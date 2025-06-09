export interface RoomConfig {
  domain: string;
  zoneId: string;
  apiToken: string;
  stunServers?: string[];
  turnServers?: TurnServer[];
}

export interface TurnServer {
  url: string;
  username?: string;
  credential?: string;
}

export interface Peer {
  id: string;
  connection: RTCPeerConnection;
  dataChannel?: RTCDataChannel;
  isConnected: boolean;
}

export type DataHandler = (data: ArrayBuffer | string, peerId: string) => void;
export type PeerHandler = (peerId: string) => void;

export interface DNSRecord {
  id?: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied?: boolean;
}

export interface CloudflareResponse<T> {
  success: boolean;
  result?: T;
  errors?: CloudflareError[];
}

export interface CloudflareListResponse<T> {
  success: boolean;
  result: T[];
  errors?: CloudflareError[];
}

export interface CloudflareError {
  code: number;
  message: string;
}