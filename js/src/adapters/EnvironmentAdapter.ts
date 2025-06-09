// Environment adapter to support different runtime environments
export interface EnvironmentAdapter {
  setInterval(callback: () => void, ms: number): any;
  clearInterval(handle: any): void;
  setTimeout(callback: () => void, ms: number): any;
  clearTimeout(handle: any): void;
  getEnvironmentVariable(name: string): string | undefined;
}

// Browser environment adapter
export class BrowserAdapter implements EnvironmentAdapter {
  setInterval(callback: () => void, ms: number): any {
    return window.setInterval(callback, ms);
  }
  
  clearInterval(handle: any): void {
    window.clearInterval(handle);
  }
  
  setTimeout(callback: () => void, ms: number): any {
    return window.setTimeout(callback, ms);
  }
  
  clearTimeout(handle: any): void {
    window.clearTimeout(handle);
  }
  
  getEnvironmentVariable(name: string): string | undefined {
    // In browser, check window.ENV or meta tags
    if (typeof window !== 'undefined' && (window as any).ENV) {
      return (window as any).ENV[name];
    }
    return undefined;
  }
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

// Export ChromeExtensionAdapter from separate file
export { ChromeExtensionAdapter } from './ChromeExtensionAdapter';

// Auto-detect environment
export function createDefaultAdapter(): EnvironmentAdapter {
  if (typeof window !== 'undefined') {
    // Check if in Chrome extension
    if (typeof (globalThis as any).chrome !== 'undefined' && (globalThis as any).chrome.storage) {
      // Import at runtime to avoid circular dependencies  
      const { ChromeExtensionAdapter } = require('./ChromeExtensionAdapter');
      return new ChromeExtensionAdapter();
    }
    return new BrowserAdapter();
  } else if (typeof process !== 'undefined' && process.env) {
    return new NodeAdapter();
  }
  throw new Error('Unknown environment');
}