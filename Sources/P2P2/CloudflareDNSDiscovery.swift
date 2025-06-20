import Foundation

public actor CloudflareDNSDiscovery {
    private let domain: String
    private let zoneId: String
    private let apiToken: String
    private let session: URLSession
    public let peerId: String
    
    private var activeRecords: Set<String> = []
    
    init(domain: String, zoneId: String, apiToken: String) {
        self.domain = domain
        self.zoneId = zoneId
        self.apiToken = apiToken
        self.session = URLSession.shared
        self.peerId = UUID().uuidString.lowercased().replacingOccurrences(of: "-", with: "")
    }
    
    func announcePresence(roomId: String) async throws {
        let recordName = "_p2p2-\(roomId)-peer-\(peerId)"
        
        // Create TXT record announcing our presence
        let record = DNSRecord(
            type: "TXT",
            name: recordName,
            content: peerId,
            ttl: 60 // 1 minute TTL for quick updates
        )
        
        try await createDNSRecord(record)
        activeRecords.insert(record.id ?? "")
    }
    
    func removePresence(roomId: String) async throws {
        // Delete all our active records
        for recordId in activeRecords {
            try await deleteDNSRecord(recordId)
        }
        activeRecords.removeAll()
    }
    
    func discoverPeers(roomId: String) async throws -> [String] {
        let prefix = "_p2p2-\(roomId)-peer-"
        let records = try await listDNSRecords(prefix: prefix)
        
        return records
            .filter { $0.type == "TXT" && $0.name.hasPrefix(prefix) }
            .compactMap { $0.content }
            .filter { $0 != peerId } // Exclude ourselves
    }
    
    func publishSignalingData(roomId: String, peerId: String, data: String) async throws {
        let recordName = "_p2p2-\(roomId)-sig-\(self.peerId)-to-\(peerId)"
        
        // Chunk data if needed (TXT records have 255 char limit per string)
        let chunks = data.chunks(ofCount: 255)
        let content = chunks.map { String($0) }.joined(separator: "")
        
        let record = DNSRecord(
            type: "TXT",
            name: recordName,
            content: content,
            ttl: 30 // Short TTL for signaling
        )
        
        try await createDNSRecord(record)
        activeRecords.insert(record.id ?? "")
    }
    
    func getSignalingData(roomId: String, fromPeerId: String) async throws -> String? {
        let recordName = "_p2p2-\(roomId)-sig-\(fromPeerId)-to-\(peerId)"
        let records = try await listDNSRecords(name: recordName)
        
        return records.first?.content
    }
    
    // MARK: - Cloudflare API
    
    private func createDNSRecord(_ record: DNSRecord) async throws {
        let url = URL(string: "https://api.cloudflare.com/client/v4/zones/\(zoneId)/dns_records")!
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(apiToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(record)
        
        let (data, response) = try await session.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw P2P2Error.dnsError("Failed to create DNS record")
        }
        
        // Parse response to get record ID
        if let result = try? JSONDecoder().decode(CloudflareResponse<DNSRecord>.self, from: data),
           let createdRecord = result.result {
            activeRecords.insert(createdRecord.id ?? "")
        }
    }
    
    private func listDNSRecords(prefix: String? = nil, name: String? = nil) async throws -> [DNSRecord] {
        var urlComponents = URLComponents(string: "https://api.cloudflare.com/client/v4/zones/\(zoneId)/dns_records")!
        
        var queryItems: [URLQueryItem] = []
        if let name = name {
            queryItems.append(URLQueryItem(name: "name", value: "\(name).\(domain)"))
        }
        if let prefix = prefix {
            queryItems.append(URLQueryItem(name: "name", value: "\(prefix)"))
            queryItems.append(URLQueryItem(name: "match", value: "prefix"))
        }
        
        if !queryItems.isEmpty {
            urlComponents.queryItems = queryItems
        }
        
        var request = URLRequest(url: urlComponents.url!)
        request.setValue("Bearer \(apiToken)", forHTTPHeaderField: "Authorization")
        
        let (data, response) = try await session.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw P2P2Error.dnsError("Failed to list DNS records")
        }
        
        let result = try JSONDecoder().decode(CloudflareListResponse<DNSRecord>.self, from: data)
        return result.result
    }
    
    private func deleteDNSRecord(_ recordId: String) async throws {
        let url = URL(string: "https://api.cloudflare.com/client/v4/zones/\(zoneId)/dns_records/\(recordId)")!
        
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(apiToken)", forHTTPHeaderField: "Authorization")
        
        let (_, response) = try await session.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw P2P2Error.dnsError("Failed to delete DNS record")
        }
    }
}

// MARK: - Data Models

struct DNSRecord: Codable {
    var id: String?
    let type: String
    let name: String
    let content: String
    let ttl: Int
    var proxied: Bool = false
}

struct CloudflareResponse<T: Codable>: Codable {
    let success: Bool
    let result: T?
    let errors: [CloudflareError]?
}

struct CloudflareListResponse<T: Codable>: Codable {
    let success: Bool
    let result: [T]
    let errors: [CloudflareError]?
}

struct CloudflareError: Codable {
    let code: Int
    let message: String
}

extension String {
    func chunks(ofCount count: Int) -> [SubSequence] {
        var chunks: [SubSequence] = []
        var i = startIndex
        
        while i < endIndex {
            let end = index(i, offsetBy: count, limitedBy: endIndex) ?? endIndex
            chunks.append(self[i..<end])
            i = end
        }
        
        return chunks
    }
}