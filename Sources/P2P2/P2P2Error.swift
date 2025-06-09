import Foundation

public enum P2P2Error: Error, LocalizedError {
    case peerNotConnected
    case connectionFailed(String)
    case dnsError(String)
    case signalingFailed(String)
    case invalidConfiguration(String)
    
    public var errorDescription: String? {
        switch self {
        case .peerNotConnected:
            return "Peer is not connected"
        case .connectionFailed(let reason):
            return "Connection failed: \(reason)"
        case .dnsError(let reason):
            return "DNS error: \(reason)"
        case .signalingFailed(let reason):
            return "Signaling failed: \(reason)"
        case .invalidConfiguration(let reason):
            return "Invalid configuration: \(reason)"
        }
    }
}