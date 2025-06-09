import { test as base, expect, chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Extend test to load extension
const test = base.extend({
  context: async ({ }, use) => {
    // Prepare extension with credentials
    const extensionPath = path.join(__dirname, '../extension-e2e');
    
    // Create background.js with real credentials from env
    const backgroundJs = `
// Background service worker
const CONFIG = {
  domain: '${process.env.DNS || 'test.domain'}',
  zoneId: '${process.env.ZONEID || 'test-zone'}',
  apiToken: '${process.env.API || 'test-token'}'
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'fetch') {
    handleFetch(request.url, request.options)
      .then(response => sendResponse(response))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
  
  if (request.type === 'getConfig') {
    sendResponse(CONFIG);
    return false;
  }
});

async function handleFetch(url, options) {
  try {
    const response = await fetch(url, options);
    const body = await response.text();
    
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: body
    };
  } catch (error) {
    throw error;
  }
}`;
    
    fs.writeFileSync(path.join(extensionPath, 'background.js'), backgroundJs);
    
    // Launch browser with extension
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        '--no-sandbox',
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });
    
    await use(context);
    await context.close();
  },
  
  extensionId: async ({ context }, use) => {
    // Get extension ID
    const extensions = await context.backgroundPages();
    if (extensions.length > 0) {
      const url = extensions[0].url();
      const id = url.split('//')[1].split('/')[0];
      await use(id);
    } else {
      await use('');
    }
  }
});

test.describe('P2P2 End-to-End Tests', () => {
  test.skip(!process.env.DNS || !process.env.ZONEID || !process.env.API, 
    'Skipping - requires DNS, ZONEID, and API environment variables');
  
  test('should establish P2P connection between two peers', async ({ context }) => {
    test.setTimeout(60000); // 1 minute timeout
    
    // Create two pages
    const page1 = await context.newPage();
    const page2 = await context.newPage();
    
    // Navigate to test page
    const testUrl = `file://${path.join(__dirname, '../test-real-e2e.html')}`;
    await page1.goto(testUrl);
    await page2.goto(testUrl);
    
    // Wait for P2P2 to load
    await page1.waitForFunction(() => window.P2P2 !== undefined);
    await page2.waitForFunction(() => window.P2P2 !== undefined);
    
    const roomId = 'e2e-test-' + Date.now();
    
    // Initialize peer 1
    const peer1Id = await page1.evaluate(async (roomId) => {
      const { P2P2, ChromeExtensionAdapter } = window.P2P2;
      
      // Get config from extension
      const config = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'getConfig' }, resolve);
      });
      
      window.room = P2P2.joinRoom(config, roomId, {
        adapter: new ChromeExtensionAdapter()
      });
      
      window.messages = [];
      window.connectedPeers = [];
      
      window.room.onPeerJoin((peerId) => {
        console.log('Peer joined:', peerId);
        window.connectedPeers.push(peerId);
      });
      
      window.room.onData((data, peerId) => {
        console.log('Received:', data);
        window.messages.push({ data, peerId });
      });
      
      await window.room.join();
      return window.room.getPeerId();
    }, roomId);
    
    console.log('Peer 1 ID:', peer1Id);
    
    // Initialize peer 2
    const peer2Id = await page2.evaluate(async (roomId) => {
      const { P2P2, ChromeExtensionAdapter } = window.P2P2;
      
      const config = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'getConfig' }, resolve);
      });
      
      window.room = P2P2.joinRoom(config, roomId, {
        adapter: new ChromeExtensionAdapter()
      });
      
      window.messages = [];
      window.connectedPeers = [];
      
      window.room.onPeerJoin((peerId) => {
        console.log('Peer joined:', peerId);
        window.connectedPeers.push(peerId);
      });
      
      window.room.onData((data, peerId) => {
        console.log('Received:', data);
        window.messages.push({ data, peerId });
      });
      
      await window.room.join();
      return window.room.getPeerId();
    }, roomId);
    
    console.log('Peer 2 ID:', peer2Id);
    
    // Wait for peer discovery (DNS + WebRTC connection)
    console.log('Waiting for peer discovery...');
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
    
    // Test message sending
    await page1.evaluate(() => {
      window.room.send('Hello from Peer 1!');
    });
    
    // Wait for message
    await page2.waitForFunction(
      () => window.messages.length > 0,
      { timeout: 5000 }
    );
    
    const peer2Messages = await page2.evaluate(() => window.messages);
    expect(peer2Messages[0].data).toBe('Hello from Peer 1!');
    expect(peer2Messages[0].peerId).toBe(peer1Id);
    
    // Send message back
    await page2.evaluate(() => {
      window.room.send('Hello from Peer 2!');
    });
    
    await page1.waitForFunction(
      () => window.messages.length > 0,
      { timeout: 5000 }
    );
    
    const peer1Messages = await page1.evaluate(() => window.messages);
    expect(peer1Messages[0].data).toBe('Hello from Peer 2!');
    expect(peer1Messages[0].peerId).toBe(peer2Id);
    
    // Clean up
    await page1.evaluate(() => window.room.leave());
    await page2.evaluate(() => window.room.leave());
  });
});

// Type declarations
declare global {
  interface Window {
    P2P2: any;
    room: any;
    messages: any[];
    connectedPeers: string[];
  }
}