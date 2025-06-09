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
        
        print("Peer 1 ID: \(peer1.getPeerId())")
        print("Peer 2 ID: \(peer2.getPeerId())")
        
        // Set up expectations
        let peer1Connected = expectation(description: "Peer 1 connected")
        let peer2Connected = expectation(description: "Peer 2 connected")
        let messageReceived = expectation(description: "Message received")
        
        // Set up handlers
        peer1.onPeerJoin { peerId in
            print("Peer 1: Peer joined \(peerId)")
            peer1Connected.fulfill()
        }
        
        peer2.onPeerJoin { peerId in
            print("Peer 2: Peer joined \(peerId)")
            peer2Connected.fulfill()
        }
        
        peer2.onData { data, peerId in
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
        try peer1.send("Hello from Peer 1!")
        
        // Wait for message
        await fulfillment(of: [messageReceived], timeout: 10)
        
        // Clean up
        await peer1.leave()
        await peer2.leave()
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
            print("Peer \(index) joined with ID: \(peer.getPeerId())")
        }
        
        // Wait a bit for discovery
        try await Task.sleep(nanoseconds: 15_000_000_000) // 15 seconds
        
        // Each peer should see 2 others
        for (index, peer) in peers.enumerated() {
            let discovered = try await peer.discoverPeers()
            print("Peer \(index) discovered: \(discovered.count) peers")
            XCTAssertGreaterThanOrEqual(discovered.count, 2)
        }
        
        // Clean up
        for peer in peers {
            await peer.leave()
        }
    }
}