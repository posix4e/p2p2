# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

P2P2 is a peer-to-peer communication library that uses DNS TXT records for peer discovery and WebRTC for data transfer. It has two separate implementations for different extension platforms:

- **Swift**: Native implementation for Safari extensions on iOS/macOS
  - Runs entirely in the extension's native process (no JavaScript)
  - Optimized for battery efficiency
  - Background sync by default
  
- **JavaScript**: For Chrome/Firefox extensions
  - Runs in service workers for background persistence
  - Routes DNS API calls through background script to bypass CORS
  - Chrome implemented, Firefox planned

Regular browser contexts are not supported - extensions only.

## Essential Commands

### JavaScript/TypeScript Development

```bash
# Setup
npm install

# Build & Development
npm run build      # Build TypeScript
npm run dev        # Watch mode
npm run typecheck  # Type checking
npm run lint       # Run ESLint
npm run format     # Run Prettier

# Testing
npm test           # Chrome extension E2E tests
npm test:basic     # Basic E2E tests  
npm test:all       # All Playwright tests

# Examples
npm run example    # Web chat example (Vite)
npm run server     # Node.js server
```

### Swift Development

```bash
# Build & Test
swift build        # Build library and CLI
swift test         # Run tests

# Run CLI chat
swift run p2p2-cli

# With environment variables
DNS=domain.com ZONEID=zone-id API=api-token ROOMID=room swift run p2p2-cli
```

## Architecture

The library consists of these key components across both platforms:

1. **P2P2Core**: Orchestrates WebRTC connections and DNS discovery
2. **CloudflareDNSDiscovery**: Manages DNS TXT records for peer announcements and signaling
3. **WebRTCManager**: Handles WebRTC peer connections and data channels
4. **P2P2Room**: High-level API for room-based multi-peer communication

The JavaScript implementation uses environment adapters:
- `ChromeExtensionAdapter`: Chrome extension environment (primary target)
- `NodeAdapter`: Node.js runtime (development/testing only)

Browser contexts are explicitly not supported - the library will throw an error if used outside of an extension environment.

## Key Implementation Details

- Peer discovery uses DNS TXT records with format: `p2p2-{peerName}.{roomId}.{domain}`
- Signaling data (SDP, ICE) is exchanged through DNS TXT record updates
- WebRTC data channels handle actual peer communication
- No central server required after DNS setup
- Chrome extension bypasses CORS restrictions for DNS API calls

## Testing Approach

- Swift: Uses XCTest with async/await, tests real DNS/WebRTC connections
- JavaScript: Playwright E2E tests including Chrome extension loading
- Both platforms test multi-peer scenarios
- Tests require Cloudflare API credentials (DNS, ZONEID, API env vars)

## Environment Variables

Required for testing and CLI:
- `DNS`: Cloudflare domain
- `ZONEID`: Cloudflare Zone ID  
- `API`: Cloudflare API token
- `ROOMID`: Optional default room ID

## Important Instructions

ALWAYS remove any fallback code, demos, mocks, or special behavior for CI. These are toxic for AI coding and create confusion between real implementation and test/demo code.