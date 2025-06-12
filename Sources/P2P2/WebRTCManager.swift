import Foundation
@preconcurrency import WebRTC

public final class WebRTCManager: @unchecked Sendable {
    nonisolated(unsafe) private static let factory: RTCPeerConnectionFactory = {
        RTCInitializeSSL()
        let videoEncoderFactory = RTCDefaultVideoEncoderFactory()
        let videoDecoderFactory = RTCDefaultVideoDecoderFactory()
        return RTCPeerConnectionFactory(
            encoderFactory: videoEncoderFactory,
            decoderFactory: videoDecoderFactory
        )
    }()
    
    private let iceServers: [RTCIceServer]
    private let constraints: RTCMediaConstraints
    
    init(stunServers: [String] = ["stun:stun.l.google.com:19302"], turnServers: [RoomConfig.TURNServer] = []) {
        var servers: [RTCIceServer] = []
        
        // Add STUN servers
        for stun in stunServers {
            servers.append(RTCIceServer(urlStrings: [stun]))
        }
        
        // Add TURN servers
        for turn in turnServers {
            if let username = turn.username, let credential = turn.credential {
                servers.append(RTCIceServer(
                    urlStrings: [turn.url],
                    username: username,
                    credential: credential
                ))
            } else {
                servers.append(RTCIceServer(urlStrings: [turn.url]))
            }
        }
        
        self.iceServers = servers
        
        // Set up constraints
        let mandatoryConstraints = [
            "OfferToReceiveAudio": "false",
            "OfferToReceiveVideo": "false"
        ]
        
        self.constraints = RTCMediaConstraints(
            mandatoryConstraints: mandatoryConstraints,
            optionalConstraints: nil
        )
    }
    
    func createPeerConnection() async throws -> RTCPeerConnection {
        let config = RTCConfiguration()
        config.iceServers = iceServers
        config.bundlePolicy = .balanced
        config.rtcpMuxPolicy = .require
        config.tcpCandidatePolicy = .enabled
        config.continualGatheringPolicy = .gatherContinually
        config.sdpSemantics = .unifiedPlan
        
        guard let connection = Self.factory.peerConnection(
            with: config,
            constraints: constraints,
            delegate: nil
        ) else {
            throw P2P2Error.connectionFailed("Failed to create peer connection")
        }
        
        return connection
    }
    
    func createOffer(for connection: RTCPeerConnection) async throws -> RTCSessionDescription {
        return try await withCheckedThrowingContinuation { continuation in
            connection.offer(for: constraints) { sdp, error in
                if let error = error {
                    continuation.resume(throwing: P2P2Error.signalingFailed(error.localizedDescription))
                } else if let sdp = sdp {
                    continuation.resume(returning: sdp)
                } else {
                    continuation.resume(throwing: P2P2Error.signalingFailed("No SDP generated"))
                }
            }
        }
    }
    
    func createAnswer(for connection: RTCPeerConnection) async throws -> RTCSessionDescription {
        return try await withCheckedThrowingContinuation { continuation in
            connection.answer(for: constraints) { sdp, error in
                if let error = error {
                    continuation.resume(throwing: P2P2Error.signalingFailed(error.localizedDescription))
                } else if let sdp = sdp {
                    continuation.resume(returning: sdp)
                } else {
                    continuation.resume(throwing: P2P2Error.signalingFailed("No SDP generated"))
                }
            }
        }
    }
    
    func setLocalDescription(_ sdp: RTCSessionDescription, for connection: RTCPeerConnection) async throws {
        return try await withCheckedThrowingContinuation { continuation in
            connection.setLocalDescription(sdp) { error in
                if let error = error {
                    continuation.resume(throwing: P2P2Error.signalingFailed(error.localizedDescription))
                } else {
                    continuation.resume()
                }
            }
        }
    }
    
    func setRemoteDescription(_ sdp: RTCSessionDescription, for connection: RTCPeerConnection) async throws {
        return try await withCheckedThrowingContinuation { continuation in
            connection.setRemoteDescription(sdp) { error in
                if let error = error {
                    continuation.resume(throwing: P2P2Error.signalingFailed(error.localizedDescription))
                } else {
                    continuation.resume()
                }
            }
        }
    }
    
    func addIceCandidate(_ candidate: RTCIceCandidate, to connection: RTCPeerConnection) async throws {
        return try await withCheckedThrowingContinuation { continuation in
            connection.add(candidate) { error in
                if let error = error {
                    continuation.resume(throwing: P2P2Error.signalingFailed(error.localizedDescription))
                } else {
                    continuation.resume()
                }
            }
        }
    }
    
    func waitForIceGathering(_ connection: RTCPeerConnection) async {
        if connection.iceGatheringState == .complete {
            return
        }
        
        await withCheckedContinuation { continuation in
            let observer = IceGatheringObserver(connection: connection) { _ in
                continuation.resume()
            }
            observer.startObserving()
        }
    }
}

// Helper class to observe ICE gathering state
private class IceGatheringObserver: NSObject, @unchecked Sendable {
    private weak var connection: RTCPeerConnection?
    private let completion: (RTCPeerConnection) -> Void
    private var observation: NSKeyValueObservation?
    
    init(connection: RTCPeerConnection, completion: @escaping (RTCPeerConnection) -> Void) {
        self.connection = connection
        self.completion = completion
        super.init()
    }
    
    func startObserving() {
        // Check if already complete
        if connection?.iceGatheringState == .complete {
            completion(connection!)
            return
        }
        
        // Use KVO to observe iceGatheringState changes
        observation = connection?.observe(\.iceGatheringState, options: [.new]) { [weak self] connection, _ in
            if connection.iceGatheringState == .complete {
                self?.completion(connection)
                self?.observation?.invalidate()
            }
        }
    }
}