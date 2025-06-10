# P2P2

A peer-to-peer communication library using Cloudflare DNS for peer discovery and WebRTC for data transfer. Designed for browser extensions that can bypass CORS restrictions.

[![Swift](https://github.com/posix4e/p2p2/actions/workflows/swift.yml/badge.svg)](https://github.com/posix4e/p2p2/actions/workflows/swift.yml)
[![JavaScript](https://github.com/posix4e/p2p2/actions/workflows/javascript.yml/badge.svg)](https://github.com/posix4e/p2p2/actions/workflows/javascript.yml)

## Features

- 🌐 **DNS-based peer discovery** using Cloudflare DNS API
- 🔗 **WebRTC data channels** for direct peer-to-peer communication
- 🔒 **No signaling server required** - uses DNS records for signaling
- 📱 **Safari Extension support** (Swift) - runs WebRTC in background on iOS/macOS
- 🧩 **Chrome Extension support** (JavaScript) - bypasses CORS restrictions
- 🦊 **Firefox Extension support** (JavaScript) - planned
- ⚡ **Simple API** for room-based communication
- 🚫 **No regular browser support** - extensions only due to CORS

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

### Chrome Extension (JavaScript/TypeScript)

```typescript
import { P2P2, ChromeExtensionAdapter } from 'p2p2';

// In your Chrome extension - config stored in chrome.storage
const room = await P2P2.createRoomForChromeExtension('room-name');

// Or with explicit config
const room = P2P2.joinRoom({
  domain: 'your-domain.com',
  zoneId: 'your-cloudflare-zone-id',
  apiToken: 'your-cloudflare-api-token'
}, 'room-name', {
  adapter: new ChromeExtensionAdapter()
});

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

### Safari Extension (Swift)

```swift
import P2P2

// In your Safari extension
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

## Extension Architecture

P2P2 has two separate implementations optimized for different platforms:

### Safari Extensions (Swift)
- Uses native Swift implementation for optimal battery efficiency on iOS/macOS
- Runs WebRTC in the extension's native background process
- No JavaScript involved - pure Swift for better performance

### Chrome/Firefox Extensions (JavaScript)
- Uses JavaScript implementation with service workers
- Routes DNS API calls through background script to bypass CORS
- Runs persistently in background for continuous sync

**Important**: This is an extension-only library. Regular web pages cannot use P2P2 due to CORS restrictions. Background operation is the default - any UI is only for testing/debugging.

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

- **Swift**: iOS 13.0+ / macOS 10.15+ (Safari Extension)
- **JavaScript**: Chrome/Firefox extensions only, Node.js 18+ (for development)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.