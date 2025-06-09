export class P2P2Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'P2P2Error';
  }
}

export class PeerNotConnectedError extends P2P2Error {
  constructor(peerId: string) {
    super(`Peer ${peerId} is not connected`);
    this.name = 'PeerNotConnectedError';
  }
}

export class ConnectionFailedError extends P2P2Error {
  constructor(reason: string) {
    super(`Connection failed: ${reason}`);
    this.name = 'ConnectionFailedError';
  }
}

export class DNSError extends P2P2Error {
  constructor(reason: string) {
    super(`DNS error: ${reason}`);
    this.name = 'DNSError';
  }
}

export class SignalingFailedError extends P2P2Error {
  constructor(reason: string) {
    super(`Signaling failed: ${reason}`);
    this.name = 'SignalingFailedError';
  }
}

export class InvalidConfigurationError extends P2P2Error {
  constructor(reason: string) {
    super(`Invalid configuration: ${reason}`);
    this.name = 'InvalidConfigurationError';
  }
}