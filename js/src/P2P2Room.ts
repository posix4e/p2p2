import { RoomConfig, Peer, DataHandler, PeerHandler } from './types';
import { PeerNotConnectedError } from './errors';
import { P2P2Core, P2P2Options } from './P2P2Core';

export class P2P2Room extends P2P2Core {
  private roomId: string;
  private peers: Map<string, Peer> = new Map();
  private discoveryIntervalHandle?: any;
  private onDataHandler?: DataHandler;
  private onPeerJoinHandler?: PeerHandler;
  private onPeerLeaveHandler?: PeerHandler;

  constructor(roomId: string, config: RoomConfig, options?: P2P2Options) {
    super(config, options);
    this.roomId = roomId;
  }

  async join(): Promise<void> {
    // Announce our presence
    await this.announcePresence(this.roomId);

    // Start discovery loop
    this.discoveryIntervalHandle = this.setInterval(() => {
      this.discoverPeersAndConnect();
    }, this.discoveryInterval);

    // Initial discovery
    await this.discoverPeersAndConnect();
  }

  async leave(): Promise<void> {
    // Stop discovery
    if (this.discoveryIntervalHandle) {
      this.clearInterval(this.discoveryIntervalHandle);
      this.discoveryIntervalHandle = undefined;
    }

    // Remove our presence
    await this.removePresence(this.roomId);

    // Close all peer connections
    for (const peer of this.peers.values()) {
      peer.connection.close();
    }
    this.peers.clear();
  }

  send(data: string | ArrayBuffer): void {
    for (const peer of this.peers.values()) {
      if (peer.isConnected && peer.dataChannel?.readyState === 'open') {
        if (typeof data === 'string') {
          peer.dataChannel.send(data);
        } else {
          peer.dataChannel.send(data);
        }
      }
    }
  }

  sendTo(peerId: string, data: string | ArrayBuffer): void {
    const peer = this.peers.get(peerId);
    if (!peer || !peer.isConnected) {
      throw new PeerNotConnectedError(peerId);
    }
    if (peer.dataChannel?.readyState === 'open') {
      if (typeof data === 'string') {
        peer.dataChannel.send(data);
      } else {
        peer.dataChannel.send(data);
      }
    }
  }

  onData(handler: DataHandler): void {
    this.onDataHandler = handler;
  }

  onPeerJoin(handler: PeerHandler): void {
    this.onPeerJoinHandler = handler;
  }

  onPeerLeave(handler: PeerHandler): void {
    this.onPeerLeaveHandler = handler;
  }

  getPeers(): Promise<string[]> {
    // Return currently discovered peers from DNS
    return this.discoverPeers(this.roomId);
  }

  getConnectedPeers(): string[] {
    // Return currently connected peers
    return Array.from(this.peers.keys()).filter(peerId => {
      const peer = this.peers.get(peerId);
      return peer?.isConnected;
    });
  }

  private async discoverPeersAndConnect(): Promise<void> {
    try {
      const discoveredPeerIds = await this.discoverPeers(this.roomId);
      
      // Connect to new peers
      for (const peerId of discoveredPeerIds) {
        if (!this.peers.has(peerId)) {
          this.connectToPeer(peerId, true);
        }
      }

      // Remove peers that are no longer announced
      const currentPeerIds = Array.from(this.peers.keys());
      for (const peerId of currentPeerIds) {
        if (!discoveredPeerIds.includes(peerId)) {
          this.removePeer(peerId);
        }
      }
    } catch (error) {
      console.error('Error discovering peers:', error);
    }
  }

