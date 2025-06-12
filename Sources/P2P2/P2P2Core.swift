import Foundation
@preconcurrency import WebRTC

/// Core P2P functionality that can be used in any Swift environment
public final class P2P2Core {
    public let dnsDiscovery: CloudflareDNSDiscovery
    public let webRTCManager: WebRTCManager
    
    public init(config: RoomConfig) {
        self.webRTCManager = WebRTCManager(
            stunServers: config.stunServers,
            turnServers: config.turnServers
        )
        self.dnsDiscovery = CloudflareDNSDiscovery(
            domain: config.domain,
            zoneId: config.zoneId,
            apiToken: config.apiToken
        )
    }
    
    // MARK: - DNS Operations
    
    public func getPeerId() -> String {
        return dnsDiscovery.peerId
    }
    
    public func announcePresence(roomId: String) async throws {
        try await dnsDiscovery.announcePresence(roomId: roomId)
    }
    
    public func removePresence(roomId: String) async throws {
        try await dnsDiscovery.removePresence(roomId: roomId)
    }
    
    public func discoverPeers(roomId: String) async throws -> [String] {
        return try await dnsDiscovery.discoverPeers(roomId: roomId)
    }
    
    public func publishSignalingData(roomId: String, targetPeerId: String, data: String) async throws {
        try await dnsDiscovery.publishSignalingData(
            roomId: roomId,
            peerId: targetPeerId,
            data: data
        )
    }
    
    public func getSignalingData(roomId: String, fromPeerId: String) async throws -> String? {
        return try await dnsDiscovery.getSignalingData(
            roomId: roomId,
            fromPeerId: fromPeerId
        )
    }
    
    // MARK: - WebRTC Operations
    
    public func createPeerConnection() async throws -> RTCPeerConnection {
        return try await webRTCManager.createPeerConnection()
    }
    
    public func createDataChannel(_ connection: RTCPeerConnection, label: String = "data") -> RTCDataChannel? {
        let config = RTCDataChannelConfiguration()
        config.isOrdered = true
        return connection.dataChannel(forLabel: label, configuration: config)
    }
    
    public func createOffer(for connection: RTCPeerConnection) async throws -> RTCSessionDescription {
        return try await webRTCManager.createOffer(for: connection)
    }
    
    public func createAnswer(for connection: RTCPeerConnection) async throws -> RTCSessionDescription {
        return try await webRTCManager.createAnswer(for: connection)
    }
    
    public func setLocalDescription(_ sdp: RTCSessionDescription, for connection: RTCPeerConnection) async throws {
        try await webRTCManager.setLocalDescription(sdp, for: connection)
    }
    
    public func setRemoteDescription(_ sdp: RTCSessionDescription, for connection: RTCPeerConnection) async throws {
        try await webRTCManager.setRemoteDescription(sdp, for: connection)
    }
    
    public func addIceCandidate(_ candidate: RTCIceCandidate, to connection: RTCPeerConnection) async throws {
        try await webRTCManager.addIceCandidate(candidate, to: connection)
    }
}

// MARK: - iOS Specific Extensions

#if os(iOS)
import UIKit

public extension P2P2Core {
    /// Configure for iOS app usage
    func configureForIOS() {
        // Configure audio session for WebRTC
        let audioSession = AVAudioSession.sharedInstance()
        do {
            try audioSession.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .allowBluetoothA2DP])
            try audioSession.setActive(true)
        } catch {
            print("Failed to configure audio session: \(error)")
        }
    }
    
    /// Handle app lifecycle for iOS
    func handleAppDidEnterBackground() {
        // Reduce discovery interval or pause
    }
    
    func handleAppWillEnterForeground() {
        // Resume normal discovery
    }
}
#endif

// MARK: - macOS Specific Extensions

#if os(macOS)
import AppKit

public extension P2P2Core {
    /// Configure for macOS app usage
    func configureForMacOS() {
        // macOS specific configuration if needed
    }
}
#endif