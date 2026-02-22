# WebTeX – Render LaTeX Anywhere

A Chrome extension that renders LaTeX math expressions on any website that doesn't support them natively. This extension uses **KaTeX as the primary renderer** with a custom-built LaTeX renderer as a fallback, providing the best of both worlds: high-quality rendering and maximum compatibility.

## Features

- **Dual Renderer System**: Uses KaTeX for high-quality rendering with custom renderer fallback
- **No External Dependencies**: Self-contained fallback renderer that doesn't rely on CDNs
- **Inline and Display Math**: Supports both inline (`$...$`) and display (`$$...$$`) math modes
- **Wide LaTeX Support**: Handles Greek letters, math symbols, fractions, subscripts, superscripts, and more
- **Domain Control**: Enable/disable rendering on specific domains
- **Real-time Updates**: Automatically re-renders when page content changes
- **SPA Support**: Works with single-page applications and dynamic content
- **Automatic Fallback**: Seamlessly switches to custom renderer if KaTeX encounters issues

## Renderer Architecture

### Primary Renderer: KaTeX
- **High-quality rendering** with professional typography
- **Fast performance** with optimized algorithms
- **Wide LaTeX support** including complex mathematical expressions
- **Print-quality output** based on Donald Knuth's TeX

### Fallback Renderer: Custom LaTeX Renderer
- **Lightweight implementation** using Unicode symbols
- **Maximum compatibility** with any LaTeX syntax
- **No external dependencies** for reliability
- **Graceful degradation** when KaTeX fails

## Supported LaTeX Features

### Greek Letters
- `\alpha`, `\beta`, `\gamma`, `\delta`, `\epsilon`, `\pi`, `\sigma`, `\omega`
- `\Alpha`, `\Beta`, `\Gamma`, `\Delta`, etc.

### Math Symbols
- `\times`, `\div`, `\pm`, `\mp`
- `\leq`, `\geq`, `\neq`, `\approx`, `\equiv`
- `\infty`, `\partial`, `\nabla`
- `\sum`, `\prod`, `\int`, `\oint`

### Set Theory
- `\in`, `\notin`, `\ni`
- `\subset`, `\supset`, `\subseteq`, `\supseteq`
- `\cup`, `\cap`, `\emptyset`
- `\forall`, `\exists`

### Arrows
- `\rightarrow`, `\leftarrow`, `\leftrightarrow`
- `\Rightarrow`, `\Leftarrow`, `\Leftrightarrow`
- `\mapsto`, `\hookrightarrow`, `\hookleftarrow`

### Subscripts and Superscripts
- `x^2` → x<sup>2</sup>
- `y_i` → y<sub>i</sub>

### Fractions
- `\frac{a}{b}` → Rendered as stacked fraction

### Square Roots
- `\sqrt{x}` → √x with overline

## Installation

### From Source

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/webtex.git
   cd webtex
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `build` folder from this project

### Development

For development with auto-rebuild:
```bash
npm run watch
```

## Usage

1. **Enable on a Domain**: Click the WebTeX extension icon and add domains where you want LaTeX rendering enabled.

2. **Write LaTeX**: Use standard LaTeX syntax in your text:
   - Inline math: `$E = mc^2$`
   - Display math: `$$\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}$$`

3. **Automatic Rendering**: The extension will automatically detect and render LaTeX expressions on enabled domains.

4. **Automatic Fallback**: If KaTeX encounters rendering issues, it will automatically switch to the custom renderer.

## Examples

### Basic Math
```
The quadratic formula is: $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$

The Pythagorean theorem states: $$a^2 + b^2 = c^2$$
```

### Greek Letters and Symbols
```
The area of a circle is: $A = \pi r^2$

The sum of angles in a triangle: $$\alpha + \beta + \gamma = \pi$$
```

### Set Theory
```
For any set A: $$\forall x \in A, x \in A$$

The union of sets: $$A \cup B = \{x : x \in A \text{ or } x \in B\}$$
```

## Technical Details

### Architecture

The extension consists of:

- **Content Script** (`src/app.js`): Main rendering logic with dual renderer system
- **Custom LaTeX Renderer** (`src/latex-renderer.js`): Fallback renderer using Unicode symbols
- **Background Script** (`src/background.js`): Handles extension lifecycle and storage
- **Popup Interface** (`public/index.html`): Domain management UI

### Rendering Process

1. **Text Node Detection**: Uses `TreeWalker` to find text nodes containing LaTeX patterns
2. **Pattern Matching**: Identifies inline (`$...$`) and display (`$$...$$`) math
3. **Primary Rendering**: Attempts to render with KaTeX for high-quality output
4. **Fallback Rendering**: If KaTeX fails, automatically switches to custom renderer
5. **DOM Replacement**: Replaces text nodes with rendered HTML elements

### Performance

- **Optimized**: KaTeX provides fast, synchronous rendering
- **Lightweight Fallback**: Custom renderer uses minimal resources
- **Efficient**: Only processes text nodes that contain LaTeX patterns
- **Debounced**: DOM mutation observer with 200ms debounce to prevent excessive re-rendering

## Browser Compatibility

- Chrome 88+
- Edge 88+ (Chromium-based)
- Other Chromium-based browsers

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- **KaTeX**: High-quality math rendering library by Khan Academy
- Inspired by the need for LaTeX rendering on websites that don't support it
- Built with modern web technologies and Chrome extension APIs

## Changelog

### v2.1.1
- **Fixed build error**: Removed `size-plugin` dependency that broke after `npm audit fix --force` downgraded it to an incompatible version
- **Fixed duplicate declaration**: Removed duplicate `COUNTRY_TLDS` constant in `domain-utils.js` that caused a webpack parse error
- **Resolved all npm audit vulnerabilities**: Eliminated the `minimatch`/`glob` vulnerability chain (0 vulnerabilities)

### v2.1.0
- **Hybrid Renderer System**: KaTeX as primary renderer with custom renderer fallback
- **Enhanced Compatibility**: Automatic fallback when KaTeX encounters issues
- **Improved Performance**: Optimized rendering pipeline
- **Better Error Handling**: Graceful degradation between renderers
- **Suppressed KaTeX missing-metrics warnings**: filters `console.warn` messages for unsupported glyphs
- **Unicode regex lint compliance**: replaced `/[^\\x00-\\x7F]/g` with `/[^\\p{ASCII}]/gu`

### v2.0.0
- Replaced MathJax with custom LaTeX renderer
- Removed external dependencies
- Improved performance and reliability
- Added comprehensive LaTeX symbol support

### v1.2.2
- Initial release with MathJax integration 