/*  src/app.js  – compiled → build/app.js
    Enhanced WebTeX with KaTeX + custom parser
*/
import katex from "katex";

// CSS injection management
const injectedStylesheets = [];

async function injectCSS() {
	if (injectedStylesheets.length > 0) return; // Already injected

	try {
		// Preload key KaTeX fonts to minimize font swap/flash on mobile
		try {
			const fontPreloads = [
				"katex/fonts/KaTeX_Main-Regular.woff2",
				"katex/fonts/KaTeX_Math-Italic.woff2",
				"katex/fonts/KaTeX_Size1-Regular.woff2",
				"katex/fonts/KaTeX_AMS-Regular.woff2",
			];
			for (const rel of fontPreloads) {
				const link = document.createElement("link");
				link.rel = "preload";
				link.as = "font";
				link.type = "font/woff2";
				link.href = chrome.runtime.getURL(rel);
				link.crossOrigin = "anonymous";
				document.head.appendChild(link);
				injectedStylesheets.push(link);
			}
		} catch {}

		// Inject app.css
		const appStyle = document.createElement("style");
		appStyle.id = "webtex-app-styles";
		appStyle.textContent = `/* WebTeX Extension Styles - Scoped to extension elements only */

/* WebTeX Enhanced Styling with proper color inheritance */
.webtex-math-container {
	display: inline;
	color: inherit !important;
}
.webtex-math {
	display: inline-block;
	color: inherit !important;
}

.webtex-display {
	display: block;
	text-align: center;
	margin: 1em 0;
	color: inherit !important;
}

.webtex-inline-math {
	display: inline;
	vertical-align: middle;
	color: inherit !important;
}

.webtex-display-math {
	display: block;
	text-align: center;
	margin: 1em 0;
	color: inherit !important;
}

.webtex-processed {
	display: inline;
	color: inherit !important;
}

/* KaTeX styling that adapts to website color scheme */
.katex {
	color: inherit !important;
	font-size: 1.1em;
}

.katex-display {
	color: inherit !important;
	margin: 1em 0;
}

.katex .katex-html {
	color: inherit !important;
}

.katex .katex-mathml {
	color: inherit !important;
}

/* Ensure all KaTeX elements inherit color */
.katex,
.katex *,
.katex .katex-html *,
.katex .katex-mathml * {
	color: inherit !important;
}

/* Custom fallback styling */
.webtex-custom-fallback {
	font-family: "Computer Modern", "Times New Roman", serif, sans-serif;
	font-size: 1.1em;
	color: inherit !important;
	background: rgba(255, 235, 238, 0.3);
	padding: 2px 4px;
	border-radius: 3px;
	border: 1px solid rgba(239, 154, 154, 0.5);
	box-sizing: border-box;
}

/* Error fallback styling */
.webtex-error-fallback {
	font-family: "Courier New", "Monaco", monospace, sans-serif;
	font-size: 0.9em;
	color: inherit !important;
	background: rgba(255, 235, 238, 0.3);
	padding: 2px 4px;
	border-radius: 3px;
	border: 1px solid rgba(239, 154, 154, 0.5);
	margin: 0 2px;
	box-sizing: border-box;
}

/* Failed render styling */
.webtex-failed-render {
	background: rgba(255, 193, 7, 0.1);
	border: 1px solid rgba(255, 193, 7, 0.3);
	border-radius: 3px;
	padding: 1px 2px;
	margin: 0 1px;
	cursor: help;
}

/* Ensure all rendered elements inherit color */
.webtex-katex-rendered,
.webtex-custom-rendered {
	color: inherit !important;
}

/* Prevent font synthesis to reduce jarring changes during font load */
.katex, .katex * { font-synthesis: none; }

/* Mobile: keep math size consistent to reduce perceived swap */
@media (max-width: 480px) { .katex { font-size: 1em; } }
`;
		document.head.appendChild(appStyle);
		injectedStylesheets.push(appStyle);

		// Fetch and inject KaTeX CSS directly
		const katexCssUrl = chrome.runtime.getURL("katex/katex.min.css");
		const response = await fetch(katexCssUrl);
		const katexCssContent = await response.text();

		// Rewrite relative font paths to absolute extension URLs
		const baseFontPath = chrome.runtime.getURL("katex/fonts/");
		const fixedKatexCss = katexCssContent.replace(
			/url\((['"]?)fonts\//g,
			(_match, quote) => `url(${quote}${baseFontPath}`,
		);

		const katexStyle = document.createElement("style");
		katexStyle.id = "webtex-katex-styles";
		katexStyle.textContent =
			// Ensure webfonts use 'swap' to avoid FOIT on iOS/Safari
			fixedKatexCss.replace(/@font-face\s*\{[\s\S]*?\}/g, (block) => {
				return block.includes("font-display")
					? block
					: block.replace(/}\s*$/, "font-display: swap;}");
			});
		document.head.appendChild(katexStyle);
		injectedStylesheets.push(katexStyle);
	} catch (_error) {
		// Fallback: inject minimal CSS
		const fallbackStyle = document.createElement("style");
		fallbackStyle.id = "webtex-fallback-styles";
		fallbackStyle.textContent = `
.katex { color: inherit !important; font-size: 1.1em; }
.katex-display { color: inherit !important; margin: 1em 0; }
.webtex-katex-rendered, .webtex-custom-rendered { color: inherit !important; }
`;
		document.head.appendChild(fallbackStyle);
		injectedStylesheets.push(fallbackStyle);
	}
}

function removeCSS() {
	injectedStylesheets.forEach((style) => {
		if (style.parentNode) {
			style.parentNode.removeChild(style);
		}
	});
	injectedStylesheets.length = 0;
}

/* -------------------------------------------------- */
// Reusable entity decoder for performance
function decodeHTMLEntities(text) {
	// Decode using safe div.textContent
	const div = document.createElement("div");
	div.innerHTML = text;
	return div.textContent;
}
/* -------------------------------------------------- */
// Logging system for debugging and error tracking
const LOG_LEVEL = {
	ERROR: 1,
	WARN: 2,
	INFO: 3,
	DEBUG: 4,
};

let CURRENT_LOG_LEVEL = LOG_LEVEL.WARN; // Show WARN and ERROR by default
// Track if we create any globals so we can clean them up on disable
let webtexCreatedLogLevel = false;
// Sync with global window setting if present, and initialize it otherwise.
if (typeof window !== "undefined") {
	if (typeof window.WEBTEX_LOG_LEVEL === "number") {
		CURRENT_LOG_LEVEL = window.WEBTEX_LOG_LEVEL;
	} else {
		window.WEBTEX_LOG_LEVEL = CURRENT_LOG_LEVEL;
		webtexCreatedLogLevel = true;
	}
}

function log(level, ...args) {
	// When KaTeX/error logging toggle is ON, ensure at least WARN-level messages are shown
	// regardless of the global WebTeX logging level. This guarantees all warnings/errors surface.
	const baseLevel =
		typeof window !== "undefined" && typeof window.WEBTEX_LOG_LEVEL === "number"
			? window.WEBTEX_LOG_LEVEL
			: CURRENT_LOG_LEVEL;
	const effectiveLevel = ENABLE_KATEX_LOGGING ? Math.max(baseLevel, LOG_LEVEL.WARN) : baseLevel;
	if (level <= effectiveLevel) {
		const now = new Date();
		const timestamp = `${now.getHours().toString().padStart(2, "0")}:${now
			.getMinutes()
			.toString()
			.padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}.${now
			.getMilliseconds()
			.toString()
			.padStart(3, "0")}`;
		const prefix = `[WebTeX ${timestamp}]`;

		switch (level) {
			case LOG_LEVEL.ERROR:
				console.error(prefix, ...args);
				break;
			case LOG_LEVEL.WARN:
				console.warn(prefix, ...args);
				break;
			case LOG_LEVEL.INFO:
				console.info(prefix, ...args);
				break;
			case LOG_LEVEL.DEBUG:
				console.log(prefix, ...args);
				break;
			default:
				console.log(prefix, ...args);
		}
	}
}

// Expose logging controls globally for debugging (avoid clobbering page globals)
let webtexCreatedLogApi = false;
if (typeof window.WebTeXLogging !== "object") {
	window.WebTeXLogging = {
		setLevel: (level) => {
			CURRENT_LOG_LEVEL = level;
			window.WEBTEX_LOG_LEVEL = level;
			console.log(
				`[WebTeX] Log level set to ${Object.keys(LOG_LEVEL)[Object.values(LOG_LEVEL).indexOf(level)]}`,
			);
		},
		showErrors: () => window.WebTeXLogging.setLevel(LOG_LEVEL.ERROR),
		showWarnings: () => window.WebTeXLogging.setLevel(LOG_LEVEL.WARN),
		showInfo: () => window.WebTeXLogging.setLevel(LOG_LEVEL.INFO),
		showDebug: () => window.WebTeXLogging.setLevel(LOG_LEVEL.DEBUG),
		showAll: () => window.WebTeXLogging.setLevel(LOG_LEVEL.DEBUG),
		hide: () => window.WebTeXLogging.setLevel(0),
	};
	webtexCreatedLogApi = true;
}

// Global handler references (declared as const to avoid reassignment)
const windowErrorHandlerRef = (event) => {
	// catch all WebTeX errors
	log(LOG_LEVEL.ERROR, "Unhandled WebTeX error:", event.error);
	console.error("[WebTeX] Global error caught:", {
		message: event.message,
		filename: event.filename,
		lineno: event.lineno,
		colno: event.colno,
		error: event.error,
		stack: event.error?.stack,
	});
};
const windowRejectionHandlerRef = (event) => {
	if (event.reason?.toString().includes("WebTeX")) {
		log(LOG_LEVEL.ERROR, "Unhandled WebTeX promise rejection:", event.reason);
		console.error("[WebTeX] Unhandled promise rejection:", event.reason);
	}
};

// Global error handler for WebTeX
window.addEventListener("error", windowErrorHandlerRef);

// Global promise rejection handler
window.addEventListener("unhandledrejection", windowRejectionHandlerRef);

// Runtime message handler (declared as const to avoid reassignment)
const runtimeMessageHandlerRef = async (msg, _sender, sendResponse) => {
	if (msg.action === "disable-website") {
		isEnabled = false;
		disableRendering();
		sendResponse({ success: true, enabled: false });
	} else if (msg.action === "ping") {
		// Let background know the content script is alive
		sendResponse({ ok: true, isEnabled });
	}

	return true; // Keep message channel open for async response
};

let observer = null;
let isEnabled = false;
let observedBodyRef = null;
const _katexLoaded = true; // KaTeX is bundled
const rendererState = {
	katexSuccess: 0,
	customParserFallback: 0,
	totalAttempts: 0,
};

// Expose renderer state globally for debugging
window.rendererState = rendererState;

// Collect KaTeX parse errors for debugging
window.webtexErrors = [];
let ENABLE_KATEX_LOGGING = false;

async function loadKatexLoggingSetting() {
	try {
		const { enableKatexLogging = false } = await chrome.storage.local.get("enableKatexLogging");
		ENABLE_KATEX_LOGGING = enableKatexLogging ?? false;
	} catch (e) {
		if (ENABLE_KATEX_LOGGING) {
			console.error("[WebTeX] Failed to load 'enableKatexLogging' from storage:", e);
		}
	}
}

const storageChangedHandlerRef = (changes, areaName) => {
	if (areaName === "local" && changes.enableKatexLogging) {
		ENABLE_KATEX_LOGGING = changes.enableKatexLogging.newValue;
		try {
			console.info(`[WebTeX] KaTeX logging ${ENABLE_KATEX_LOGGING ? "enabled" : "disabled"}`);
		} catch (e) {
			if (ENABLE_KATEX_LOGGING) {
				try {
					console.error("[WebTeX] Failed to write logging state to console:", e);
				} catch {}
			}
		}
		// Proactively re-render to ensure state is consistent without requiring a page reload
		try {
			// Fire and forget; safeRender has its own error guards
			void safeRender();
		} catch (e) {
			if (ENABLE_KATEX_LOGGING) {
				try {
					log(LOG_LEVEL.ERROR, "[WebTeX] Re-render after logging toggle failed:", e);
				} catch {}
			}
		}
	}
};
chrome.storage.onChanged.addListener(storageChangedHandlerRef);

function reportKaTeXError(tex, error) {
	const message = error?.message || (typeof error === "string" ? error : "Unknown KaTeX error");
	window.webtexErrors.push({ tex, message, time: Date.now() });
	if (ENABLE_KATEX_LOGGING) {
		// Surface parse errors prominently when verbose logging is enabled
		try {
			console.error("[WebTeX] KaTeX parse error:", message, "in", tex, error);
		} catch (e) {
			if (ENABLE_KATEX_LOGGING) {
				try {
					console.error("[WebTeX] Failed to write KaTeX parse error to console:", e);
				} catch {}
			}
		}
		// Also use the internal logger for consistency
		try {
			log(LOG_LEVEL.ERROR, "[WebTeX] KaTeX parse error:", message, "in", tex);
		} catch (e) {
			if (ENABLE_KATEX_LOGGING) {
				try {
					console.error("[WebTeX] Failed to log KaTeX parse error:", e);
				} catch {}
			}
		}
	}

	// Dispatch a custom event for external listeners/devtools panels
	try {
		const evt = new CustomEvent("webtex-katex-error", { detail: { tex, message } });
		document.dispatchEvent(evt);
	} catch (e) {
		if (ENABLE_KATEX_LOGGING) {
			try {
				console.error("[WebTeX] Failed to dispatch 'webtex-katex-error' event:", e);
			} catch {}
		}
	}
}

/* -------------------------------------------------- */
// Enhanced Custom LaTeX Parser for edge cases

function cleanupEmptyBraces(str) {
	// Preserve empty base before superscripts/subscripts (e.g., {}^{A}, {}_{Z}).
	// Only remove empty groups when they are NOT immediately (optionally after whitespace)
	// followed by ^ or _.
	// Remove any run of 2 or more empty groups not followed by ^ or _
	str = str.replace(/(?:\{\}){2,}(?!\s*[\^_])/g, "");
	// Remove single empty braces not followed by ^ or _ ONLY if they are not part of a required command argument (e.g., \\text{})
	// We achieve this by ensuring the braces are NOT immediately preceded by a backslash followed by letters (a LaTeX command)
	// Example kept: "\\text{}" => should stay. Example removed: stray "{}" not used as a base.
	str = str.replace(/(^|[^\\a-zA-Z])\{\}(?!\s*[\^_])/g, "$1");
	return str;
}

// --------------------------------------------------
// NEW SHARED HELPER: fixIncompleteCommands
// Centralises fixes for incomplete \text{} commands and malformed integral
// limits that were previously duplicated in multiple locations.
function fixIncompleteCommands(str) {
	// --- Incomplete \text{}
	// Replace standalone "\\text" at string end or followed by whitespace
	str = str.replace(/\\text(?=$|\s)/g, "\\text{}");

	// Replace "\\text" not followed by an opening brace
	str = str.replace(/\\text(?!\s*\{)/g, "\\text{}");

	// Replace "\\text{" that has no closing brace until end-of-string
	str = str.replace(/\\text\{[^}]*$/g, "\\text{}");

	// --- Malformed integrals (missing superscripts)
	// \int_{<sub>}^<nothing>
	str = str.replace(/\\int_\{([^}]+)\}\^\s*$/g, "\\int_{$1}^{}");

	// \int_{<sub>}^  <whitespace>
	str = str.replace(/\\int_\{([^}]+)\}\^\s+/g, "\\int_{$1}^{} ");

	// \int_{<sub>}^<token>   (token not wrapped in braces)
	str = str.replace(/\\int_\{([^}]+)\}\^(?!\s*\{)/g, "\\int_{$1}^{}");

	// Also handle variants without braces around subscript, e.g. \int_0^
	// Pattern allows either a LaTeX command (e.g., \\alpha) or bare token
	const SUBSCRIPT_TOKEN = "(?:\\\\[a-zA-Z]+|[^_\\\\s{}]+)";
	const reSubNoBraceEnd = new RegExp(`\\\\int_${SUBSCRIPT_TOKEN}\\^\\s*$`, "g");
	const reSubNoBraceToken = new RegExp(`\\\\int_${SUBSCRIPT_TOKEN}\\^(?!\\s*\\{)`, "g");
	str = str.replace(reSubNoBraceEnd, (_m) =>
		_m.replace(/\\int_/, "\\int_{").replace(/\^/, "}^{\\,}"),
	);
	str = str.replace(reSubNoBraceToken, (_m) =>
		_m.replace(/\\int_/, "\\int_{").replace(/\^/, "}^{\\,}"),
	);

	// \int_0^{  (missing closing brace on superscript)
	const reSubMissingBrace = new RegExp(`\\\\int_${SUBSCRIPT_TOKEN}\\^\\{[^}]*$`, "g");
	str = str.replace(reSubMissingBrace, (_m) => {
		return _m.replace(/\\int_/, "\\int_{").replace(/\^\{[^}]*$/, "}^{\\,}");
	});

	// --- Unmatched \left ... \right handling
	// Replace standalone \left(, \left[, etc. without matching \right with regular delimiters
	str = str.replace(/\\left\s*([([{|.])/g, "$1");
	// Replace standalone \right), \right], etc. without matching \left
	str = str.replace(/\\right\s*([)\]}|.])/g, "$1");

	// Remove any remaining standalone \\left or \\right that are not followed by a delimiter character.
	// These often cause false "Unmatched delimiter" warnings later in the pipeline.
	str = str.replace(/\\left\s*(?=\s|$)/g, "");
	str = str.replace(/\\right\s*(?=\s|$)/g, "");

	// --- Generic: caret without superscript right before math delimiter or end
	// e.g., "^$", "^\\)" or "^" at string end
	// Insert a thin space (\\,) as placeholder so KaTeX accepts the group.
	str = str.replace(/\^\s*(?=(?:\$|\\\\\)|\\\\\]|$))/g, "^{\\,}");

	// Finally, convert any remaining empty superscript braces to a thin space placeholder
	str = str.replace(/\^\{\}/g, "^{\\,}");
	return str;
}
// --------------------------------------------------

