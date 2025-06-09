import Foundation
import P2P2
import Combine

/// Manager class for using P2P2 in iOS apps
@MainActor
class P2P2Manager: ObservableObject {
    @Published var isConnected = false
    @Published var peers: [String] = []
    @Published var messages: [ChatMessage] = []
    @Published var error: String?
    
    private var room: P2P2Room?
    private let config: RoomConfig
    
    struct ChatMessage: Identifiable {
        let id = UUID()
        let content: String
        let peerId: String
        let timestamp: Date
        let isLocal: Bool
    }
    
    init() {
        // In production, load from secure storage or configuration
        self.config = RoomConfig(
            domain: ProcessInfo.processInfo.environment["DNS"] ?? "",
            zoneId: ProcessInfo.processInfo.environment["ZONEID"] ?? "",
            apiToken: ProcessInfo.processInfo.environment["API"] ?? ""
        )
    }
    
    func joinRoom(_ roomId: String) async {
        do {
            // Leave existing room if any
            if let room = room {
                try await room.leave()
            }
            
            // Create and join new room
            room = try P2P2.joinRoom(config: config, roomId: roomId)
            
            // Set up handlers
            await room?.onPeerJoin { [weak self] peerId in
                await MainActor.run {
                    self?.peers.append(peerId)
                    self?.addSystemMessage("Peer joined: \(peerId.prefix(8))")
                }
            }
            
            await room?.onPeerLeave { [weak self] peerId in
                await MainActor.run {
                    self?.peers.removeAll { $0 == peerId }
                    self?.addSystemMessage("Peer left: \(peerId.prefix(8))")
                }
            }
            
            await room?.onData { [weak self] data, peerId in
                if let message = String(data: data, encoding: .utf8) {
                    await MainActor.run {
                        self?.messages.append(ChatMessage(
                            content: message,
                            peerId: peerId,
                            timestamp: Date(),
                            isLocal: false
                        ))
                    }
                }
            }
            
            // Join the room
            try await room?.join()
            isConnected = true
            error = nil
            
        } catch {
            self.error = error.localizedDescription
            isConnected = false
        }
    }
    
    func sendMessage(_ message: String) async {
        guard let room = room else { return }
        
        do {
            let data = message.data(using: .utf8)!
            try await room.send(data)
            
            // Add to local messages
            messages.append(ChatMessage(
                content: message,
                peerId: "You",
                timestamp: Date(),
                isLocal: true
            ))
        } catch {
            self.error = "Failed to send message: \(error.localizedDescription)"
        }
    }
    
    func leaveRoom() async {
        do {
            try await room?.leave()
            room = nil
            isConnected = false
            peers.removeAll()
            addSystemMessage("Left room")
        } catch {
            self.error = "Failed to leave room: \(error.localizedDescription)"
        }
    }
    
    private func addSystemMessage(_ text: String) {
        messages.append(ChatMessage(
            content: text,
            peerId: "System",
            timestamp: Date(),
            isLocal: false
        ))
    }
}

// MARK: - SwiftUI View Example

import SwiftUI

struct P2P2ChatView: View {
    @StateObject private var manager = P2P2Manager()
    @State private var roomId = "chat-room"
    @State private var messageText = ""
    
    var body: some View {
        NavigationView {
            VStack {
                if !manager.isConnected {
                    // Connection view
                    VStack(spacing: 20) {
                        TextField("Room ID", text: $roomId)
                            .textFieldStyle(RoundedBorderTextFieldStyle())
                            .autocapitalization(.none)
                        
                        Button("Join Room") {
                            Task {
                                await manager.joinRoom(roomId)
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        
                        if let error = manager.error {
                            Text(error)
                                .foregroundColor(.red)
                                .font(.caption)
                        }
                    }
                    .padding()
                } else {
                    // Chat view
                    VStack {
                        // Peer list
                        if !manager.peers.isEmpty {
                            ScrollView(.horizontal) {
                                HStack {
                                    ForEach(manager.peers, id: \\.self) { peer in
                                        Text(String(peer.prefix(8)))
                                            .font(.caption)
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 4)
                                            .background(Color.blue.opacity(0.2))
                                            .cornerRadius(8)
                                    }
                                }
                            }
                            .padding(.horizontal)
                        }
                        
                        // Messages
                        ScrollView {
                            LazyVStack(alignment: .leading, spacing: 8) {
                                ForEach(manager.messages) { message in
                                    MessageBubble(message: message)
                                }
                            }
                            .padding()
                        }
                        
                        // Input
                        HStack {
                            TextField("Message", text: $messageText)
                                .textFieldStyle(RoundedBorderTextFieldStyle())
                            
                            Button("Send") {
                                Task {
                                    await manager.sendMessage(messageText)
                                    messageText = ""
                                }
                            }
                            .disabled(messageText.isEmpty)
                        }
                        .padding()
                    }
                }
            }
            .navigationTitle("P2P2 Chat")
            .toolbar {
                if manager.isConnected {
                    Button("Leave") {
                        Task {
                            await manager.leaveRoom()
                        }
                    }
                }
            }
        }
    }
}

struct MessageBubble: View {
    let message: P2P2Manager.ChatMessage
    
    var body: some View {
        VStack(alignment: message.isLocal ? .trailing : .leading, spacing: 4) {
            Text(message.isLocal ? "You" : String(message.peerId.prefix(8)))
                .font(.caption)
                .foregroundColor(.secondary)
            
            Text(message.content)
                .padding(10)
                .background(message.isLocal ? Color.blue : Color.gray.opacity(0.3))
                .foregroundColor(message.isLocal ? .white : .primary)
                .cornerRadius(12)
        }
        .frame(maxWidth: .infinity, alignment: message.isLocal ? .trailing : .leading)
    }
}