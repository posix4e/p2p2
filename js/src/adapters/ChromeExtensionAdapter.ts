/// <reference types="chrome"/>
import { EnvironmentAdapter } from './EnvironmentAdapter';

export class ChromeExtensionAdapter implements EnvironmentAdapter {
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
    // In Chrome extensions, we don't use environment variables
    return undefined;
  }

  // Make fetch requests through the background script to avoid CORS
  async fetch(url: string, options?: RequestInit): Promise<Response> {
    return new Promise((resolve, reject) => {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
        reject(new Error('Chrome runtime API not available'));
        return;
      }
      
      chrome.runtime.sendMessage(
        {
          type: 'fetch',
          url,
          options
        },
        (response: any) => {
          if (chrome.runtime?.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          if (response?.error) {
            reject(new Error(response.error));
            return;
          }
          
          // Create a Response-like object
          const fetchResponse = new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
          });
          
          resolve(fetchResponse);
        }
      );
    });
  }
}