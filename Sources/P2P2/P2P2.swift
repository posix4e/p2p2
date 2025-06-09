import Foundation

public enum P2P2 {
    public static func joinRoom(config: RoomConfig, roomId: String) throws -> P2P2Room {
        return P2P2Room(roomId: roomId, config: config)
    }
    
    public static func createRoomFromEnvironment(roomId: String? = nil) throws -> P2P2Room {
        guard let domain = ProcessInfo.processInfo.environment["DNS"],
              let zoneId = ProcessInfo.processInfo.environment["ZONEID"],
              let apiToken = ProcessInfo.processInfo.environment["API"] else {
            throw P2P2Error.invalidConfiguration("Missing required environment variables: DNS, ZONEID, API")
        }
        
        let finalRoomId = roomId ?? ProcessInfo.processInfo.environment["ROOMID"] ?? "default-room"
        
        let config = RoomConfig(
            domain: domain,
            zoneId: zoneId,
            apiToken: apiToken
        )
        
        return try joinRoom(config: config, roomId: finalRoomId)
    }
}