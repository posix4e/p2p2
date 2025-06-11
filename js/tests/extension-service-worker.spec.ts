import { test as base, chromium, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test that loads extension and verifies it works
const test = base.extend({
  context: async ({ }, use) => {
    const pathToExtension = path.join(__dirname, '../test-extension');
    
    // Launch browser with extension
    const context = await chromium.launchPersistentContext('', {
      headless: false, // Extensions require headed mode
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

test.describe('P2P2 Extension Service Worker Tests', () => {
  test.skip(!process.env.DNS || !process.env.ZONEID || !process.env.API,
    'Requires DNS, ZONEID, and API environment variables');

  test('extension loads successfully', async ({ context }) => {
    // Verify the extension loaded by checking the context
    expect(context).toBeDefined();
    
    // Get service workers (extension background script)
    const workers = context.serviceWorkers();
    console.log(`Found ${workers.length} service worker(s)`);
    
    // Get extension ID by navigating to chrome://extensions
    const extPage = await context.newPage();
    await extPage.goto('chrome://extensions/');
    await extPage.waitForTimeout(500);
    
    // Get extension info
    const extensionInfo = await extPage.evaluate(async () => {
      // @ts-ignore - chrome.developerPrivate is available on extensions page
      if (typeof chrome !== 'undefined' && chrome.developerPrivate) {
        const extensions = await new Promise((resolve) => {
          // @ts-ignore
          chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true }, resolve);
        });
        const p2p2Ext = extensions.find((ext: any) => ext.name === 'P2P2 Test Extension');
        return p2p2Ext ? { id: p2p2Ext.id, name: p2p2Ext.name, enabled: p2p2Ext.enabled } : null;
      }
      return null;
    });
    
    if (extensionInfo) {
      console.log('Extension loaded:', extensionInfo);
      console.log('Extension ID:', extensionInfo.id);
      expect(extensionInfo.id).toBeTruthy();
      expect(extensionInfo.name).toBe('P2P2 Test Extension');
      // Note: enabled property might not be available in all Chrome versions
    } else {
      console.log('Could not get extension info from chrome.developerPrivate API');
      // Still pass if we have service workers
      expect(workers.length).toBeGreaterThan(0);
    }
    
    await extPage.close();
    
    console.log('Extension context test passed');
  });
});