class CustomLatexParser {
	constructor() {
		this.supportedEnvironments = [
			"matrix",
			"pmatrix",
			"bmatrix",
			"vmatrix",
			"Vmatrix",
			"array",
			"align",
			"aligned",
			"gather",
			"gathered",
			"cases",
			"split",
			"multline",
			"eqnarray",
		];
	}

	// Convert to simplified LaTeX that KaTeX can handle
	simplify(tex) {
		// Remove stray leading/trailing $ around environments (e.g. "$\\begin{pmatrix}")
		if (/^\$\\begin\{/.test(tex)) {
			tex = tex.replace(/^\$/, "");
		}
		if (/\\end\{[^}]+\}\$$/.test(tex)) {
			tex = tex.replace(/\$$/, "");
		}

		let simplified = tex;

		// First, fix any structural issues
		simplified = this.fixMalformedLatex(simplified);

		// Process fractions
		simplified = this.processFractionNotation(simplified);

		// Process nuclear notation BEFORE text processing
		simplified = this.processNuclearNotation(simplified);

		// Process environments
		simplified = this.processEquationEnvironments(simplified);
		simplified = this.processAlignEnvironment(simplified);

		// Process arrows and symbols
		simplified = this.processArrows(simplified);
		simplified = this.processLimits(simplified);
		simplified = this.processDerivatives(simplified);

		// Process text wrappers AFTER nuclear notation
		simplified = this.processTextWrappers(simplified);
		// Run nuclear normalization again to catch math unwrapped from \text{}
		simplified = this.processNuclearNotation(simplified);
		simplified = this.processTypoFixes(simplified);

		// Handle matrix environments
		simplified = simplified.replace(/\\begin\{matrix\}/g, "\\begin{array}");
		simplified = simplified.replace(/\\end\{matrix\}/g, "\\end{array}");

		return simplified;
	}

