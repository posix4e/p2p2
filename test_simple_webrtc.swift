import Foundation
import WebRTC

// Simple WebRTC test without P2P2 wrapper

signal(SIGPIPE, SIG_IGN)
RTCInitializeSSL()

let factory = RTCPeerConnectionFactory()

// Configuration
let config = RTCConfiguration()
config.iceServers = [RTCIceServer(urlStrings: ["stun:stun.l.google.com:19302"])]
config.sdpSemantics = .unifiedPlan

let constraints = RTCMediaConstraints(
    mandatoryConstraints: ["OfferToReceiveAudio": "false", "OfferToReceiveVideo": "false"],
    optionalConstraints: nil
)

// Create connections
let pc1 = factory.peerConnection(with: config, constraints: constraints, delegate: nil)!
let pc2 = factory.peerConnection(with: config, constraints: constraints, delegate: nil)!

print("Created peer connections")

// Monitor states
class Monitor: NSObject {
    var obs1: NSKeyValueObservation?
    var obs2: NSKeyValueObservation?
    
    override init() {
        super.init()
        obs1 = pc1.observe(\.connectionState) { pc, _ in
            print("PC1 connection state: \(pc.connectionState.rawValue)")
        }
        obs2 = pc2.observe(\.connectionState) { pc, _ in
            print("PC2 connection state: \(pc.connectionState.rawValue)")
        }
    }
}

let monitor = Monitor()

// Create data channel BEFORE offer
let dcConfig = RTCDataChannelConfiguration()
dcConfig.isOrdered = true
let dc = pc1.dataChannel(forLabel: "test", configuration: dcConfig)
print("Created data channel")

// Exchange ICE candidates
class Delegate: NSObject, RTCPeerConnectionDelegate {
    let name: String
    weak var other: RTCPeerConnection?
    
    init(name: String) {
        self.name = name
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        print("[\(name)] ICE: \(newState.rawValue)")
    }
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        other?.add(candidate) { _ in }
    }
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {
        print("[\(name)] Data channel opened!")
    }
}

let d1 = Delegate(name: "PC1")
let d2 = Delegate(name: "PC2")
d1.other = pc2
d2.other = pc1
pc1.delegate = d1
pc2.delegate = d2

// Create offer
let sem = DispatchSemaphore(value: 0)
pc1.offer(for: constraints) { offer, error in
    guard let offer = offer else { 
        print("Failed to create offer: \(error!)")
        exit(1)
    }
    
    pc1.setLocalDescription(offer) { error in
        if let error = error {
            print("Failed to set local description: \(error)")
            exit(1)
        }
        
        // Set remote on pc2
        pc2.setRemoteDescription(offer) { error in
            if let error = error {
                print("Failed to set remote description: \(error)")
                exit(1)
            }
            
            // Create answer
            pc2.answer(for: constraints) { answer, error in
                guard let answer = answer else {
                    print("Failed to create answer: \(error!)")
                    exit(1)
                }
                
                pc2.setLocalDescription(answer) { error in
                    if let error = error {
                        print("Failed to set local description: \(error)")
                        exit(1)
                    }
                    
                    // Set answer on pc1
                    pc1.setRemoteDescription(answer) { error in
                        if let error = error {
                            print("Failed to set remote description: \(error)")
                            exit(1)
                        }
                        sem.signal()
                    }
                }
            }
        }
    }
}

sem.wait()
print("\nOffer/Answer exchange complete")

// Wait for connection
sleep(5)

print("\nFinal states:")
print("PC1: connection=\(pc1.connectionState.rawValue), ice=\(pc1.iceConnectionState.rawValue)")
print("PC2: connection=\(pc2.connectionState.rawValue), ice=\(pc2.iceConnectionState.rawValue)")
print("Data channel: \(dc?.readyState.rawValue ?? -1)")

RTCCleanupSSL()