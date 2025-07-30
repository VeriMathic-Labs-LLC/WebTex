/* popup.js – runs in the extension popup */
const $ = (id) => document.getElementById(id);

const globalToggle = $('globalToggle');
const siteToggle   = $('siteToggle');
const siteStatus   = $('siteStatus');
const globalStatus = $('globalStatus');
const domainSpan   = $('domainName');

let currentTab, host;

/* ---------- init ---------- */
chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
  currentTab = tab;
  host       = new URL(tab.url).hostname;
  domainSpan.textContent = host;

  const st = await chrome.storage.local.get(['enabled', 'allowedDomains']);
  refreshUI(st.enabled !== false, st.allowedDomains ?? []);
});

/* ---------- event handlers ---------- */
globalToggle.onchange = async () => {
  const enabled = globalToggle.checked;
  await chrome.storage.local.set({ enabled });
  refreshGlobal(enabled);

  // tell content script on this tab to reload (ignore if not present)
  try { await chrome.tabs.sendMessage(currentTab.id, { action: 'toggle-global', enabled }); }
  catch { /* no listener – safe to ignore */ }
};

siteToggle.onchange = async () => {
  const { allowedDomains = [] } = await chrome.storage.local.get('allowedDomains');
  const list = siteToggle.checked
    ? [...new Set([...allowedDomains, host])]
    : allowedDomains.filter(d => d !== host);

  await chrome.storage.local.set({ allowedDomains: list });
  refreshSite(list);

  try { await chrome.tabs.sendMessage(currentTab.id, { action: 'domain-updated', allowed: list }); }
  catch { /* ignore */ }
};

/* ---------- helpers ---------- */
function refreshUI (enabled, list) {
  refreshGlobal(enabled);
  refreshSite(list);
}

function refreshGlobal (enabled) {
  globalToggle.checked = enabled;
  globalStatus.textContent = enabled ? 'ON' : 'OFF';
  globalStatus.className   = 'chip ' + (enabled ? 'on' : 'off');
}

function refreshSite (list) {
  const active = list.includes(host);
  siteToggle.checked      = active;
  siteStatus.textContent  = active ? 'ON' : 'OFF';
  siteStatus.className    = 'chip ' + (active ? 'on' : 'off');
}