	getNextArgument(str, index) {
		let i = index;
		while (i < str.length && /\s/.test(str[i])) {
			i++; // Skip whitespace
		}
		if (i >= str.length) return null;

		const startIndex = i;
		const char = str[i];

		if (char === "{") {
			let braceCount = 1;
			let j = i + 1;
			while (j < str.length) {
				if (str[j] === "{" && str[j - 1] !== "\\") {
					braceCount++;
				} else if (str[j] === "}" && str[j - 1] !== "\\") {
					braceCount--;
				}
				if (braceCount === 0) {
					return { value: str.substring(i + 1, j), length: j + 1 - startIndex };
				}
				j++;
			}
			// Unmatched brace, return rest of string
			return { value: str.substring(i + 1), length: str.length - startIndex };
		}

		if (char === "\\") {
			const match = str.slice(i).match(/^\\[a-zA-Z]+(?=\s|{|}|\[|\(|\[|$)/);
			if (match) {
				return { value: match[0], length: match[0].length + (i - startIndex) };
			}
			// Escaped char
			return { value: str.slice(i, i + 2), length: 2 + (i - startIndex) };
		}

		// Single character
		return { value: char, length: 1 + (i - startIndex) };
	}

	fixMalformedLatex(str) {
		// Pre-process common malformed patterns
		// Fix incomplete \text{} commands
		str = str.replace(/\\text(?!\s*\{)/g, "\\text{}");
		str = str.replace(/\\text$/g, "\\text{}");
		str = str.replace(/\\text\s+(?!\{)/g, "\\text{} ");

		// Fix malformed integrals with missing superscripts
		str = str.replace(/\\int_\{([^}]+)\}\^/g, "\\int_{$1}^{}");
		str = str.replace(/\\int_\{([^}]+)\}\^$/g, "\\int_{$1}^{}");
		str = str.replace(/\\int_\{([^}]+)\}\^\s/g, "\\int_{$1}^{} ");

		let fixed = "";
		let i = 0;
		while (i < str.length) {
			const char = str[i];

			if (char === "\\") {
				const commandMatch = str.slice(i).match(/^\\[a-zA-Z]+/);
				if (commandMatch) {
					const command = commandMatch[0];
					fixed += command;
					i += command.length;

					if (command === "\\frac") {
						const arg1Result = this.getNextArgument(str, i);
						if (arg1Result) {
							fixed += `{${arg1Result.value}}`;
							i += arg1Result.length;
							const arg2Result = this.getNextArgument(str, i);
							if (arg2Result) {
								fixed += `{${arg2Result.value}}`;
								i += arg2Result.length;
							} else {
								fixed += "{}";
							}
						} else {
							fixed += "{}";
						}
					} else if (command === "\\text") {
						// Handle incomplete \text{} commands
						const argResult = this.getNextArgument(str, i);
						if (argResult) {
							fixed += `{${argResult.value}}`;
							i += argResult.length;
						} else {
							fixed += "{}";
						}
					} else if (command === "\\int") {
						// Handle integrals with missing superscripts
						// Look ahead to see if there's a ^ without a following group
						if (i < str.length && str[i] === "^") {
							fixed += "^";
							i++;
							const argResult = this.getNextArgument(str, i);
							if (argResult) {
								fixed += `{${argResult.value}}`;
								i += argResult.length;
							} else {
								fixed += "{}";
							}
						}
					}
				} else {
					fixed += char;
					i++;
				}
			} else if (char === "^" || char === "_") {
				fixed += char;
				i++;
				// Peek next non-space character to avoid consuming another ^/_ as the argument
				let k = i;
				while (k < str.length && /\s/.test(str[k])) k++;
				if (k >= str.length || str[k] === "^" || str[k] === "_") {
					// Missing argument or immediately followed by another super/subscript: insert empty group
					fixed += "{}";
					// Do not advance i; the next loop iteration will handle the following ^/_
				} else {
					const argResult = this.getNextArgument(str, i);
					if (argResult) {
						fixed += `{${argResult.value}}`;
						i += argResult.length;
					} else {
						fixed += "{}";
					}
				}
			} else {
				fixed += char;
				i++;
			}
		}

		// Final brace balancing pass
		let braceCount = 0;
		let finalResult = "";
		for (const char of fixed) {
			if (char === "{") {
				braceCount++;
			} else if (char === "}") {
				if (braceCount <= 0) continue; // Skip extra closing brace
				braceCount--;
			}
			finalResult += char;
		}
		if (braceCount > 0) {
			finalResult += "}".repeat(braceCount);
		}

		return finalResult;
	}

	processFractionNotation(str) {
		// First, protect existing \frac commands to avoid breaking them
		str = str.replace(/\\frac/g, "\\FRAC_TEMP");

		// Fix malformed fractions by ensuring they have two braced arguments
		str = str.replace(/\\FRAC_TEMP(?![{[])/g, (match, offset) => {
			const following = str.slice(offset + match.length);
			// Check for content that needs to be wrapped in braces
			const arg1Match = following.match(/^([^{[]|[\d\w]+)/);
			if (arg1Match) {
				const arg1 = arg1Match[0];
				const rest = following.slice(arg1.length);
				const arg2Match = rest.match(/^([^{[]|[\d\w]+)/);
				if (arg2Match) {
					const arg2 = arg2Match[0];
					return `\\FRAC_TEMP{${arg1}}{${arg2}}`;
				}
			}
			return match; // Return original if no fix is applied
		});

		// Fix missing braces around denominator like \frac{a}{b + c}d → wrap single token
		// But be careful not to break expressions with nested braces or superscripts
		str = str.replace(/\\FRAC_TEMP\{([^{}]+)\}([^{}\s])/g, (_m, num, following) => {
			// Only fix if the following character is not part of a superscript or subscript
			// and if the numerator doesn't end with a superscript/subscript
			if (!/[\^_]/.test(num.slice(-1)) && !/[\^_]/.test(following)) {
				return `\\FRAC_TEMP{${num}}{${following}}`;
			}
			return _m; // Return original if it might break superscripts/subscripts
		});

		// Handle incomplete fractions at the end of expressions
		str = str.replace(/\\FRAC_TEMP\{([^}]+)\}\{([^}]*)(?:\s*)$/g, "\\FRAC_TEMP{$1}{$2}");

		// Handle fractions with missing closing brace in numerator
		str = str.replace(/\\FRAC_TEMP\{([^}]*)(?:\s*)$/g, "\\FRAC_TEMP{$1}{}");

		// rac{num}{den} - convert rac to \frac
		str = str.replace(/rac\{([^}]+)\}\{([^}]+)\}/g, "\\frac{$1}{$2}");

		// rac27 pattern
		str = str.replace(/\brac(\d)(\d+)/g, (_, a, b) => `\\frac{${a}}{${b}}`);

		// standalone rac - convert to \frac
		str = str.replace(/\brac\b/g, "\\frac");

		// Fix fractions with double braces
		str = str.replace(/\\FRAC_TEMP\{\{([^}]+)\}\}\{\{([^}]+)\}\}/g, "\\FRAC_TEMP{$1}{$2}");

		// Fix malformed fractions with superscripts in numerator
		// Handle cases like \frac{\pi^{2}{6} -> \frac{\pi^{2}}{6}
		str = str.replace(/\\FRAC_TEMP\{([^}]*\^\{[^}]*\})\{([^}]*)\}/g, "\\FRAC_TEMP{$1}{$2}");

		// Fix fractions where the closing brace is missing after superscripts
		str = str.replace(/\\FRAC_TEMP\{([^}]*\^\{[^}]*\})\s*([^{}\s])/g, "\\FRAC_TEMP{$1}{$2}");

		// Finally, restore \frac commands
		str = str.replace(/\\FRAC_TEMP/g, "\\frac");

		return str;
	}

