import Foundation
import P2P2

@main
struct P2P2CLI {
    static func main() async {
        print("P2P2 Chat CLI")
        print("=============")
        
        do {
            // Load configuration from environment
            let room = try P2P2.createRoomFromEnvironment()
            
            // Set up event handlers
            await room.onPeerJoin { peerId in
                print("\n[+] Peer joined: \(peerId)")
            }
            
            await room.onPeerLeave { peerId in
                print("\n[-] Peer left: \(peerId)")
            }
            
            await room.onData { data, peerId in
                if let message = String(data: data, encoding: .utf8) {
                    print("\n[\(peerId.prefix(8))]: \(message)")
                }
            }
            
            // Join the room
            print("Joining room...")
            try await room.join()
            print("Connected! Type messages to send, or 'quit' to exit.\n")
            
            // Start input loop
            Task {
                while true {
                    if let input = readLine() {
                        if input.lowercased() == "quit" {
                            try await room.leave()
                            exit(0)
                        } else if !input.isEmpty {
                            let data = input.data(using: .utf8)!
                            try await room.send(data)
                        }
                    }
                }
            }
            
            // Keep the program running
            try await Task.sleep(nanoseconds: .max)
            
        } catch {
            print("Error: \(error.localizedDescription)")
            exit(1)
        }
    }
}