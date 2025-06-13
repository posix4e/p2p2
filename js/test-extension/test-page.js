// Test page script that communicates with the extension's service worker

let room = null;
let peers = new Set();
let messages = [];

async function initP2P(roomId) {
  try {
    console.log('initP2P: Starting initialization for room', roomId);
    
    // Check if chrome.runtime is available
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      throw new Error('Chrome runtime API not available');
    }
    
    // Send message to service worker to create/join room
    console.log('initP2P: Sending joinRoom message to service worker');
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'joinRoom',
        roomId: roomId
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('initP2P: Chrome runtime error:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          console.log('initP2P: Received response from service worker:', response);
          resolve(response);
        }
      });
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    document.getElementById('status').textContent = 'Connected';
    document.getElementById('peer-id').textContent = 'Peer ID: ' + response.peerId;
    document.getElementById('room-id').textContent = 'Room ID: ' + roomId;
    
    // Enable send button
    document.getElementById('send-btn').disabled = false;
    
    return response;
  } catch (error) {
    console.error('Failed to initialize P2P:', error);
    document.getElementById('status').textContent = 'Error: ' + error.message;
    throw error;
  }
}

// Register P2P message listener
window.__p2p2MessageListeners = window.__p2p2MessageListeners || [];
window.__p2p2MessageListeners.push((message) => {
  if (message.type === 'peerJoined') {
    console.log('Peer joined:', message.peerId);
    peers.add(message.peerId);
    updatePeerCount();
  } else if (message.type === 'peerLeft') {
    console.log('Peer left:', message.peerId);
    peers.delete(message.peerId);
    updatePeerCount();
  } else if (message.type === 'dataReceived') {
    console.log('Received:', message.data, 'from', message.peerId);
    messages.push(message);
    
    const div = document.createElement('div');
    div.textContent = `${new Date().toLocaleTimeString()} - ${message.peerId}: ${message.data}`;
    document.getElementById('messages').appendChild(div);
  }
});

function updatePeerCount() {
  document.getElementById('peer-count').textContent = peers.size;
}

// Send button handler
document.getElementById('send-btn').onclick = async () => {
  const msg = 'Test message at ' + new Date().toLocaleTimeString();
  
  await chrome.runtime.sendMessage({
    type: 'sendData',
    data: msg
  });
  
  console.log('Sent:', msg);
};

// Export for testing
window.initP2P = initP2P;
window.getPeers = () => Array.from(peers);
window.getMessages = () => messages;