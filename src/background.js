/*  src/background.js  – compiled → build/background.js */
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(
    { enabled: true, allowedDomains: [] },
    (v) => chrome.storage.local.set(v)        // seed on first install
  );
});

chrome.action.onClicked.addListener((tab) => {
  chrome.storage.local.get('enabled', ({ enabled = true }) => {
    const next = !enabled;
    chrome.storage.local.set({ enabled: next });
    chrome.tabs.sendMessage(tab.id, { action: 'toggle-global', enabled: next });
  });
});