	processNuclearNotation(str) {
		// Enhanced nuclear notation processing with better error handling

		// First, clean up any existing malformed patterns
		str = cleanupEmptyBraces(str);

		// Handle specific nuclear notation patterns in \text{} commands
		// Pattern: \text{{}^{A}N} -> {}^{A}\text{N}
		str = str.replace(/\\text\{\{\}\^\{([^}]+)\}([^}]*)\}/g, "{}^{$1}\\text{$2}");

		// Pattern: \text{{}^{A}_{Z}N} -> {}^{A}_{Z}\text{N}
		str = str.replace(/\\text\{\{\}\^\{([^}]+)\}_\{([^}]+)\}([^}]*)\}/g, "{}^{$1}_{$2}\\text{$3}");

		// Pattern: \text{_Z^A X} -> {}^{A}_{Z}\text{X}
		str = str.replace(/\\text\{_(\d+)\^(\d+)\s+([^}]+)\}/g, "{}^{$2}_{$1}\\text{$3}");
		str = str.replace(/\\text\{_([A-Z])\^([A-Z])\s+([^}]+)\}/g, "{}^{$2}_{$1}\\text{$3}");

		// Pattern: \text{{Z-2}^{A-4} N'} -> {}^{A-4}_{Z-2}\text{N'}
		str = str.replace(/\\text\{\{([^}]+)\}\^\{([^}]+)\}\s+([^}]+)\}/g, "{}^{$2}_{$1}\\text{$3}");

		// Handle already formatted notation: ^{A}_{Z}\text{N} and ^{A}{Z}\text{N}
		str = str.replace(/\^\{([^}]+)\}_\{([^}]+)\}\\text\{([^}]+)\}/g, "{}^{$1}_{$2}\\text{$3}");
		str = str.replace(/\^\{([^}]+)\}\{([^}]+)\}\\text\{([^}]+)\}/g, "{}^{$1}_{$2}\\text{$3}");

		// e^- and e^+ patterns - both inside and outside \text{}
		str = str.replace(/\\text\{e\}\^([-+])/g, "e^{$1}");
		str = str.replace(/\\text\{e\}\^\{([-+])\}/g, "e^{$1}");
		str = str.replace(/\\text\{e\^([-+])\}/g, "e^{$1}");
		str = str.replace(/\\text\{e\^\{([-+])\}\}/g, "e^{$1}");

		// Neutrino and antineutrino patterns
		str = str.replace(/\\bar\{\\nu\}/g, "\\overline{\\nu}");

		// Handle overline nu patterns that might be malformed
		str = str.replace(/\\overline\{\\nu(.*?)\}/g, (match, rest) => {
			if (rest === "") return "\\overline{\\nu}";
			return match; // Keep as is if it has content
		});

		// Star notation for excited states
		str = str.replace(/\\text\{([^}]+)\*\}/g, "\\text{$1}^*");

		// Handle Z^A and _Z^A without \text{} (explicit literal Z to avoid false positives)
		// Ensure we keep Z as a subscript in the canonical form (always brace the subscript)
		str = str.replace(
			/_Z\s*\^\s*\{?([^{}\s^_]+)\}?\s*([A-Z][a-z]?['*]?)/g,
			"{}^{$1}_{Z}\\text{$2}",
		);
		str = str.replace(/Z\s*\^\s*\{?([^{}\s^_]+)\}?\s*([A-Z][a-z]?['*]?)/g, "{}^{$1}_{Z}\\text{$2}");

		// Handle numeric Z/A with proper element symbols (e.g., _3^7 Li, ^7_3 Li)
		str = str.replace(
			/_\s*\{?(\d+)\}?\s*\^\s*\{?(\d+)\}?\s*([A-Z][a-z]?)/g,
			"{}^{$2}_{$1}\\text{$3}",
		);
		str = str.replace(
			/\^\s*\{?(\d+)\}?\s*_\s*\{?(\d+)\}?\s*([A-Z][a-z]?)/g,
			"{}^{$1}_{$2}\\text{$3}",
		);

		// Handle bare-number then caret: 2^4 He -> {}^{4}_{2}\text{He}
		str = str.replace(/(\b\d+)\s*\^\s*\{?(\d+)\}?\s*([A-Z][a-z]?['*]?)/g, "{}^{$2}_{$1}\\text{$3}");

		// Handle braced-number then caret: {88}^{226}Ra -> {}^{226}_{88}\text{Ra}
		str = str.replace(
			/\{\s*(\d+)\s*\}\s*\^\s*\{?(\d+)\}?\s*([A-Z][a-z]?['*]?)/g,
			"{}^{$2}_{$1}\\text{$3}",
		);

		// Cleanup: stray leading '_' before an already-canonical group (prevents double subscript)
		str = str.replace(
			/_\s*\{\}\s*\^\{([^}]+)\}\s*_\{?Z\}?\s*\\text\{([^}]+)\}/g,
			"{}^{$1}_{Z}\\text{$2}",
		);
		str = str.replace(
			/_\s*\{\}\s*\^\{([^}]+)\}\s*_Z\s*\\text\{([^}]+)\}/g,
			"{}^{$1}_{Z}\\text{$2}",
		);

		// Normalize _{Z}^{A}\text{N} or ^{A}_{Z}\text{N} (ensure proper base)
		str = str.replace(
			/_\s*\{([^}]+)\}\s*\^\s*\{([^}]+)\}\s*\\text\{([^}]+)\}/g,
			"{}^{$2}_{$1}\\text{$3}",
		);

		// General token forms with hyphens/symbols: _{Z-1}^A N and ^A_{Z-1} N
		str = str.replace(
			/_\s*\{?([^{}\s^_]+)\}?\s*\^\s*\{?([^{}\s^_]+)\}?\s*([A-Z][a-z]?['*]?)/g,
			"{}^{$2}_{$1}\\text{$3}",
		);
		str = str.replace(
			/\^\s*\{?([^{}\s^_]+)\}?\s*_\s*\{?([^{}\s^_]+)\}?\s*([A-Z][a-z]?['*]?)/g,
			"{}^{$1}_{$2}\\text{$3}",
		);
		// Remove stray leading '_' before an already-canonical group (any subscript token, not just Z)
		// Example: _{}^{A}_{Z}\text{N} -> {}^{A}_{Z}\text{N}
		str = str.replace(
			/_\s*(?:\{\}\s*)+\^\{([^}]+)\}\s*_\{([^}]+)\}\s*\\text\{([^}]+)\}/g,
			"{}^{$1}_{$2}\\text{$3}",
		);
		// Also handle unbraced subscript tokens: _Z, _n, etc.
		str = str.replace(
			/_\s*(?:\{\}\s*)+\^\{([^}]+)\}\s*_([^\s{}^_]+)\s*\\text\{([^}]+)\}/g,
			(_m, A, sub, el) => `{}^{${A}}_{${sub}}\\text{${el}}`,
		);
		// And handle a stray leading underscore before a superscript-only nuclear form: _{}^{A}\text{N} -> {}^{A}\text{N}
		str = str.replace(/_\s*(?:\{\}\s*)+\^\{([^}]+)\}\s*\\text\{([^}]+)\}/g, "{}^{$1}\\text{$2}");

		// Fix base-level double subscript: {}^{A}_{Z}_{x}\\text{N} -> {}^{A}_{Z}\\text{N}_{x}
		// If the second subscript equals the first, drop it entirely
		str = str.replace(
			/\{\}\s*\^\{([^}]+)\}\s*_\{\s*([^}]+)\s*\}\s*_\{\s*\2\s*\}\s*\\text\{([^}]+)\}/g,
			"{}^{$1}_{$2}\\text{$3}",
		);
		// Generic: move the second (different) subscript to the element
		str = str.replace(
			/\{\}\s*\^\{([^}]+)\}\s*_\{\s*([^}]+)\s*\}\s*_\{\s*([^}]+)\s*\}\s*\\text\{([^}]+)\}/g,
			(_m, A, sub1, sub2, el) => `{}^{${A}}_{${sub1}}\\text{${el}}_{${sub2}}`,
		);
		// Variant where the second subscript is unbraced: {}^{A}_{Z}_x\\text{N} -> {}^{A}_{Z}\\text{N}_{x}
		str = str.replace(
			/\{\}\s*\^\{([^}]+)\}\s*_\{\s*([^}]+)\s*\}\s*_([^\s{}^_]+)\s*\\text\{([^}]+)\}/g,
			(_m, A, sub1, sub2, el) => `{}^{${A}}_{${sub1}}\\text{${el}}_{${sub2}}`,
		);

		// Fix common malformed nuclear notation patterns
		// Handle cases like {}^{A}\text{N} -> {}^{A}\text{N}
		str = str.replace(/\{\}\^\{([^}]+)\}\\text\{([^}]+)\}/g, "{}^{$1}\\text{$2}");

		// Handle cases like {}^{A}_{Z+1}\text{N'} + e^{-} + \overline{\nu}
		str = str.replace(/\{\}\^\{([^}]+)\}_\{([^}]+)\}\\text\{([^}]+)\}/g, "{}^{$1}_{$2}\\text{$3}");

		// Fix nuclear notation format: {^{A}} -> {}^{A}
		str = str.replace(/\{(\^\{[^}]+\})\}/g, "{$1}");

		// Fix any \text{} commands that contain superscripts (which cause KaTeX errors)
		// Pattern: \text{^{A}N} -> {}^{A}\text{N}
		str = str.replace(/\\text\{\^\{([^}]+)\}([^}]*)\}/g, "{}^{$1}\\text{$2}");

		// Fix nested \text commands in nuclear notation like: \text{^{A}\text{N}} -> {}^{A}\text{N}
		// This handles malformed input where superscript A and element N are both wrapped in \text{}
		// Multi-line, commented regex for maintainability
		const MALFORMED_NESTED_TEXT_PATTERN = new RegExp(
			[
				// Match \text{^{A}\text{N}}
				String.raw`\\text\{`, // Match literal \text{
				String.raw`\\\^\{([^}]+)\}`, // Match ^{A} (superscript), capture A
				String.raw`\\text\{([^}]*)\}`, // Match \text{N}, capture N
				String.raw`\}`, // Match closing }
			].join(""),
			"g",
		);
		str = str.replace(MALFORMED_NESTED_TEXT_PATTERN, "{}^{$1}\\text{$2}");

		// Handle nested form without escaped caret: \text{^{A}\text{N}} -> {}^{A}\text{N}
		str = str.replace(/\\text\{\^\{([^}]+)\}\\text\{([^}]+)\}\}/g, "{}^{$1}\\text{$2}");

		// Final cleanup using the helper method
		str = cleanupEmptyBraces(str);

		return str;
	}

	processEquationEnvironments(str) {
		return str.replace(/\\begin\{equation\}([\s\S]*?)\\end\{equation\}/g, "$1");
	}

	processAlignEnvironment(str) {
		return str.replace(
			/\\begin\{align\}([\s\S]*?)\\end\{align\}/g,
			"\\begin{aligned}$1\\end{aligned}",
		);
	}

	processArrows(str) {
		str = str.replace(/\\to/g, "\\rightarrow");
		str = str.replace(/→/g, "\\rightarrow");
		return str;
	}

	processTextWrappers(str) {
		// Parse-balanced \text{...} so we can unwrap even when nested braces are inside
		let out = "";
		let i = 0;
		while (i < str.length) {
			if (str[i] === "\\") {
				const slice = str.slice(i);
				const m = slice.match(/^\\text(?=\s*\{)/);
				if (m) {
					// Skip command and read its braced argument
					i += m[0].length;
					const arg = this.getNextArgument(str, i);
					if (arg) {
						const inner = arg.value;
						i += arg.length;
						// Decide whether to keep or unwrap
						const keepPatterns = [
							/^[A-Z]'?$/, // N, N'
							/^[a-z]'?$/,
							/^(He|Li|Be|C|N|O|F|Ne|Na|Mg|Al|Si|P|S|Cl|Ar|K|Ca)$/,
							/^e\^[+-]$/, // e^-, e^+
							/^\w+['*]?$/,
						];
						let keep = false;
						for (const p of keepPatterns) {
							if (p.test(inner)) {
								keep = true;
								break;
							}
						}
						if (keep) {
							out += `\\text{${inner}}`;
							continue;
						}
						// If clearly mathy, unwrap so KaTeX parses it
						if (
							/[\\^_]|→/.test(inner) ||
							/\\(to|nu|gamma|overline|bar|frac|int|sum|prod|mathrm|mathbf|text)\b/.test(inner)
						) {
							out += inner;
							continue;
						}
						// Simple content: unwrap
						if (/^[A-Za-z0-9_+\-*/=().,\s]+$/.test(inner)) {
							out += inner;
							continue;
						}
						// Default: keep as \text{}
						out += `\\text{${inner}}`;
						continue;
					} else {
						// Malformed \text without a braced argument
						out += "\\text{}";
						continue;
					}
				}
			}
			// Fallback: copy char
			out += str[i];
			i++;
		}
		return out;
	}

	processTypoFixes(str) {
		// fix common typos like infty -> \infty
		str = str.replace(/\binfty\b/g, "\\infty");

		// Fix limit arrow typos: \to -> \rightarrow
		str = str.replace(/\\to\b/g, "\\rightarrow");

		// Fix missing braces in limits: \lim_{x o infty} -> \lim_{x \to \infty}
		str = str.replace(/\\lim_\{([^}]*)\s+o\s+infty\}/g, "\\lim_{$1 \\to \\infty}");

		// Auto-wrap bare ^ and _ arguments with braces
		str = str.replace(/(\^|_)(?![{\\])\s*([A-Za-z0-9+-])/g, "$1{$2}");

		// Fix unmatched braces in expressions
		str = this.fixUnmatchedBraces(str);
		str = cleanupEmptyBraces(str);

		return str;
	}

	fixUnmatchedBraces(str) {
		let result = str;
		let openCount = 0;
		const chars = result.split("");

		// Count and fix missing closing braces
		for (let i = 0; i < chars.length; i++) {
			if (chars[i] === "{") {
				openCount++;
			} else if (chars[i] === "}") {
				openCount--;
				// Handle extra closing braces
				if (openCount < 0) {
					openCount = 0; // Reset count but don't add the brace back
					chars[i] = ""; // Remove this brace
				}
			}
		}

		// Rebuild string without extra closing braces
		result = chars.filter((char) => char !== "").join("");

		// Add missing closing braces
		while (openCount > 0) {
			result += "}";
			openCount--;
		}

		// Return result without cleanup; cleanup (e.g., removing empty braces) is handled by cleanupEmptyBraces in processTypoFixes
		return result;
	}

	processDerivatives(str) {
		// Handle derivatives properly
		// Convert d/dx patterns. Wrap the fraction in braces {} to remove
		// ambiguity when it's followed by brackets, like [x^n].
		str = str.replace(/\\frac\{d\}\{dx\}/g, "{\\frac{\\mathrm{d}}{\\mathrm{d}x}}");

		// Handle standalone d in derivatives (but not in other contexts)
		str = str.replace(/\b([dfgh])\(x\)/g, "$1(x)"); // Keep function names as-is
		str = str.replace(/\bd([xy])/g, "\\mathrm{d}$1"); // Convert dx, dy to \mathrm{d}x
		str = str.replace(/([dfgh])'\(x\)/g, "$1'(x)"); // Keep derivative notation

		return str;
	}

	processLimits(str) {
		// Fix "lim_{x o infty}" -> "lim_{x \to \infty}"
		str = str.replace(/lim_\{([^}]+)\s+o\s+([^}]+)\}/g, "\\lim_{$1 \\to $2}");
		// Fix standalone "lim" -> "\lim"
		str = str.replace(/\blim\b/g, "\\lim");
		return str;
	}

	// Create a simple fallback rendering
	renderFallback(tex, displayMode = false) {
		const container = document.createElement("span");
		container.className = "webtex-custom-fallback";
		container.style.cssText = `
      display: ${displayMode ? "block" : "inline-block"};
      font-family: 'Computer Modern', serif;
      font-size: 1.1em;
      color: inherit;
      background: rgba(255, 235, 238, 0.3);
      padding: 2px 4px;
      border-radius: 3px;
      border: 1px solid rgba(239, 154, 154, 0.5);
    `;
		// Use textContent for security - this is the ultimate fallback that displays raw LaTeX text
		// when all rendering attempts fail. Using textContent prevents XSS attacks from malicious LaTeX content.
		container.textContent = tex;
		return container;
	}
}

