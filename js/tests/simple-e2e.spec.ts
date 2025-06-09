import { test, expect } from '@playwright/test';

test.describe('P2P2 Simple E2E Tests', () => {
  test.skip(!process.env.DNS || !process.env.ZONEID || !process.env.API,
    'Requires DNS, ZONEID, and API environment variables');

  test('should demonstrate CORS limitation and library structure', async ({ page }) => {
    // This test verifies the library loads correctly but will fail on API calls due to CORS
    
    await page.goto('http://localhost:8080/test-real.html');
    
    // Verify P2P2 library loads
    const p2p2Loaded = await page.evaluate(() => {
      return typeof window.P2P2 !== 'undefined';
    });
    expect(p2p2Loaded).toBe(true);
    
    // Verify we can create a room instance
    const roomCreated = await page.evaluate(() => {
      window.room = window.P2P2.joinRoom({
        domain: 'test.com',
        zoneId: 'test-zone',
        apiToken: 'test-token'
      }, 'test-room');
      return window.room !== undefined;
    });
    expect(roomCreated).toBe(true);
    
    // Verify the room has expected methods
    const methods = await page.evaluate(() => {
      return {
        join: typeof window.room.join === 'function',
        leave: typeof window.room.leave === 'function',
        send: typeof window.room.send === 'function',
        onPeerJoin: typeof window.room.onPeerJoin === 'function',
        onData: typeof window.room.onData === 'function',
        getPeerId: typeof window.room.getPeerId === 'function'
      };
    });
    
    expect(methods.join).toBe(true);
    expect(methods.leave).toBe(true);
    expect(methods.send).toBe(true);
    expect(methods.onPeerJoin).toBe(true);
    expect(methods.onData).toBe(true);
    expect(methods.getPeerId).toBe(true);
    
    // Get peer ID
    const peerId = await page.evaluate(() => window.room.getPeerId());
    expect(peerId).toMatch(/^[a-f0-9]{16}$/); // 16 hex chars
    
    console.log('✅ Library structure verified');
    console.log('ℹ️  Note: Actual P2P connection would fail due to CORS');
    console.log('ℹ️  Use Chrome extension or server-side proxy for real tests');
  });
});

declare global {
  interface Window {
    P2P2: any;
    room: any;
  }
}