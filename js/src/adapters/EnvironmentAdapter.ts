// Environment adapter to support different runtime environments
export interface EnvironmentAdapter {
  setInterval(callback: () => void, ms: number): any;
  clearInterval(handle: any): void;
  setTimeout(callback: () => void, ms: number): any;
  clearTimeout(handle: any): void;
  getEnvironmentVariable(name: string): string | undefined;
}

// Node.js environment adapter
export class NodeAdapter implements EnvironmentAdapter {
  setInterval(callback: () => void, ms: number): any {
    return setInterval(callback, ms);
  }
  
  clearInterval(handle: any): void {
    clearInterval(handle);
  }
  
  setTimeout(callback: () => void, ms: number): any {
    return setTimeout(callback, ms);
  }
  
  clearTimeout(handle: any): void {
    clearTimeout(handle);
  }
  
  getEnvironmentVariable(name: string): string | undefined {
    return process.env[name];
  }
}

// Import ChromeExtensionAdapter for use in createDefaultAdapter
import { ChromeExtensionAdapter } from './ChromeExtensionAdapter';

// Export ChromeExtensionAdapter from separate file
export { ChromeExtensionAdapter };

// Auto-detect environment
export function createDefaultAdapter(): EnvironmentAdapter {
  if (typeof window !== 'undefined') {
    // Check if in Chrome extension
    if (typeof (globalThis as any).chrome !== 'undefined' && (globalThis as any).chrome.runtime) {
      return new ChromeExtensionAdapter();
    }
    throw new Error('P2P2 requires Chrome extension environment. Regular browser context is not supported due to CORS restrictions.');
  } else if (typeof process !== 'undefined' && process.env) {
    return new NodeAdapter();
  }
  throw new Error('Unknown environment');
}