const customParser = new CustomLatexParser();

/* -------------------------------------------------- */

async function renderMathExpression(tex, displayMode = false, element = null) {
	rendererState.totalAttempts++;

	if (!tex || !tex.trim()) {
		if (element) {
			element.textContent = tex || "";
		}
		return { success: false, method: "empty", element };
	}

	let cleanedTex = tex.trim();
	const isDisplayMath =
		displayMode ||
		(cleanedTex.startsWith("$$") && cleanedTex.endsWith("$$")) ||
		(cleanedTex.startsWith("\\[") && cleanedTex.endsWith("\\]"));

	if (isDisplayMath) {
		cleanedTex = cleanedTex
			.replace(/^\$\$|\$\$$/g, "")
			.replace(/^\\\[|\\\]$/g, "")
			.trim();
	}

	// This variable will be used in both try and catch blocks
	let processedTex = cleanedTex;

	try {
		// Pre-fix common issues before attempting to render
		processedTex = fixIncompleteCommands(processedTex);
		processedTex = customParser.fixUnmatchedBraces(processedTex);
		processedTex = cleanupEmptyBraces(processedTex);

		// Additional safety check for unmatched braces that might cause parse errors
		processedTex = processedTex.replace(/\\text\{([^}]*)$/g, "\\text{$1}");

		// Simplify complex structures for KaTeX
		processedTex = customParser.simplify(processedTex);

		// Handle Unicode characters
		processedTex = handleUnicodeInMath(processedTex);

		// Convert text mode accent commands to math mode equivalents
		processedTex = convertTextModeAccents(processedTex);

		const katexOptions = {
			displayMode: isDisplayMath,
			errorColor: "inherit",
			// When verbose logging is enabled, surface all KaTeX strict warnings.
			// Otherwise, suppress them to avoid console noise.
			strict: (_errorCode) => (ENABLE_KATEX_LOGGING ? "warn" : "ignore"),
			trust: false,
			throwOnError: true, // We will catch the error
		};

		const originalWarn = console.warn;
		console.warn = (msg, ...rest) => {
			// If verbose logging is disabled, suppress KaTeX warnings entirely during render
			if (!ENABLE_KATEX_LOGGING) return;
			try {
				originalWarn.call(console, msg, ...rest);
			} catch (e) {
				console.error("[WebTeX] Failed to forward KaTeX warning to console.warn:", e);
			}
		};
		let rendered;
		try {
			rendered = katex.renderToString(processedTex, katexOptions);
		} finally {
			console.warn = originalWarn;
		}
		rendererState.katexSuccess++;

		if (element) {
			element.innerHTML = rendered;
			element.classList.add("webtex-katex-rendered");
		}

		return { success: true, method: "katex", element };
	} catch (katexError) {
		// --- This is the new, robust fallback logic ---
		reportKaTeXError(tex, katexError);

		// Use the original, un-simplified text for the fallback to avoid cascading errors.
		const fallbackText = cleanedTex;

		try {
			const fallbackElement = customParser.renderFallback(fallbackText, isDisplayMath);
			if (element && fallbackElement) {
				// Clear any failed render attempts and append the safe fallback.
				element.innerHTML = "";
				element.appendChild(fallbackElement); // Correctly append the HTML element
				element.classList.add("webtex-custom-rendered");
				rendererState.customParserFallback++;
				return { success: true, method: "custom-fallback", element };
			}
		} catch (fallbackError) {
			log(LOG_LEVEL.ERROR, "The custom text fallback renderer also failed:", fallbackError);
		}

		// Ultimate fallback: display the original text to prevent script crash.
		if (element) {
			element.textContent = tex; // Use the raw original `tex`
			element.classList.add("webtex-error-fallback");
			element.title = katexError.message || "WebTeX failed to render this expression.";
		}

		return { success: false, method: "error", element, error: katexError };
	}
}

