import XCTest
@testable import P2P2
import WebRTC

final class WebRTCConnectionTests: XCTestCase {
    
    override func setUp() {
        super.setUp()
        signal(SIGPIPE, SIG_IGN)
    }
    
    func testLocalWebRTCConnection() async throws {
        print("\n=== Testing Local WebRTC Connection ===")
        
        // Create WebRTC managers
        let config = RoomConfig(
            domain: "test.com",
            zoneId: "test",
            apiToken: "test"
        )
        let managerA = WebRTCManager()
        let managerB = WebRTCManager()
        
        // Create connections
        let peerA = try await managerA.createPeerConnection()
        let peerB = try await managerB.createPeerConnection()
        
        // Track connection states
        let expectationA = XCTestExpectation(description: "Peer A connects")
        let expectationB = XCTestExpectation(description: "Peer B connects")
        
        class StateMonitor: NSObject {
            let expectation: XCTestExpectation
            var connectionObserver: NSKeyValueObservation?
            var iceObserver: NSKeyValueObservation?
            
            init(connection: RTCPeerConnection, expectation: XCTestExpectation, name: String) {
                self.expectation = expectation
                super.init()
                
                connectionObserver = connection.observe(\.connectionState, options: [.new]) { conn, _ in
                    print("[\(name)] Connection state: \(conn.connectionState.rawValue)")
                    if conn.connectionState == .connected {
                        expectation.fulfill()
                    }
                }
                
                iceObserver = connection.observe(\.iceConnectionState, options: [.new]) { conn, _ in
                    print("[\(name)] ICE state: \(conn.iceConnectionState.rawValue)")
                }
            }
        }
        
        let monitorA = StateMonitor(connection: peerA, expectation: expectationA, name: "A")
        let monitorB = StateMonitor(connection: peerB, expectation: expectationB, name: "B")
        
        // Create data channel on initiator
        print("\nCreating data channel...")
        let dcConfig = RTCDataChannelConfiguration()
        dcConfig.isOrdered = true
        dcConfig.maxRetransmits = 3
        let dataChannel = peerA.dataChannel(forLabel: "data", configuration: dcConfig)
        print("Data channel created")
        
        // Set up delegates to exchange ICE candidates
        class PeerDelegate: NSObject, RTCPeerConnectionDelegate {
            let name: String
            weak var otherPeer: RTCPeerConnection?
            
            init(name: String) {
                self.name = name
                super.init()
            }
            
            func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
            func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
            func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
            func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
            func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {}
            func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}
            func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
            
            func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
                print("[\(name)] Generated ICE candidate")
                guard let otherPeer = otherPeer else { return }
                otherPeer.add(candidate) { error in
                    if let error = error {
                        print("[\(self.name)] Error adding ICE candidate: \(error)")
                    }
                }
            }
            
            func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {
                print("[\(name)] Data channel opened!")
            }
        }
        
        let delegateA = PeerDelegate(name: "A")
        let delegateB = PeerDelegate(name: "B")
        delegateA.otherPeer = peerB
        delegateB.otherPeer = peerA
        peerA.delegate = delegateA
        peerB.delegate = delegateB
        
        // Create offer
        print("\nCreating offer...")
        let offer = try await managerA.createOffer(for: peerA)
        try await managerA.setLocalDescription(offer, for: peerA)
        
        // Wait for ICE gathering
        await managerA.waitForIceGathering(peerA)
        
        // Set offer on peer B and create answer
        print("\nSetting offer and creating answer...")
        try await managerB.setRemoteDescription(offer, for: peerB)
        let answer = try await managerB.createAnswer(for: peerB)
        try await managerB.setLocalDescription(answer, for: peerB)
        
        // Wait for ICE gathering
        await managerB.waitForIceGathering(peerB)
        
        // Set answer on peer A
        print("\nSetting answer...")
        try await managerA.setRemoteDescription(answer, for: peerA)
        
        // Wait for connection with shorter timeout
        await fulfillment(of: [expectationA, expectationB], timeout: 10.0)
        
        print("\n=== Connection Established ===")
        print("Peer A state: \(peerA.connectionState.rawValue)")
        print("Peer B state: \(peerB.connectionState.rawValue)")
        print("Data channel state: \(dataChannel?.readyState.rawValue ?? -1)")
        
        XCTAssertEqual(peerA.connectionState, .connected)
        XCTAssertEqual(peerB.connectionState, .connected)
    }
}