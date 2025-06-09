#!/usr/bin/env node
import { P2P2 } from './dist/index.js';
import { config } from 'dotenv';
import readline from 'readline';

// Load environment variables
config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  // Check required environment variables
  if (!process.env.DNS || !process.env.ZONEID || !process.env.API) {
    console.error('❌ Missing required environment variables: DNS, ZONEID, API');
    console.error('Please create a .env file with your Cloudflare credentials');
    process.exit(1);
  }

  const roomId = process.argv[2] || process.env.ROOMID || 'test-room';
  console.log(`🚀 P2P2 Chat CLI`);
  console.log(`📍 Room: ${roomId}`);
  
  try {
    // Create room
    const room = P2P2.createRoomFromEnvironment(roomId);
    console.log(`🆔 Your peer ID: ${room.getPeerId()}`);
    
    // Set up event handlers
    room.onPeerJoin((peerId) => {
      console.log(`\n✅ Peer joined: ${peerId}`);
      rl.prompt();
    });
    
    room.onPeerLeave((peerId) => {
      console.log(`\n❌ Peer left: ${peerId}`);
      rl.prompt();
    });
    
    room.onData((data, peerId) => {
      console.log(`\n💬 [${peerId.substring(0, 8)}]: ${data}`);
      rl.prompt();
    });
    
    // Join room
    console.log('🔄 Joining room...');
    await room.join();
    console.log('✅ Connected to room!');
    console.log('💡 Type messages to send to all peers. Type /quit to exit.\n');
    
    // Start peer discovery
    setInterval(async () => {
      const peers = await room.getPeers();
      const connected = room.getConnectedPeers();
      if (peers.length > 0 || connected.length > 0) {
        console.log(`\n📊 Discovered peers: ${peers.length}, Connected: ${connected.length}`);
        rl.prompt();
      }
    }, 10000);
    
    // Handle user input
    rl.setPrompt('> ');
    rl.prompt();
    
    rl.on('line', (line) => {
      const message = line.trim();
      
      if (message === '/quit') {
        console.log('👋 Leaving room...');
        room.leave().then(() => {
          process.exit(0);
        });
        return;
      }
      
      if (message === '/peers') {
        const connected = room.getConnectedPeers();
        console.log(`Connected peers: ${connected.length > 0 ? connected.join(', ') : 'none'}`);
      } else if (message) {
        room.send(message);
        console.log(`📤 Sent: ${message}`);
      }
      
      rl.prompt();
    });
    
    // Handle exit
    process.on('SIGINT', async () => {
      console.log('\n👋 Leaving room...');
      await room.leave();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);