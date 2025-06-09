// Background service worker for the extension
// Handles fetch requests to bypass CORS

chrome.runtime.onInstalled.addListener(() => {
  console.log('P2P2 Extension installed');
});

// Handle fetch requests from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'fetch') {
    handleFetch(request.url, request.options)
      .then(response => sendResponse(response))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Will respond asynchronously
  }
});

async function handleFetch(url, options) {
  try {
    const response = await fetch(url, options);
    
    // Convert response to a serializable format
    const body = await response.text();
    
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: body
    };
  } catch (error) {
    throw error;
  }
}