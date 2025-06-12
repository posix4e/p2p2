import Foundation
@preconcurrency import WebRTC

public actor P2P2Room: Sendable {
    private let roomId: String
    private let config: RoomConfig
    private let core: P2P2Core
    
    private var peers: [String: Peer] = [:]
    private var onPeerJoinHandler: (@Sendable (String) -> Void)?
    private var onPeerLeaveHandler: (@Sendable (String) -> Void)?
    private var onDataHandler: (@Sendable (Data, String) -> Void)?
    private var iceCandidateCounter: [String: Int] = [:]
    private var discoveryTask: Task<Void, Error>?
    
    struct Peer {
        let id: String
        let connection: RTCPeerConnection
        var dataChannel: RTCDataChannel?
        var isConnected: Bool
        fileprivate var connectionObserver: ConnectionStateObserver?
        fileprivate var dataChannelDelegate: PeerConnectionDelegateWrapper?
        fileprivate var dataChannelObserver: DataChannelObserver?
    }
    
    public init(roomId: String, config: RoomConfig) {
        self.roomId = roomId
        self.config = config
        self.core = P2P2Core(config: config)
    }
    
    public var peerId: String {
        core.getPeerId()
    }
    
    public func join() async throws {
        // Start peer discovery via DNS
        try await core.announcePresence(roomId: roomId)
        print("[\(peerId)] Announced presence in room: \(roomId)")
        
        // Start discovery loop
        discoveryTask = Task {
            print("[\(peerId)] Starting discovery loop")
            while !Task.isCancelled {
                do {
                    try await discoverPeers()
                } catch {
                    print("[\(peerId)] Discovery error: \(error)")
                }
                try await Task.sleep(nanoseconds: 5_000_000_000) // 5 seconds
            }
        }
    }
    
    public func leave() async throws {
        // Cancel discovery task first
        discoveryTask?.cancel()
        discoveryTask = nil
        
        // Close all peer connections before removing presence
        for peer in peers.values {
            peer.dataChannel?.close()
            peer.connection.close()
        }
        peers.removeAll()
        iceCandidateCounter.removeAll()
        
        // Give connections time to close gracefully
        try await Task.sleep(nanoseconds: 100_000_000) // 100ms
        
        // Remove presence last
        try await core.removePresence(roomId: roomId)
    }
    
    public func send(_ data: Data) throws {
        for peer in peers.values where peer.isConnected {
            peer.dataChannel?.sendData(RTCDataBuffer(data: data, isBinary: true))
        }
    }
    
    public func send(_ data: Data, to peerId: String) throws {
        guard let peer = peers[peerId], peer.isConnected else {
            throw P2P2Error.peerNotConnected
        }
        peer.dataChannel?.sendData(RTCDataBuffer(data: data, isBinary: true))
    }
    
    public func onPeerJoin(_ handler: @Sendable @escaping (String) -> Void) {
        onPeerJoinHandler = handler
    }
    
    public func onPeerLeave(_ handler: @Sendable @escaping (String) -> Void) {
        onPeerLeaveHandler = handler
    }
    
    public func onData(_ handler: @Sendable @escaping (Data, String) -> Void) {
        onDataHandler = handler
    }
    
    private func discoverPeers() async throws {
        let discoveredPeers = try await core.discoverPeers(roomId: roomId)
        
        if !discoveredPeers.isEmpty {
            print("[\(self.peerId)] Discovered peers: \(discoveredPeers)")
        }
        
        for peerId in discoveredPeers {
            if peers[peerId] == nil {
                print("[\(self.peerId)] Attempting to connect to new peer: \(peerId)")
                try await connectToPeer(peerId)
            }
        }
        
        // Remove peers that are no longer announced
        let currentPeerIds = Set(peers.keys)
        let discoveredPeerIds = Set(discoveredPeers)
        let removedPeers = currentPeerIds.subtracting(discoveredPeerIds)
        
        for peerId in removedPeers {
            removePeer(peerId)
        }
    }
    
    private func connectToPeer(_ peerId: String) async throws {
        // Check if we should be initiator (compare peer IDs)
        let isInitiator = self.peerId < peerId
        print("[\(self.peerId)] Comparing with \(peerId): isInitiator = \(isInitiator)")
        
        if isInitiator {
            try await connectAsInitiator(to: peerId)
        } else {
            try await waitForConnectionFrom(peerId)
        }
    }
    
    private func connectAsInitiator(to peerId: String) async throws {
        print("[\(self.peerId)] Connecting as initiator to \(peerId)")
        let connection = try await core.createPeerConnection()
        
        // Set up connection delegate to see ICE candidates
        let delegate = PeerConnectionDelegateWrapper(
            peerId: peerId,
            onDataChannel: { [weak self] dataChannel in
                Task { [weak self] in
                    await self?.handleReceivedDataChannel(dataChannel, for: peerId)
                }
            },
            onIceCandidate: { [weak self] candidate in
                Task { [weak self] in
                    await self?.publishIceCandidate(candidate, for: peerId)
                }
            }
        )
        connection.delegate = delegate
        
        let dataChannelConfig = RTCDataChannelConfiguration()
        dataChannelConfig.isOrdered = true
        dataChannelConfig.maxRetransmits = 3
        let dataChannel = connection.dataChannel(forLabel: "data", configuration: dataChannelConfig)
        
        // Monitor connection state
        let observer = ConnectionStateObserver(connection: connection) { [weak self] state in
            Task { [weak self] in
                await self?.handleConnectionStateChange(for: peerId, state: state)
            }
        }
        observer.startObserving()
        
        let peer = Peer(
            id: peerId,
            connection: connection,
            dataChannel: dataChannel,
            isConnected: false,
            connectionObserver: observer,
            dataChannelDelegate: delegate,
            dataChannelObserver: nil
        )
        
        peers[peerId] = peer
        
        // Set up data channel handlers
        setupDataChannel(dataChannel, for: peerId)
        
        // Create offer
        print("[\(self.peerId)] Creating offer for \(peerId)")
        let offer = try await core.createOffer(for: connection)
        try await core.setLocalDescription(offer, for: connection)
        print("[\(self.peerId)] Set local description, ICE gathering state: \(connection.iceGatheringState.rawValue)")
        
        // Wait for ICE gathering to complete (matching JavaScript implementation)
        print("[\(self.peerId)] Waiting for ICE gathering to complete...")
        await core.webRTCManager.waitForIceGathering(connection)
        print("[\(self.peerId)] ICE gathering complete")
        
        // Get the updated local description with ICE candidates
        guard let updatedOffer = connection.localDescription else {
            throw P2P2Error.signalingFailed("No local description after ICE gathering")
        }
        
        // Debug: Check if candidates are in the SDP
        print("[\(self.peerId)] Updated SDP contains candidates: \(updatedOffer.sdp.contains("a=candidate"))")
        if !updatedOffer.sdp.contains("a=candidate") {
            print("[\(self.peerId)] WARNING: No ICE candidates in SDP after gathering!")
        }
        
        // Serialize offer to JSON format matching JavaScript
        let offerData: [String: Any] = [
            "type": "offer",
            "sdp": updatedOffer.sdp
        ]
        
        guard let jsonData = try? JSONSerialization.data(withJSONObject: offerData),
              let jsonString = String(data: jsonData, encoding: .utf8) else {
            throw P2P2Error.signalingFailed("Failed to serialize offer")
        }
        
        print("[\(self.peerId)] Publishing offer to \(peerId)")
        try await core.publishSignalingData(
            roomId: roomId,
            targetPeerId: peerId,
            data: jsonString
        )
        
        // Poll for answer with retries
        print("[\(self.peerId)] Polling for answer from \(peerId)")
        await pollForAnswer(from: peerId, connection: connection)
    }
    
    private func removePeer(_ peerId: String) {
        if let peer = peers[peerId] {
            peer.connectionObserver?.stopObserving()
            peer.connection.close()
            peers[peerId] = nil
            if peer.isConnected {
                onPeerLeaveHandler?(peerId)
            }
        }
    }
    
    private func pollForAnswer(from peerId: String, connection: RTCPeerConnection) async {
        let maxAttempts = 10
        var attempts = 0
        
        while attempts < maxAttempts && !Task.isCancelled {
            do {
                if let answerData = try await core.getSignalingData(
                    roomId: roomId,
                    fromPeerId: peerId
                ) {
                    print("[\(self.peerId)] Got answer from \(peerId), length: \(answerData.count)")
                    
                    // Parse JSON format from JavaScript
                    guard let data = answerData.data(using: .utf8),
                          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                          let sdp = json["sdp"] as? String,
                          let type = json["type"] as? String,
                          type == "answer" else {
                        print("[\(self.peerId)] Failed to parse answer JSON")
                        attempts += 1
                        continue
                    }
                    
                    let answer = RTCSessionDescription(type: .answer, sdp: sdp)
                    print("[\(self.peerId)] Created answer RTCSessionDescription")
                    print("[\(self.peerId)] Answer SDP length: \(answer.sdp.count)")
                    try await core.setRemoteDescription(answer, for: connection)
                    
                    // Start polling for ICE candidates
                    Task {
                        await pollForIceCandidates(from: peerId, connection: connection)
                    }
                    
                    return
                }
            } catch {
                print("Error polling for answer from \(peerId): \(error)")
            }
            
            attempts += 1
            if !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds
            }
        }
        
        // Failed to get answer
        if !Task.isCancelled {
            removePeer(peerId)
        }
    }
    
    private func waitForConnectionFrom(_ peerId: String) async throws {
        print("[\(self.peerId)] Waiting for connection from \(peerId)")
        let connection = try await core.createPeerConnection()
        
        // Monitor connection state
        let observer = ConnectionStateObserver(connection: connection) { [weak self] state in
            Task { [weak self] in
                await self?.handleConnectionStateChange(for: peerId, state: state)
            }
        }
        observer.startObserving()
        
        // Create peer without data channel (will be received from initiator)
        var peer = Peer(
            id: peerId,
            connection: connection,
            dataChannel: nil,
            isConnected: false,
            connectionObserver: observer,
            dataChannelDelegate: nil,
            dataChannelObserver: nil
        )
        
        // Set up data channel handler
        let capturedSelf = self
        let capturedPeerId = peerId
        let delegate = PeerConnectionDelegateWrapper(
            peerId: peerId,
            onDataChannel: { dataChannel in
                Task {
                    await capturedSelf.handleReceivedDataChannel(dataChannel, for: capturedPeerId)
                }
            },
            onIceCandidate: { candidate in
                Task {
                    await capturedSelf.publishIceCandidate(candidate, for: capturedPeerId)
                }
            }
        )
        connection.delegate = delegate
        peer.dataChannelDelegate = delegate
        
        peers[peerId] = peer
        
        // Poll for offer
        await pollForOffer(from: peerId, connection: connection)
    }
    
    private func pollForOffer(from peerId: String, connection: RTCPeerConnection) async {
        let maxAttempts = 10
        var attempts = 0
        
        while attempts < maxAttempts && !Task.isCancelled {
            do {
                if let offerData = try await core.getSignalingData(
                    roomId: roomId,
                    fromPeerId: peerId
                ) {
                    print("[\(self.peerId)] Got offer from \(peerId), length: \(offerData.count)")
                    guard !offerData.isEmpty else {
                        print("[\(self.peerId)] Empty offer data from \(peerId)")
                        continue
                    }
                    
                    // Parse JSON format from JavaScript
                    guard let data = offerData.data(using: .utf8),
                          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                          let sdp = json["sdp"] as? String,
                          let type = json["type"] as? String,
                          type == "offer" else {
                        print("[\(self.peerId)] Failed to parse offer JSON")
                        attempts += 1
                        continue
                    }
                    
                    let offer = RTCSessionDescription(type: .offer, sdp: sdp)
                    print("[\(self.peerId)] Created RTCSessionDescription")
                    print("[\(self.peerId)] Offer SDP length: \(offer.sdp.count)")
                    
                    try await core.setRemoteDescription(offer, for: connection)
                    
                    // Create answer
                    let answer = try await core.createAnswer(for: connection)
                    try await core.setLocalDescription(answer, for: connection)
                    print("[\(self.peerId)] Set local description for answer, ICE gathering state: \(connection.iceGatheringState.rawValue)")
                    
                    // Wait for ICE gathering to complete (matching JavaScript implementation)
                    print("[\(self.peerId)] Waiting for ICE gathering to complete...")
                    await core.webRTCManager.waitForIceGathering(connection)
                    print("[\(self.peerId)] ICE gathering complete")
                    
                    // Get the updated local description with ICE candidates
                    guard let updatedAnswer = connection.localDescription else {
                        throw P2P2Error.signalingFailed("No local description after ICE gathering")
                    }
                    
                    // Serialize answer to JSON format matching JavaScript
                    let answerData: [String: Any] = [
                        "type": "answer",
                        "sdp": updatedAnswer.sdp
                    ]
                    
                    guard let jsonData = try? JSONSerialization.data(withJSONObject: answerData),
                          let jsonString = String(data: jsonData, encoding: .utf8) else {
                        throw P2P2Error.signalingFailed("Failed to serialize answer")
                    }
                    
                    try await core.publishSignalingData(
                        roomId: roomId,
                        targetPeerId: peerId,
                        data: jsonString
                    )
                    
                    // Start polling for ICE candidates
                    Task {
                        await pollForIceCandidates(from: peerId, connection: connection)
                    }
                    
                    return
                }
            } catch {
                print("Error polling for offer from \(peerId): \(error)")
            }
            
            attempts += 1
            if !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds
            }
        }
        
        // Failed to get offer
        if !Task.isCancelled {
            removePeer(peerId)
        }
    }
    
    private func handleConnectionStateChange(for peerId: String, state: RTCPeerConnectionState) async {
        guard var peer = peers[peerId] else { return }
        
        switch state {
        case .connected:
            if !peer.isConnected {
                peer.isConnected = true
                peers[peerId] = peer
                onPeerJoinHandler?(peerId)
            }
        case .failed, .disconnected, .closed:
            removePeer(peerId)
        default:
            break
        }
    }
    
    private func setupDataChannel(_ channel: RTCDataChannel?, for peerId: String) {
        guard let channel = channel else { return }
        
        let observer = DataChannelObserver { [weak self] state in
            if state == .open {
                Task { [weak self] in
                    await self?.handleDataChannelOpen(for: peerId)
                }
            }
        } onMessage: { [weak self] data in
            Task { [weak self] in
                await self?.onDataHandler?(data, peerId)
            }
        }
        channel.delegate = observer
        
        // Store observer reference
        if var peer = peers[peerId] {
            peer.dataChannelObserver = observer
            peers[peerId] = peer
        }
    }
    
    private func handleDataChannelOpen(for peerId: String) async {
        // Update peer's data channel reference if needed
        if var peer = peers[peerId], peer.dataChannel == nil {
            // Find the data channel from connection
            // Data channel is already set, just mark as connected
            peer.isConnected = true
            peers[peerId] = peer
        }
    }
    
    private func handleReceivedDataChannel(_ dataChannel: RTCDataChannel, for peerId: String) async {
        guard var peer = peers[peerId] else { return }
        peer.dataChannel = dataChannel
        peers[peerId] = peer
        setupDataChannel(dataChannel, for: peerId)
    }
    
    private func incrementIceCandidateCounter(for peerId: String) {
        iceCandidateCounter[peerId] = (iceCandidateCounter[peerId] ?? 0) + 1
    }
    
    private func publishIceCandidate(_ candidate: RTCIceCandidate, for peerId: String) async {
        let counter = iceCandidateCounter[peerId] ?? 0
        incrementIceCandidateCounter(for: peerId)
        
        do {
            try await core.publishIceCandidate(
                roomId: roomId,
                targetPeerId: peerId,
                candidate: candidate,
                index: counter
            )
            print("[\(self.peerId)] Published ICE candidate #\(counter) to \(peerId)")
        } catch {
            print("[\(self.peerId)] Failed to publish ICE candidate: \(error)")
        }
    }
    
    private func pollForIceCandidates(from peerId: String, connection: RTCPeerConnection) async {
        var knownCandidates = Set<String>()
        let maxPolls = 10
        var polls = 0
        
        while polls < maxPolls && !Task.isCancelled {
            do {
                let candidates = try await core.getIceCandidates(roomId: roomId, fromPeerId: peerId)
                
                if !candidates.isEmpty {
                    print("[\(self.peerId)] Found \(candidates.count) ICE candidates from \(peerId)")
                }
                
                for candidate in candidates {
                    let candidateKey = "\(candidate.sdpMLineIndex)-\(candidate.sdp)"
                    if !knownCandidates.contains(candidateKey) {
                        knownCandidates.insert(candidateKey)
                        do {
                            try await core.addIceCandidate(candidate, to: connection)
                            print("[\(self.peerId)] Added ICE candidate from \(peerId): \(candidate.sdp)")
                        } catch {
                            print("[\(self.peerId)] Failed to add ICE candidate: \(error)")
                        }
                    }
                }
            } catch {
                // Ignore errors, keep polling
            }
            
            polls += 1
            if !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000) // 1 second
            }
        }
    }
}

