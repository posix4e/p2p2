import { P2P2 } from '../dist/index.js';

class ChatApp {
  constructor() {
    this.room = null;
    this.peers = new Set();
    this.initializeElements();
    this.initializeRoom();
  }

  initializeElements() {
    this.statusEl = document.getElementById('status');
    this.messagesEl = document.getElementById('messages');
    this.messageInput = document.getElementById('messageInput');
    this.sendButton = document.getElementById('sendButton');
    this.peerListEl = document.getElementById('peerList');
    this.roomIdEl = document.getElementById('roomId');
    this.peerIdEl = document.getElementById('peerId');

    // Set up event listeners
    this.sendButton.addEventListener('click', () => this.sendMessage());
    this.messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.sendMessage();
      }
    });
  }

  async initializeRoom() {
    try {
      this.updateStatus('Loading configuration...', 'connecting');

      // Fetch config from server
      const response = await fetch('/api/config');
      const config = await response.json();
      window.ENV = config;

      this.updateStatus('Connecting to room...', 'connecting');

      // Create room from environment
      this.room = P2P2.createRoomFromEnvironment();

      // Display room info
      this.roomIdEl.textContent = window.ENV.ROOMID;
      this.peerIdEl.textContent = this.room.getPeerId().substring(0, 8);

      // Set up event handlers
      this.room.onPeerJoin((peerId) => {
        this.peers.add(peerId);
        this.addSystemMessage(`Peer joined: ${peerId.substring(0, 8)}`);
        this.updatePeerList();
      });

      this.room.onPeerLeave((peerId) => {
        this.peers.delete(peerId);
        this.addSystemMessage(`Peer left: ${peerId.substring(0, 8)}`);
        this.updatePeerList();
      });

      this.room.onData((data, peerId) => {
        const message = typeof data === 'string' ? data : new TextDecoder().decode(data);
        this.addMessage(message, peerId);
      });

      // Join the room
      await this.room.join();

      this.updateStatus('Connected! Waiting for peers...', 'connected');
      this.messageInput.disabled = false;
      this.sendButton.disabled = false;
      this.messageInput.focus();
    } catch (error) {
      console.error('Failed to initialize room:', error);
      this.updateStatus(`Error: ${error.message}`, 'error');
    }
  }

  sendMessage() {
    const message = this.messageInput.value.trim();
    if (!message || !this.room) return;

    try {
      // Send message to all peers
      this.room.send(message);

      // Add to our own chat
      this.addMessage(message, 'You');

      // Clear input
      this.messageInput.value = '';
      this.messageInput.focus();
    } catch (error) {
      console.error('Failed to send message:', error);
      this.addSystemMessage(`Failed to send message: ${error.message}`);
    }
  }

  addMessage(text, peerId) {
    const messageEl = document.createElement('div');
    messageEl.className = 'message';

    const peerIdEl = document.createElement('div');
    peerIdEl.className = 'peer-id';
    peerIdEl.textContent = peerId === 'You' ? 'You' : peerId.substring(0, 8);

    const textEl = document.createElement('div');
    textEl.textContent = text;

    messageEl.appendChild(peerIdEl);
    messageEl.appendChild(textEl);

    this.messagesEl.appendChild(messageEl);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  addSystemMessage(text) {
    const messageEl = document.createElement('div');
    messageEl.className = 'message system';
    messageEl.textContent = text;

    this.messagesEl.appendChild(messageEl);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  updateStatus(text, type) {
    this.statusEl.textContent = text;
    this.statusEl.className = `status ${type}`;
  }

  updatePeerList() {
    if (this.peers.size === 0) {
      this.peerListEl.textContent = 'No peers connected';
    } else {
      this.peerListEl.innerHTML = '';
      for (const peerId of this.peers) {
        const peerEl = document.createElement('div');
        peerEl.className = 'peer-item';
        peerEl.textContent = `• ${peerId.substring(0, 8)}`;
        this.peerListEl.appendChild(peerEl);
      }
    }
  }
}

// Initialize the chat app when the page loads
new ChatApp();
