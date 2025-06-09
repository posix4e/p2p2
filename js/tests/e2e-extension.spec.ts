import { test as base, chromium, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Custom test that loads extension
const test = base.extend({
  context: async ({ }, use) => {
    const pathToExtension = path.join(__dirname, '../test-extension');
    
    // Extension files should already exist with credentials
    
    // Launch browser with extension
    const context = await chromium.launchPersistentContext('', {
      headless: false, // Extensions don't work in headless mode
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`
      ]
    });
    
    await use(context);
    await context.close();
  }
});

test.describe('P2P2 Extension E2E Tests', () => {
  test.skip(!process.env.DNS || !process.env.ZONEID || !process.env.API,
    'Requires DNS, ZONEID, and API environment variables');
  
  test.skip(!!process.env.CI,
    'Chrome extensions require headed mode - skipping in CI');

  test('should establish real P2P connection via extension', async ({ context }) => {
    test.setTimeout(60000);
    
    // Create two pages (two peers)
    const page1 = await context.newPage();
    const page2 = await context.newPage();
    
    // Enable console logging
    page1.on('console', msg => console.log('[Peer 1]', msg.text()));
    page2.on('console', msg => console.log('[Peer 2]', msg.text()));
    page1.on('pageerror', err => console.error('[Peer 1 Error]', err));
    page2.on('pageerror', err => console.error('[Peer 2 Error]', err));
    
    // Navigate to test page
    const testHtml = `<!DOCTYPE html>
<html>
<head><title>P2P2 Extension Test</title></head>
<body>
  <h1>P2P2 Extension Test</h1>
  <div id="status">Loading...</div>
  <div id="messages"></div>
  <script type="module">
    import { P2P2, ChromeExtensionAdapter } from './dist/index.js';
    
    window.initP2P = async (roomId) => {
      // Get config from extension
      const config = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'getConfig' }, resolve);
      });
      
      console.log('Got config:', config.domain);
      
      // Create room with extension adapter
      const room = P2P2.joinRoom(config, roomId, {
        adapter: new ChromeExtensionAdapter()
      });
      
      window.room = room;
      window.messages = [];
      window.connectedPeers = [];
      
      room.onPeerJoin((peerId) => {
        console.log('Peer joined:', peerId);
        window.connectedPeers.push(peerId);
        document.getElementById('status').textContent = 'Connected to ' + peerId;
      });
      
      room.onPeerLeave((peerId) => {
        console.log('Peer left:', peerId);
        const index = window.connectedPeers.indexOf(peerId);
        if (index > -1) window.connectedPeers.splice(index, 1);
      });
      
      room.onData((data, peerId) => {
        console.log('Received:', data, 'from', peerId);
        window.messages.push({ data, peerId });
        const div = document.createElement('div');
        div.textContent = peerId + ': ' + data;
        document.getElementById('messages').appendChild(div);
      });
      
      await room.join();
      document.getElementById('status').textContent = 'Joined as ' + room.getPeerId();
      return room.getPeerId();
    };
    
    document.getElementById('status').textContent = 'Ready';
  </script>
</body>
</html>`;
    
    // Write test HTML to temp file
    const testPath = path.join(__dirname, '../test-extension.html');
    fs.writeFileSync(testPath, testHtml);
    
    // Navigate both pages
    await page1.goto(`http://localhost:8080/test-extension.html`);
    await page2.goto(`http://localhost:8080/test-extension.html`);
    
    // Wait for ready
    await page1.waitForFunction(() => 
      document.getElementById('status')?.textContent === 'Ready'
    );
    await page2.waitForFunction(() => 
      document.getElementById('status')?.textContent === 'Ready'
    );
    
    // Initialize P2P rooms
    const roomId = 'e2e-ext-' + Date.now();
    
    console.log('Initializing Peer 1...');
    const peer1Id = await page1.evaluate(async (roomId) => {
      return await window.initP2P(roomId);
    }, roomId);
    console.log('Peer 1 ID:', peer1Id);
    
    console.log('Initializing Peer 2...');
    const peer2Id = await page2.evaluate(async (roomId) => {
      return await window.initP2P(roomId);
    }, roomId);
    console.log('Peer 2 ID:', peer2Id);
    
    // Wait for connection
    console.log('Waiting for peers to connect...');
    await page1.waitForFunction(
      () => window.connectedPeers.length > 0,
      { timeout: 30000 }
    );
    await page2.waitForFunction(
      () => window.connectedPeers.length > 0,
      { timeout: 30000 }
    );
    
    // Verify connections
    const peer1Connected = await page1.evaluate(() => window.connectedPeers);
    const peer2Connected = await page2.evaluate(() => window.connectedPeers);
    
    expect(peer1Connected).toContain(peer2Id);
    expect(peer2Connected).toContain(peer1Id);
    console.log('✅ Peers connected!');
    
    // Send message from peer 1
    console.log('Sending message from Peer 1...');
    await page1.evaluate(() => {
      window.room.send('Hello from Peer 1!');
    });
    
    // Wait for message on peer 2
    await page2.waitForFunction(
      () => window.messages.length > 0,
      { timeout: 5000 }
    );
    
    const peer2Messages = await page2.evaluate(() => window.messages);
    expect(peer2Messages[0].data).toBe('Hello from Peer 1!');
    expect(peer2Messages[0].peerId).toBe(peer1Id);
    console.log('✅ Peer 2 received message!');
    
    // Send message back
    console.log('Sending message from Peer 2...');
    await page2.evaluate(() => {
      window.room.send('Hello back from Peer 2!');
    });
    
    await page1.waitForFunction(
      () => window.messages.length > 0,
      { timeout: 5000 }
    );
    
    const peer1Messages = await page1.evaluate(() => window.messages);
    expect(peer1Messages[0].data).toBe('Hello back from Peer 2!');
    expect(peer1Messages[0].peerId).toBe(peer2Id);
    console.log('✅ Peer 1 received message!');
    
    // Clean up
    await page1.evaluate(() => window.room.leave());
    await page2.evaluate(() => window.room.leave());
    
    console.log('✅ All tests passed!');
  });
});

declare global {
  interface Window {
    initP2P: (roomId: string) => Promise<string>;
    room: any;
    messages: any[];
    connectedPeers: string[];
  }
}