// Helper class to observe data channel events
private class DataChannelObserver: NSObject, RTCDataChannelDelegate, @unchecked Sendable {
    private let onStateChange: (RTCDataChannelState) -> Void
    private let onMessage: (Data) -> Void
    
    init(onStateChange: @escaping (RTCDataChannelState) -> Void, onMessage: @escaping (Data) -> Void) {
        self.onStateChange = onStateChange
        self.onMessage = onMessage
        super.init()
    }
    
    func dataChannelDidChangeState(_ dataChannel: RTCDataChannel) {
        onStateChange(dataChannel.readyState)
    }
    
    func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) {
        onMessage(buffer.data)
    }
}

// Helper class to observe connection state changes
fileprivate class ConnectionStateObserver: NSObject, @unchecked Sendable {
    private weak var connection: RTCPeerConnection?
    private let onStateChange: (RTCPeerConnectionState) -> Void
    private var observation: NSKeyValueObservation?
    
    init(connection: RTCPeerConnection, onStateChange: @escaping (RTCPeerConnectionState) -> Void) {
        self.connection = connection
        self.onStateChange = onStateChange
        super.init()
    }
    
    func startObserving() {
        observation = connection?.observe(\.connectionState, options: [.new]) { [weak self] connection, _ in
            self?.onStateChange(connection.connectionState)
        }
    }
    
    func stopObserving() {
        observation?.invalidate()
        observation = nil
    }
}

// Delegate wrapper for handling peer connection events
fileprivate class PeerConnectionDelegateWrapper: NSObject, RTCPeerConnectionDelegate, @unchecked Sendable {
    private let peerId: String
    private let onDataChannel: @Sendable (RTCDataChannel) -> Void
    private let onIceCandidate: @Sendable (RTCIceCandidate) -> Void
    
    init(peerId: String, 
         onDataChannel: @escaping @Sendable (RTCDataChannel) -> Void,
         onIceCandidate: @escaping @Sendable (RTCIceCandidate) -> Void) {
        self.peerId = peerId
        self.onDataChannel = onDataChannel
        self.onIceCandidate = onIceCandidate
        super.init()
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        print("[\(peerId)] ICE connection state changed to: \(newState.rawValue)")
    }
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {
        print("[\(peerId)] ICE gathering state changed to: \(newState.rawValue)")
    }
    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        print("[\(peerId)] Generated ICE candidate: \(candidate.sdp)")
        // Send ICE candidates via trickle ICE
        onIceCandidate(candidate)
    }
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {
        print("[\(peerId)] Received data channel")
        onDataChannel(dataChannel)
    }
}