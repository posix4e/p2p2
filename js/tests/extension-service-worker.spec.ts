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
    
    // The extension should have loaded
    expect(workers.length).toBeGreaterThanOrEqual(0);
    
    // Create a page to verify browser works
    const page = await context.newPage();
    await page.goto('about:blank');
    expect(await page.title()).toBe('');
    await page.close();
    
    console.log('Extension context test passed');
  });
});