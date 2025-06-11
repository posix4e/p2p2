
// Background service worker for E2E tests
import { P2P2, ChromeExtensionAdapter } from '../../dist/index.js';

const CONFIG = {
  domain: 'newman.family',
  zoneId: '10fa67ca924a83ca40d1c8081d21fdfe',
  apiToken: 'cgJ0eSU7A_0h1BcbbROXEOuMoNUWupL_ajbIlL3u'
};

let currentRoom = null;
let connectedTabs = new Set();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'fetch') {
    console.log('Background: Handling fetch to', request.url);
    handleFetch(request.url, request.options)
      .then(response => sendResponse(response))
      .catch(error => {
        console.error('Background fetch error:', error);
        sendResponse({ error: error.message });
      });
    return true; // Will respond asynchronously
  }
  
  if (request.type === 'getConfig') {
    sendResponse(CONFIG);
    return false;
  }
  
  if (request.type === 'joinRoom') {
    handleJoinRoom(request.roomId, sender.tab?.id)
      .then(response => sendResponse(response))
      .catch(error => {
        console.error('Join room error:', error);
        sendResponse({ error: error.message });
      });
    return true;
  }
  
  if (request.type === 'sendData') {
    if (currentRoom) {
      currentRoom.send(request.data);
      sendResponse({ success: true });
    } else {
      sendResponse({ error: 'Not connected to a room' });
    }
    return false;
  }
});

async function handleJoinRoom(roomId, tabId) {
  try {
    // Leave current room if any
    if (currentRoom) {
      await currentRoom.leave();
    }
    
    // Create new room
    currentRoom = P2P2.joinRoom(CONFIG, roomId, {
      adapter: new ChromeExtensionAdapter()
    });
    
    // Track connected tab
    if (tabId) {
      connectedTabs.add(tabId);
    }
    
    // Set up event handlers
    currentRoom.onPeerJoin((peerId) => {
      console.log('Peer joined:', peerId);
      broadcastToTabs({ type: 'peerJoined', peerId });
    });
    
    currentRoom.onPeerLeave((peerId) => {
      console.log('Peer left:', peerId);
      broadcastToTabs({ type: 'peerLeft', peerId });
    });
    
    currentRoom.onData((data, peerId) => {
      console.log('Data received:', data, 'from', peerId);
      broadcastToTabs({ type: 'dataReceived', data, peerId });
    });
    
    // Join the room
    await currentRoom.join();
    const peerId = currentRoom.getPeerId();
    console.log('Joined room', roomId, 'as', peerId);
    
    return { success: true, peerId, roomId };
  } catch (error) {
    console.error('Failed to join room:', error);
    throw error;
  }
}

function broadcastToTabs(message) {
  connectedTabs.forEach(tabId => {
    chrome.tabs.sendMessage(tabId, message).catch(() => {
      // Tab might be closed
      connectedTabs.delete(tabId);
    });
  });
}

async function handleFetch(url, options) {
  const response = await fetch(url, options);
  const body = await response.text();
  
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    body: body
  };
}

// Clean up on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  connectedTabs.delete(tabId);
  if (connectedTabs.size === 0 && currentRoom) {
    currentRoom.leave();
    currentRoom = null;
  }
});

console.log('P2P2 test extension loaded');