/* -------------------------------------------------- */
// Enhanced math detection and processing
function findMathExpressions(root) {
	const mathExpressions = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
		acceptNode: (node) => {
			// Skip if parent is already processed or should be ignored
			if (
				node.parentElement &&
				(node.parentElement.classList.contains("webtex-ignore") ||
					node.parentElement.closest(".webtex-ignore") ||
					// Only skip math containers that contain failed renders to prevent infinite loops
					(node.parentElement.classList.contains("webtex-math-container") &&
						node.parentElement.classList.contains("webtex-failed-render")))
			) {
				return NodeFilter.FILTER_REJECT;
			}

			// Skip inside code-like and input elements where we should not render math
			const tag = node.parentElement?.tagName;
			if (
				tag &&
				[
					"SCRIPT",
					"STYLE",
					"TEXTAREA",
					"PRE",
					"CODE",
					"NOSCRIPT",
					"INPUT",
					"SELECT",
					"BUTTON",
				].includes(tag)
			) {
				return NodeFilter.FILTER_REJECT;
			}

			// Skip editable areas to avoid interfering with user typing
			if (node.parentElement && nodeIsEditable(node.parentElement)) {
				return NodeFilter.FILTER_REJECT;
			}
			return NodeFilter.FILTER_ACCEPT;
		},
	});

	let node;
	while ((node = walker.nextNode())) {
		const text = node.textContent;

		// Enhanced regex patterns for math detection
		const patterns = [
			// Display math: $$...$$ and \[...\]
			{ pattern: /\$\$([\s\S]*?)\$\$/g, display: true },
			{ pattern: /\\\[([\s\S]*?)\\\]/g, display: true },
			// Inline math: $...$ and \(...\)
			// The following regex matches inline math expressions delimited by single dollar signs ($...$),
			// while allowing for escaped dollar signs (\$) inside the math. It captures the content between
			// the dollar signs, ensuring that a single $ does not match across multiple math expressions.
			// Breakdown:
			//   \$           - Match a literal dollar sign (start delimiter)
			//   (            - Start capturing group for the math content
			//     (?:        - Non-capturing group for content inside math
			//       [^\$]    - Any character except a dollar sign
			//       |        - OR
			//       \\$     - An escaped dollar sign (i.e., \$)
			//     )+?        - Repeat one or more times, non-greedy
			//   )            - End capturing group
			//   \$           - Match a literal dollar sign (end delimiter)
			{ pattern: /\$((?:[^$]|\\\$)+?)\$/g, display: false },
			{ pattern: /\\\(([\s\S]*?)\\\)/g, display: false },
		];

		patterns.forEach(({ pattern, display }) => {
			let match = pattern.exec(text);
			while (match !== null) {
				const tex = decodeHTMLEntities(match[1].trim());
				if (tex) {
					mathExpressions.push({
						tex: tex,
						display: display,
						node: node,
						match: match[0],
						start: match.index,
						end: match.index + match[0].length,
					});
				}
				match = pattern.exec(text);
			}
		});
	}

	return mathExpressions;
}

/* -------------------------------------------------- */
// Process math expressions with intelligent fallback
async function processMathExpressions(expressions) {
	const processedNodes = new Set();

	for (const expr of expressions) {
		if (processedNodes.has(expr.node)) continue;

		// Check if node still exists and has a parent
		if (!expr.node || !expr.node.parentNode) {
			continue;
		}

		const text = expr.node.textContent;
		const container = document.createElement("span");
		container.className = "webtex-math-container";

		// Replace the math expression with a container
		const before = text.substring(0, expr.start);
		const after = text.substring(expr.end);

		if (before) {
			container.appendChild(document.createTextNode(before));
		}

		const mathElement = document.createElement("span");
		mathElement.className = `webtex-math ${expr.display ? "webtex-display" : "webtex-inline"}`;

		const result = await renderMathExpression(expr.tex, expr.display, mathElement);

		if (result.success) {
			// Store original text for potential restoration
			mathElement.dataset.originalText = expr.match;
			container.appendChild(mathElement);
		} else {
			// Keep original text if all renderers failed
			const textNode = document.createTextNode(expr.match);
			container.appendChild(textNode);
			// Mark container as processed to prevent infinite loop on failed renders
			container.classList.add("webtex-processed", "webtex-failed-render");
			container.title = "WebTeX: Failed to render this LaTeX expression";
		}

		if (after) {
			container.appendChild(document.createTextNode(after));
		}

		// Double-check parent exists before replacing
		if (expr.node.parentNode) {
			expr.node.parentNode.replaceChild(container, expr.node);
			processedNodes.add(expr.node);

			// Recursively process any remaining math in the newly created container (e.g., second $...$ in same text node)
			await safeRender(container);
		}
	}
}

/* -------------------------------------------------- */
// Enhanced preprocessing with Unicode handling
function preprocessMathText(node) {
	if (!node || !node.childNodes) return;

	node.childNodes.forEach((child) => {
		if (child.nodeType === 3) {
			// Text node
			let text = child.textContent;
			text = decodeHTMLEntities(text);
			// Normalize nuclear notation sequences so KaTeX can parse them
			text = customParser.processNuclearNotation(text);

			// Enhanced environment handling
			// Upgrade single-$ wrapped environments (but skip if already in $$)
			text = text.replace(
				/(?<!\$)\$\s*\\begin\{([^}]+)\}([\s\S]*?)\\end\{\1\}\s*\$(?!\$)/g,
				(_m, env, content) => {
					const decodedContent = decodeHTMLEntities(content);
					return `$$\\begin{${env}}${decodedContent}\\end{${env}}$$`;
				},
			);

			child.textContent = text;
		} else if (
			child.nodeType === 1 &&
			![
				"SCRIPT",
				"STYLE",
				"TEXTAREA",
				"PRE",
				"CODE",
				"NOSCRIPT",
				"INPUT",
				"SELECT",
				"BUTTON",
			].includes(child.tagName)
		) {
			preprocessMathText(child);
		}
	});
}

// Common Unicode fractions
const unicodeFractions = {
	"½": "\\frac{1}{2}",
	"⅓": "\\frac{1}{3}",
	"⅔": "\\frac{2}{3}",
	"¼": "\\frac{1}{4}",
	"¾": "\\frac{3}{4}",
	"⅕": "\\frac{1}{5}",
	"⅖": "\\frac{2}{5}",
	"⅗": "\\frac{3}{5}",
	"⅘": "\\frac{4}{5}",
	"⅙": "\\frac{1}{6}",
	"⅚": "\\frac{5}{6}",
	"⅐": "\\frac{1}{7}",
	"⅛": "\\frac{1}{8}",
	"⅜": "\\frac{3}{8}",
	"⅝": "\\frac{5}{8}",
	"⅞": "\\frac{7}{8}",
	"⅑": "\\frac{1}{9}",
	"⅒": "\\frac{1}{10}",
};

// Common Unicode symbols and their LaTeX equivalents
const unicodeSymbols = {
	"→": "\\rightarrow",
	"←": "\\leftarrow",
	"↔": "\\leftrightarrow",
	"⇒": "\\Rightarrow",
	"⇐": "\\Leftarrow",
	"⇔": "\\Leftrightarrow",
	"∈": "\\in",
	"∉": "\\notin",
	"⊆": "\\subseteq",
	"⊂": "\\subset",
	"⊇": "\\supseteq",
	"⊃": "\\supset",
	"∩": "\\cap",
	"∪": "\\cup",
	"∅": "\\emptyset",
	"∞": "\\infty",
	"±": "\\pm",
	"∓": "\\mp",
	"×": "\\times",
	"÷": "\\div",
	"≤": "\\leq",
	"≥": "\\geq",
	"≠": "\\neq",
	"≈": "\\approx",
	"≡": "\\equiv",
	"≅": "\\cong",
	"∝": "\\propto",
	"∑": "\\sum",
	"∏": "\\prod",
	"∫": "\\int",
	"∬": "\\iint",
	"∭": "\\iiint",
	"∮": "\\oint",
	"∇": "\\nabla",
	"∂": "\\partial",
	"√": "\\sqrt",
	"∛": "\\sqrt[3]",
	"∜": "\\sqrt[4]",
	α: "\\alpha",
	β: "\\beta",
	γ: "\\gamma",
	δ: "\\delta",
	ε: "\\epsilon",
	ζ: "\\zeta",
	η: "\\eta",
	θ: "\\theta",
	ι: "\\iota",
	κ: "\\kappa",
	λ: "\\lambda",
	μ: "\\mu",
	ν: "\\nu",
	ξ: "\\xi",
	π: "\\pi",
	ρ: "\\rho",
	σ: "\\sigma",
	τ: "\\tau",
	υ: "\\upsilon",
	φ: "\\phi",
	χ: "\\chi",
	ψ: "\\psi",
	ω: "\\omega",
	Α: "\\Alpha",
	Β: "\\Beta",
	Γ: "\\Gamma",
	Δ: "\\Delta",
	Ε: "\\Epsilon",
	Ζ: "\\Zeta",
	Η: "\\Eta",
	Θ: "\\Theta",
	Ι: "\\Iota",
	Κ: "\\Kappa",
	Λ: "\\Lambda",
	Μ: "\\Mu",
	Ν: "\\Nu",
	Ξ: "\\Xi",
	Π: "\\Pi",
	Ρ: "\\Rho",
	Σ: "\\Sigma",
	Τ: "\\Tau",
	Υ: "\\Upsilon",
	Φ: "\\Phi",
	Χ: "\\Chi",
	Ψ: "\\Psi",
	Ω: "\\Omega",
};

