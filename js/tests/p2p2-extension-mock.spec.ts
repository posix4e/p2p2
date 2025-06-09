import { test, expect } from '@playwright/test';

test.describe('P2P2 Chrome Extension Architecture Tests', () => {
  test('should successfully route API calls through Chrome extension adapter', async ({ page }) => {
    // Log console messages
    page.on('console', msg => console.log('Browser:', msg.text()));
    page.on('pageerror', err => console.error('Browser error:', err));
    
    // Navigate to the mock test page
    await page.goto('http://localhost:8080/test-extension-mock.html?autorun=true');
    
    // Wait for test to complete
    await page.waitForFunction(
      () => window.testResult !== undefined,
      { timeout: 10000 }
    );
    
    // Get test result
    const testResult = await page.evaluate(() => window.testResult);
    const testError = await page.evaluate(() => window.testError);
    
    if (testResult === 'FAILED') {
      console.error('Test error:', testError);
    }
    
    // Verify the test passed
    expect(testResult).toBe('PASSED');
    
    // Verify visual indicators
    await expect(page.locator('#test-status')).toHaveClass(/test success/);
    await expect(page.locator('#status')).toHaveText('PASSED');
    
    // Verify key operations were logged
    const logs = await page.locator('.log').allTextContents();
    
    // Check that Chrome runtime API was used
    expect(logs.some(log => log.includes('Mock: Intercepting fetch request'))).toBe(true);
    expect(logs.some(log => log.includes('Successfully joined room (DNS announce via Chrome runtime API)'))).toBe(true);
    expect(logs.some(log => log.includes('Successfully left room (DNS cleanup via Chrome runtime API)'))).toBe(true);
    expect(logs.some(log => log.includes('Adapter fetch successfully routed through Chrome runtime'))).toBe(true);
  });
});

declare global {
  interface Window {
    testResult?: 'PASSED' | 'FAILED';
    testError?: string;
  }
}