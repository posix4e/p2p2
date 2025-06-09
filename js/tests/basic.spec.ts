import { test, expect } from '@playwright/test';

test.describe('P2P2 Basic Tests', () => {
  test('should load the chat interface', async ({ page }) => {
    await page.goto('/');
    
    // Check page title and main elements
    await expect(page).toHaveTitle('P2P2 Chat Example');
    await expect(page.locator('h1')).toHaveText('P2P2 Chat Example');
    
    // Check all UI elements are present
    await expect(page.locator('#status')).toBeVisible();
    await expect(page.locator('#messages')).toBeVisible();
    await expect(page.locator('#messageInput')).toBeVisible();
    await expect(page.locator('#sendButton')).toBeVisible();
    await expect(page.locator('#peerList')).toBeVisible();
  });

  test('should display room and peer IDs', async ({ page }) => {
    await page.goto('/');
    
    // Wait a moment for initialization
    await page.waitForTimeout(1000);
    
    // Check room ID is displayed
    const roomId = await page.locator('#roomId').textContent();
    expect(roomId).toBe('goatmanisthebest');
    
    // Check peer ID is displayed (should be 8 characters)
    const peerId = await page.locator('#peerId').textContent();
    expect(peerId).toMatch(/^[a-f0-9]{8}$/);
  });

  test('should show connecting status initially', async ({ page }) => {
    await page.goto('/');
    
    // Check initial status
    const status = page.locator('#status');
    await expect(status).toHaveText(/Connecting|Initializing/);
    await expect(status).toHaveClass(/status connecting/);
  });
});