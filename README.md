<div align="center">

<img alt="WebTeX icon" src="public/icons/icon_128.png" width="96" height="96">

# WebTeX – Render LaTeX anywhere

[![GitHub release](https://img.shields.io/github/v/release/Wais-A/WebTex?logo=github)](https://github.com/Wais-A/WebTex/releases)
<!-- Uncomment after publishing →
[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/__________.svg?logo=googlechrome)](https://chrome.google.com/webstore/detail/__________)
-->
[![License](https://img.shields.io/github/license/Wais-A/WebTex)](LICENSE)
[![Build](https://img.shields.io/github/actions/workflow/status/Wais-A/WebTex/build.yml?label=build)](https://github.com/Wais-A/WebTex/actions)

**WebTeX** is a lightweight Chrome/Edge/Brave extension that auto‑renders inline  
and block LaTeX on pages that don’t support it natively—Reddit, GitHub issues,
Notion, Google Docs comments, NotebookLM, and more.

</div>

---

## ✨ Features

|            | |
|------------|--------------------------------------------------------------|
| 🖋️ **KaTeX engine** | Fast & offline‑ready—bundled fonts, no CDN hits. |
| 🌓 **Dark‑mode aware** | Respects system/theme changes automatically. |
| 🎚 **Per‑site toggle** | Enable rendering only where you need it. |
| 🔄 **Live DOM observer** | Renders math added by AJAX / infinite‑scroll. |
| 🔒 **Strict MV3 CSP** | No inline scripts; passes Chrome store review. |

<p align="center">
  <img src="docs/screenshot-light.png" width="380">
  <img src="docs/screenshot-dark.png"  width="380">
</p>

*(Replace the screenshots above with your own images in **docs/**.)*

---

## 🚀 Install

| Browser | Link |
|---------|------|
| **Chrome / Edge / Brave** | *(coming soon – publish to store then paste link)* |
| **Developer build** | Load the unpacked `build/` folder (see below). |

---

## 🛠 Development

```bash
git clone https://github.com/Wais-A/WebTex.git
cd WebTex
npm install
npm run build        # outputs production bundle to build/