const unicodeReplacements = { ...unicodeFractions, ...unicodeSymbols };
const unicodeReplacementPattern = new RegExp(Object.keys(unicodeReplacements).join("|"), "g");

// Function to handle Unicode characters in math expressions
function handleUnicodeInMath(tex) {
	let processed = tex;

	// Replace Unicode fractions and symbols with LaTeX equivalents using a single pass
	processed = processed.replace(unicodeReplacementPattern, (match) => unicodeReplacements[match]);

	// Handle other Unicode characters by wrapping them in \text{}
	// This regex matches Unicode characters that are not already in \text{} or other commands
	processed = processed.replace(/([^\p{ASCII}])/gu, (_match, char) => {
		// Skip if already in \text{} or other commands
		if (
			processed.includes(`\\text{${char}}`) ||
			processed.includes(`\\mathrm{${char}}`) ||
			processed.includes(`\\mathit{${char}}`)
		) {
			return char;
		}
		return `\\text{${char}}`;
	});

	return processed;
}

// Convert text mode accent commands to math mode equivalents
function convertTextModeAccents(tex) {
	if (!tex) return tex;

	// Common text mode accent commands that should be converted to math mode
	const textModeAccents = [
		// Single character accents
		{ pattern: /\\u\{([^}]+)\}/g, replacement: "\\breve{$1}" }, // breve
		{ pattern: /\\v\{([^}]+)\}/g, replacement: "\\check{$1}" }, // caron/hacek
		{ pattern: /\\H\{([^}]+)\}/g, replacement: "\\ddot{$1}" }, // double acute
		{ pattern: /\\k\{([^}]+)\}/g, replacement: "\\mathring{$1}" }, // ogonek
		{ pattern: /\\'\{([^}]+)\}/g, replacement: "\\acute{$1}" }, // acute
		{ pattern: /\\`\{([^}]+)\}/g, replacement: "\\grave{$1}" }, // grave
		{ pattern: /\\"\{([^}]+)\}/g, replacement: "\\ddot{$1}" }, // diaeresis
		{ pattern: /\\~\{([^}]+)\}/g, replacement: "\\tilde{$1}" }, // tilde
		{ pattern: /\\\^\{([^}]+)\}/g, replacement: "\\hat{$1}" }, // circumflex
		{ pattern: /\\\.\{([^}]+)\}/g, replacement: "\\dot{$1}" }, // dot
		{ pattern: /\\=\{([^}]+)\}/g, replacement: "\\bar{$1}" }, // macron
		{ pattern: /\\b\{([^}]+)\}/g, replacement: "\\bar{$1}" }, // bar

		// Handle escaped versions (common in user input)
		{ pattern: /\\\\u\{([^}]+)\}/g, replacement: "\\breve{$1}" },
		{ pattern: /\\\\v\{([^}]+)\}/g, replacement: "\\check{$1}" },
		{ pattern: /\\\\H\{([^}]+)\}/g, replacement: "\\ddot{$1}" },
		{ pattern: /\\\\k\{([^}]+)\}/g, replacement: "\\mathring{$1}" },
		{ pattern: /\\\\'\{([^}]+)\}/g, replacement: "\\acute{$1}" },
		{ pattern: /\\\\`\{([^}]+)\}/g, replacement: "\\grave{$1}" },
		{ pattern: /\\\\"\{([^}]+)\}/g, replacement: "\\ddot{$1}" },
		{ pattern: /\\\\~\{([^}]+)\}/g, replacement: "\\tilde{$1}" },
		{ pattern: /\\\\\^\{([^}]+)\}/g, replacement: "\\hat{$1}" },
		{ pattern: /\\\\\.\{([^}]+)\}/g, replacement: "\\dot{$1}" },
		{ pattern: /\\\\=\{([^}]+)\}/g, replacement: "\\bar{$1}" },
		{ pattern: /\\\\b\{([^}]+)\}/g, replacement: "\\bar{$1}" },
	];

	let result = tex;
	textModeAccents.forEach(({ pattern, replacement }) => {
		result = result.replace(pattern, replacement);
	});

	return result;
}

/* -------------------------------------------------- */
// Main rendering function
async function safeRender(root = document.body) {
	if (!isEnabled) return;

	try {
		preprocessMathText(root);

		const expressions = findMathExpressions(root);
		if (expressions.length > 0) {
			log(LOG_LEVEL.DEBUG, `[WebTeX] Processing ${expressions.length} math expressions`);
			await processMathExpressions(expressions);
		}
	} catch (error) {
		log(LOG_LEVEL.ERROR, "Error in safeRender:", error);
		console.error("[WebTeX] SafeRender error details:", {
			error: error,
			message: error.message,
			stack: error.stack,
			root: root,
			isEnabled: isEnabled,
		});
	}
}

/* -------------------------------------------------- */
// DOM readiness helper: wait until document.body exists
async function waitForDocumentReady() {
	if (
		document.body &&
		(document.readyState === "interactive" || document.readyState === "complete")
	) {
		return;
	}

	await new Promise((resolve) => {
		let resolved = false;
		let mo = null;
		const done = () => {
			if (resolved) return;
			if (!document.body) return;
			resolved = true;
			document.removeEventListener("DOMContentLoaded", done);
			window.removeEventListener("load", done);
			try {
				mo?.disconnect();
			} catch (e) {
				console.error("[WebTeX] Failed to disconnect readiness observer:", e);
			}
			resolve();
		};

		document.addEventListener("DOMContentLoaded", done, { once: true });
		window.addEventListener("load", done, { once: true });
		mo = new MutationObserver(() => done());
		mo.observe(document.documentElement || document, { childList: true });
	});
}

/* -------------------------------------------------- */
// Main initialization
(async function main() {
	log(LOG_LEVEL.INFO, "WebTeX extension initializing...");

	// Ensure DOM is ready and body exists before setting up observers
	await waitForDocumentReady();

	// Load persisted user settings before first render
	await loadKatexLoggingSetting();

	// Since this script is only injected on allowed domains, we can enable immediately
	isEnabled = true;
	await enableRendering();

	// Listen for disable messages from background script (handler defined above)
	chrome.runtime.onMessage.addListener(runtimeMessageHandlerRef);

	setupNavigationHandlers();
})();

/* -------------------------------------------------- */
// Navigation and observer setup
let navigationHandlersSetup = false;
let navigationObserverInstance = null;
let debouncedNavigationHandlerRef = null;
let origPushStateRef = null;
let origReplaceStateRef = null;
let onHashChangeRef = null;
let onPageShowRef = null;
let onPopStateRef = null;
let onVisibilityChangeRef = null;
let onPjaxEndRef = null;
let onTurboLoadRef = null;
let onTurboRenderRef = null;
let navObservedBodyRef = null;
let lastUrlRef = null;

function setupNavigationHandlers() {
	if (!isEnabled || navigationHandlersSetup) return;

	navigationHandlersSetup = true;
	lastUrlRef = location.href;

	debouncedNavigationHandlerRef = debounce(async () => {
		await handleNavigation();
	}, 100);

	// Hook history API for SPA route changes
	origPushStateRef = history.pushState;
	origReplaceStateRef = history.replaceState;
	history.pushState = function (...args) {
		const ret = origPushStateRef.apply(this, args);
		debouncedNavigationHandlerRef();
		return ret;
	};
	history.replaceState = function (...args) {
		const ret = origReplaceStateRef.apply(this, args);
		debouncedNavigationHandlerRef();
		return ret;
	};

	// Hash changes and BFCache restores
	onHashChangeRef = () => debouncedNavigationHandlerRef();
	onPageShowRef = () => debouncedNavigationHandlerRef();
	onVisibilityChangeRef = () => {
		if (!document.hidden) debouncedNavigationHandlerRef();
	};
	onPopStateRef = () => debouncedNavigationHandlerRef();

	// PJAX/Turbo events used by GitHub and similar sites
	onPjaxEndRef = () => debouncedNavigationHandlerRef();
	onTurboLoadRef = () => debouncedNavigationHandlerRef();
	onTurboRenderRef = () => debouncedNavigationHandlerRef();

	window.addEventListener("hashchange", onHashChangeRef);
	window.addEventListener("pageshow", onPageShowRef);
	document.addEventListener("visibilitychange", onVisibilityChangeRef);
	window.addEventListener("popstate", onPopStateRef);
	// Listen to common SPA navigation events
	document.addEventListener("pjax:end", onPjaxEndRef);
	document.addEventListener("pjax:complete", onPjaxEndRef);
	document.addEventListener("turbo:load", onTurboLoadRef);
	document.addEventListener("turbo:render", onTurboRenderRef);

	navigationObserverInstance = new MutationObserver(() => {
		if (location.href !== lastUrlRef) {
			lastUrlRef = location.href;
			debouncedNavigationHandlerRef();
		}
	});

	navigationObserverInstance.observe(document.body, {
		childList: true,
		subtree: true,
		characterData: true,
	});

	// Track which body is being observed to handle body replacement
	navObservedBodyRef = document.body;
}

