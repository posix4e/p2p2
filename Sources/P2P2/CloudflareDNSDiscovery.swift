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
        
        // Create a custom URLSession configuration to handle network issues better
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 60
        configuration.waitsForConnectivity = true
        self.session = URLSession(configuration: configuration)
        
        // Match JavaScript's 16-character peer ID limit
        let fullId = UUID().uuidString.lowercased().replacingOccurrences(of: "-", with: "")
        self.peerId = String(fullId.prefix(16))
    }
    
    deinit {
        // Finish ongoing tasks gracefully before invalidating
        session.finishTasksAndInvalidate()
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
    }
    
    func removePresence(roomId: String) async throws {
        // Delete all our active records
        for recordId in activeRecords {
            do {
                try await deleteDNSRecord(recordId)
            } catch {
                // Log but continue with other deletions
                print("Warning: Failed to delete record \(recordId): \(error)")
            }
        }
        activeRecords.removeAll()
        
        // Also clean up any stale records for our peer ID
        let recordName = "_p2p2-\(roomId)-peer-\(peerId)"
        let records = try await listDNSRecords(name: recordName)
        for record in records {
            if let recordId = record.id {
                do {
                    try await deleteDNSRecord(recordId)
                } catch {
                    print("Warning: Failed to delete stale record \(recordId): \(error)")
                }
            }
        }
    }
    
    func discoverPeers(roomId: String) async throws -> [String] {
        let prefix = "_p2p2-\(roomId)-peer-"
        // Use type filter and then filter by prefix
        var urlComponents = URLComponents(string: "https://api.cloudflare.com/client/v4/zones/\(zoneId)/dns_records")!
        urlComponents.queryItems = [
            URLQueryItem(name: "type", value: "TXT"),
            URLQueryItem(name: "per_page", value: "100")
        ]
        
        var request = URLRequest(url: urlComponents.url!)
        request.setValue("Bearer \(apiToken)", forHTTPHeaderField: "Authorization")
        
        let (data, response) = try await session.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw P2P2Error.dnsError("Failed to list DNS records")
        }
        
        let result = try JSONDecoder().decode(CloudflareListResponse<DNSRecord>.self, from: data)
        
        return result.result
            .filter { $0.name.hasPrefix("\(prefix)") && $0.name.contains(".\(domain)") }
            .compactMap { $0.content }
            .filter { $0 != peerId } // Exclude ourselves
    }
    
    func publishSignalingData(roomId: String, peerId: String, data: String) async throws {
        // Match JavaScript naming convention
        let recordName = "_p2p2-\(roomId)-sig-\(self.peerId)-to-\(peerId)"
        
        // First, delete any existing record with this name
        let existingRecords = try await listDNSRecords(name: recordName)
        for record in existingRecords {
            if let recordId = record.id {
                try? await deleteDNSRecord(recordId)
            }
        }
        
        // For now, just store the data as-is and let Cloudflare handle it
        // Cloudflare will automatically split long TXT records into multiple strings
        let record = DNSRecord(
            type: "TXT",
            name: recordName,
            content: data,
            ttl: 60 // Minimum TTL allowed by Cloudflare
        )
        
        try await createDNSRecord(record)
    }
    
    func getSignalingData(roomId: String, fromPeerId: String) async throws -> String? {
        // Match JavaScript naming convention
        let recordName = "_p2p2-\(roomId)-sig-\(fromPeerId)-to-\(peerId)"
        let records = try await listDNSRecords(name: recordName)
        
        if let record = records.first {
            // Cloudflare may return multi-string TXT records as a single string with quotes
            // or it may already be concatenated. Let's handle both cases.
            var content = record.content
            
            // If the content starts and ends with quotes, it might be a quoted string
            if content.hasPrefix("\"") && content.hasSuffix("\"") {
                content = String(content.dropFirst().dropLast())
            }
            
            // Handle escaped quotes
            content = content.replacingOccurrences(of: "\\\"", with: "\"")
            
            return content
        }
        
        return nil
    }
    
    func publishIceCandidate(roomId: String, peerId: String, candidate: String, index: Int) async throws {
        // Use shortened names to avoid DNS length limits
        let recordName = "_p2p2-ice-\(String(roomId.prefix(8)))-\(String(self.peerId.prefix(8)))-\(String(peerId.prefix(8)))-\(index)"
        
        let record = DNSRecord(
            type: "TXT",
            name: recordName,
            content: candidate,
            ttl: 60
        )
        
        try await createDNSRecord(record)
    }
    
    func getIceCandidates(roomId: String, fromPeerId: String) async throws -> [String] {
        let prefix = "_p2p2-ice-\(String(roomId.prefix(8)))-\(String(fromPeerId.prefix(8)))-\(String(peerId.prefix(8)))-"
        
        var urlComponents = URLComponents(string: "https://api.cloudflare.com/client/v4/zones/\(zoneId)/dns_records")!
        urlComponents.queryItems = [
            URLQueryItem(name: "type", value: "TXT"),
            URLQueryItem(name: "per_page", value: "100")
        ]
        
        var request = URLRequest(url: urlComponents.url!)
        request.setValue("Bearer \(apiToken)", forHTTPHeaderField: "Authorization")
        
        let (data, response) = try await session.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw P2P2Error.dnsError("Failed to list ICE candidate records")
        }
        
        let result = try JSONDecoder().decode(CloudflareListResponse<DNSRecord>.self, from: data)
        
        return result.result
            .filter { $0.name.hasPrefix("\(prefix)") && $0.name.contains(".\(domain)") }
            .compactMap { record -> (index: Int, content: String)? in
                let parts = record.name.split(separator: "-")
                if let indexStr = parts.last?.split(separator: ".").first,
                   let index = Int(indexStr) {
                    return (index, record.content)
                }
                return nil
            }
            .sorted { $0.index < $1.index }
            .map { $0.content }
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
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw P2P2Error.dnsError("Failed to create DNS record: Invalid response")
        }
        
        guard (200...299).contains(httpResponse.statusCode) else {
            let errorBody = String(data: data, encoding: .utf8) ?? "No error body"
            throw P2P2Error.dnsError("Failed to create DNS record: HTTP \(httpResponse.statusCode), \(errorBody)")
        }
        
        // Parse response to get record ID
        if let result = try? JSONDecoder().decode(CloudflareResponse<DNSRecord>.self, from: data),
           let createdRecord = result.result,
           let recordId = createdRecord.id {
            activeRecords.insert(recordId)
        }
    }
    
    private func listDNSRecords(prefix: String? = nil, name: String? = nil) async throws -> [DNSRecord] {
        var urlComponents = URLComponents(string: "https://api.cloudflare.com/client/v4/zones/\(zoneId)/dns_records")!
        
        var queryItems: [URLQueryItem] = []
        if let name = name {
            queryItems.append(URLQueryItem(name: "name", value: "\(name).\(domain)"))
        }
        if let prefix = prefix {
            // For prefix search, we need to search with the domain appended
            queryItems.append(URLQueryItem(name: "name", value: "\(prefix)"))
            queryItems.append(URLQueryItem(name: "match", value: "all"))
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
        guard !recordId.isEmpty else {
            // Skip empty record IDs
            return
        }
        
        let url = URL(string: "https://api.cloudflare.com/client/v4/zones/\(zoneId)/dns_records/\(recordId)")!
        
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(apiToken)", forHTTPHeaderField: "Authorization")
        
        let (data, response) = try await session.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw P2P2Error.dnsError("Failed to delete DNS record \(recordId): Invalid response")
        }
        
        guard (200...299).contains(httpResponse.statusCode) else {
            let errorBody = String(data: data, encoding: .utf8) ?? "No error body"
            throw P2P2Error.dnsError("Failed to delete DNS record \(recordId): HTTP \(httpResponse.statusCode), \(errorBody)")
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