// Domain utility functions for WebTeX

// Common subdomains to strip when normalizing domains
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

// Common country-specific TLDs that should keep the second-to-last part
const COUNTRY_TLDS = new Set([
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
]);

/**
 * Normalize a domain by stripping common subdomains
 * @param {string} hostname - The hostname to normalize
 * @returns {string} The normalized domain
 */
export function normalizeDomain(hostname) {
	if (!hostname) return "";

	// Normalize host: lowercase, strip port and IPv6 brackets
	const host = hostname
		.toLowerCase()
		.replace(/:\d+$/, "")
		.replace(/^\[|\]$/g, "");

	// Handle localhost, IPv4, and IPv6 (with optional port)
	const ipv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
	const ipv6 = /^[0-9a-f:]+$/;
	if (host === "localhost" || ipv4.test(host) || ipv6.test(host)) {
		return host;
	}

	// Split into parts
	const parts = host.split(".");

	// If we have 2 or fewer parts, return as-is
	if (parts.length <= 2) {
		return parts.join(".");
	}

	// Check if the first part is a common subdomain
	const firstPart = parts[0].toLowerCase();
	if (COMMON_SUBDOMAINS.includes(firstPart)) {
		// Remove the common subdomain
		return parts.slice(1).join(".");
	}

	// For domains with more than 2 parts, check if it's a country-specific domain
	// e.g., example.co.uk, example.com.au
	if (parts.length > 2) {
		const tld = parts[parts.length - 1];

		if (COUNTRY_TLDS.has(tld)) {
			// For country domains, keep the last 3 parts (e.g., example.co.uk)
			return parts.slice(-3).join(".");
		}
	}

	// Default: keep the last 2 parts (domain.tld)
	return parts.slice(-2).join(".");
}

/**
 * Check if a hostname matches a normalized domain
 * @param {string} hostname - The hostname to check
 * @param {string} normalizedDomain - The normalized domain to match against
 * @returns {boolean} True if the hostname matches the domain
 */
export function domainMatches(hostname, normalizedDomain) {
	if (!hostname || !normalizedDomain) return false;
	// Normalize and strip port/brackets, lowercase
	const host = hostname
		.toLowerCase()
		.replace(/:\d+$/, "")
		.replace(/^\[|\]$/g, "");
	const norm = normalizedDomain.toLowerCase();
	// Exact match or subdomain match
	return host === norm || host.endsWith(`.${norm}`);
}

/**
 * Get the display name for a domain (for UI purposes)
 * @param {string} hostname - The hostname to get display name for
 * @returns {string} The display name
 */
export function getDomainDisplayName(hostname) {
	const normalized = normalizeDomain(hostname);

	// If the normalized domain is the same as the hostname, show as-is
	if (normalized === hostname) {
		return hostname;
	}

	// Otherwise, show the normalized domain with a note about subdomains
	return `${normalized} (and subdomains)`;
}

/**
 * Get all domains that would be affected by enabling/disabling a domain
 * @param {string} hostname - The hostname to check
 * @param {Array<string>} existingDomains - List of existing allowed domains
 * @returns {Array<string>} List of domains that would be affected
 */
export function getAffectedDomains(hostname, existingDomains = []) {
	const normalized = normalizeDomain(hostname);
	const affected = [];

	// Check existing domains to see which ones would be covered
	for (const domain of existingDomains) {
		if (domainMatches(domain, normalized)) {
			affected.push(domain);
		}
	}

	// Add the current hostname if it's not already in the list
	if (!affected.includes(hostname)) {
		affected.push(hostname);
	}

	return affected;
}

/**
 * Check if a domain is already covered by existing allowed domains
 * @param {string} hostname - The hostname to check
 * @param {Array<string>} allowedDomains - List of allowed domains
 * @returns {boolean} True if the domain is already covered
 */
export function isDomainCovered(hostname, allowedDomains) {
	return allowedDomains.some((domain) => domainMatches(hostname, domain));
}
