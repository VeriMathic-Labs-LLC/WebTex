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

function safeRender (root = document.body) {        // ★ renamed function
  renderMathInElement(root, {
    delimiters: DELIMITERS,
    ignoredTags: [
      "script","style","textarea","pre","code","noscript",
      "input","select",                             // ★ ignore form controls
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
