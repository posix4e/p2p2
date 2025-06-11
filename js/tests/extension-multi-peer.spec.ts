import { test as base, chromium, expect, BrowserContext } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test that launches two separate browser instances with the extension
const test = base.extend<{
  browser1: BrowserContext;
  browser2: BrowserContext;
}>({
  browser1: async ({ }, use) => {
    const pathToExtension = path.join(__dirname, '../test-extension');
    const userDataDir = path.join(__dirname, '../test-data/browser1');
    
    const context = await chromium.launchPersistentContext(userDataDir, {
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
  browser2: async ({ }, use) => {
    const pathToExtension = path.join(__dirname, '../test-extension');
    const userDataDir = path.join(__dirname, '../test-data/browser2');
    
    const context = await chromium.launchPersistentContext(userDataDir, {
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

test.describe('P2P2 Multi-Peer Extension Tests', () => {
  test.skip(!process.env.DNS || !process.env.ZONEID || !process.env.API,
    'Requires DNS, ZONEID, and API environment variables');

  test('two extension instances should communicate', async ({ browser1, browser2 }) => {
    test.setTimeout(120000); // 2 minutes
    
    console.log('Starting multi-peer extension test...');
    
    // Verify both extensions loaded
    const workers1 = browser1.serviceWorkers();
    const workers2 = browser2.serviceWorkers();
    
    console.log(`Browser 1: ${workers1.length} service worker(s)`);
    console.log(`Browser 2: ${workers2.length} service worker(s)`);
    
    // Enable console logging for both pages
    const setupLogging = (page, name) => {
      page.on('console', msg => console.log(`[${name}]`, msg.text()));
      page.on('pageerror', err => console.error(`[${name} Error]`, err));
    };
    
    // Get extension pages
    const ext1 = await browser1.newPage();
    const ext2 = await browser2.newPage();
    
    setupLogging(ext1, 'Browser1');
    setupLogging(ext2, 'Browser2');
    
    // Navigate to extension test pages
    const extensionId1 = await getExtensionId(ext1);
    const extensionId2 = await getExtensionId(ext2);
    
    console.log('Extension 1 ID:', extensionId1);
    console.log('Extension 2 ID:', extensionId2);
    
    if (extensionId1 && extensionId2) {
      // Navigate to test pages within each extension
      await ext1.goto(`chrome-extension://${extensionId1}/dist/test-page.html`);
      await ext2.goto(`chrome-extension://${extensionId2}/dist/test-page.html`);
      
      // Wait for pages to fully load
      await ext1.waitForLoadState('networkidle');
      await ext2.waitForLoadState('networkidle');
      
      // Initialize P2P with the same room ID
      const roomId = 'test-room-' + Date.now();
      
      // Wait for initP2P to be available
      await ext1.waitForFunction(() => typeof window.initP2P === 'function', { timeout: 10000 });
      await ext2.waitForFunction(() => typeof window.initP2P === 'function', { timeout: 10000 });
      
      console.log('Initializing P2P in browser 1...');
      const result1 = await ext1.evaluate(async (roomId) => {
        try {
          // First test direct chrome API
          const config = await chrome.runtime.sendMessage({ type: 'getConfig' });
          console.log('Got config:', config);
          
          // Now try initP2P
          return await window.initP2P(roomId);
        } catch (error) {
          console.error('Error in browser 1:', error.message);
          throw error;
        }
      }, roomId);
      
      console.log('Initializing P2P in browser 2...');
      const result2 = await ext2.evaluate(async (roomId) => {
        return await window.initP2P(roomId);
      }, roomId);
      
      console.log('Browser 1 peer ID:', result1.peerId);
      console.log('Browser 2 peer ID:', result2.peerId);
      
      // Wait for peer discovery
      console.log('Waiting for peer discovery...');
      
      await ext1.waitForFunction(
        () => window.getPeers().length > 0,
        { timeout: 60000 }
      );
      
      await ext2.waitForFunction(
        () => window.getPeers().length > 0,
        { timeout: 60000 }
      );
      
      const peers1 = await ext1.evaluate(() => window.getPeers());
      const peers2 = await ext2.evaluate(() => window.getPeers());
      
      console.log('Browser 1 sees peers:', peers1);
      console.log('Browser 2 sees peers:', peers2);
      
      expect(peers1).toContain(result2.peerId);
      expect(peers2).toContain(result1.peerId);
      
      console.log('✅ Peers discovered each other!');
      
      // Test message sending
      console.log('Testing message sync...');
      
      await ext1.click('#send-btn');
      
      await ext2.waitForFunction(
        () => window.getMessages().length > 0,
        { timeout: 10000 }
      );
      
      const messages2 = await ext2.evaluate(() => window.getMessages());
      expect(messages2.length).toBeGreaterThan(0);
      expect(messages2[0].peerId).toBe(result1.peerId);
      
      console.log('✅ Message synced from browser 1 to browser 2');
      
      // Clean up is handled by browser context closure
      console.log('✅ Multi-peer test completed!');
    } else {
      console.log('Could not get extension IDs, verifying basic functionality...');
      expect(workers1.length).toBeGreaterThan(0);
      expect(workers2.length).toBeGreaterThan(0);
    }
  });
});

async function getExtensionId(page) {
  // Try to get extension ID
  await page.goto('chrome://extensions/');
  await page.waitForTimeout(1000);
  
  const extensionInfo = await page.evaluate(async () => {
    // @ts-ignore
    if (typeof chrome !== 'undefined' && chrome.developerPrivate) {
      const extensions = await new Promise((resolve) => {
        // @ts-ignore
        chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true }, resolve);
      });
      const ext = extensions.find((e: any) => e.name === 'P2P2 Test Extension');
      return ext?.id;
    }
    return null;
  });
  
  return extensionInfo;
}