import { P2P2Room } from './P2P2Room';
import { P2P2Core, P2P2Options } from './P2P2Core';
import { RoomConfig } from './types';
import { InvalidConfigurationError } from './errors';
import { NodeAdapter, ChromeExtensionAdapter, createDefaultAdapter } from './adapters/EnvironmentAdapter';

// Export all types and errors
export * from './types';
export * from './errors';

// Export core modules for advanced use
export { P2P2Core, P2P2Options };
export { CloudflareDNSDiscovery } from './CloudflareDNSDiscovery';
export { WebRTCManager } from './WebRTCManager';

// Export adapters for different environments
export { 
  NodeAdapter, 
  ChromeExtensionAdapter,
  createDefaultAdapter
};

// Export main room class
export { P2P2Room };

// Convenience factory class (backward compatible)
export class P2P2 {
  static joinRoom(config: RoomConfig, roomId: string, options?: P2P2Options): P2P2Room {
    return new P2P2Room(roomId, config, options);
  }

  static createRoomFromEnvironment(roomId?: string, options?: P2P2Options): P2P2Room {
    const adapter = options?.adapter || createDefaultAdapter();
    
    const domain = adapter.getEnvironmentVariable('DNS');
    const zoneId = adapter.getEnvironmentVariable('ZONEID');
    const apiToken = adapter.getEnvironmentVariable('API');
    
    if (!domain || !zoneId || !apiToken) {
      throw new InvalidConfigurationError(
        'Missing required environment variables: DNS, ZONEID, API'
      );
    }

    const finalRoomId = roomId || 
      adapter.getEnvironmentVariable('ROOMID') || 
      'default-room';

    const config: RoomConfig = {
      domain,
      zoneId,
      apiToken
    };

    return P2P2.joinRoom(config, finalRoomId, options);
  }

  // Convenience method for Chrome extensions
  static async createRoomForChromeExtension(
    roomId?: string, 
    configKey: string = 'p2p2Config'
  ): Promise<P2P2Room> {
    return new Promise((resolve, reject) => {
      if (typeof (globalThis as any).chrome === 'undefined' || !(globalThis as any).chrome.storage) {
        reject(new Error('Not running in Chrome extension context'));
        return;
      }

      (globalThis as any).chrome.storage.local.get([configKey], (result: any) => {
        const config = result[configKey];
        if (!config || !config.domain || !config.zoneId || !config.apiToken) {
          reject(new InvalidConfigurationError(
            `Missing P2P2 configuration in chrome.storage.local['${configKey}']`
          ));
          return;
        }

        const options: P2P2Options = {
          adapter: new ChromeExtensionAdapter()
        };

        const room = P2P2.joinRoom(config, roomId || 'default-room', options);
        resolve(room);
      });
    });
  }
}