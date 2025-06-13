import Foundation

public struct RoomConfig: Sendable {
    public let domain: String
    public let zoneId: String
    public let apiToken: String
    public let stunServers: [String]
    public let turnServers: [TURNServer]
    
    public struct TURNServer: Sendable {
        public let url: String
        public let username: String?
        public let credential: String?
        
        public init(url: String, username: String? = nil, credential: String? = nil) {
            self.url = url
            self.username = username
            self.credential = credential
        }
    }
    
    public init(
        domain: String,
        zoneId: String,
        apiToken: String,
        stunServers: [String] = [
            "stun:stun.l.google.com:19302",
            "stun:stun1.l.google.com:19302",
            "stun:stun2.l.google.com:19302",
            "stun:stun3.l.google.com:19302",
            "stun:stun4.l.google.com:19302"
        ],
        turnServers: [TURNServer] = []
    ) {
        self.domain = domain
        self.zoneId = zoneId
        self.apiToken = apiToken
        self.stunServers = stunServers
        self.turnServers = turnServers
    }
}