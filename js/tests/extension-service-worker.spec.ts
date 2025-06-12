import { test as base, chromium, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test that loads extension and verifies it works
const test = base.extend({
  context: async ({ }, use) => {
    const pathToExtension = path.join(__dirname, '../test-extension');
    
    console.log('Launching browser with extension from:', pathToExtension);
    
    // Launch browser with extension
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote', // Disable zygote process
      '--no-first-run',
      '--disable-features=ChromeWhatsNewUI',
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`
    ];
    
    // Add CI-specific flags
    if (process.env.CI) {
      args.push(
        '--disable-dbus', // Prevent D-Bus errors in CI
        '--disable-software-rasterizer',
        '--disable-accelerated-2d-canvas',
        '--disable-blink-features=AutomationControlled'
      );
    }
    
    let context;
    let retries = 3;
    
    while (retries > 0) {
      try {
        context = await chromium.launchPersistentContext('', {
          headless: false, // Extensions require headed mode
          args,
          timeout: 120000 // Increase browser launch timeout to 2 minutes
        });
        break;
      } catch (error) {
        retries--;
        console.error(`Failed to launch browser (${3 - retries}/3):`, error.message);
        if (retries === 0) {
          throw error;
        }
        console.log(`Retrying in 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    console.log('Browser context created');
    
    await use(context);
    await context.close();
  }
});

test.describe('P2P2 Extension Service Worker Tests', () => {
  test.skip(!process.env.DNS || !process.env.ZONEID || !process.env.API,
    'Requires DNS, ZONEID, and API environment variables');

  test('extension loads successfully', async ({ context }, testInfo) => {
    // Add debug info
    console.log('Test environment:', {
      display: process.env.DISPLAY,
      ci: process.env.CI,
      platform: process.platform
    });
    
    // Verify the extension loaded by checking the context
    expect(context).toBeDefined();
    
    // Wait a bit for extension to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Get service workers (extension background script)
    const workers = context.serviceWorkers();
    console.log(`Found ${workers.length} service worker(s)`);
    
    // Simple test - just verify we can create a page
    const page = await context.newPage();
    
    try {
      // Navigate to a simple page
      await page.goto('about:blank');
      
      // Check if extension is available in the page context
      const hasExtension = await page.evaluate(() => {
        return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
      });
      
      console.log('Extension available in page context:', hasExtension);
      
      // If we have service workers or extension is available, test passes
      if (workers.length > 0 || hasExtension) {
        console.log('Extension loaded successfully');
        expect(true).toBe(true);
      } else {
        throw new Error('No service workers found and extension not available in page context');
      }
    } catch (error) {
      console.error('Test error:', error);
      
      // Attach error details
      await testInfo.attach('error-details', {
        body: Buffer.from(`Error: ${error}\nDisplay: ${process.env.DISPLAY}\nWorkers: ${workers.length}`),
        contentType: 'text/plain'
      });
      
      throw error;
    } finally {
      await page.close();
    }
    
    console.log('Extension context test passed');
  });
});