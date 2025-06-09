// Example popup.js for Chrome extension
// Replace the config values with your own Cloudflare credentials

import { P2P2 } from '../dist/index.js';

let room = null;
const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');

function log(message) {
    const div = document.createElement('div');
    div.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
}

function updateStatus(status) {
    statusEl.textContent = status;
    statusEl.className = 'status ' + status.toLowerCase().replace(' ', '-');
}

// Store config in chrome.storage
// IMPORTANT: Replace these with your own Cloudflare credentials!
chrome.storage.local.set({
    p2p2Config: {
        domain: 'YOUR-DOMAIN.com',
        zoneId: 'YOUR-ZONE-ID',
        apiToken: 'YOUR-API-TOKEN'
    }
});

document.getElementById('connect').addEventListener('click', async () => {
    try {
        updateStatus('Connecting');
        log('Creating P2P2 room...');
        
        room = await P2P2.createRoomForChromeExtension('extension-demo');
        
        room.onPeerJoin((peerId) => {
            log(`Peer joined: ${peerId}`);
        });
        
        room.onPeerLeave((peerId) => {
            log(`Peer left: ${peerId}`);
        });
        
        room.onData((data, peerId) => {
            log(`Message from ${peerId}: ${data}`);
        });
        
        await room.join();
        updateStatus('Connected');
        log(`Connected as ${room.getPeerId()}`);
        
        // Send a test message every 5 seconds
        setInterval(() => {
            if (room) {
                room.send(`Hello from ${room.getPeerId()} at ${new Date().toLocaleTimeString()}`);
            }
        }, 5000);
        
    } catch (error) {
        updateStatus('Error');
        log(`Error: ${error.message}`);
        console.error(error);
    }
});

document.getElementById('disconnect').addEventListener('click', async () => {
    if (room) {
        await room.leave();
        room = null;
        updateStatus('Disconnected');
        log('Disconnected from room');
    }
});