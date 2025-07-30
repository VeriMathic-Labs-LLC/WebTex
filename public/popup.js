/* popup.js – runs in the extension popup */
const $ = (id) => document.getElementById(id);

const siteToggle   = $('siteToggle');
const siteStatus   = $('siteStatus');
const domainSpan   = $('domainName');

let currentTab, host;

/* ---------- init ---------- */
chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
  currentTab = tab;
  host       = new URL(tab.url).hostname;
  domainSpan.textContent = host;

  const st = await chrome.storage.local.get(['allowedDomains']);
  refreshUI(st.allowedDomains ?? []);
});

/* ---------- event handlers ---------- */
siteToggle.onchange = async () => {
  const { allowedDomains = [] } = await chrome.storage.local.get('allowedDomains');
  const list = siteToggle.checked
    ? [...new Set([...allowedDomains, host])]
    : allowedDomains.filter(d => d !== host);

  await chrome.storage.local.set({ allowedDomains: list });
  refreshSite(list);

  // Reload the page to apply changes
  chrome.tabs.reload(currentTab.id);
};

/* ---------- helpers ---------- */
function refreshUI (list) {
  refreshSite(list);
}

function refreshSite (list) {
  const active = list.includes(host);
  siteToggle.checked      = active;
  siteStatus.textContent  = active ? 'ON' : 'OFF';
  siteStatus.className    = 'chip ' + (active ? 'on' : 'off');
}