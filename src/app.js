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
        
        // Skip currency patterns (e.g., "$100", "$USD", etc.)
        const beforeMatch = str.substring(Math.max(0, offset - 10), offset);
        const afterMatch = str.substring(offset + m.length, offset + m.length + 10);
        
        // Check if this looks like currency (number or currency code after $)
        const isCurrency = /[0-9]/.test(inner) || 
                          /^[A-Z]{3}$/.test(inner.trim()) || // Currency codes like USD, EUR
                          /^[0-9,]+(\.[0-9]{2})?$/.test(inner.trim()) || // Money amounts
                          /[元円₽€£¥₹₩₪₦₨₩₫₭₮₯₰₱₲₳₴₵₶₷₸₹₺₻₼₽₾₿]/.test(inner); // Currency symbols
        
        if (isCurrency) return m;
        
        const trimmed = inner.trim();
        
        // Smart math detection that excludes non-math text in other languages
        if (trimmed && !containsNonMathText(trimmed) && (
          /\\[a-zA-Z]/.test(trimmed) ||           // LaTeX commands
          /[a-zA-Z]_/.test(trimmed) ||            // Subscripts
          /[a-zA-Z]\^/.test(trimmed) ||           // Superscripts  
          /[{}\[\]()｛｝（）]/.test(trimmed) ||     // Braces/brackets (including Unicode)
          /[=+\-*/≤≥≠∞∂∇∆Ω∈∉⊂⊃∪∩∀∃∑∏∫√±]/.test(trimmed) || // Math symbols
          /[×÷]/.test(trimmed) ||                 // Additional math symbols
          /[|]/.test(trimmed) ||                  // Pipe character (used in math)
          // Only accept Latin letters/numbers in specific math contexts
          (isValidMathContent(trimmed))
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
      text = text.replace(/≤/g, '\\leq ');    // Less than or equal
      text = text.replace(/≥/g, '\\geq ');    // Greater than or equal
      text = text.replace(/≠/g, '\\neq ');    // Not equal
      text = text.replace(/±/g, '\\pm ');     // Plus-minus
      text = text.replace(/∞/g, '\\infty ');  // Infinity
      text = text.replace(/∑/g, '\\sum ');    // Sum
      text = text.replace(/∏/g, '\\prod ');   // Product
      text = text.replace(/∫/g, '\\int ');    // Integral
      text = text.replace(/√/g, '\\sqrt ');   // Square root
      text = text.replace(/∂/g, '\\partial '); // Partial derivative
      text = text.replace(/∇/g, '\\nabla ');  // Nabla
      text = text.replace(/∆/g, '\\Delta ');  // Delta
      text = text.replace(/Ω/g, '\\Omega ');  // Omega
      text = text.replace(/∈/g, '\\in ');     // Element of
      text = text.replace(/∉/g, '\\notin ');  // Not element of
      text = text.replace(/⊂/g, '\\subset '); // Subset
      text = text.replace(/⊃/g, '\\supset '); // Superset
      text = text.replace(/∪/g, '\\cup ');    // Union
      text = text.replace(/∩/g, '\\cap ');    // Intersection
      text = text.replace(/∀/g, '\\forall '); // For all
      text = text.replace(/∃/g, '\\exists '); // Exists
      
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

/* Smart math content detection ------------------------------------ */
function containsNonMathText(text) {
  // Check for non-Latin scripts that shouldn't be parsed as math
  const nonMathPatterns = [
    /[\u4e00-\u9fff]/,     // Chinese characters (CJK Unified Ideographs)
    /[\u3040-\u309f]/,     // Hiragana
    /[\u30a0-\u30ff]/,     // Katakana
    /[\uac00-\ud7af]/,     // Hangul (Korean)
    /[\u0600-\u06ff]/,     // Arabic
    /[\u0750-\u077f]/,     // Arabic Supplement
    /[\u08a0-\u08ff]/,     // Arabic Extended-A
    /[\u0400-\u04ff]/,     // Cyrillic
    /[\u0500-\u052f]/,     // Cyrillic Supplement
    /[\u2de0-\u2dff]/,     // Cyrillic Extended-A
    /[\ua640-\ua69f]/,     // Cyrillic Extended-B
    /[\u0e00-\u0e7f]/,     // Thai
    /[\u0b80-\u0bff]/,     // Tamil
    /[\u0c00-\u0c7f]/,     // Telugu
    /[\u0c80-\u0cff]/,     // Kannada
    /[\u0d00-\u0d7f]/,     // Malayalam
    /[\u0d80-\u0dff]/,     // Sinhala
    /[\u0e80-\u0eff]/,     // Lao
    /[\u0f00-\u0fff]/,     // Tibetan
    /[\u1000-\u109f]/,     // Myanmar
    /[\u1100-\u11ff]/,     // Hangul Jamo
    /[\u1200-\u137f]/,     // Ethiopic
    /[\u1380-\u139f]/,     // Ethiopic Supplement
    /[\u13a0-\u13ff]/,     // Cherokee
    /[\u1400-\u167f]/,     // Unified Canadian Aboriginal Syllabics
    /[\u1680-\u169f]/,     // Ogham
    /[\u16a0-\u16ff]/,     // Runic
    /[\u1700-\u171f]/,     // Tagalog
    /[\u1720-\u173f]/,     // Hanunoo
    /[\u1740-\u175f]/,     // Buhid
    /[\u1760-\u177f]/,     // Tagbanwa
    /[\u1780-\u17ff]/,     // Khmer
    /[\u1800-\u18af]/,     // Mongolian
    /[\u1900-\u194f]/,     // Limbu
    /[\u1950-\u197f]/,     // Tai Le
    /[\u1980-\u19df]/,     // New Tai Lue
    /[\u19e0-\u19ff]/,     // Khmer Symbols
    /[\u1a00-\u1a1f]/,     // Buginese
    /[\u1a20-\u1aaf]/,     // Tai Tham
    /[\u1b00-\u1b7f]/,     // Balinese
    /[\u1b80-\u1bbf]/,     // Sundanese
    /[\u1bc0-\u1bff]/,     // Batak
    /[\u1c00-\u1c4f]/,     // Lepcha
    /[\u1c50-\u1c7f]/,     // Ol Chiki
    /[\u1cc0-\u1ccf]/,     // Sundanese Supplement
    /[\u1cd0-\u1cff]/,     // Vedic Extensions
    /[\u1d00-\u1d7f]/,     // Phonetic Extensions
    /[\u1d80-\u1dbf]/,     // Phonetic Extensions Supplement
    /[\u1dc0-\u1dff]/,     // Combining Diacritical Marks Supplement
    /[\u1e00-\u1eff]/,     // Latin Extended Additional
    /[\u1f00-\u1fff]/,     // Greek Extended
    /[\u2000-\u206f]/,     // General Punctuation
    /[\u2070-\u209f]/,     // Superscripts and Subscripts
    /[\u20a0-\u20cf]/,     // Currency Symbols
    /[\u20d0-\u20ff]/,     // Combining Diacritical Marks for Symbols
    /[\u2100-\u214f]/,     // Letterlike Symbols
    /[\u2150-\u218f]/,     // Number Forms
    /[\u2190-\u21ff]/,     // Arrows
    /[\u2200-\u22ff]/,     // Mathematical Operators
    /[\u2300-\u23ff]/,     // Miscellaneous Technical
    /[\u2400-\u243f]/,     // Control Pictures
    /[\u2440-\u245f]/,     // Optical Character Recognition
    /[\u2460-\u24ff]/,     // Enclosed Alphanumerics
    /[\u2500-\u257f]/,     // Box Drawing
    /[\u2580-\u259f]/,     // Block Elements
    /[\u25a0-\u25ff]/,     // Geometric Shapes
    /[\u2600-\u26ff]/,     // Miscellaneous Symbols
    /[\u2700-\u27bf]/,     // Dingbats
    /[\u27c0-\u27ef]/,     // Miscellaneous Mathematical Symbols-A
    /[\u27f0-\u27ff]/,     // Supplemental Arrows-A
    /[\u2800-\u28ff]/,     // Braille Patterns
    /[\u2900-\u297f]/,     // Supplemental Arrows-B
    /[\u2980-\u29ff]/,     // Miscellaneous Mathematical Symbols-B
    /[\u2a00-\u2aff]/,     // Supplemental Mathematical Operators
    /[\u2b00-\u2bff]/,     // Miscellaneous Symbols and Arrows
    /[\u2c00-\u2c5f]/,     // Glagolitic
    /[\u2c60-\u2c7f]/,     // Latin Extended-C
    /[\u2c80-\u2cff]/,     // Coptic
    /[\u2d00-\u2d2f]/,     // Georgian Supplement
    /[\u2d30-\u2d7f]/,     // Tifinagh
    /[\u2d80-\u2ddf]/,     // Ethiopic Extended
    /[\u2de0-\u2dff]/,     // Cyrillic Extended-A
    /[\u2e00-\u2e7f]/,     // Supplemental Punctuation
    /[\u2e80-\u2eff]/,     // CJK Radicals Supplement
    /[\u2f00-\u2fdf]/,     // Kangxi Radicals
    /[\u2ff0-\u2fff]/,     // Ideographic Description Characters
    /[\u3000-\u303f]/,     // CJK Symbols and Punctuation
    /[\u3040-\u309f]/,     // Hiragana
    /[\u30a0-\u30ff]/,     // Katakana
    /[\u3100-\u312f]/,     // Bopomofo
    /[\u3130-\u318f]/,     // Hangul Compatibility Jamo
    /[\u3190-\u319f]/,     // Kanbun
    /[\u31a0-\u31bf]/,     // Bopomofo Extended
    /[\u31c0-\u31ef]/,     // CJK Strokes
    /[\u31f0-\u31ff]/,     // Katakana Phonetic Extensions
    /[\u3200-\u32ff]/,     // Enclosed CJK Letters and Months
    /[\u3300-\u33ff]/,     // CJK Compatibility
    /[\u3400-\u4dbf]/,     // CJK Unified Ideographs Extension A
    /[\u4dc0-\u4dff]/,     // Yijing Hexagram Symbols
    /[\u4e00-\u9fff]/,     // CJK Unified Ideographs
    /[\ua000-\ua48f]/,     // Yi Syllables
    /[\ua490-\ua4cf]/,     // Yi Radicals
    /[\ua4d0-\ua4ff]/,     // Lisu
    /[\ua500-\ua63f]/,     // Vai
    /[\ua640-\ua69f]/,     // Cyrillic Extended-B
    /[\ua6a0-\ua6ff]/,     // Bamum
    /[\ua700-\ua71f]/,     // Modifier Tone Letters
    /[\ua720-\ua7ff]/,     // Latin Extended-D
    /[\ua800-\ua82f]/,     // Syloti Nagri
    /[\ua830-\ua83f]/,     // Common Indic Number Forms
    /[\ua840-\ua87f]/,     // Phags-pa
    /[\ua880-\ua8df]/,     // Saurashtra
    /[\ua8e0-\ua8ff]/,     // Devanagari Extended
    /[\ua900-\ua92f]/,     // Kayah Li
    /[\ua930-\ua95f]/,     // Rejang
    /[\ua960-\ua97f]/,     // Hangul Jamo Extended-A
    /[\ua980-\ua9df]/,     // Javanese
    /[\ua9e0-\ua9ff]/,     // Myanmar Extended-B
    /[\uaa00-\uaa5f]/,     // Cham
    /[\uaa60-\uaa7f]/,     // Myanmar Extended-A
    /[\uaa80-\uaadf]/,     // Tai Viet
    /[\uaae0-\uaaff]/,     // Meetei Mayek Extensions
    /[\uab00-\uab2f]/,     // Ethiopic Extended-A
    /[\uab30-\uab6f]/,     // Latin Extended-E
    /[\uab70-\uabbf]/,     // Cherokee Supplement
    /[\uabc0-\uabff]/,     // Meetei Mayek
    /[\uac00-\ud7af]/,     // Hangul Syllables
    /[\ud7b0-\ud7ff]/,     // Hangul Jamo Extended-B
    /[\ud800-\udb7f]/,     // High Surrogates
    /[\udb80-\udbff]/,     // High Private Use Surrogates
    /[\udc00-\udfff]/,     // Low Surrogates
    /[\ue000-\uf8ff]/,     // Private Use Area
    /[\uf900-\ufaff]/,     // CJK Compatibility Ideographs
    /[\ufb00-\ufb4f]/,     // Alphabetic Presentation Forms
    /[\ufb50-\ufdff]/,     // Arabic Presentation Forms-A
    /[\ufe00-\ufe0f]/,     // Variation Selectors
    /[\ufe10-\ufe1f]/,     // Vertical Forms
    /[\ufe20-\ufe2f]/,     // Combining Half Marks
    /[\ufe30-\ufe4f]/,     // CJK Compatibility Forms
    /[\ufe50-\ufe6f]/,     // Small Form Variants
    /[\ufe70-\ufeff]/,     // Arabic Presentation Forms-B
    /[\uff00-\uffef]/,     // Halfwidth and Fullwidth Forms
    /[\ufff0-\uffff]/      // Specials
  ];
  
  return nonMathPatterns.some(pattern => pattern.test(text));
}

function isValidMathContent(text) {
  // Check if the content looks like valid math (Latin letters/numbers with math context)
  const mathPatterns = [
    /^[a-zA-Z0-9\s+\-*/=(){}[\]_^.,;:!?|&%#@~`'"]+$/,  // Basic math characters
    /\\[a-zA-Z]/,  // LaTeX commands
    /[a-zA-Z]_/,   // Subscripts
    /[a-zA-Z]\^/,  // Superscripts
    /[0-9]/,       // Numbers
    /[+\-*/=]/,    // Basic operators
    /[(){}[\]]/,   // Parentheses and brackets
    /[=<>≤≥≠]/,    // Comparison operators
    /[∑∏∫√∞∂∇∆Ω∈∉⊂⊃∪∩∀∃]/,  // Advanced math symbols
    /[×÷±]/,       // Additional operators
    /[|]/,         // Pipe character
    /[αβγδεζηθικλμνξοπρστυφχψω]/,  // Greek letters
    /[ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ]/   // Greek letters (uppercase)
  ];
  
  // Must contain at least one math pattern and be primarily Latin-based
  const hasMathPattern = mathPatterns.some(pattern => pattern.test(text));
  const isLatinBased = /^[a-zA-Z0-9\s+\-*/=(){}[\]_^.,;:!?|&%#@~`'"]+$/.test(text) || 
                       /\\[a-zA-Z]/.test(text) || 
                       /[αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ]/.test(text);
  
  return hasMathPattern && isLatinBased;
}

/* Simple debounce helper ------------------------------------------- */
function debounce (fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
