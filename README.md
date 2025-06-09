# P2P2

A peer-to-peer communication library using Cloudflare DNS for peer discovery and WebRTC for data transfer. Available for both Swift and JavaScript/TypeScript.

[![Swift](https://github.com/posix4e/p2p2/actions/workflows/swift.yml/badge.svg)](https://github.com/posix4e/p2p2/actions/workflows/swift.yml)
[![JavaScript](https://github.com/posix4e/p2p2/actions/workflows/javascript.yml/badge.svg)](https://github.com/posix4e/p2p2/actions/workflows/javascript.yml)

## Features

- 🌐 **DNS-based peer discovery** using Cloudflare DNS API
- 🔗 **WebRTC data channels** for direct peer-to-peer communication
- 🔒 **No signaling server required** - uses DNS records for signaling
- 📱 **Swift support** for iOS/macOS applications
- 🌏 **JavaScript/TypeScript support** for web and Node.js
- 🧩 **Chrome Extension support** with CORS bypass architecture
- ⚡ **Simple API** for room-based communication

## Installation

### Swift Package Manager

Add to your `Package.swift`:

```swift
dependencies: [
    .package(url: "https://github.com/posix4e/p2p2.git", from: "1.0.0")
]
```

### NPM

```bash
npm install p2p2
```

## Quick Start

### JavaScript/TypeScript

```typescript
import { P2P2 } from 'p2p2';

// Create a room
const room = P2P2.joinRoom({
  domain: 'your-domain.com',
  zoneId: 'your-cloudflare-zone-id',
  apiToken: 'your-cloudflare-api-token'
}, 'room-name');

// Set up event handlers
room.onPeerJoin((peerId) => {
  console.log(`Peer joined: ${peerId}`);
});

room.onData((data, peerId) => {
  console.log(`Received from ${peerId}: ${data}`);
});

// Join the room
await room.join();

// Send messages
room.send('Hello peers!');
```

### Swift

```swift
import P2P2

// Create configuration
let config = RoomConfig(
    domain: "your-domain.com",
    zoneId: "your-cloudflare-zone-id", 
    apiToken: "your-cloudflare-api-token"
)

// Create and join room
let room = try P2P2.joinRoom(config: config, roomId: "room-name")
try await room.join()

// Send messages
try room.send("Hello peers!")

// Handle events
room.onPeerJoin { peerId in
    print("Peer joined: \(peerId)")
}

room.onData { data, peerId in
    print("Received from \(peerId): \(data)")
}
```

## Chrome Extension Usage

P2P2 includes special support for Chrome extensions to bypass CORS restrictions:

```javascript
// In your Chrome extension
const room = await P2P2.createRoomForChromeExtension('room-name');
await room.join();
```

The extension architecture routes API calls through the background script, eliminating CORS issues.

## Environment Variables

Create a `.env` file for local development:

```env
DNS=your-domain.com
ZONEID=your-cloudflare-zone-id
API=your-cloudflare-api-token
ROOMID=default-room-name
```

## Development

### JavaScript

```bash
cd js
npm install
npm run build
npm test
```

### Swift

```bash
swift build
swift test
```

## How It Works

1. **Peer Discovery**: Peers announce their presence by creating DNS TXT records
2. **Signaling**: WebRTC offers/answers are exchanged via DNS TXT records
3. **Connection**: Direct peer-to-peer WebRTC data channels are established
4. **Communication**: Messages are sent directly between peers without any server

## Requirements

- **Cloudflare account** with DNS API access
- **Domain** managed by Cloudflare DNS
- **API Token** with DNS edit permissions

### Platform Requirements

- **Swift**: iOS 13.0+ / macOS 10.15+
- **JavaScript**: Modern browsers with WebRTC support, Node.js 18+

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.