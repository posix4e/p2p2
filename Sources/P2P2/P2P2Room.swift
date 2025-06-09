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
        let dataChannel: RTCDataChannel?
        var isConnected: Bool
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
        
        // Start discovery loop
        Task {
            while !Task.isCancelled {
                try await discoverPeers()
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
        
        for peerId in discoveredPeers {
            if peers[peerId] == nil {
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
        let connection = try await core.createPeerConnection()
        let dataChannelConfig = RTCDataChannelConfiguration()
        dataChannelConfig.isOrdered = true
        let dataChannel = connection.dataChannel(forLabel: "data", configuration: dataChannelConfig)
        
        let peer = Peer(
            id: peerId,
            connection: connection,
            dataChannel: dataChannel,
            isConnected: false
        )
        
        peers[peerId] = peer
        
        // Exchange signaling data via DNS TXT records
        let offer = try await core.createOffer(for: connection)
        try await core.publishSignalingData(
            roomId: roomId,
            targetPeerId: peerId,
            data: offer.sdp
        )
        
        // Wait for answer
        if let answerData = try await core.getSignalingData(
            roomId: roomId,
            fromPeerId: peerId
        ) {
            let answer = RTCSessionDescription(type: .answer, sdp: answerData)
            try await core.setRemoteDescription(answer, for: connection)
        }
    }
    
    private func removePeer(_ peerId: String) {
        if let peer = peers[peerId] {
            peer.connection.close()
            peers[peerId] = nil
            onPeerLeaveHandler?(peerId)
        }
    }
}