/*  src/background.js  – compiled → build/background.js */
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(
    { enabled: true, allowedDomains: [] },
    (v) => {
      chrome.storage.local.set(v, (err) => {
        if (chrome.runtime.lastError) {
          console.error('Error seeding storage:', chrome.runtime.lastError);
        }
      });
    }
  );
});

chrome.action.onClicked.addListener((tab) => {
  chrome.storage.local.get('enabled', ({ enabled = true }) => {
    const next = !enabled;
    chrome.storage.local.set({ enabled: next }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error toggling enabled:', chrome.runtime.lastError);
      }
      chrome.tabs.sendMessage(tab.id, { action: 'toggle-global', enabled: next }, (res) => {
      if (res && res.error) {
        console.error('Content script error:', res.error);
      }
        if (chrome.runtime.lastError) {
          // Only log if it's not the expected "no receiver" error
          if (!/Receiving end does not exist/.test(chrome.runtime.lastError.message)) {
            console.error('Error sending toggle-global message:', chrome.runtime.lastError);
          }
        }
      });
    });
  });
});