/*  src/background.js  – compiled → build/background.js */
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(
    { allowedDomains: [] },
    (v) => chrome.storage.local.set(v)        // seed on first install
  );
});