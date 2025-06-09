#!/usr/bin/env node
import { P2P2 } from './dist/index.js';
import { config } from 'dotenv';

// Load environment variables
config();

async function runTest() {
  console.log('🧪 P2P2 Node.js Test\n');
  
  try {
    // Test 1: Create two peers
    console.log('Test 1: Creating two peers in same room');
    const roomId = 'node-test-' + Date.now();
    
    const room1 = P2P2.createRoomFromEnvironment(roomId);
    const room2 = P2P2.createRoomFromEnvironment(roomId);
    
    console.log(`Peer 1 ID: ${room1.getPeerId()}`);
    console.log(`Peer 2 ID: ${room2.getPeerId()}`);
    
    // Test 2: Set up event handlers
    console.log('\nTest 2: Setting up event handlers');
    
    let peer1Connected = false;
    let peer2Connected = false;
    const messages = [];
    
    room1.onPeerJoin((peerId) => {
      console.log(`[Peer 1] Peer joined: ${peerId}`);
      peer1Connected = true;
    });
    
    room1.onData((data, peerId) => {
      console.log(`[Peer 1] Received: "${data}" from ${peerId}`);
      messages.push({ peer: 1, data });
    });
    
    room2.onPeerJoin((peerId) => {
      console.log(`[Peer 2] Peer joined: ${peerId}`);
      peer2Connected = true;
    });
    
    room2.onData((data, peerId) => {
      console.log(`[Peer 2] Received: "${data}" from ${peerId}`);
      messages.push({ peer: 2, data });
    });
    
    // Test 3: Join rooms
    console.log('\nTest 3: Joining rooms');
    await room1.join();
    console.log('[Peer 1] Joined room');
    
    await room2.join();
    console.log('[Peer 2] Joined room');
    
    // Test 4: Wait for peer discovery
    console.log('\nTest 4: Waiting for peer discovery (10 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Test 5: Check peer lists
    console.log('\nTest 5: Checking peer lists');
    const peers1 = await room1.getPeers();
    const peers2 = await room2.getPeers();
    
    console.log(`Peer 1 sees: ${peers1.join(', ') || 'no peers'}`);
    console.log(`Peer 2 sees: ${peers2.join(', ') || 'no peers'}`);
    
    if (peers1.length === 0 || peers2.length === 0) {
      throw new Error('Peers did not discover each other');
    }
    
    // Test 6: Leave rooms
    console.log('\nTest 6: Leaving rooms');
    await room1.leave();
    console.log('[Peer 1] Left room');
    
    await room2.leave();
    console.log('[Peer 2] Left room');
    
    console.log('\n✅ All tests passed!');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Check for required environment variables
if (!process.env.DNS || !process.env.ZONEID || !process.env.API) {
  console.error('❌ Missing required environment variables: DNS, ZONEID, API');
  console.error('Please ensure .env file exists with Cloudflare credentials');
  process.exit(1);
}

runTest();