#!/usr/bin/env swift

import Foundation
import WebRTC
import P2P2

// Test WebRTC connection establishment locally without DNS

signal(SIGPIPE, SIG_IGN)
RTCInitializeSSL()

print("Creating WebRTC connections...")

// Create two peer connections
let factory = RTCPeerConnectionFactory()
let config = RTCConfiguration()
config.iceServers = [RTCIceServer(urlStrings: ["stun:stun.l.google.com:19302"])]
config.bundlePolicy = .balanced
config.rtcpMuxPolicy = .require
config.sdpSemantics = .unifiedPlan

let constraints = RTCMediaConstraints(
    mandatoryConstraints: [
        "OfferToReceiveAudio": "false",
        "OfferToReceiveVideo": "false"
    ],
    optionalConstraints: nil
)

// Create peer A (initiator)
let peerA = factory.peerConnection(with: config, constraints: constraints, delegate: nil)!
print("Created peer A")

// Create peer B (receiver)
let peerB = factory.peerConnection(with: config, constraints: constraints, delegate: nil)!
print("Created peer B")

// Monitor connection states
class ConnectionMonitor: NSObject, RTCPeerConnectionDelegate {
    let name: String
    var iceConnectionState: RTCIceConnectionState = .new
    var connectionState: RTCPeerConnectionState = .new
    
    init(name: String) {
        self.name = name
        super.init()
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {
        print("[\(name)] Signaling state: \(stateChanged.rawValue)")
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        print("[\(name)] ICE connection state: \(newState.rawValue)")
        iceConnectionState = newState
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {
        print("[\(name)] ICE gathering state: \(newState.rawValue)")
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        print("[\(name)] Generated ICE candidate")
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {
        print("[\(name)] Data channel opened!")
    }
}

// Set delegates
let monitorA = ConnectionMonitor(name: "A")
let monitorB = ConnectionMonitor(name: "B")
peerA.delegate = monitorA
peerB.delegate = monitorB

// Observe connection state using KVO
class StateObserver: NSObject {
    let name: String
    var observation: NSKeyValueObservation?
    
    init(name: String, connection: RTCPeerConnection) {
        self.name = name
        super.init()
        
        observation = connection.observe(\.connectionState, options: [.new, .initial]) { [weak self] connection, _ in
            print("[\(self?.name ?? "")] RTCPeerConnectionState: \(connection.connectionState.rawValue)")
        }
    }
}

let observerA = StateObserver(name: "A", connection: peerA)
let observerB = StateObserver(name: "B", connection: peerB)

// Create data channel on peer A BEFORE creating offer
print("\nCreating data channel on peer A...")
let dcConfig = RTCDataChannelConfiguration()
dcConfig.isOrdered = true
dcConfig.maxRetransmits = 3
dcConfig.isNegotiated = false

let dataChannel = peerA.dataChannel(forLabel: "data", configuration: dcConfig)
print("Data channel created, state: \(dataChannel?.readyState.rawValue ?? -1)")

// Handle data channel on peer B
peerB.delegate = monitorB

// Create offer
print("\nCreating offer...")
let semaphore = DispatchSemaphore(value: 0)
var localOffer: RTCSessionDescription?

peerA.offer(for: constraints) { sdp, error in
    if let error = error {
        print("Error creating offer: \(error)")
    } else if let sdp = sdp {
        print("Offer created, setting local description...")
        peerA.setLocalDescription(sdp) { error in
            if let error = error {
                print("Error setting local description: \(error)")
            } else {
                print("Local description set")
                localOffer = sdp
            }
            semaphore.signal()
        }
    }
}

semaphore.wait()

// Wait for ICE gathering
print("\nWaiting for ICE gathering...")
Thread.sleep(forTimeInterval: 2.0)

// Set offer on peer B and create answer
print("\nSetting remote description on peer B...")
var localAnswer: RTCSessionDescription?

peerB.setRemoteDescription(localOffer!) { error in
    if let error = error {
        print("Error setting remote description: \(error)")
    } else {
        print("Remote description set, creating answer...")
        peerB.answer(for: constraints) { sdp, error in
            if let error = error {
                print("Error creating answer: \(error)")
            } else if let sdp = sdp {
                print("Answer created, setting local description...")
                peerB.setLocalDescription(sdp) { error in
                    if let error = error {
                        print("Error setting local description: \(error)")
                    } else {
                        print("Local description set")
                        localAnswer = sdp
                    }
                    semaphore.signal()
                }
            }
        }
    }
}

semaphore.wait()

// Set answer on peer A
print("\nSetting remote description on peer A...")
peerA.setRemoteDescription(localAnswer!) { error in
    if let error = error {
        print("Error setting remote description: \(error)")
    } else {
        print("Remote description set")
    }
    semaphore.signal()
}

semaphore.wait()

// Wait for connection
print("\nWaiting for connection...")
Thread.sleep(forTimeInterval: 5.0)

// Check final states
print("\n=== Final States ===")
print("Peer A - ICE: \(monitorA.iceConnectionState.rawValue), Connection: \(peerA.connectionState.rawValue)")
print("Peer B - ICE: \(monitorB.iceConnectionState.rawValue), Connection: \(peerB.connectionState.rawValue)")
print("Data channel state: \(dataChannel?.readyState.rawValue ?? -1)")

// Clean up
RTCCleanupSSL()