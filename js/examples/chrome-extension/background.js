// Chrome Extension background script using P2P2
import { P2P2 } from '../../dist/index.js';

let room = null;

// Initialize P2P2 when extension is installed
chrome.runtime.onInstalled.addListener(async () => {
  // Store configuration securely in chrome.storage
  // In production, these would come from user settings
  const config = {
    domain: 'your-domain.com',
    zoneId: 'your-zone-id',
    apiToken: 'your-api-token'
  };
  
  await chrome.storage.local.set({ p2p2Config: config });
  console.log('P2P2 configuration stored');
});

// Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'joinRoom':
      joinRoom(request.roomId).then(sendResponse);
      return true; // Will respond asynchronously
      
    case 'sendMessage':
      sendMessage(request.message).then(sendResponse);
      return true;
      
    case 'leaveRoom':
      leaveRoom().then(sendResponse);
      return true;
  }
});

async function joinRoom(roomId) {
  try {
    if (room) {
      await room.leave();
    }
    
    // Create room using Chrome extension adapter
    room = await P2P2.createRoomForChromeExtension(roomId);
    
    // Set up event handlers
    room.onPeerJoin((peerId) => {
      console.log('Peer joined:', peerId);
      // Notify popup or content scripts
      chrome.runtime.sendMessage({
        type: 'peerJoined',
        peerId: peerId
      });
    });
    
    room.onPeerLeave((peerId) => {
      console.log('Peer left:', peerId);
      chrome.runtime.sendMessage({
        type: 'peerLeft',
        peerId: peerId
      });
    });
    
    room.onData((data, peerId) => {
      console.log('Data received:', data, 'from', peerId);
      chrome.runtime.sendMessage({
        type: 'dataReceived',
        data: data,
        peerId: peerId
      });
    });
    
    await room.join();
    return { success: true, peerId: room.getPeerId() };
    
  } catch (error) {
    console.error('Failed to join room:', error);
    return { success: false, error: error.message };
  }
}

async function sendMessage(message) {
  try {
    if (!room) {
      throw new Error('Not connected to any room');
    }
    
    room.send(message);
    return { success: true };
    
  } catch (error) {
    console.error('Failed to send message:', error);
    return { success: false, error: error.message };
  }
}

async function leaveRoom() {
  try {
    if (room) {
      await room.leave();
      room = null;
    }
    return { success: true };
    
  } catch (error) {
    console.error('Failed to leave room:', error);
    return { success: false, error: error.message };
  }
}