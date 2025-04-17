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

(async function main () {
  const { enabled = true, allowedDomains = [] } = await chrome.storage.local.get(
    ["enabled", "allowedDomains"]
  );
  if (!enabled || !allowedDomains.includes(location.hostname)) return;

  renderWholePage();

  /* re‑render on DOM changes */
  const obs = new MutationObserver(debounce(muts => {
    muts.flatMap(m => [...m.addedNodes])
        .filter(n => n.nodeType === 1)
        .forEach(renderWholePage);
  }, 200));
  obs.observe(document.body, { childList:true, subtree:true });

  /* listen for global toggle */
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.action === "toggle-global") location.reload();
  });
})();

/* ---------- core ---------- */

function renderWholePage (root = document.body) {
  decodeEntitiesWalk(root);          // <-- new step
  renderMathInElement(root, {
    delimiters: DELIMITERS,
    ignoredTags: ["script","style","textarea","pre","code","noscript"]
  });
}

/* Walk text nodes and decode &gt; &lt; &amp; */
function decodeEntitiesWalk (node) {
  if (node.nodeType === 3) {         // Text node
    node.data = node.data
      .replace(/&gt;/g,  '>')
      .replace(/&lt;/g,  '<')
      .replace(/&amp;/g, '&');
  } else {
    node.childNodes.forEach(decodeEntitiesWalk);
  }
}

/* Simple debounce helper */
function debounce (fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}