import Foundation
import WebRTC
@testable import P2P2

// Simple test to monitor WebRTC connection states
@main
struct ConnectionStateTest {
    static func main() async throws {
        print("Starting WebRTC connection state test...")
        
        WebRTCManager.initialize()
        let manager = WebRTCManager()
        
        // Create two connections
        let connection1 = try await manager.createPeerConnection()
        let connection2 = try await manager.createPeerConnection()
        
        // Monitor connection states
        let observer1 = ConnectionStateMonitor(name: "Connection1", connection: connection1)
        let observer2 = ConnectionStateMonitor(name: "Connection2", connection: connection2)
        
        observer1.startObserving()
        observer2.startObserving()
        
        // Create data channel on connection1
        let dataChannel = connection1.dataChannel(forLabel: "test", configuration: RTCDataChannelConfiguration())
        print("Created data channel on connection1")
        
        // Create offer
        let offer = try await manager.createOffer(for: connection1)
        try await manager.setLocalDescription(offer, for: connection1)
        print("Set local description on connection1")
        
        // Wait for ICE gathering
        await manager.waitForIceGathering(connection1)
        print("ICE gathering complete on connection1")
        
        // Set offer on connection2
        let offerDesc = RTCSessionDescription(type: .offer, sdp: offer.sdp!)
        try await manager.setRemoteDescription(offerDesc, for: connection2)
        print("Set remote description on connection2")
        
        // Create answer
        let answer = try await manager.createAnswer(for: connection2)
        try await manager.setLocalDescription(answer, for: connection2)
        print("Set local description on connection2")
        
        // Wait for ICE gathering
        await manager.waitForIceGathering(connection2)
        print("ICE gathering complete on connection2")
        
        // Set answer on connection1
        let answerDesc = RTCSessionDescription(type: .answer, sdp: answer.sdp!)
        try await manager.setRemoteDescription(answerDesc, for: connection1)
        print("Set remote description on connection1")
        
        // Wait and observe
        print("\nWaiting for connection state changes...")
        try await Task.sleep(nanoseconds: 5_000_000_000) // 5 seconds
        
        print("\nFinal states:")
        print("Connection1 - Peer state: \(connection1.connectionState.rawValue), ICE state: \(connection1.iceConnectionState.rawValue)")
        print("Connection2 - Peer state: \(connection2.connectionState.rawValue), ICE state: \(connection2.iceConnectionState.rawValue)")
        
        observer1.stopObserving()
        observer2.stopObserving()
        
        WebRTCManager.cleanup()
    }
}

class ConnectionStateMonitor: NSObject {
    private let name: String
    private weak var connection: RTCPeerConnection?
    private var peerStateObservation: NSKeyValueObservation?
    private var iceStateObservation: NSKeyValueObservation?
    private var signalingStateObservation: NSKeyValueObservation?
    
    init(name: String, connection: RTCPeerConnection) {
        self.name = name
        self.connection = connection
        super.init()
    }
    
    func startObserving() {
        peerStateObservation = connection?.observe(\.connectionState, options: [.new, .old]) { [weak self] connection, change in
            if let self = self {
                print("[\(self.name)] Peer connection state: \(change.oldValue?.rawValue ?? -1) -> \(connection.connectionState.rawValue)")
            }
        }
        
        iceStateObservation = connection?.observe(\.iceConnectionState, options: [.new, .old]) { [weak self] connection, change in
            if let self = self {
                print("[\(self.name)] ICE connection state: \(change.oldValue?.rawValue ?? -1) -> \(connection.iceConnectionState.rawValue)")
            }
        }
        
        signalingStateObservation = connection?.observe(\.signalingState, options: [.new, .old]) { [weak self] connection, change in
            if let self = self {
                print("[\(self.name)] Signaling state: \(change.oldValue?.rawValue ?? -1) -> \(connection.signalingState.rawValue)")
            }
        }
    }
    
    func stopObserving() {
        peerStateObservation?.invalidate()
        iceStateObservation?.invalidate()
        signalingStateObservation?.invalidate()
    }
}