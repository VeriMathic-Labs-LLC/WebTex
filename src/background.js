/*  src/background.js  – compiled → build/background.js */

import { domainMatches } from "./domain-utils.js";

// Track which tabs have content scripts injected
const injectedTabs = new Set();

// Cache for allowed domains
let allowedDomainsCache = [];

// Initialize cache
chrome.storage.local.get("allowedDomains").then(({ allowedDomains = [] }) => {
	allowedDomainsCache = allowedDomains;
});

// Initialize extension
chrome.runtime.onInstalled.addListener((details) => {
	// Only initialize on fresh install, not on updates
	if (details.reason === "install") {
		// Initialize with empty allowed domains list (OFF by default)
		chrome.storage.local.set({ allowedDomains: [] });
	}
});

// Handle tab updates to inject content scripts on allowed domains
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
	try {
		// Reset our injected state when a page starts loading to avoid stale tab tracking
		if (changeInfo.status === "loading") {
			injectedTabs.delete(tabId);
			return;
		}

		// Only proceed if the page is complete and has a URL
		if (changeInfo.status !== "complete" || !tab.url) return;

		const url = new URL(tab.url);
		// Use cached allowed domains instead of querying storage every time
		const allowedDomains = allowedDomainsCache;

		// Check if this domain should have WebTeX enabled
		const shouldInject =
			url.protocol === "file:" ||
			allowedDomains.some((domain) => domainMatches(url.hostname, domain)) ||
			url.pathname.includes("test-comprehensive.html") ||
			url.pathname.includes("test-simple.html");

		if (shouldInject) {
			let alive = false;
			try {
				// Ping the content script if we think we've injected before
				if (injectedTabs.has(tabId)) {
					const res = await chrome.tabs.sendMessage(tabId, { action: "ping" });
					alive = !!res?.ok;
				}
			} catch (_e) {
				alive = false;
			}

			if (!alive) {
				await chrome.scripting.executeScript({ target: { tabId }, files: ["app.js"] });
				injectedTabs.add(tabId);
				console.log(`WebTeX: Injected content script on ${url.hostname}`);
			}
		} else if (!shouldInject && injectedTabs.has(tabId)) {
			// Note: We can't easily remove content scripts, but we can send a message to disable
			try {
				await chrome.tabs.sendMessage(tabId, { action: "disable-website" });
			} catch (_e) {
				// Tab might not be accessible or content script not ready
			}
			injectedTabs.delete(tabId);
			console.log(`WebTeX: Disabled on ${url.hostname}`);
		}
	} catch (error) {
		console.error("WebTeX: Error handling tab update:", error);
	}
});

// Handle tab removal to clean up tracking
chrome.tabs.onRemoved.addListener((tabId) => {
	injectedTabs.delete(tabId);
});

// Handle domain list updates
chrome.storage.onChanged.addListener(async (changes, namespace) => {
	if (namespace === "local" && changes.allowedDomains) {
		const newAllowedDomains = changes.allowedDomains.newValue || [];
		allowedDomainsCache = newAllowedDomains;

		// Check all current tabs and update injection status
		const tabs = await chrome.tabs.query({});

		await Promise.all(
			tabs.map(async (tab) => {
				if (!tab.url) return;

				try {
					const url = new URL(tab.url);
					const shouldInject =
						url.protocol === "file:" ||
						newAllowedDomains.some((domain) => domainMatches(url.hostname, domain)) ||
						url.pathname.includes("test-comprehensive.html") ||
						url.pathname.includes("test-simple.html");

					if (shouldInject && !injectedTabs.has(tab.id)) {
						await chrome.scripting.executeScript({
							target: { tabId: tab.id },
							files: ["app.js"],
						});
						injectedTabs.add(tab.id);
						console.log(`WebTeX: Injected content script on ${url.hostname} after domain update`);
					} else if (!shouldInject && injectedTabs.has(tab.id)) {
						try {
							await chrome.tabs.sendMessage(tab.id, { action: "disable-website" });
						} catch (_e) {
							// Tab might not be accessible
						}
						injectedTabs.delete(tab.id);
						console.log(`WebTeX: Disabled on ${url.hostname} after domain update`);
					}
				} catch (error) {
					console.error("WebTeX: Error updating tab after domain change:", error);
				}
			}),
		);
	}
});
