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
(async function main () {
  const { enabled = true, allowedDomains = [] } =
    await chrome.storage.local.get(["enabled", "allowedDomains"]);

  if (!enabled || !allowedDomains.includes(location.hostname)) return;

  safeRender();                              // ★ renamed from renderWholePage()

  /* re‑render on DOM changes ------------------------------------- */
  const obs = new MutationObserver(debounce(muts => {
    /* ① If mutations are only UI ripples → ignore ---------------- */
    if (mutationsOnlyRipple(muts)) return;          // ★ new guard

    /* ② If user is selecting text → ignore ----------------------- */
    if (userIsSelectingText()) return;              // ★ new guard

    /* ③ If user is typing in an active editor → ignore ----------- */
    if (typingInsideActiveElement(muts)) return;    // ★ new guard

    /* ④ Otherwise, re‑render only the nodes that were added ------ */
    muts.flatMap(m => [...m.addedNodes])
        .filter(n => n.nodeType === 1)
        .forEach(safeRender);
  }, 200));
  obs.observe(document.body, { childList:true, subtree:true });

  /* listen for global toggle */
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.action === "toggle-global") location.reload();
  });
})();

/* ---------- core ---------- */

function preprocessMathText(node) {
  if (!node || !node.childNodes) return;
  node.childNodes.forEach(child => {
    if (child.nodeType === 3) { // Text node
      let text = child.textContent;
      
      // Handle block math: $$...$$ and \[...\]
      // Support various spacing patterns including multi-line with extra whitespace
      text = text.replace(/\$\$([\s\S]*?)\$\$/g, (m, inner) => {
        // Keep original spacing for display math - don't trim
        return inner ? `$$${inner}$$` : m;
      });
      
      text = text.replace(/\\\[([\s\S]*?)\\\]/g, (m, inner) => {
        // Keep original spacing for display math - don't trim
        return inner ? `\\[${inner}\\]` : m;
      });
      
      // Handle inline math: $...$ and \(...\)
      // Support equations adjacent to text (no spaces required)
      // More permissive pattern that allows any content between delimiters
      text = text.replace(/(?<!\\)\$(?!\$)([^\$\r\n]+?)\$(?!\$)/g, (m, inner) => {
        // More lenient math detection - check for common LaTeX patterns
        const mathPatterns = [
          /\\[a-zA-Z]+/, // LaTeX commands like \eq, \alpha, \sum
          /[a-zA-Z]_[{a-zA-Z0-9}]/, // Subscripts
          /[a-zA-Z]\^[{a-zA-Z0-9}]/, // Superscripts
          /[{}\[\]()]/, // Braces and brackets
          /[=+\-*/|<>≤≥≠∞∂∇∆Ω∈∉⊂⊃∪∩∀∃∑∏∫√±]/, // Math symbols
          /\\[()\[\]]/, // Escaped delimiters
          /[a-zA-Z][a-zA-Z0-9]*/, // Variables (single or multi-char)
        ];
        
        const trimmed = inner.trim();
        if (trimmed && mathPatterns.some(pattern => pattern.test(inner))) {
          return `$${inner}$`; // Keep original spacing within delimiters
        }
        return m;
      });
      
      // Handle \(...\) with similar logic
      text = text.replace(/\\\(([^\)\r\n]*?)\\\)/g, (m, inner) => {
        return inner ? `\\(${inner}\\)` : m;
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
