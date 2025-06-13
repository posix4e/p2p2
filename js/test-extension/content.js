// Content script injected into test pages
console.log('P2P2 content script loaded');

// Inject chrome API access into the page
const script = document.createElement('script');
script.textContent = `
  // Make chrome.runtime available to the page
  window.chromeRuntime = {
    sendMessage: (message, callback) => {
      window.postMessage({ type: 'chrome-runtime-message', message }, '*');
      
      // Store callback to be called when response arrives
      window.__pendingCallbacks = window.__pendingCallbacks || {};
      const id = Date.now() + Math.random();
      window.__pendingCallbacks[id] = callback;
      
      // Include callback ID in message
      window.postMessage({ type: 'chrome-runtime-message', message, callbackId: id }, '*');
    }
  };
  
  // Override chrome.runtime if it doesn't exist
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    window.chrome = window.chrome || {};
    window.chrome.runtime = window.chromeRuntime;
  }
`;
script.id = 'p2p2-chrome-api-bridge';
(document.head || document.documentElement).appendChild(script);

// Listen for messages from the page
window.addEventListener('message', async (event) => {
  if (event.source !== window) return;
  
  if (event.data.type === 'chrome-runtime-message') {
    const { message, callbackId } = event.data;
    
    // Forward to background script
    chrome.runtime.sendMessage(message, (response) => {
      // Send response back to page
      window.postMessage({
        type: 'chrome-runtime-response',
        callbackId,
        response
      }, '*');
    });
  }
});

// Listen for responses and call callbacks
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  
  if (event.data.type === 'chrome-runtime-response') {
    const { callbackId, response } = event.data;
    
    // Execute callback in page context
    const script = document.createElement('script');
    script.textContent = `
      if (window.__pendingCallbacks && window.__pendingCallbacks['${callbackId}']) {
        window.__pendingCallbacks['${callbackId}'](${JSON.stringify(response)});
        delete window.__pendingCallbacks['${callbackId}'];
      }
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }
});

// Listen for P2P events from the service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'peerJoined' || message.type === 'peerLeft' || message.type === 'dataReceived') {
    // Forward to the page
    const script = document.createElement('script');
    script.textContent = `
      if (window.chrome && window.chrome.runtime && window.chrome.runtime.onMessage) {
        // Trigger any registered listeners
        if (window.__p2p2MessageListeners) {
          window.__p2p2MessageListeners.forEach(listener => {
            listener(${JSON.stringify(message)});
          });
        }
      }
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }
});