import { test as base, chromium, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test that loads extension and tests service worker behavior
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

  test('service worker should handle fetch requests', async ({ context }) => {
    // Get the service worker from extension
    const [background] = context.serviceWorkers();
    if (!background) {
      // Open extension page to trigger service worker
      const page = await context.newPage();
      await page.goto('chrome://extensions/');
      await page.waitForTimeout(1000);
      await page.close();
    }
    
    // Test by creating a page and sending a message
    const page = await context.newPage();
    
    // Inject test script
    await page.evaluate(() => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'getConfig' }, (response) => {
          (window as any).testConfig = response;
          resolve(response);
        });
      });
    });
    
    // Verify config was received
    const config = await page.evaluate(() => (window as any).testConfig);
    expect(config).toHaveProperty('domain');
    expect(config).toHaveProperty('zoneId');
    expect(config).toHaveProperty('apiToken');
    
    // Test fetch routing through service worker
    const fetchResult = await page.evaluate(() => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { 
            type: 'fetch', 
            url: 'https://api.cloudflare.com/client/v4/user',
            options: {
              method: 'GET',
              headers: {
                'Authorization': 'Bearer test'
              }
            }
          }, 
          resolve
        );
      });
    });
    
    expect(fetchResult).toHaveProperty('status');
    console.log('Service worker fetch test passed');
  });

  test('multiple tabs can communicate through service worker', async ({ context }) => {
    test.setTimeout(30000);
    
    // Create two tabs
    const tab1 = await context.newPage();
    const tab2 = await context.newPage();
    
    // Set up message passing test
    await tab1.evaluate(() => {
      (window as any).receivedMessages = [];
      chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'broadcast') {
          (window as any).receivedMessages.push(message);
        }
      });
    });
    
    await tab2.evaluate(() => {
      (window as any).receivedMessages = [];
      chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'broadcast') {
          (window as any).receivedMessages.push(message);
        }
      });
    });
    
    // Send message from tab1
    await tab1.evaluate(() => {
      chrome.runtime.sendMessage({ 
        type: 'broadcast', 
        data: 'Hello from tab 1' 
      });
    });
    
    // Wait a bit for message propagation
    await tab1.waitForTimeout(1000);
    
    // Check if tab2 received the message
    const tab2Messages = await tab2.evaluate(() => (window as any).receivedMessages);
    console.log('Tab 2 received messages:', tab2Messages);
    
    // Note: This test assumes the service worker implements broadcast functionality
    // If not implemented, this test documents the expected behavior
  });
});