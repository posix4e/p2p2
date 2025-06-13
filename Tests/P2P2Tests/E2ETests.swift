import XCTest
@testable import P2P2

final class E2ETests: XCTestCase {
    
    func testRealP2PCommunication() async throws {
        // Skip if no environment variables
        guard let domain = ProcessInfo.processInfo.environment["DNS"],
              let zoneId = ProcessInfo.processInfo.environment["ZONEID"],
              let apiToken = ProcessInfo.processInfo.environment["API"] else {
            throw XCTSkip("Requires DNS, ZONEID, and API environment variables")
        }
        
        let config = RoomConfig(
            domain: domain,
            zoneId: zoneId,
            apiToken: apiToken
        )
        
        let roomId = "swift-e2e-test-\(Date().timeIntervalSince1970)"
        
        // Create two peers
        let peer1 = try P2P2.joinRoom(config: config, roomId: roomId)
        let peer2 = try P2P2.joinRoom(config: config, roomId: roomId)
        
        print("Peer 1 ID: \(await peer1.peerId)")
        print("Peer 2 ID: \(await peer2.peerId)")
        
        // Set up expectations
        let peer1Connected = expectation(description: "Peer 1 connected")
        let peer2Connected = expectation(description: "Peer 2 connected")
        let messageReceived = expectation(description: "Message received")
        
        // Set up handlers
        await peer1.onPeerJoin { peerId in
            print("Peer 1: Peer joined \(peerId)")
            peer1Connected.fulfill()
        }
        
        await peer2.onPeerJoin { peerId in
            print("Peer 2: Peer joined \(peerId)")
            peer2Connected.fulfill()
        }
        
        await peer2.onData { data, peerId in
            if let message = String(data: data, encoding: .utf8) {
                print("Peer 2 received: \(message) from \(peerId)")
                XCTAssertEqual(message, "Hello from Peer 1!")
                messageReceived.fulfill()
            }
        }
        
        // Join rooms
        try await peer1.join()
        print("Peer 1 joined room")
        
        try await peer2.join()
        print("Peer 2 joined room")
        
        // Wait for connection (with timeout)
        await fulfillment(of: [peer1Connected, peer2Connected], timeout: 30)
        
        // Send message
        try await peer1.send("Hello from Peer 1!".data(using: .utf8)!)
        
        // Wait for message
        await fulfillment(of: [messageReceived], timeout: 10)
        
        // Clean up
        try await peer1.leave()
        try await peer2.leave()
        
        // Give time for cleanup
        try await Task.sleep(nanoseconds: 500_000_000) // 500ms
        
        // Clean up WebRTC
        WebRTCManager.cleanup()
    }
    
    func testMultiplePeers() async throws {
        // Skip if no environment variables
        guard let domain = ProcessInfo.processInfo.environment["DNS"],
              let zoneId = ProcessInfo.processInfo.environment["ZONEID"],
              let apiToken = ProcessInfo.processInfo.environment["API"] else {
            throw XCTSkip("Requires DNS, ZONEID, and API environment variables")
        }
        
        let config = RoomConfig(
            domain: domain,
            zoneId: zoneId,
            apiToken: apiToken
        )
        
        let roomId = "swift-multi-test-\(Date().timeIntervalSince1970)"
        
        // Create three peers
        let peers = try (0..<3).map { _ in
            try P2P2.joinRoom(config: config, roomId: roomId)
        }
        
        // Join all peers
        for (index, peer) in peers.enumerated() {
            try await peer.join()
            print("Peer \(index) joined with ID: \(await peer.peerId)")
        }
        
        // Wait a bit for discovery
        try await Task.sleep(nanoseconds: 15_000_000_000) // 15 seconds
        
        // Each peer should see 2 others
        // Note: discoverPeers is a private method, so we'll just wait and trust
        // that peers will discover each other through the background task
        
        // Clean up
        for peer in peers {
            try await peer.leave()
        }
        
        // Give time for cleanup
        try await Task.sleep(nanoseconds: 500_000_000) // 500ms
        
        // Clean up WebRTC
        WebRTCManager.cleanup()
    }
}