// Core P2P functionality that can be used in any environment
import { RoomConfig } from './types';
import { CloudflareDNSDiscovery } from './CloudflareDNSDiscovery';
import { WebRTCManager } from './WebRTCManager';
import { EnvironmentAdapter, createDefaultAdapter } from './adapters/EnvironmentAdapter';

export interface P2P2Options {
  adapter?: EnvironmentAdapter;
  discoveryInterval?: number;
  iceServers?: RTCIceServer[];
}

export class P2P2Core {
  protected dnsDiscovery: CloudflareDNSDiscovery;
  protected webRTCManager: WebRTCManager;
  protected adapter: EnvironmentAdapter;
  protected discoveryInterval: number;

  constructor(config: RoomConfig, options: P2P2Options = {}) {
    this.adapter = options.adapter || createDefaultAdapter();
    this.discoveryInterval = options.discoveryInterval || 5000;
    
    this.dnsDiscovery = new CloudflareDNSDiscovery(
      config.domain,
      config.zoneId,
      config.apiToken,
      this.adapter
    );
    
    this.webRTCManager = new WebRTCManager(config);
  }

  getPeerId(): string {
    return this.dnsDiscovery.getPeerId();
  }

  // Core DNS operations
  async announcePresence(roomId: string): Promise<void> {
    return this.dnsDiscovery.announcePresence(roomId);
  }

  async removePresence(roomId: string): Promise<void> {
    return this.dnsDiscovery.removePresence(roomId);
  }

  async discoverPeers(roomId: string): Promise<string[]> {
    return this.dnsDiscovery.discoverPeers(roomId);
  }

  async publishSignalingData(roomId: string, targetPeerId: string, data: string): Promise<void> {
    return this.dnsDiscovery.publishSignalingData(roomId, targetPeerId, data);
  }

  async getSignalingData(roomId: string, fromPeerId: string): Promise<string | null> {
    return this.dnsDiscovery.getSignalingData(roomId, fromPeerId);
  }

  // Core WebRTC operations
  async createPeerConnection(): Promise<RTCPeerConnection> {
    return this.webRTCManager.createPeerConnection();
  }

  createDataChannel(connection: RTCPeerConnection, label: string = 'data'): RTCDataChannel {
    return this.webRTCManager.createDataChannel(connection, label);
  }

  async createOffer(connection: RTCPeerConnection): Promise<RTCSessionDescriptionInit> {
    return this.webRTCManager.createOffer(connection);
  }

  async createAnswer(connection: RTCPeerConnection): Promise<RTCSessionDescriptionInit> {
    return this.webRTCManager.createAnswer(connection);
  }

  async setRemoteDescription(
    connection: RTCPeerConnection,
    description: RTCSessionDescriptionInit
  ): Promise<void> {
    return this.webRTCManager.setRemoteDescription(connection, description);
  }

  async addIceCandidate(
    connection: RTCPeerConnection,
    candidate: RTCIceCandidateInit
  ): Promise<void> {
    return this.webRTCManager.addIceCandidate(connection, candidate);
  }

  // Timer utilities using adapter
  setInterval(callback: () => void, ms: number): any {
    return this.adapter.setInterval(callback, ms);
  }

  clearInterval(handle: any): void {
    this.adapter.clearInterval(handle);
  }

  setTimeout(callback: () => void, ms: number): any {
    return this.adapter.setTimeout(callback, ms);
  }

  clearTimeout(handle: any): void {
    this.adapter.clearTimeout(handle);
  }

  async waitForIceGathering(connection: RTCPeerConnection): Promise<void> {
    return this.webRTCManager.waitForIceGathering(connection);
  }
}