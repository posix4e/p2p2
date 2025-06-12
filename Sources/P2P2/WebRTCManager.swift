import Foundation
@preconcurrency import WebRTC

public final class WebRTCManager: @unchecked Sendable {
    nonisolated(unsafe) private static let factory: RTCPeerConnectionFactory = {
        RTCInitializeSSL()
        // For data-channel only, we don't need video encoders/decoders
        return RTCPeerConnectionFactory()
    }()
    
    public static func cleanup() {
        RTCCleanupSSL()
    }
    
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
        // For local testing, use only host candidates to avoid waiting for STUN
        config.iceTransportPolicy = .all // Change to .relay to use only TURN
        config.candidateNetworkPolicy = .all
        
        
        // Add more aggressive ICE gathering for local testing
        config.iceCandidatePoolSize = 10
        config.audioJitterBufferMaxPackets = 50
        config.iceConnectionReceivingTimeout = 10000
        config.iceBackupCandidatePairPingInterval = 1000
        
        // For data-channel only connections, we might need this
        config.activeResetSrtpParams = true
        
        guard let connection = Self.factory.peerConnection(
            with: config,
            constraints: constraints,
            delegate: nil
        ) else {
            throw P2P2Error.connectionFailed("Failed to create peer connection")
        }
        
        print("[WebRTCManager] Created peer connection with \(config.iceServers.count) ICE servers")
        
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
                    print("[WebRTCManager] Set local description, ICE gathering state: \(connection.iceGatheringState.rawValue)")
                    print("[WebRTCManager] ICE connection state: \(connection.iceConnectionState.rawValue)")
                    print("[WebRTCManager] Signaling state: \(connection.signalingState.rawValue)")
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
        print("[WebRTCManager] Starting ICE gathering wait. Current state: \(connection.iceGatheringState.rawValue)")
        print("[WebRTCManager] Connection state: \(connection.connectionState.rawValue)")
        print("[WebRTCManager] Signaling state: \(connection.signalingState.rawValue)")
        
        // Give a small delay for ICE gathering to start
        try? await Task.sleep(nanoseconds: 100_000_000) // 100ms
        
        // Check if we're already complete or if gathering started
        if connection.iceGatheringState == .complete {
            print("[WebRTCManager] ICE gathering already complete")
            return
        }
        
        // Try to restart ICE gathering if it hasn't started
        if connection.iceGatheringState == .new {
            print("[WebRTCManager] ICE gathering hasn't started, trying to restart ICE")
            connection.restartIce()
            try? await Task.sleep(nanoseconds: 100_000_000) // Give it time to start
        }
        
        // For data-channel only connections, ICE gathering might not start
        // until answer is set. We'll wait with a timeout.
        let waiter = IceGatheringWaiter()
        await waiter.wait(for: connection)
    }
}

// Actor to manage ICE gathering state
private actor IceGatheringWaiter {
    private var continuation: CheckedContinuation<Void, Never>?
    private var hasCompleted = false
    
    func wait(for connection: RTCPeerConnection) async {
        if connection.iceGatheringState == .complete {
            return
        }
        
        await withCheckedContinuation { continuation in
            self.continuation = continuation
            
            // Start timeout - 2 seconds should be enough for local candidates
            Task {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                await self.complete(timedOut: true)
            }
            
            // Start observing
            Task { @MainActor in
                let observer = IceGatheringObserver(connection: connection) { [weak self] in
                    Task {
                        await self?.complete(timedOut: false)
                    }
                }
                observer.startObserving()
            }
        }
    }
    
    private func complete(timedOut: Bool) {
        guard !hasCompleted, let continuation = continuation else { return }
        hasCompleted = true
        self.continuation = nil
        
        if timedOut {
            print("ICE gathering timeout reached")
        } else {
            print("ICE gathering completed")
        }
        
        continuation.resume()
    }
}

// Helper class to observe ICE gathering state
private class IceGatheringObserver: NSObject {
    private weak var connection: RTCPeerConnection?
    private let completion: () -> Void
    private var observation: NSKeyValueObservation?
    
    init(connection: RTCPeerConnection, completion: @escaping () -> Void) {
        self.connection = connection
        self.completion = completion
        super.init()
    }
    
    func startObserving() {
        // Check if already complete
        if connection?.iceGatheringState == .complete {
            completion()
            return
        }
        
        // Use KVO to observe iceGatheringState changes
        observation = connection?.observe(\.iceGatheringState, options: [.new, .initial]) { [weak self] connection, change in
            let state = connection.iceGatheringState
            print("[IceGatheringObserver] ICE gathering state changed to: \(state.rawValue) (\(self?.stateString(for: state) ?? "unknown"))")
            if state == .complete {
                self?.completion()
                self?.observation?.invalidate()
            }
        }
    }
    
    private func stateString(for state: RTCIceGatheringState) -> String {
        switch state {
        case .new: return "new"
        case .gathering: return "gathering"
        case .complete: return "complete"
        @unknown default: return "unknown"
        }
    }
}