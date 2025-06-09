import { test, expect, Page } from '@playwright/test';

test.describe('P2P2 Chat', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load chat interface', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('P2P2 Chat Example');
    await expect(page.locator('#status')).toBeVisible();
    await expect(page.locator('#messages')).toBeVisible();
    await expect(page.locator('#messageInput')).toBeVisible();
  });

  test('should connect to room', async ({ page }) => {
    // Wait for connection
    await expect(page.locator('#status')).toHaveText(/Connected/, { timeout: 10000 });
    
    // Check that room ID and peer ID are displayed
    const roomId = await page.locator('#roomId').textContent();
    expect(roomId).toBe('goatmanisthebest');
    
    const peerId = await page.locator('#peerId').textContent();
    expect(peerId).toMatch(/^[a-f0-9]{8}$/);
  });

  test('should enable input after connection', async ({ page }) => {
    // Wait for connection
    await expect(page.locator('#status')).toHaveText(/Connected/, { timeout: 10000 });
    
    // Check that input is enabled
    await expect(page.locator('#messageInput')).toBeEnabled();
    await expect(page.locator('#sendButton')).toBeEnabled();
  });

  test('should send and display own messages', async ({ page }) => {
    // Wait for connection
    await expect(page.locator('#status')).toHaveText(/Connected/, { timeout: 10000 });
    
    // Send a message
    await page.fill('#messageInput', 'Hello, world!');
    await page.click('#sendButton');
    
    // Check that message appears in chat
    const message = page.locator('.message').last();
    await expect(message.locator('.peer-id')).toHaveText('You');
    await expect(message).toContainText('Hello, world!');
    
    // Check that input is cleared
    await expect(page.locator('#messageInput')).toHaveValue('');
  });

  test('should communicate between two peers', async ({ browser }) => {
    // Create two browser contexts (simulating two users)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    
    // Navigate both to the chat
    await page1.goto('/');
    await page2.goto('/');
    
    // Wait for both to connect
    await expect(page1.locator('#status')).toHaveText(/Connected/, { timeout: 10000 });
    await expect(page2.locator('#status')).toHaveText(/Connected/, { timeout: 10000 });
    
    // Wait for peer discovery (may take a few seconds)
    await page1.waitForTimeout(6000);
    
    // Get peer IDs
    const peerId1 = await page1.locator('#peerId').textContent();
    const peerId2 = await page2.locator('#peerId').textContent();
    
    // Check that each peer sees the other in the peer list
    await expect(page1.locator('#peerList')).toContainText(peerId2!.substring(0, 8));
    await expect(page2.locator('#peerList')).toContainText(peerId1!.substring(0, 8));
    
    // Send message from page1
    await page1.fill('#messageInput', 'Hello from peer 1!');
    await page1.click('#sendButton');
    
    // Check that page2 receives the message
    await expect(page2.locator('.message').last()).toContainText('Hello from peer 1!');
    await expect(page2.locator('.message').last().locator('.peer-id')).toContainText(peerId1!.substring(0, 8));
    
    // Send message from page2
    await page2.fill('#messageInput', 'Hello from peer 2!');
    await page2.click('#sendButton');
    
    // Check that page1 receives the message
    await expect(page1.locator('.message').last()).toContainText('Hello from peer 2!');
    await expect(page1.locator('.message').last().locator('.peer-id')).toContainText(peerId2!.substring(0, 8));
    
    // Clean up
    await context1.close();
    await context2.close();
  });

  test('should handle peer disconnection', async ({ browser }) => {
    // Create two browser contexts
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    
    // Navigate both to the chat
    await page1.goto('/');
    await page2.goto('/');
    
    // Wait for connection and peer discovery
    await expect(page1.locator('#status')).toHaveText(/Connected/, { timeout: 10000 });
    await expect(page2.locator('#status')).toHaveText(/Connected/, { timeout: 10000 });
    await page1.waitForTimeout(6000);
    
    const peerId2 = await page2.locator('#peerId').textContent();
    
    // Verify peer is connected
    await expect(page1.locator('#peerList')).toContainText(peerId2!.substring(0, 8));
    
    // Close page2
    await page2.close();
    await context2.close();
    
    // Wait for disconnection to be detected
    await page1.waitForTimeout(6000);
    
    // Check that peer is removed from list
    await expect(page1.locator('#peerList')).toHaveText('No peers connected');
    
    // Check for system message about peer leaving
    await expect(page1.locator('.message.system').last()).toContainText('Peer left');
    
    await context1.close();
  });
});