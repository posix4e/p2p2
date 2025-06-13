import { test as base, chromium, expect, BrowserContext } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test fixture that creates two browser contexts with the extension
const test = base.extend<{
  context1: BrowserContext;
  context2: BrowserContext;
}>({
  context1: async ({ }, use) => {
    const pathToExtension = path.join(__dirname, '../test-extension');
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`
      ]
    });
    await use(context);
    await context.close();
  },
  context2: async ({ }, use) => {
    const pathToExtension = path.join(__dirname, '../test-extension');
    const context = await chromium.launchPersistentContext('', {
      headless: false,
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

test.describe('P2P2 Extension Sync Tests', () => {
  test.skip(!process.env.DNS || !process.env.ZONEID || !process.env.API,
    'Requires DNS, ZONEID, and API environment variables');

  test('two extensions should discover each other and sync', async ({ context1, context2 }) => {
    test.setTimeout(120000); // 2 minutes for peer discovery and sync

    // Create test pages for each extension
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Enable console logging
    page1.on('console', msg => console.log('[Extension 1]', msg.text()));
    page2.on('console', msg => console.log('[Extension 2]', msg.text()));
    page1.on('pageerror', err => console.error('[Extension 1 Error]', err));
    page2.on('pageerror', err => console.error('[Extension 2 Error]', err));

    // Create a simple test page that uses the extension
    const testHtml = `<!DOCTYPE html>
<html>
<head><title>P2P2 Sync Test</title></head>
<body>
  <h1>P2P2 Extension Sync Test</h1>
  <div id="status">Initializing...</div>
  <div id="peers">Peers: <span id="peer-count">0</span></div>
  <div id="messages"></div>
  <button id="send-btn" disabled>Send Test Message</button>
  
  <script type="module">
    // Import P2P2 from extension's dist
    const script = document.createElement('script');
    script.type = 'module';
    script.textContent = \`
      import { P2P2, ChromeExtensionAdapter } from 'chrome-extension://__EXTENSION_ID__/dist/index.js';
      
      window.initP2P = async () => {
        try {
          // Get config from extension
          const config = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: 'getConfig' }, (response) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(response);
              }
            });
          });
          
          console.log('Got config for domain:', config.domain);
          
          // Create room with a unique ID for this test
          const roomId = 'sync-test-' + Date.now();
          const room = P2P2.joinRoom(config, roomId, {
            adapter: new ChromeExtensionAdapter()
          });
          
          window.room = room;
          window.peers = new Set();
          window.messages = [];
          
          // Set up event handlers
          room.onPeerJoin((peerId) => {
            console.log('Peer joined:', peerId);
            window.peers.add(peerId);
            updateUI();
          });
          
          room.onPeerLeave((peerId) => {
            console.log('Peer left:', peerId);
            window.peers.delete(peerId);
            updateUI();
          });
          
          room.onData((data, peerId) => {
            console.log('Received:', data, 'from', peerId);
            window.messages.push({ data, peerId, timestamp: Date.now() });
            
            const div = document.createElement('div');
            div.textContent = \`\${new Date().toLocaleTimeString()} - \${peerId}: \${data}\`;
            document.getElementById('messages').appendChild(div);
          });
          
          // Join the room
          await room.join();
          const myId = room.getPeerId();
          console.log('Joined room as:', myId);
          document.getElementById('status').textContent = 'Connected as: ' + myId;
          
          // Enable send button
          document.getElementById('send-btn').disabled = false;
          document.getElementById('send-btn').onclick = () => {
            const msg = 'Hello from ' + myId + ' at ' + new Date().toLocaleTimeString();
            room.send(msg);
            console.log('Sent:', msg);
          };
          
          return { roomId, peerId: myId };
        } catch (error) {
          console.error('Failed to initialize P2P:', error);
          document.getElementById('status').textContent = 'Error: ' + error.message;
          throw error;
        }
      };
      
      function updateUI() {
        document.getElementById('peer-count').textContent = window.peers.size;
      }
    \`;
    
    // We need to get the extension ID first
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'getConfig' }, () => {
        // Once we verify the extension is loaded, add the script
        const extensionId = chrome.runtime.id;
        script.textContent = script.textContent.replace('__EXTENSION_ID__', extensionId);
        document.head.appendChild(script);
        
        // Initialize after script loads
        setTimeout(() => {
          if (window.initP2P) {
            window.initP2P().then(info => {
              window.p2pInfo = info;
            });
          }
        }, 100);
      });
    } else {
      document.getElementById('status').textContent = 'Extension not available';
    }
  </script>
</body>
</html>`;

    // Load the test page in both contexts
    await page1.evaluate(html => {
      document.documentElement.innerHTML = html;
    }, testHtml);
    
    await page2.evaluate(html => {
      document.documentElement.innerHTML = html;
    }, testHtml);

    // Wait for both peers to initialize
    console.log('Waiting for peers to initialize...');
    
    const peer1Info = await page1.waitForFunction(
      () => window.p2pInfo,
      { timeout: 30000 }
    ).then(() => page1.evaluate(() => window.p2pInfo));
    
    const peer2Info = await page2.waitForFunction(
      () => window.p2pInfo,
      { timeout: 30000 }
    ).then(() => page2.evaluate(() => window.p2pInfo));
    
    console.log('Peer 1 initialized:', peer1Info);
    console.log('Peer 2 initialized:', peer2Info);
    
    // Both peers should be in the same room
    expect(peer1Info.roomId).toBe(peer2Info.roomId);
    
    // Wait for peers to discover each other
    console.log('Waiting for peer discovery...');
    
    await page1.waitForFunction(
      () => window.peers && window.peers.size > 0,
      { timeout: 60000 }
    );
    
    await page2.waitForFunction(
      () => window.peers && window.peers.size > 0,
      { timeout: 60000 }
    );
    
    // Verify both peers see each other
    const peer1Peers = await page1.evaluate(() => Array.from(window.peers));
    const peer2Peers = await page2.evaluate(() => Array.from(window.peers));
    
    expect(peer1Peers).toContain(peer2Info.peerId);
    expect(peer2Peers).toContain(peer1Info.peerId);
    
    console.log('✅ Peers discovered each other!');
    
    // Test message sending from peer 1
    console.log('Testing message sync...');
    await page1.click('#send-btn');
    
    // Wait for peer 2 to receive the message
    await page2.waitForFunction(
      () => window.messages && window.messages.length > 0,
      { timeout: 10000 }
    );
    
    const peer2Messages = await page2.evaluate(() => window.messages);
    expect(peer2Messages.length).toBeGreaterThan(0);
    expect(peer2Messages[0].peerId).toBe(peer1Info.peerId);
    
    console.log('✅ Message synced from peer 1 to peer 2');
    
    // Test message sending from peer 2
    await page2.click('#send-btn');
    
    // Wait for peer 1 to receive the message
    await page1.waitForFunction(
      () => window.messages && window.messages.length > 0,
      { timeout: 10000 }
    );
    
    const peer1Messages = await page1.evaluate(() => window.messages);
    expect(peer1Messages.length).toBeGreaterThan(0);
    expect(peer1Messages[0].peerId).toBe(peer2Info.peerId);
    
    console.log('✅ Message synced from peer 2 to peer 1');
    
    // Clean up
    await page1.evaluate(() => window.room.leave());
    await page2.evaluate(() => window.room.leave());
    
    console.log('✅ P2P sync test completed successfully!');
  });
});

declare global {
  interface Window {
    initP2P: () => Promise<{ roomId: string; peerId: string }>;
    p2pInfo: { roomId: string; peerId: string };
    room: any;
    peers: Set<string>;
    messages: Array<{ data: string; peerId: string; timestamp: number }>;
  }
}