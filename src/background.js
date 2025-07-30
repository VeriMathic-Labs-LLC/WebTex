/*  src/background.js  – compiled → build/background.js */
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(
    { allowedDomains: [] },
    (v) => {
      chrome.storage.local.set(v, (err) => {
        if (chrome.runtime.lastError) {
          console.error('Error seeding storage:', chrome.runtime.lastError);
        }
      });
    }
  );
});