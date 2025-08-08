/* popup.js – runs in the extension popup */

// Domain utility functions (bundled to avoid module import issues)
const COMMON_SUBDOMAINS = [
	"www",
	"m",
	"mobile",
	"app",
	"api",
	"cdn",
	"static",
	"assets",
	"media",
	"img",
	"images",
	"js",
	"css",
	"fonts",
	"blog",
	"forum",
	"support",
	"help",
	"docs",
	"dev",
	"staging",
	"test",
	"beta",
	"alpha",
];

function normalizeDomain(hostname) {
	if (!hostname) return "";

	if (hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
		return hostname;
	}

	const parts = hostname.split(".");

	if (parts.length <= 2) {
		return hostname;
	}

	const firstPart = parts[0].toLowerCase();
	if (COMMON_SUBDOMAINS.includes(firstPart)) {
		return parts.slice(1).join(".");
	}

	if (parts.length > 2) {
		const tld = parts[parts.length - 1];
		const countryTlds = [
			"uk",
			"au",
			"nz",
			"za",
			"br",
			"in",
			"jp",
			"kr",
			"cn",
			"ru",
			"de",
			"fr",
			"it",
			"es",
			"nl",
			"se",
			"no",
			"dk",
			"fi",
			"pl",
			"cz",
			"hu",
			"ro",
			"bg",
			"hr",
			"si",
			"sk",
			"ee",
			"lv",
			"lt",
			"mt",
			"cy",
			"gr",
			"pt",
			"ie",
			"be",
			"at",
			"ch",
			"lu",
			"li",
			"mc",
			"ad",
			"sm",
			"va",
		];

		if (countryTlds.includes(tld)) {
			return parts.slice(-3).join(".");
		}
	}

	return parts.slice(-2).join(".");
}

function domainMatches(hostname, normalizedDomain) {
	if (!hostname || !normalizedDomain) return false;

	if (hostname === normalizedDomain) return true;

	if (hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
		return hostname === normalizedDomain;
	}

	return hostname.endsWith(`.${normalizedDomain}`);
}

function getDomainDisplayName(hostname) {
	const normalized = normalizeDomain(hostname);

	if (normalized === hostname) {
		return hostname;
	}

	return `${normalized} (and subdomains)`;
}

function getAffectedDomains(hostname, existingDomains = []) {
	const normalized = normalizeDomain(hostname);
	const affected = [];

	for (const domain of existingDomains) {
		if (domainMatches(domain, normalized)) {
			affected.push(domain);
		}
	}

	if (!affected.includes(hostname)) {
		affected.push(hostname);
	}

	return affected;
}

function isDomainCovered(hostname, allowedDomains) {
	return allowedDomains.some((domain) => domainMatches(hostname, domain));
}

const $ = (id) => document.getElementById(id);

const siteToggle = $("siteToggle");
const siteStatus = $("siteStatus");
const domainSpan = $("domainName");
const advancedSection = $("advancedSection");
const katexLoggingToggle = $("katexLoggingToggle");

let host;
let normalizedHost;

// Add visual feedback for toggle actions
function showToggleStatus(message, isSuccess = true) {
	const statusEl = document.createElement("div");
	statusEl.textContent = message;
	statusEl.style.cssText = `
    position: fixed; top: 10px; left: 10px; right: 10px;
    padding: 8px; border-radius: 4px; z-index: 1000;
    background: ${isSuccess ? "#d4edda" : "#f8d7da"};
    color: ${isSuccess ? "#155724" : "#721c24"};
    border: 1px solid ${isSuccess ? "#c3e6cb" : "#f5c6cb"};
    font-size: 12px; text-align: center;
  `;
	document.body.appendChild(statusEl);
	setTimeout(() => statusEl.remove(), 2000);
}

/* ---------- init ---------- */
chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
	// Handle special URLs (chrome://, about:, etc.) that can't be parsed
	try {
		const url = new URL(tab.url);
		host = url.hostname || "local";
	} catch (_e) {
		// For special pages like chrome:// or about:
		host = tab.url.split(":")[0] || "special";
	}

	// Normalize the hostname for smart domain matching
	normalizedHost = normalizeDomain(host);

	// Show the normalized domain name in the UI
	domainSpan.textContent = getDomainDisplayName(host);

	const { allowedDomains = [] } = await chrome.storage.local.get("allowedDomains");
	refreshSite(allowedDomains);

	// Load Advanced section state and KaTeX logging preference
	try {
		const { advancedOpen = false, enableKatexLogging = false } = await chrome.storage.local.get([
			"advancedOpen",
			"enableKatexLogging",
		]);
		if (advancedSection) {
			advancedSection.open = !!advancedOpen;
			// Persist initial open state if key doesn't exist to make future toggles consistent
			await chrome.storage.local.set({ advancedOpen: !!advancedOpen });
		}
		if (katexLoggingToggle) {
			katexLoggingToggle.checked = !!enableKatexLogging;
		}
	} catch (_e) {}
});

/* ---------- event handlers ---------- */
siteToggle.onchange = async () => {
	try {
		const { allowedDomains = [] } = await chrome.storage.local.get("allowedDomains");

		let newAllowedDomains;
		const action = siteToggle.checked ? "enabled" : "disabled";

		if (siteToggle.checked) {
			// When enabling, add the normalized domain and remove any existing subdomains
			const existingDomains = allowedDomains.filter((d) => !domainMatches(d, normalizedHost));
			newAllowedDomains = [...new Set([...existingDomains, normalizedHost])];
		} else {
			// When disabling, remove the normalized domain and any of its subdomains
			newAllowedDomains = allowedDomains.filter((d) => !domainMatches(d, normalizedHost));
		}

		await chrome.storage.local.set({ allowedDomains: newAllowedDomains });
		refreshSite(newAllowedDomains);

		// Show which domains are affected
		const affectedDomains = getAffectedDomains(host, allowedDomains);
		if (affectedDomains.length > 1) {
			const domainList =
				affectedDomains.slice(0, 3).join(", ") + (affectedDomains.length > 3 ? "..." : "");
			showToggleStatus(`WebTeX ${action} for ${normalizedHost} (affects: ${domainList})`);
		} else {
			showToggleStatus(`WebTeX ${action} for ${normalizedHost}`);
		}

		// The background script will automatically handle content script injection/removal
		// based on the updated allowed domains list
		showToggleStatus(`WebTeX ${action} - changes will apply to new page loads`);
	} catch (_error) {}
};

/* ---------- helpers ---------- */
function refreshSite(list) {
	const active = isDomainCovered(host, list);
	siteToggle.checked = active;
	siteStatus.textContent = active ? "ON" : "OFF";
	siteStatus.className = `chip ${active ? "on" : "off"}`;
}

/* ---------- Advanced handlers ---------- */
if (advancedSection) {
	// Persist open/closed state
	advancedSection.addEventListener("toggle", async () => {
		try {
			await chrome.storage.local.set({ advancedOpen: advancedSection.open });
		} catch (_e) {}
	});
}

if (katexLoggingToggle) {
	katexLoggingToggle.onchange = async () => {
		try {
			await chrome.storage.local.set({ enableKatexLogging: !!katexLoggingToggle.checked });
			showToggleStatus(
				`KaTeX error logging ${katexLoggingToggle.checked ? "enabled" : "disabled"}`,
				true,
			);
		} catch (_e) {}
	};
}
