<div align="center">

<img alt="WebTeX icon" src="public/icons/icon_128.png" width="96" height="96">

# WebTeX – Render LaTeX anywhere

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/your-id.svg?logo=googlechrome)](https://chrome.google.com/webstore/detail/your‑id)
[![License](https://img.shields.io/github/license/USERNAME/WebTeX-extension)](LICENSE)
[![Build](https://img.shields.io/github/actions/workflow/status/USERNAME/WebTeX-extension/build.yml?label=build)](https://github.com/USERNAME/WebTeX-extension/actions)

**WebTeX** is a lightweight Chrome/Edge/Brave extension that auto‑renders inline  
and block LaTeX on any website that doesn’t support it natively—Reddit, GitHub  
issues, Notion, Google Docs comments, …

</div>

---

## ✨ Features

|            | |
|------------|--------------------------------------------------------------|
| 🖋️ **KaTeX engine** | Fast, self‑contained (no CDN requests, works offline). |
| 🌓 **Dark‑mode aware** | Follows the page theme; math stays legible on dark backgrounds. |
| 🎚 **Per‑site toggle** | Enable rendering only where you need it. |
| 🔄 **Live DOM observer** | Renders math added by AJAX / infinite‑scroll without reloads. |
| ♿️ **No CSP breaks** | All scripts are external; extension passes strict MV3 CSP. |

<p align="center">
  <img src="docs/screenshot-light.png" width="380">
  <img src="docs/screenshot-dark.png"  width="380">
</p>

*(Add your own screenshots in **docs/** or replace these placeholders.)*

---

## 🚀 Install

* **Chrome / Edge / Brave** – grab it from the  
  <a href="https://chrome.google.com/webstore/detail/your‑id">
  <img alt="Chrome Web Store" height="20" src="https://img.shields.io/badge/Chrome%20Web Store-Install-blue?logo=googlechrome&logoColor=white"></a>

* **Firefox** – coming soon (MV3 parity landed in Firefox 128).

---

## 🛠 Development

```bash
git clone https://github.com/USERNAME/WebTeX-extension.git
cd WebTeX-extension
npm install
npm run build            # → build/ with manifest & bundles