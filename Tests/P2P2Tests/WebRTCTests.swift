import XCTest
@testable import P2P2
@preconcurrency import WebRTC

final class WebRTCTests: XCTestCase {
    
    func testBasicWebRTCConnection() async throws {
        // Create two WebRTC managers
        let manager1 = WebRTCManager()
        let manager2 = WebRTCManager()
        
        // Create connections
        let connection1 = try await manager1.createPeerConnection()
        let connection2 = try await manager2.createPeerConnection()
        
        // Create data channel on connection1
        let config = RTCDataChannelConfiguration()
        config.isOrdered = true
        let dataChannel = connection1.dataChannel(forLabel: "test", configuration: config)
        XCTAssertNotNil(dataChannel)
        
        // Create offer
        let offer = try await manager1.createOffer(for: connection1)
        print("Created offer with SDP length: \(offer.sdp.count)")
        
        // Set local description on connection1
        try await manager1.setLocalDescription(offer, for: connection1)
        print("Set local description on connection1")
        
        // Try to set remote description on connection2
        print("Attempting to set remote description on connection2")
        print("Offer type: \(offer.type.rawValue)")
        print("Offer SDP preview: \(String(offer.sdp.prefix(100)))")
        
        do {
            try await manager2.setRemoteDescription(offer, for: connection2)
            print("Successfully set remote description")
        } catch {
            print("Failed to set remote description: \(error)")
            throw error
        }
        
        // Create answer
        let answer = try await manager2.createAnswer(for: connection2)
        print("Created answer with SDP length: \(answer.sdp.count)")
        
        // Set local description on connection2
        try await manager2.setLocalDescription(answer, for: connection2)
        
        // Set remote description on connection1
        try await manager1.setRemoteDescription(answer, for: connection1)
        
        print("WebRTC negotiation completed successfully")
    }
    
    func testSDPRoundTrip() async throws {
        // Test that we can create and parse SDP correctly
        let manager = WebRTCManager()
        let connection = try await manager.createPeerConnection()
        
        // Create offer
        let offer = try await manager.createOffer(for: connection)
        let sdpString = offer.sdp
        
        print("Original SDP length: \(sdpString.count)")
        print("Original SDP preview: \(String(sdpString.prefix(100)))")
        
        // Create new RTCSessionDescription from string
        let recreatedOffer = RTCSessionDescription(type: .offer, sdp: sdpString)
        print("Recreated SDP length: \(recreatedOffer.sdp.count)")
        print("Recreated SDP preview: \(String(recreatedOffer.sdp.prefix(100)))")
        
        // Verify they match
        XCTAssertEqual(sdpString, recreatedOffer.sdp)
        XCTAssertEqual(offer.type, recreatedOffer.type)
    }
    
    func testSDPFromDNS() async throws {
        // Test the full JSON exchange flow with ICE gathering
        let manager = WebRTCManager()
        
        // Create connection1 that will generate an offer
        let connection1 = try await manager.createPeerConnection()
        let dataChannel = connection1.dataChannel(forLabel: "data", configuration: RTCDataChannelConfiguration())
        XCTAssertNotNil(dataChannel)
        
        // Create offer and wait for ICE gathering
        let offer = try await manager.createOffer(for: connection1)
        try await manager.setLocalDescription(offer, for: connection1)
        await manager.waitForIceGathering(connection1)
        
        // Simulate JSON exchange format
        let offerData: [String: Any] = [
            "type": "offer",
            "sdp": offer.sdp
        ]
        
        guard let jsonData = try? JSONSerialization.data(withJSONObject: offerData),
              let jsonString = String(data: jsonData, encoding: .utf8) else {
            XCTFail("Failed to create JSON")
            return
        }
        
        print("JSON to send via DNS: \(jsonString)")
        
        // Parse it back like P2P2Room does
        guard let data = jsonString.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let sdp = json["sdp"] as? String,
              let type = json["type"] as? String,
              type == "offer" else {
            XCTFail("Failed to parse JSON")
            return
        }
        
        // Create connection2 that will receive the offer
        let connection2 = try await manager.createPeerConnection()
        let parsedOffer = RTCSessionDescription(type: .offer, sdp: sdp)
        
        // This should work now because the SDP includes ICE candidates
        try await manager.setRemoteDescription(parsedOffer, for: connection2)
        print("Successfully set remote description from JSON format")
        
        // Create answer and verify it works
        let answer = try await manager.createAnswer(for: connection2)
        try await manager.setLocalDescription(answer, for: connection2)
        await manager.waitForIceGathering(connection2)
        
        XCTAssertFalse(answer.sdp.isEmpty, "Answer SDP should not be empty")
        // Note: In test environment, ICE candidates may not be gathered (no network)
        // The important thing is that the SDP exchange format works correctly
    }
}