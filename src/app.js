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
    // Fallback: "$...$" (later we’ll filter out escaped dollars in the replacer)
    return /\$([^\$\r\n]*?)\$/g;
  }
})();

/* -------------------------------------------------- */
(async function main () {
  const { enabled = true, allowedDomains = [] } =
    await chrome.storage.local.get(["enabled", "allowedDomains"]);

  if (!enabled) {
    return;
  }
  
  // Allow local files (file://) and check domain allowlist for web pages
  const isLocalFile = location.protocol === 'file:';
  const isDomainAllowed = allowedDomains.includes(location.hostname);
  
  if (!isLocalFile && !isDomainAllowed) {
    return;
  }
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
  
  // If the node itself is a rendered math element, skip it
  if (node.nodeType === 1 && node.matches('math-renderer, .katex, .MathJax, .MathJax_Display')) {
    return;
  }
  
  // Try to reconstruct fragmented LaTeX before processing
  reconstructFragmentedMath(node);
  
  // Normalize common Unicode characters to standard LaTeX
  normalizeUnicodeMath(node);
  
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
      // More permissive approach that handles Unicode characters and various LaTeX patterns
      text = text.replace(INLINE_MATH_REGEX, (m, inner, offset, str) => {
        // If we are on the fallback regex, skip matches where opening $ is escaped
        if (offset > 0 && str[offset - 1] === '\\') return m;
        const trimmed = inner.trim();
        
        // More permissive math detection that includes Unicode characters
        if (trimmed && (
          /\\[a-zA-Z]/.test(trimmed) ||           // LaTeX commands
          /[a-zA-Z]_/.test(trimmed) ||            // Subscripts
          /[a-zA-Z]\^/.test(trimmed) ||           // Superscripts  
          /[{}\[\]()｛｝（）]/.test(trimmed) ||     // Braces/brackets (including Unicode)
          /[=+\-*/≤≥≠∞∂∇∆Ω∈∉⊂⊃∪∩∀∃∑∏∫√±]/.test(trimmed) || // Math symbols
          /[a-zA-Z]/.test(trimmed) ||             // Any text with letters
          /[0-9]/.test(trimmed) ||                // Any text with numbers
          /[×÷]/.test(trimmed) ||                 // Additional math symbols
          /[|]/.test(trimmed)                     // Pipe character (used in math)
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
  // Skip if this subtree is already fully rendered (contains only rendered math)
  if (hasRenderedMath(root) && !root.querySelector('[data-raw-math]')) {
    return;
  }
  // NOTE: We intentionally do NOT skip rendering even if the root contains
  // some already-rendered math, because there may be raw LaTeX mixed in.
  // Granular skipping is handled inside preprocessMathText for each node.
  
  preprocessMathText(root);
  
  try {
    renderMathInElement(root, {
      delimiters: DELIMITERS,
      ignoredTags: [
        "script","style","textarea","pre","code","noscript",
        "input","select","math","math-renderer","mjx-container"
      ],
      ignoredClasses: [
        "katex","katex-mathml","katex-html","js-inline-math",
        "MathJax","MathJax_Display","MathJax_Preview"
      ],
      strict: "ignore",
      throwOnError: false,
      errorColor: '#cc0000'
    });
  } catch (error) {
    console.warn('KaTeX rendering error:', error);
  }
}

/* ---------- helpers ---------- */

/* Reconstruct fragmented LaTeX that has been split across HTML elements */
function reconstructFragmentedMath(node) {
  /*
    We keep this routine conservative – it ONLY fixes obviously broken fragmentation
    we have observed in the wild (inline <em>/<strong> or <br> inside LaTeX).
    It now contains basic XSS guards and avoids writing back if <script> tags are present.
  */
  if (!node || node.nodeType !== 1) return;
  
  // Skip nodes that already contain rendered math to avoid conflicts
  if (hasRenderedMath(node)) {
    return;
  }
  
  const htmlContent = node.innerHTML || '';
  // Never touch nodes that already include <script> tags – avoid re-injection.
  if (/\<script/i.test(htmlContent)) return;
  
  // Only process if we find LaTeX delimiters that might be fragmented
  const hasLatexDelimiters = /\$\$|\\\[|\\\]|\$|\\\(|\\\)/.test(htmlContent);
  if (!hasLatexDelimiters) return;
  
  try {
    let fixedHTML = htmlContent;
    
    // Handle common fragmentation patterns more carefully
    // Pattern 1: LaTeX split by <em> or <strong> tags
    fixedHTML = fixedHTML.replace(
      /\$([^$]*?)<(em|strong|i|b)>([^<]*?)<\/(em|strong|i|b)>([^$]*?)\$/g,
      '$$$1$3$5$$'
    );
    
    // Pattern 2: Block math split by formatting tags
    fixedHTML = fixedHTML.replace(
      /\$\$([^$]*?)<(em|strong|i|b)>([^<]*?)<\/(em|strong|i|b)>([^$]*?)\$\$/g,
      '$$$$1$3$5$$$$'
    );
    
    // Pattern 3: LaTeX split by line breaks or spans (but not rendered math)
    fixedHTML = fixedHTML.replace(
      /\$([^$]*?)<br\s*\/??>([^$]*?)\$/g,
      '$$$1 $2$$'
    );
    
    // Only apply changes if we actually modified something and it looks safe
    if (fixedHTML !== htmlContent && !/<span[^>]*class="katex/.test(fixedHTML)) {
      node.innerHTML = fixedHTML;
    }
  } catch (e) {
    // Silently handle fragmented math reconstruction errors
  }
}

/* Normalize Unicode characters to standard LaTeX */
function normalizeUnicodeMath(node) {
  if (!node || !node.childNodes) return;
  
  node.childNodes.forEach(child => {
    if (child.nodeType === 3) { // Text node
      let text = child.textContent;
      
      // Normalize common Unicode characters to standard LaTeX
      text = text.replace(/｛/g, '{');  // Fullwidth left brace
      text = text.replace(/｝/g, '}');  // Fullwidth right brace
      text = text.replace(/（/g, '(');  // Fullwidth left parenthesis
      text = text.replace(/）/g, ')');  // Fullwidth right parenthesis
      text = text.replace(/×/g, '\\times ');  // Multiplication symbol
      text = text.replace(/÷/g, '\\div ');    // Division symbol
      
      // Fix common LaTeX syntax errors
      text = text.replace(/e_\(/g, 'e_{');  // Fix e_(i2} -> e_{i2}
      text = text.replace(/Ifrac/g, '\\frac');  // Fix Ifrac -> \frac
      text = text.replace(/Isum/g, '\\sum');    // Fix Isum -> \sum
      text = text.replace(/Ilog/g, '\\log');    // Fix Ilog -> \log
      
      child.textContent = text;
    } else if (child.nodeType === 1 && !["SCRIPT","STYLE","TEXTAREA","PRE","CODE","NOSCRIPT","INPUT","SELECT"].includes(child.tagName)) {
      normalizeUnicodeMath(child);
    }
  });
}

/* Check if element contains already-rendered math to avoid conflicts */
function hasRenderedMath(element) {
  if (!element || element.nodeType !== 1) return false;

  // Check for common math renderer classes and tags
  const mathSelectors = [
    '.katex', '.katex-mathml', '.katex-html',
    '.MathJax', '.MathJax_Display', '.MathJax_Preview',
    '.js-inline-math', '.js-display-math',
    'math-renderer', 'mjx-container', 'math'
  ];

  // Check if this element or any child contains rendered math
  return mathSelectors.some(selector => {
    return element.matches && element.matches(selector) || 
           element.querySelector && element.querySelector(selector);
  });
}

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
