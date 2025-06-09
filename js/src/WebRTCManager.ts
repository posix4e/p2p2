import { RoomConfig, TurnServer } from './types';
import { ConnectionFailedError, SignalingFailedError } from './errors';

export class WebRTCManager {
  private iceServers: RTCIceServer[];

  constructor(config: RoomConfig) {
    this.iceServers = this.createIceServers(config);
  }

  private createIceServers(config: RoomConfig): RTCIceServer[] {
    const servers: RTCIceServer[] = [];

    // Add STUN servers
    const stunServers = config.stunServers || ['stun:stun.l.google.com:19302'];
    for (const stun of stunServers) {
      servers.push({ urls: stun });
    }

    // Add TURN servers
    if (config.turnServers) {
      for (const turn of config.turnServers) {
        const server: RTCIceServer = { urls: turn.url };
        if (turn.username && turn.credential) {
          server.username = turn.username;
          server.credential = turn.credential;
        }
        servers.push(server);
      }
    }

    return servers;
  }

  async createPeerConnection(): Promise<RTCPeerConnection> {
    const configuration: RTCConfiguration = {
      iceServers: this.iceServers,
      bundlePolicy: 'balanced',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: 10
    };

    const connection = new RTCPeerConnection(configuration);
    
    if (!connection) {
      throw new ConnectionFailedError('Failed to create peer connection');
    }

    return connection;
  }

  createDataChannel(connection: RTCPeerConnection, label: string = 'data'): RTCDataChannel {
    const channel = connection.createDataChannel(label, {
      ordered: true,
      maxRetransmits: 3
    });

    return channel;
  }

  async createOffer(connection: RTCPeerConnection): Promise<RTCSessionDescriptionInit> {
    try {
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      return offer;
    } catch (error) {
      throw new SignalingFailedError(`Failed to create offer: ${error}`);
    }
  }

  async createAnswer(connection: RTCPeerConnection): Promise<RTCSessionDescriptionInit> {
    try {
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      return answer;
    } catch (error) {
      throw new SignalingFailedError(`Failed to create answer: ${error}`);
    }
  }

  async setRemoteDescription(
    connection: RTCPeerConnection, 
    description: RTCSessionDescriptionInit
  ): Promise<void> {
    try {
      await connection.setRemoteDescription(description);
    } catch (error) {
      throw new SignalingFailedError(`Failed to set remote description: ${error}`);
    }
  }

  async addIceCandidate(
    connection: RTCPeerConnection,
    candidate: RTCIceCandidateInit
  ): Promise<void> {
    try {
      await connection.addIceCandidate(candidate);
    } catch (error) {
      throw new SignalingFailedError(`Failed to add ICE candidate: ${error}`);
    }
  }

  async waitForIceGathering(connection: RTCPeerConnection): Promise<void> {
    return new Promise((resolve) => {
      if (connection.iceGatheringState === 'complete') {
        resolve();
      } else {
        const checkState = () => {
          if (connection.iceGatheringState === 'complete') {
            connection.removeEventListener('icegatheringstatechange', checkState);
            resolve();
          }
        };
        connection.addEventListener('icegatheringstatechange', checkState);
      }
    });
  }
}