
// Background service worker for E2E tests
const CONFIG = {
  domain: 'newman.family',
  zoneId: '10fa67ca924a83ca40d1c8081d21fdfe',
  apiToken: 'cgJ0eSU7A_0h1BcbbROXEOuMoNUWupL_ajbIlL3u'
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'fetch') {
    console.log('Background: Handling fetch to', request.url);
    handleFetch(request.url, request.options)
      .then(response => sendResponse(response))
      .catch(error => {
        console.error('Background fetch error:', error);
        sendResponse({ error: error.message });
      });
    return true; // Will respond asynchronously
  }
  
  if (request.type === 'getConfig') {
    sendResponse(CONFIG);
    return false;
  }
});

async function handleFetch(url, options) {
  const response = await fetch(url, options);
  const body = await response.text();
  
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    body: body
  };
}

console.log('P2P2 test extension loaded');