function teardownNavigationHandlers() {
	if (!navigationHandlersSetup) return;
	try {
		if (onHashChangeRef) window.removeEventListener("hashchange", onHashChangeRef);
		if (onPageShowRef) window.removeEventListener("pageshow", onPageShowRef);
		if (onVisibilityChangeRef)
			document.removeEventListener("visibilitychange", onVisibilityChangeRef);
		if (onPopStateRef) window.removeEventListener("popstate", onPopStateRef);
		if (onPjaxEndRef) {
			document.removeEventListener("pjax:end", onPjaxEndRef);
			document.removeEventListener("pjax:complete", onPjaxEndRef);
		}
		if (onTurboLoadRef) document.removeEventListener("turbo:load", onTurboLoadRef);
		if (onTurboRenderRef) document.removeEventListener("turbo:render", onTurboRenderRef);
	} catch (e) {
		if (ENABLE_KATEX_LOGGING) {
			try {
				console.error("[WebTeX] Failed to remove navigation event listeners:", e);
			} catch {}
		}
	}
	try {
		navigationObserverInstance?.disconnect();
	} catch (e) {
		if (ENABLE_KATEX_LOGGING) {
			try {
				console.error("[WebTeX] Failed to disconnect navigation observer:", e);
			} catch {}
		}
	}
	try {
		if (origPushStateRef) history.pushState = origPushStateRef;
	} catch (e) {
		if (ENABLE_KATEX_LOGGING) {
			try {
				console.error("[WebTeX] Failed to restore history.pushState:", e);
			} catch {}
		}
	}
	try {
		if (origReplaceStateRef) history.replaceState = origReplaceStateRef;
	} catch (e) {
		if (ENABLE_KATEX_LOGGING) {
			try {
				console.error("[WebTeX] Failed to restore history.replaceState:", e);
			} catch {}
		}
	}
	try {
		if (debouncedNavigationHandlerRef?.cancel) debouncedNavigationHandlerRef.cancel();
	} catch (e) {
		if (ENABLE_KATEX_LOGGING) {
			try {
				console.error("[WebTeX] Failed to cancel debounced navigation handler:", e);
			} catch {}
		}
	}

	navigationObserverInstance = null;
	debouncedNavigationHandlerRef = null;
	origPushStateRef = null;
	origReplaceStateRef = null;
	onHashChangeRef = null;
	onPageShowRef = null;
	onVisibilityChangeRef = null;
	onPopStateRef = null;
	onPjaxEndRef = null;
	onTurboLoadRef = null;
	onTurboRenderRef = null;
	lastUrlRef = null;
	navigationHandlersSetup = false;
}

async function handleNavigation() {
	if (!isEnabled) return;

	// If the page framework swapped out <body>, reattach our observers
	try {
		if (observer && observedBodyRef !== document.body) {
			observer.disconnect();
			observer.observe(document.body, { childList: true, subtree: true, characterData: true });
			observedBodyRef = document.body;
		}
	} catch (e) {
		if (ENABLE_KATEX_LOGGING) {
			try {
				console.error("[WebTeX] Failed to reattach main MutationObserver after body swap:", e);
			} catch {}
		}
	}

	try {
		if (navigationObserverInstance && navObservedBodyRef !== document.body) {
			navigationObserverInstance.disconnect();
			navigationObserverInstance.observe(document.body, {
				childList: true,
				subtree: true,
				characterData: true,
			});
			navObservedBodyRef = document.body;
		}
	} catch (e) {
		if (ENABLE_KATEX_LOGGING) {
			try {
				console.error(
					"[WebTeX] Failed to reattach navigation MutationObserver after body swap:",
					e,
				);
			} catch {}
		}
	}
	await safeRender();
}

async function enableRendering() {
	await injectCSS(); // Inject styles when enabling
	await safeRender(); // Wait for initial render to complete

	observer = new MutationObserver(
		debounce(async (muts) => {
			// Guard optional helpers; don't break if they are undefined
			const shouldSkip =
				(typeof mutationsOnlyRipple === "function" && mutationsOnlyRipple(muts)) ||
				(typeof userIsSelectingText === "function" && userIsSelectingText()) ||
				(typeof typingInsideActiveElement === "function" && typingInsideActiveElement(muts));
			if (shouldSkip) {
				return;
			}

			// Collect all nodes that need rendering to avoid race conditions
			const nodesToRender = new Set();

			muts.forEach((m) => {
				// Process the mutation target itself (covers character data changes)
				nodesToRender.add(m.target);

				// Handle added nodes (elements OR text)
				m.addedNodes.forEach((n) => {
					if (n.nodeType === 3) {
						// Text node – re-render its parent
						nodesToRender.add(n.parentNode || document.body);
					} else if (n.nodeType === 1 && !n.closest(".webtex-ignore")) {
						nodesToRender.add(n);
					}
				});
			});

			// Render all collected nodes in a single pass
			for (const node of nodesToRender) {
				if (node?.parentNode) {
					// Ensure node still exists
					await safeRender(node);
				}
			}
		}, 200),
	);

	observer.observe(document.body, { childList: true, subtree: true, characterData: true });
	observedBodyRef = document.body;
}

function disableRendering() {
	if (observer) {
		observer.disconnect();
		observer = null;
	}

	// Tear down navigation handlers and restore history hooks
	teardownNavigationHandlers();

	// Remove global and Chrome listeners
	try {
		if (windowErrorHandlerRef) window.removeEventListener("error", windowErrorHandlerRef);
		if (windowRejectionHandlerRef)
			window.removeEventListener("unhandledrejection", windowRejectionHandlerRef);
		if (storageChangedHandlerRef) chrome.storage.onChanged.removeListener(storageChangedHandlerRef);
		if (runtimeMessageHandlerRef) chrome.runtime.onMessage.removeListener(runtimeMessageHandlerRef);
	} catch (e) {
		if (ENABLE_KATEX_LOGGING) {
			try {
				console.error("[WebTeX] Failed to remove global/Chrome listeners:", e);
			} catch {}
		}
	}

	// Restore original DOM structure completely
	document
		.querySelectorAll(
			".webtex-math-container, .webtex-processed, .webtex-inline-math, .webtex-display-math",
		)
		.forEach((container) => {
			// Find all original text nodes and math elements within
			const textParts = [];
			container.childNodes.forEach((node) => {
				if (node.nodeType === 3) {
					// Text node
					textParts.push(node.textContent);
				} else if (node.dataset?.originalText) {
					textParts.push(node.dataset.originalText);
				} else {
					textParts.push(node.textContent || "");
				}
			});

			// Replace container with original text node
			const originalText = textParts.join("");
			const textNode = document.createTextNode(originalText);
			if (container.parentNode) {
				container.parentNode.replaceChild(textNode, container);
			}
		});

	// Clean up any remaining WebTeX elements
	document
		.querySelectorAll(
			".webtex-katex-rendered, .webtex-custom-rendered, .webtex-math, .webtex-display, .webtex-inline-math, .webtex-display-math, .webtex-processed, .webtex-error-fallback, .webtex-custom-fallback",
		)
		.forEach((el) => {
			if (el.dataset.originalText) {
				const textNode = document.createTextNode(el.dataset.originalText);
				if (el.parentNode) {
					el.parentNode.replaceChild(textNode, el);
				}
			} else {
				el.remove();
			}
		});

	removeCSS(); // Remove injected styles
	// Clear global state to prevent memory leaks
	delete window.rendererState;
	delete window.webtexErrors;

	// Clean up global debug/logging exports to avoid page side-effects when disabled
	try {
		if (webtexCreatedLogApi && "WebTeXLogging" in window) {
			delete window.WebTeXLogging;
		}
	} catch {}
	try {
		if (webtexCreatedLogLevel && "WEBTEX_LOG_LEVEL" in window) {
			delete window.WEBTEX_LOG_LEVEL;
		}
	} catch {}

	// Reset internal refs to avoid accidental reuse if body is swapped later
	observedBodyRef = null;
	navObservedBodyRef = null;
}

/* -------------------------------------------------- */
// Helper functions
function nodeIsEditable(n) {
	if (n.getAttribute && n.getAttribute("contenteditable") === "false") return false;
	return n.isContentEditable || (n.nodeType === 1 && /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName));
}

function typingInsideActiveElement(muts) {
	const active = document.activeElement;
	if (!active || !nodeIsEditable(active)) return false;
	return muts.every((m) => active.contains(m.target));
}

function userIsSelectingText() {
	const sel = document.getSelection();
	return sel && sel.rangeCount > 0 && !sel.isCollapsed;
}

function isRippleNode(n) {
	return (
		n.nodeType === 1 &&
		n.classList &&
		(n.classList.contains("mat-ripple") ||
			n.classList.contains("mdc-button__ripple") ||
			n.classList.contains("mat-focus-indicator"))
	);
}

function mutationsOnlyRipple(muts) {
	return muts.every((m) => [...m.addedNodes, ...m.removedNodes].every(isRippleNode));
}

function debounce(fn, ms) {
	let t;
	const debounced = (...a) => {
		clearTimeout(t);
		t = setTimeout(() => fn(...a), ms);
	};
	debounced.cancel = () => {
		if (t) clearTimeout(t);
	};
	return debounced;
}
