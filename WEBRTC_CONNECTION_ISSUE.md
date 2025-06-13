# WebRTC Connection Issue Analysis

## Problem
Swift WebRTC connections establish ICE successfully but `RTCPeerConnectionState` remains at 0 (new), preventing peer join callbacks from firing.

## Root Cause
The `RTCPeerConnectionState` property in the iOS/macOS WebRTC framework doesn't update properly for data-channel-only connections. While ICE connects successfully (state 2), the peer connection state never transitions from "new" to "connected".

## Evidence
1. ICE connection reaches state 2 (connected) and stays stable
2. Data channels are created and included in SDP  
3. But `RTCPeerConnectionState` remains at 0 (new)
4. JavaScript implementation works, suggesting framework differences

## Solution
Use ICE connection state as the primary indicator of connection success for data-channel-only connections:

```swift
// In ConnectionStateObserver
if (iceState == .connected || iceState == .completed) && 
   connection.connectionState == .new {
    // Treat ICE connected as peer connected
    self?.onStateChange(.connected)
}
```

## Alternative Approaches
1. Monitor data channel state instead of peer connection state
2. Use ICE connection state directly in P2P2Room
3. Update to newer WebRTC framework that properly implements RTCPeerConnectionState

## Recommendation
Implement the ICE-based workaround in ConnectionStateObserver as it's the least invasive change that maintains API compatibility.