  private async connectToPeer(peerId: string, isInitiator: boolean): Promise<void> {
    try {
      const connection = await this.createPeerConnection();
      
      // Set up connection event handlers
      connection.onicecandidate = async (event) => {
        if (event.candidate) {
          // In production, we'd send ICE candidates via DNS
          // For now, we include them in the SDP
        }
      };

      connection.onconnectionstatechange = () => {
        if (connection.connectionState === 'connected') {
          const peer = this.peers.get(peerId);
          if (peer) {
            peer.isConnected = true;
            this.onPeerJoinHandler?.(peerId);
          }
        } else if (connection.connectionState === 'failed' || 
                   connection.connectionState === 'disconnected') {
          this.removePeer(peerId);
        }
      };

      let dataChannel: RTCDataChannel | undefined;

      if (isInitiator) {
        // Create data channel as initiator
        dataChannel = this.createDataChannel(connection);
        this.setupDataChannel(dataChannel, peerId);

        // Create and send offer
        const offer = await this.createOffer(connection);
        await this.waitForIceGathering(connection);
        
        // Publish offer via DNS
        await this.publishSignalingData(
          this.roomId,
          peerId,
          JSON.stringify(offer)
        );

        // Poll for answer
        this.pollForAnswer(peerId, connection);
      } else {
        // Handle incoming data channel
        connection.ondatachannel = (event) => {
          dataChannel = event.channel;
          this.setupDataChannel(dataChannel, peerId);
        };

        // Wait for offer
        this.pollForOffer(peerId, connection);
      }

      const peer: Peer = {
        id: peerId,
        connection,
        dataChannel,
        isConnected: false
      };

      this.peers.set(peerId, peer);
    } catch (error) {
      console.error(`Failed to connect to peer ${peerId}:`, error);
    }
  }

  private setupDataChannel(channel: RTCDataChannel, peerId: string): void {
    channel.onopen = () => {
      const peer = this.peers.get(peerId);
      if (peer) {
        peer.dataChannel = channel;
      }
    };

    channel.onmessage = (event) => {
      this.onDataHandler?.(event.data, peerId);
    };

    channel.onerror = (error) => {
      console.error(`Data channel error for peer ${peerId}:`, error);
    };

    channel.onclose = () => {
      console.log(`Data channel closed for peer ${peerId}`);
    };
  }

  private async pollForOffer(peerId: string, connection: RTCPeerConnection): Promise<void> {
    const maxAttempts = 10;
    let attempts = 0;

    const poll = async () => {
      if (attempts >= maxAttempts) {
        this.removePeer(peerId);
        return;
      }

      try {
        const offerData = await this.getSignalingData(this.roomId, peerId);
        if (offerData) {
          const offer = JSON.parse(offerData) as RTCSessionDescriptionInit;
          await this.setRemoteDescription(connection, offer);

          // Create and send answer
          const answer = await this.createAnswer(connection);
          await this.waitForIceGathering(connection);
          
          await this.publishSignalingData(
            this.roomId,
            peerId,
            JSON.stringify(answer)
          );
        } else {
          attempts++;
          this.setTimeout(poll, 2000);
        }
      } catch (error) {
        console.error(`Error polling for offer from ${peerId}:`, error);
        attempts++;
        this.setTimeout(poll, 2000);
      }
    };

    poll();
  }

  private async pollForAnswer(peerId: string, connection: RTCPeerConnection): Promise<void> {
    const maxAttempts = 10;
    let attempts = 0;

    const poll = async () => {
      if (attempts >= maxAttempts) {
        this.removePeer(peerId);
        return;
      }

      try {
        const answerData = await this.getSignalingData(this.roomId, peerId);
        if (answerData) {
          const answer = JSON.parse(answerData) as RTCSessionDescriptionInit;
          await this.setRemoteDescription(connection, answer);
        } else {
          attempts++;
          this.setTimeout(poll, 2000);
        }
      } catch (error) {
        console.error(`Error polling for answer from ${peerId}:`, error);
        attempts++;
        this.setTimeout(poll, 2000);
      }
    };

    this.setTimeout(poll, 1000); // Give time for peer to receive offer
  }

  private removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.connection.close();
      this.peers.delete(peerId);
      if (peer.isConnected) {
        this.onPeerLeaveHandler?.(peerId);
      }
    }
  }
}