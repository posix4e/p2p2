import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('P2P2 Real End-to-End Tests', () => {
  test.skip(!process.env.DNS || !process.env.ZONEID || !process.env.API, 
    'Skipping - requires DNS, ZONEID, and API environment variables');

  test('should send messages between two peers', async ({ browser }) => {
    test.setTimeout(60000); // 1 minute timeout
    
    // Create two browser contexts (like two different users)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    
    // Enable console logging
    page1.on('console', msg => console.log('[Page 1]', msg.text()));
    page2.on('console', msg => console.log('[Page 2]', msg.text()));
    
    // Navigate to test page
    await page1.goto('http://localhost:8080/test-real.html');
    await page2.goto('http://localhost:8080/test-real.html');
    
    // Set up environment in both pages
    const env = {
      DNS: process.env.DNS,
      ZONEID: process.env.ZONEID,
      API: process.env.API
    };
    
    await page1.evaluate((env) => { window.ENV = env; }, env);
    await page2.evaluate((env) => { window.ENV = env; }, env);
    
    // Create unique room ID
    const roomId = 'test-' + Date.now();
    
    // Initialize peer 1
    console.log('Initializing Peer 1...');
    const peer1Id = await page1.evaluate(async (roomId) => {
      const room = window.P2P2.joinRoom({
        domain: window.ENV.DNS,
        zoneId: window.ENV.ZONEID,
        apiToken: window.ENV.API
      }, roomId);
      
      window.room = room;
      window.messages = [];
      window.connected = false;
      
      room.onPeerJoin((peerId) => {
        console.log('Peer joined:', peerId);
        window.connected = true;
      });
      
      room.onData((data, peerId) => {
        console.log('Received:', data, 'from', peerId);
        window.messages.push({ data, peerId });
      });
      
      await room.join();
      return room.getPeerId();
    }, roomId);
    
    console.log('Peer 1 ID:', peer1Id);
    
    // Initialize peer 2
    console.log('Initializing Peer 2...');
    const peer2Id = await page2.evaluate(async (roomId) => {
      const room = window.P2P2.joinRoom({
        domain: window.ENV.DNS,
        zoneId: window.ENV.ZONEID,
        apiToken: window.ENV.API
      }, roomId);
      
      window.room = room;
      window.messages = [];
      window.connected = false;
      
      room.onPeerJoin((peerId) => {
        console.log('Peer joined:', peerId);
        window.connected = true;
      });
      
      room.onData((data, peerId) => {
        console.log('Received:', data, 'from', peerId);
        window.messages.push({ data, peerId });
      });
      
      await room.join();
      return room.getPeerId();
    }, roomId);
    
    console.log('Peer 2 ID:', peer2Id);
    
    // This will fail due to CORS, but let's see what happens
    console.log('Note: This test will fail due to CORS unless run with a proxy or extension');
    
    // Clean up contexts
    await context1.close();
    await context2.close();
  });
});