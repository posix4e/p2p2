import { test, expect, Browser, Page } from '@playwright/test';

test.describe('P2P2 Integration Tests', () => {
  let browser: Browser;
  
  test.beforeAll(async ({ browser: b }) => {
    browser = b;
  });

  test('should establish P2P connection between two peers', async () => {
    // Create two browser contexts (like two different users)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    
    // Navigate both to the test page
    await page1.goto('/test-manual.html');
    await page2.goto('/test-manual.html');
    
    // Use same room ID for both
    const roomId = 'test-room-' + Date.now();
    
    await page1.fill('input#roomId', roomId);
    await page2.fill('input#roomId', roomId);
    
    // Connect both peers
    await page1.click('#connect');
    await page2.click('#connect');
    
    // Wait for connection status
    await expect(page1.locator('#status1')).toHaveClass(/status connected/, { timeout: 10000 });
    await expect(page2.locator('#status2')).toHaveClass(/status connected/, { timeout: 10000 });
    
    // Wait for peer discovery (DNS records take time)
    await page1.waitForTimeout(7000);
    
    // Check that peers see each other
    const peers1Text = await page1.locator('#peers1').textContent();
    const peers2Text = await page2.locator('#peers2').textContent();
    
    expect(peers1Text).not.toBe('None');
    expect(peers2Text).not.toBe('None');
    
    // Get peer IDs
    const peerId1 = await page1.locator('#peerId1').textContent();
    const peerId2 = await page2.locator('#peerId2').textContent();
    
    // Verify each peer sees the other
    expect(peers1Text).toContain(peerId2!.substring(0, 8));
    expect(peers2Text).toContain(peerId1!.substring(0, 8));
    
    // Clean up
    await context1.close();
    await context2.close();
  });

  test('should send messages between peers', async () => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    
    await page1.goto('/test-manual.html');
    await page2.goto('/test-manual.html');
    
    const roomId = 'test-chat-' + Date.now();
    
    await page1.fill('input#roomId', roomId);
    await page2.fill('input#roomId', roomId);
    
    await page1.click('#connect');
    await page2.click('#connect');
    
    // Wait for connection
    await expect(page1.locator('#status1')).toHaveClass(/status connected/, { timeout: 10000 });
    await expect(page2.locator('#status2')).toHaveClass(/status connected/, { timeout: 10000 });
    
    // Wait for peer discovery
    await page1.waitForTimeout(7000);
    
    // Send message from peer 1
    await page1.fill('#input1', 'Hello from Peer 1!');
    await page1.press('#input1', 'Enter');
    
    // Check message appears in peer 2
    await expect(page2.locator('#messages2')).toContainText('Hello from Peer 1!', { timeout: 5000 });
    
    // Send message from peer 2
    await page2.fill('#input2', 'Hello back from Peer 2!');
    await page2.press('#input2', 'Enter');
    
    // Check message appears in peer 1
    await expect(page1.locator('#messages1')).toContainText('Hello back from Peer 2!', { timeout: 5000 });
    
    // Verify both peers have both messages
    const messages1 = await page1.locator('#messages1').textContent();
    const messages2 = await page2.locator('#messages2').textContent();
    
    expect(messages1).toContain('Hello from Peer 1!');
    expect(messages1).toContain('Hello back from Peer 2!');
    expect(messages2).toContain('Hello from Peer 1!');
    expect(messages2).toContain('Hello back from Peer 2!');
    
    await context1.close();
    await context2.close();
  });

  test('should handle peer disconnection', async () => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    
    await page1.goto('/test-manual.html');
    await page2.goto('/test-manual.html');
    
    const roomId = 'test-disconnect-' + Date.now();
    
    await page1.fill('input#roomId', roomId);
    await page2.fill('input#roomId', roomId);
    
    await page1.click('#connect');
    await page2.click('#connect');
    
    // Wait for connection and peer discovery
    await expect(page1.locator('#status1')).toHaveClass(/status connected/, { timeout: 10000 });
    await expect(page2.locator('#status2')).toHaveClass(/status connected/, { timeout: 10000 });
    await page1.waitForTimeout(7000);
    
    // Verify peers are connected
    const peers1Before = await page1.locator('#peers1').textContent();
    expect(peers1Before).not.toBe('None');
    
    // Disconnect peer 2
    await page2.click('#disconnect');
    await expect(page2.locator('#status2')).toHaveClass(/status disconnected/);
    
    // Wait for peer 1 to detect disconnection (DNS TTL + discovery interval)
    await page1.waitForTimeout(10000);
    
    // Check that peer 1 no longer sees peer 2
    await expect(page1.locator('#messages1')).toContainText('Peer left');
    const peers1After = await page1.locator('#peers1').textContent();
    expect(peers1After).toBe('None');
    
    await context1.close();
    await context2.close();
  });

  test('should work with multiple peers in same room', async () => {
    const contexts = [];
    const pages = [];
    const roomId = 'test-multi-' + Date.now();
    
    // Create 3 peers
    for (let i = 0; i < 3; i++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto('/test-manual.html');
      await page.fill('input#roomId', roomId);
      contexts.push(context);
      pages.push(page);
    }
    
    // Connect all peers
    for (const page of pages) {
      await page.click('#connect');
    }
    
    // Wait for all to connect
    for (const page of pages) {
      await expect(page.locator('#status1')).toHaveClass(/status connected/, { timeout: 10000 });
    }
    
    // Wait for peer discovery
    await pages[0].waitForTimeout(10000);
    
    // Check that each peer sees 2 other peers
    for (const page of pages) {
      const peersText = await page.locator('#peers1').textContent();
      expect(peersText).not.toBe('None');
      // Should see 2 other peer IDs (each 8 chars + comma + space = ~18 chars per peer)
      expect(peersText!.length).toBeGreaterThan(15);
    }
    
    // Send a message from first peer
    await pages[0].fill('#input1', 'Hello everyone!');
    await pages[0].press('#input1', 'Enter');
    
    // Check all other peers receive it
    for (let i = 1; i < pages.length; i++) {
      await expect(pages[i].locator('#messages1')).toContainText('Hello everyone!', { timeout: 5000 });
    }
    
    // Clean up
    for (const context of contexts) {
      await context.close();
    }
  });
});