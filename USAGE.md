# P2P2 Library Usage Guide

## Overview

P2P2 is a modular peer-to-peer communication library that uses Cloudflare DNS API for peer discovery and WebRTC for data transfer. It's designed to work in multiple environments:

- **Node.js** applications
- **Web browsers**
- **Chrome extensions**
- **iOS apps** (Swift)
- **macOS apps** (Swift)

## JavaScript/TypeScript Usage

### Basic Usage (Node.js or Browser)

```javascript
import { P2P2 } from 'p2p2';

// Create room from environment variables
const room = P2P2.createRoomFromEnvironment();

// Or with explicit config
const room = P2P2.joinRoom({
  domain: 'your-domain.com',
  zoneId: 'your-zone-id',
  apiToken: 'your-api-token'
}, 'room-name');

// Set up event handlers
room.onPeerJoin((peerId) => {
  console.log('Peer joined:', peerId);
});

room.onPeerLeave((peerId) => {
  console.log('Peer left:', peerId);
});

room.onData((data, peerId) => {
  console.log('Received:', data, 'from', peerId);
});

// Join the room
await room.join();

// Send messages
room.send('Hello, peers!');
room.sendTo(specificPeerId, 'Private message');

// Leave when done
await room.leave();
```

### Chrome Extension Usage

```javascript
// In background script
import { P2P2 } from 'p2p2';

// Store config in chrome.storage
await chrome.storage.local.set({
  p2p2Config: {
    domain: 'your-domain.com',
    zoneId: 'your-zone-id',
    apiToken: 'your-api-token'
  }
});

// Create room with Chrome adapter
const room = await P2P2.createRoomForChromeExtension('room-name');
await room.join();
```

### Advanced Usage with Core API

```javascript
import { P2P2Core, CloudflareDNSDiscovery, WebRTCManager } from 'p2p2';

// Use individual components
const discovery = new CloudflareDNSDiscovery(domain, zoneId, apiToken);
const webrtc = new WebRTCManager(config);

// Or use the core class
const core = new P2P2Core(config);

// Direct DNS operations
await core.announcePresence('room-id');
const peers = await core.discoverPeers('room-id');

// Direct WebRTC operations
const connection = await core.createPeerConnection();
const channel = core.createDataChannel(connection);
```

### Custom Environment Adapters

```javascript
import { P2P2, NodeAdapter, BrowserAdapter } from 'p2p2';

// Use specific adapter
const room = P2P2.joinRoom(config, roomId, {
  adapter: new NodeAdapter(),
  discoveryInterval: 3000 // Check every 3 seconds
});

// Create custom adapter
class MyCustomAdapter extends BrowserAdapter {
  getEnvironmentVariable(name) {
    // Custom logic
    return myStorage.get(name);
  }
}
```

## Swift Usage

### Basic Usage

```swift
import P2P2

// Create room from environment
let room = try P2P2.createRoomFromEnvironment()

// Or with explicit config
let config = RoomConfig(
    domain: "your-domain.com",
    zoneId: "your-zone-id",
    apiToken: "your-api-token"
)
let room = try P2P2.joinRoom(config: config, roomId: "room-name")

// Set up handlers
await room.onPeerJoin { peerId in
    print("Peer joined: \(peerId)")
}

await room.onData { data, peerId in
    if let message = String(data: data, encoding: .utf8) {
        print("Received: \(message) from \(peerId)")
    }
}

// Join and use
try await room.join()
try await room.send("Hello, peers!".data(using: .utf8)!)
try await room.leave()
```

### iOS App Usage

```swift
import P2P2
import SwiftUI

@MainActor
class ChatManager: ObservableObject {
    @Published var messages: [Message] = []
    private var room: P2P2Room?
    
    func connect(roomId: String) async {
        let config = RoomConfig(
            domain: ProcessInfo.processInfo.environment["DNS"]!,
            zoneId: ProcessInfo.processInfo.environment["ZONEID"]!,
            apiToken: ProcessInfo.processInfo.environment["API"]!
        )
        
        room = P2P2Room(roomId: roomId, config: config)
        
        // Configure for iOS
        #if os(iOS)
        room.core.configureForIOS()
        #endif
        
        try await room?.join()
    }
}
```

### Advanced Usage with Core API

```swift
import P2P2

// Use core functionality directly
let core = P2P2Core(config: config)

// DNS operations
try await core.announcePresence(roomId: "test")
let peers = try await core.discoverPeers(roomId: "test")

// WebRTC operations
let connection = try await core.createPeerConnection()
let channel = core.createDataChannel(connection)

// iOS specific features
#if os(iOS)
core.configureForIOS()
core.handleAppDidEnterBackground()
#endif
```

## Environment Configuration

### Environment Variables

- `DNS` - Your Cloudflare domain
- `ZONEID` - Cloudflare Zone ID
- `API` - Cloudflare API token
- `ROOMID` - Default room ID (optional)

### Security Notes

1. **Never hardcode API credentials** in your source code
2. **Use secure storage** for credentials:
   - Environment variables for servers
   - Keychain for iOS/macOS
   - chrome.storage for extensions
   - Secure preferences for Android

3. **Scope API tokens** to minimum required permissions:
   - Zone:DNS:Edit for the specific zone

## Building from Source

### JavaScript
```bash
cd js
npm install
npm run build
```

### Swift
```bash
swift build
```

## Examples

- `/js/example/` - Web chat application
- `/js/examples/chrome-extension/` - Chrome extension example
- `/Examples/iOSExample/` - iOS app example
- `/Sources/P2P2CLI/` - Swift command-line chat

## Testing

### JavaScript
```bash
cd js
npm test
```

### Swift
```bash
swift test
```