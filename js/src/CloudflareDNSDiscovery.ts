import { DNSRecord, CloudflareResponse, CloudflareListResponse } from './types';
import { DNSError } from './errors';
import { EnvironmentAdapter } from './adapters/EnvironmentAdapter';

export class CloudflareDNSDiscovery {
  private domain: string;
  private zoneId: string;
  private apiToken: string;
  private peerId: string;
  private activeRecords: Set<string> = new Set();
  private adapter?: EnvironmentAdapter & { fetch?: typeof fetch };

  constructor(domain: string, zoneId: string, apiToken: string, adapter?: EnvironmentAdapter) {
    this.domain = domain;
    this.zoneId = zoneId;
    this.apiToken = apiToken;
    this.peerId = this.generatePeerId();
    this.adapter = adapter as any;
  }

  private generatePeerId(): string {
    // Use shorter peer IDs to avoid DNS name length limits
    const uuid = crypto.randomUUID().toLowerCase().replace(/-/g, '');
    return uuid.substring(0, 16); // Use first 16 chars
  }

  getPeerId(): string {
    return this.peerId;
  }

  async announcePresence(roomId: string): Promise<void> {
    const recordName = `_p2p2-${roomId}-peer-${this.peerId}`;
    
    const record: DNSRecord = {
      type: 'TXT',
      name: recordName,
      content: this.peerId,
      ttl: 60 // 1 minute TTL for quick updates
    };

    const created = await this.createDNSRecord(record);
    if (created.id) {
      this.activeRecords.add(created.id);
    }
  }

  async removePresence(roomId: string): Promise<void> {
    // Delete all our active records
    const deletePromises = Array.from(this.activeRecords).map(recordId => 
      this.deleteDNSRecord(recordId)
    );
    await Promise.all(deletePromises);
    this.activeRecords.clear();
  }

  async discoverPeers(roomId: string): Promise<string[]> {
    const prefix = `_p2p2-${roomId}-peer-`;
    // List all TXT records and filter client-side
    const records = await this.listDNSRecords();
    
    return records
      .filter(record => 
        record.type === 'TXT' && 
        record.name.startsWith(prefix) &&
        record.name.endsWith(`.${this.domain}`)
      )
      .map(record => record.content)
      .filter(peerId => peerId !== this.peerId); // Exclude ourselves
  }

  async publishSignalingData(roomId: string, targetPeerId: string, data: string): Promise<void> {
    const recordName = `_p2p2-${roomId}-sig-${this.peerId}-to-${targetPeerId}`;
    
    // Chunk data if needed (TXT records have 255 char limit per string)
    const chunks = this.chunkString(data, 255);
    const content = chunks.join('');
    
    const record: DNSRecord = {
      type: 'TXT',
      name: recordName,
      content: content,
      ttl: 30 // Short TTL for signaling
    };

    const created = await this.createDNSRecord(record);
    if (created.id) {
      this.activeRecords.add(created.id);
    }
  }

  async getSignalingData(roomId: string, fromPeerId: string): Promise<string | null> {
    const recordName = `_p2p2-${roomId}-sig-${fromPeerId}-to-${this.peerId}`;
    const records = await this.listDNSRecords(recordName);
    
    return records.length > 0 ? records[0].content : null;
  }

  private async fetchWithAdapter(url: string, options?: RequestInit): Promise<Response> {
    // Use adapter's fetch if available (for Chrome extensions)
    if (this.adapter && 'fetch' in this.adapter && typeof this.adapter.fetch === 'function') {
      return this.adapter.fetch(url, options);
    }
    // Otherwise use global fetch
    return fetch(url, options);
  }

  private async createDNSRecord(record: DNSRecord): Promise<DNSRecord> {
    const url = `https://api.cloudflare.com/client/v4/zones/${this.zoneId}/dns_records`;
    
    const response = await this.fetchWithAdapter(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ...record, proxied: false })
    });

    if (!response.ok) {
      throw new DNSError(`Failed to create DNS record: ${response.statusText}`);
    }

    const data: CloudflareResponse<DNSRecord> = await response.json();
    
    if (!data.success || !data.result) {
      throw new DNSError(data.errors?.[0]?.message || 'Failed to create DNS record');
    }

    return data.result;
  }

  private async listDNSRecords(name?: string): Promise<DNSRecord[]> {
    let url = `https://api.cloudflare.com/client/v4/zones/${this.zoneId}/dns_records`;
    const params = new URLSearchParams();
    
    // Add type filter for TXT records
    params.append('type', 'TXT');
    
    if (name) {
      params.append('name', `${name}.${this.domain}`);
    }
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    const response = await this.fetchWithAdapter(url, {
      headers: {
        'Authorization': `Bearer ${this.apiToken}`
      }
    });

    if (!response.ok) {
      throw new DNSError(`Failed to list DNS records: ${response.statusText}`);
    }

    const data: CloudflareListResponse<DNSRecord> = await response.json();
    
    if (!data.success) {
      throw new DNSError(data.errors?.[0]?.message || 'Failed to list DNS records');
    }

    return data.result;
  }

  private async deleteDNSRecord(recordId: string): Promise<void> {
    const url = `https://api.cloudflare.com/client/v4/zones/${this.zoneId}/dns_records/${recordId}`;
    
    const response = await this.fetchWithAdapter(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`
      }
    });

    if (!response.ok) {
      throw new DNSError(`Failed to delete DNS record: ${response.statusText}`);
    }
  }

  private chunkString(str: string, size: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < str.length; i += size) {
      chunks.push(str.slice(i, i + size));
    }
    return chunks;
  }
}