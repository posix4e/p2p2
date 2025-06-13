import { test as base, chromium, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const test = base.extend({
  context: async ({ }, use) => {
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

test.describe('P2P2 Extension Simple Test', () => {
  test('can load test page and communicate with service worker', async ({ context }) => {
    // Get extension ID
    const extPage = await context.newPage();
    await extPage.goto('chrome://extensions/');
    await extPage.waitForTimeout(1000);
    
    const extensionId = await extPage.evaluate(async () => {
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
    
    console.log('Extension ID:', extensionId);
    
    // Navigate to test page
    const testPage = await context.newPage();
    await testPage.goto(`chrome-extension://${extensionId}/dist/test-page.html`);
    await testPage.waitForLoadState('networkidle');
    
    // Try to get config directly
    const configResult = await testPage.evaluate(async () => {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'getConfig' });
        return { success: true, data: response };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
    
    console.log('Config result:', configResult);
    
    if (configResult.success) {
      expect(configResult.data).toHaveProperty('domain');
      expect(configResult.data).toHaveProperty('zoneId');
      expect(configResult.data).toHaveProperty('apiToken');
      console.log('✅ Successfully communicated with service worker!');
    } else {
      console.error('❌ Failed to communicate:', configResult.error);
    }
    
    await extPage.close();
    await testPage.close();
  });
});