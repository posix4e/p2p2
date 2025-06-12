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
        Task {
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
        try await core.removePresence(roomId: roomId)
        
        // Close all peer connections
        for peer in peers.values {
            peer.connection.close()
        }
        peers.removeAll()
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
            dataChannelDelegate: nil,
            dataChannelObserver: nil
        )
        
        peers[peerId] = peer
        
        // Set up data channel handlers
        setupDataChannel(dataChannel, for: peerId)
        
        // Create offer and wait for ICE gathering
        print("[\(self.peerId)] Creating offer for \(peerId)")
        let offer = try await core.createOffer(for: connection)
        try await core.setLocalDescription(offer, for: connection)
        print("[\(self.peerId)] Waiting for ICE gathering")
        await core.webRTCManager.waitForIceGathering(connection)
        
        // Exchange signaling data via DNS TXT records
        print("[\(self.peerId)] Publishing offer to \(peerId)")
        try await core.publishSignalingData(
            roomId: roomId,
            targetPeerId: peerId,
            data: offer.sdp
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
        
        while attempts < maxAttempts {
            do {
                if let answerData = try await core.getSignalingData(
                    roomId: roomId,
                    fromPeerId: peerId
                ) {
                    let answer = RTCSessionDescription(type: .answer, sdp: answerData)
                    try await core.setRemoteDescription(answer, for: connection)
                    return
                }
            } catch {
                print("Error polling for answer from \(peerId): \(error)")
            }
            
            attempts += 1
            try? await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds
        }
        
        // Failed to get answer
        removePeer(peerId)
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
        let delegate = PeerConnectionDelegateWrapper(peerId: peerId) { dataChannel in
            Task {
                await capturedSelf.handleReceivedDataChannel(dataChannel, for: capturedPeerId)
            }
        }
        connection.delegate = delegate
        peer.dataChannelDelegate = delegate
        
        peers[peerId] = peer
        
        // Poll for offer
        await pollForOffer(from: peerId, connection: connection)
    }
    
    private func pollForOffer(from peerId: String, connection: RTCPeerConnection) async {
        let maxAttempts = 10
        var attempts = 0
        
        while attempts < maxAttempts {
            do {
                if let offerData = try await core.getSignalingData(
                    roomId: roomId,
                    fromPeerId: peerId
                ) {
                    let offer = RTCSessionDescription(type: .offer, sdp: offerData)
                    try await core.setRemoteDescription(offer, for: connection)
                    
                    // Create answer and wait for ICE gathering
                    let answer = try await core.createAnswer(for: connection)
                    try await core.setLocalDescription(answer, for: connection)
                    await core.webRTCManager.waitForIceGathering(connection)
                    
                    // Send answer
                    try await core.publishSignalingData(
                        roomId: roomId,
                        targetPeerId: peerId,
                        data: answer.sdp
                    )
                    return
                }
            } catch {
                print("Error polling for offer from \(peerId): \(error)")
            }
            
            attempts += 1
            try? await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds
        }
        
        // Failed to get offer
        removePeer(peerId)
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
    
    init(peerId: String, onDataChannel: @escaping @Sendable (RTCDataChannel) -> Void) {
        self.peerId = peerId
        self.onDataChannel = onDataChannel
        super.init()
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {
        print("[\(peerId)] Received data channel")
        onDataChannel(dataChannel)
    }
}