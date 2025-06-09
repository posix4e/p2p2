import { test, expect } from '@playwright/test';

test.describe('P2P2 Extension Environment Tests', () => {
  test('should work in extension-like environment', async ({ page }) => {
    test.setTimeout(30000);
    
    // Log console messages
    page.on('console', msg => console.log('Browser console:', msg.text()));
    page.on('pageerror', err => console.error('Browser error:', err));
    
    // Navigate to extension test page
    await page.goto('http://localhost:8080/test-extension.html?autorun=true');
    
    // Wait for test to complete
    await page.waitForFunction(
      () => window.testResult !== undefined,
      { timeout: 25000 }
    );
    
    // Get test result
    const testResult = await page.evaluate(() => window.testResult);
    const testError = await page.evaluate(() => window.testError);
    
    if (testResult === 'FAILED') {
      console.error('Test failed with error:', testError);
    }
    
    // Verify the test passed
    expect(testResult).toBe('PASSED');
    
    // Verify visual indicators
    await expect(page.locator('#test-status')).toHaveClass(/test success/);
    await expect(page.locator('#status')).toHaveText('PASSED');
  });

  test('should demonstrate extension popup functionality', async ({ page }) => {
    test.setTimeout(30000);
    
    // Navigate to extension popup simulation
    await page.goto('http://localhost:8080/extension-test/popup.html');
    
    // Verify initial state
    await expect(page.locator('#status')).toHaveText('Disconnected');
    
    // Mock chrome.storage API if not present
    await page.evaluate(() => {
      if (!window.chrome) {
        window.chrome = {
          storage: {
            local: {
              set: (data, callback) => {
                console.log('Mock chrome.storage.local.set:', data);
                if (callback) callback();
              },
              get: (keys, callback) => {
                callback({
                  p2p2Config: {
                    domain: 'test.example.com',
                    zoneId: 'test-zone-id',
                    apiToken: 'test-api-token'
                  }
                });
              }
            }
          }
        };
      }
    });
    
    // Click connect
    await page.click('#connect');
    
    // Wait for connection
    await expect(page.locator('#status')).toHaveText('Connected', { timeout: 15000 });
    
    // Check that peer ID is logged
    const logs = await page.locator('#log').textContent();
    expect(logs).toContain('Connected as');
    
    // Disconnect
    await page.click('#disconnect');
    await expect(page.locator('#status')).toHaveText('Disconnected');
  });
});

// Type declarations
declare global {
  interface Window {
    testResult?: 'PASSED' | 'FAILED';
    testError?: string;
    chrome?: any;
  }
}