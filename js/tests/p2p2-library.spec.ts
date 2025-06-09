import { test, expect } from '@playwright/test';

test.describe('P2P2 Library Structure Tests', () => {
  test('should have all required exports and functionality', async ({ page }) => {
    // Navigate to library structure test
    await page.goto('http://localhost:8080/test-library-structure.html');
    
    // Wait for tests to complete
    await page.waitForFunction(
      () => window.testResult !== undefined,
      { timeout: 5000 }
    );
    
    // Get test result
    const testResult = await page.evaluate(() => window.testResult);
    
    // Verify all tests passed
    expect(testResult).toBe('PASSED');
    
    // Verify visual indicators
    await expect(page.locator('#test-status')).toHaveClass(/test success/);
    await expect(page.locator('#status')).toHaveText('All tests passed!');
    
    // Check that all individual tests passed
    const logs = await page.locator('.log').allTextContents();
    
    // Verify key exports are tested
    expect(logs.some(log => log.includes('✓ P2P2 factory class exists'))).toBe(true);
    expect(logs.some(log => log.includes('✓ P2P2Room class exists'))).toBe(true);
    expect(logs.some(log => log.includes('✓ CloudflareDNSDiscovery class exists'))).toBe(true);
    expect(logs.some(log => log.includes('✓ WebRTCManager class exists'))).toBe(true);
    expect(logs.some(log => log.includes('✓ Can create room instance'))).toBe(true);
    
    // No failures
    expect(logs.some(log => log.includes('✗'))).toBe(false);
  });
});

declare global {
  interface Window {
    testResult?: 'PASSED' | 'FAILED';
  }
}