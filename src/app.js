/*  src/app.js  – compiled → build/app.js
    Bundles KaTeX auto‑render + our logic.
*/
import "katex/dist/katex.min.css";
import renderMathInElement from "katex/dist/contrib/auto-render.mjs";

const DELIMITERS = [
  { left: "$$", right: "$$", display: true },
  { left: "\\[", right: "\\]", display: true },
  { left: "$",   right: "$",   display: false },
  { left: "\\(", right: "\\)", display: false },
];

/* -------------------------------------------------- */
// Cross-browser safe inline-math detector.
// Chrome supports the precise negative-look-behind pattern, but Firefox/Safari do not.
// We attempt to compile the sharper pattern and fall back to a simpler one.
const INLINE_MATH_REGEX = (() => {
  try {
    return new RegExp('(?<!\\\\)\\$(?!\\$)([^\\$\\r\\n]*?)\\$(?!\\$)', 'g');
  } catch (_) {
    // Fallback: "$...$" (later we'll filter out escaped dollars in the replacer)
    return /\$([^\$\r\n]*?)\$/g;
  }
})();

/* -------------------------------------------------- */
let observer = null;
let isEnabled = false;

(async function main () {
  const { allowedDomains = [] } = await chrome.storage.local.get("allowedDomains");
  
  // Allow local files (file://) and check domain allowlist for web pages
  const isLocalFile = location.protocol === 'file:';
  const isDomainAllowed = allowedDomains.includes(location.hostname);
  
  isEnabled = isLocalFile || isDomainAllowed;
  
  if (isEnabled) {
    enableRendering();
  }

  /* listen for domain updates */
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.action === "domain-updated" && msg.allowed) {
      const newIsEnabled = location.protocol === 'file:' || msg.allowed.includes(location.hostname);
      
      if (newIsEnabled && !isEnabled) {
        // Turning ON - enable rendering
        isEnabled = true;
        enableRendering();
      } else if (!newIsEnabled && isEnabled) {
        // Turning OFF - disable rendering and restore original text
        isEnabled = false;
        disableRendering();
      }
    }
  });
})();

function enableRendering() {
  safeRender();                              // ★ renamed from renderWholePage()

  /* re‑render on DOM changes ------------------------------------- */
  observer = new MutationObserver(debounce(muts => {
    /* ① If mutations are only UI ripples → ignore ---------------- */
    if (mutationsOnlyRipple(muts)) return;          // ★ new guard

    /* ② If user is selecting text → ignore ----------------------- */
    if (userIsSelectingText()) return;              // ★ new guard

    /* ③ If user is typing in an active editor → ignore ----------- */
    if (typingInsideActiveElement(muts)) return;    // ★ new guard

    /* ④ Otherwise, re‑render only the nodes that were added ------ */
    muts.flatMap(m => [...m.addedNodes])
        .filter(n => n.nodeType === 1)
        .forEach(safeRender);
  }, 200));
  observer.observe(document.body, { childList:true, subtree:true });
}

function disableRendering() {
  // Stop observing changes
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  
  // Remove all rendered KaTeX elements and restore original text
  const katexElements = document.querySelectorAll('.katex');
  katexElements.forEach(elem => {
    // Find the original math delimiter
    const mathAnnotation = elem.querySelector('annotation[encoding="application/x-tex"]');
    if (mathAnnotation) {
      const mathContent = mathAnnotation.textContent;
      
      // Determine if it was display or inline math
      const isDisplay = elem.classList.contains('katex-display');
      let originalText = mathContent;
      
      // Try to restore with proper delimiters
      if (elem.previousSibling && elem.previousSibling.nodeType === 3) {
        const prevText = elem.previousSibling.textContent;
        if (prevText.endsWith('$$')) {
          originalText = '$$' + mathContent + '$$';
        } else if (prevText.endsWith('\\[')) {
          originalText = '\\[' + mathContent + '\\]';
        } else if (prevText.endsWith('$')) {
          originalText = '$' + mathContent + '$';
        } else if (prevText.endsWith('\\(')) {
          originalText = '\\(' + mathContent + '\\)';
        }
      } else {
        // Fallback: guess based on display type
        if (isDisplay) {
          originalText = '$$' + mathContent + '$$';
        } else {
          originalText = '$' + mathContent + '$';
        }
      }
      
      // Replace the KaTeX element with a text node
      const textNode = document.createTextNode(originalText);
      elem.parentNode.replaceChild(textNode, elem);
    }
  });
}

