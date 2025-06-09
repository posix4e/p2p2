import { test, expect } from '@playwright/test';

test.describe('P2P2 Chromium Automated Tests', () => {
  test('should complete automated P2P test successfully', async ({ page }) => {
    // Set longer timeout for this test since it involves P2P discovery
    test.setTimeout(30000);
    
    // Log console messages
    page.on('console', msg => console.log('Browser console:', msg.text()));
    page.on('pageerror', err => console.error('Browser error:', err));
    
    // Navigate to the automated test page with autorun parameter
    await page.goto('http://localhost:8080/test-chromium.html?autorun=true');
    
    // Wait for the test to complete
    await page.waitForFunction(
      () => window.testResult !== undefined,
      { timeout: 25000 }
    );
    
    // Get the test result
    const testResult = await page.evaluate(() => window.testResult);
    const testError = await page.evaluate(() => window.testError);
    
    // Verify the test passed
    expect(testResult).toBe('PASSED');
    
    // If test failed, log the error
    if (testResult === 'FAILED') {
      console.error('Test failed with error:', testError);
    }
    
    // Also verify visual indicators
    await expect(page.locator('#test-status')).toHaveClass(/test success/);
    await expect(page.locator('#status')).toHaveText('PASSED');
    
    // Check that all test phases completed
    const logs = await page.locator('.log').allTextContents();
    expect(logs.some(log => log.includes('Test 1: Creating two peers'))).toBe(true);
    expect(logs.some(log => log.includes('Test 2: Setting up event handlers'))).toBe(true);
    expect(logs.some(log => log.includes('Test 3: Joining rooms'))).toBe(true);
    expect(logs.some(log => log.includes('Test 4: Waiting for peer discovery'))).toBe(true);
    expect(logs.some(log => log.includes('Test 5: Checking connections'))).toBe(true);
    expect(logs.some(log => log.includes('Test 6: Sending messages'))).toBe(true);
    expect(logs.some(log => log.includes('Test 7: Verifying results'))).toBe(true);
    expect(logs.some(log => log.includes('✅ All tests passed!'))).toBe(true);
  });

  test('should handle manual test button click', async ({ page }) => {
    test.setTimeout(30000);
    
    // Navigate without autorun
    await page.goto('http://localhost:8080/test-chromium.html');
    
    // Verify initial state
    await expect(page.locator('#status')).toHaveText('Not Started');
    await expect(page.locator('#test-status')).toHaveClass(/test pending/);
    
    // Click the run test button
    await page.click('#run-test');
    
    // Verify test starts
    await expect(page.locator('#status')).toHaveText('Running...');
    
    // Wait for completion
    await page.waitForFunction(
      () => window.testResult !== undefined,
      { timeout: 25000 }
    );
    
    // Verify success
    const testResult = await page.evaluate(() => window.testResult);
    expect(testResult).toBe('PASSED');
  });

  test('should demonstrate P2P functionality in single browser', async ({ page }) => {
    test.setTimeout(30000);
    
    // Navigate to test page
    await page.goto('http://localhost:8080/test-chromium.html');
    
    // Run the test
    await page.click('#run-test');
    
    // Monitor specific P2P events
    const peerJoinLogs = await page.waitForSelector(
      '.log:has-text("[Peer 1] Peer joined:")',
      { timeout: 15000 }
    );
    expect(peerJoinLogs).toBeTruthy();
    
    const messageReceivedLogs = await page.waitForSelector(
      '.log:has-text("[Peer 1] Received:")',
      { timeout: 20000 }
    );
    expect(messageReceivedLogs).toBeTruthy();
    
    // Verify both peers exchange messages
    const peer1ReceivedMessage = await page.locator('.log:has-text("[Peer 1] Received: \\"Hello from Peer 2!\\"")').isVisible();
    const peer2ReceivedMessage = await page.locator('.log:has-text("[Peer 2] Received: \\"Hello from Peer 1!\\"")').isVisible();
    
    expect(peer1ReceivedMessage).toBe(true);
    expect(peer2ReceivedMessage).toBe(true);
  });
});

// Type declarations for test globals
declare global {
  interface Window {
    testResult?: 'PASSED' | 'FAILED';
    testError?: string;
  }
}