/* ---------- core ---------- */

function preprocessMathText(node) {
  if (!node || !node.childNodes) return;
  node.childNodes.forEach(child => {
    if (child.nodeType === 3) { // Text node
      let text = child.textContent;
      
      // Handle block math: $$...$$ and \[...\]
      // Keep original spacing for display math
      text = text.replace(/\$\$([\s\S]*?)\$\$/g, (m, inner) => {
        return inner !== undefined ? '$$' + inner + '$$' : m;
      });
      
      text = text.replace(/\\\[([\s\S]*?)\\\]/g, (m, inner) => {
        return inner !== undefined ? '\\[' + inner + '\\]' : m;
      });
      
      // Handle inline math: $...$ and \(...\)
      // Simplified approach - less restrictive pattern matching
      text = text.replace(INLINE_MATH_REGEX, (m, inner, offset, str) => {
        // If we are on the fallback regex, skip matches where opening $ is escaped
        if (offset > 0 && str[offset - 1] === '\\') return m;
        const trimmed = inner.trim();
        // Accept any non-empty content that contains typical math characters
        // This is more permissive and handles mixed content better
        if (trimmed && (
          /\\[a-zA-Z]/.test(trimmed) ||           // LaTeX commands
          /[a-zA-Z]_/.test(trimmed) ||            // Subscripts
          /[a-zA-Z]\^/.test(trimmed) ||           // Superscripts  
          /[{}\[\]()]/.test(trimmed) ||           // Braces/brackets
          /[=+\-*/≤≥≠∞∂∇∆Ω∈∉⊂⊃∪∩∀∃∑∏∫√±]/.test(trimmed) || // Math symbols
          (/[a-zA-Z]/.test(trimmed) && /[0-9]/.test(trimmed)) // Variables with numbers
        )) {
          return '$' + trimmed + '$';
        }
        return m;
      });
      
      // Handle \(...\) - parentheses delimited inline math
      text = text.replace(/\\\(([^\)\r\n]*?)\\\)/g, (m, inner) => {
        return inner !== undefined ? '\\(' + inner + '\\)' : m;
      });
      
      child.textContent = text;
    } else if (child.nodeType === 1 && !["SCRIPT","STYLE","TEXTAREA","PRE","CODE","NOSCRIPT","INPUT","SELECT"].includes(child.tagName)) {
      preprocessMathText(child);
    }
  });
}

function safeRender (root = document.body) {
  preprocessMathText(root); // Preprocess before rendering
  renderMathInElement(root, {
    delimiters: DELIMITERS,
    ignoredTags: [
      "script","style","textarea","pre","code","noscript",
      "input","select",
    ],
    strict: "ignore"
  });
}

/* ---------- helpers ---------- */

/* Skip nodes inside <input>, <textarea>, or [contenteditable] ------- */
function nodeIsEditable (n) {
  // Treat [contenteditable="false"] as non-editable despite the isContentEditable flag
  if (n.getAttribute && n.getAttribute('contenteditable') === 'false') return false;
  return n.isContentEditable ||
         (n.nodeType === 1 &&
          /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName));
}

/* Mutations entirely inside the active editor? --------------------- */
function typingInsideActiveElement (muts) {         // ★ new
  const active = document.activeElement;
  if (!active || !nodeIsEditable(active)) return false;
  return muts.every(m => active.contains(m.target));
}

/* True if the user currently has text selected -------------------- */
function userIsSelectingText () {
  const sel = document.getSelection();
  return sel && sel.rangeCount > 0 && !sel.isCollapsed;
}

/* Ignore Angular / MDC hover‑ripples to avoid re‑renders ------------ */
function isRippleNode (n) {                         // ★ new
  return n.nodeType === 1 && n.classList && (
    n.classList.contains("mat-ripple") ||
    n.classList.contains("mdc-button__ripple") ||
    n.classList.contains("mat-focus-indicator")
  );
}
function mutationsOnlyRipple (muts) {              // ★ new
  return muts.every(m =>
    [...m.addedNodes, ...m.removedNodes].every(isRippleNode)
  );
}

/* Simple debounce helper ------------------------------------------- */
function debounce (fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}