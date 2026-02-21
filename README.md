# Zotero Spotlight

[![zotero target version](https://img.shields.io/badge/Zotero-7%2F8-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support-orange?style=flat-square&logo=buy-me-a-coffee)](https://www.buymeacoffee.com/royshare)

**Intent-first navigation for Zotero.**

Zotero Spotlight adds a **command-palette–style switcher** to Zotero.  
Press one shortcut inside Zotero and jump to the paper you want.

![intro](https://github.com/user-attachments/assets/72a63bf3-0d26-46f6-b278-cd2943c73a4d)

---

## Why

Zotero search, by default, searches only the current collection/sub-list.

Spotlight is different:

- **Always starts from intent**, not where you are in the UI
- Optimized for **fast switching**, not browsing

> You think of a paper → you’re there.

## Zotero Spotlight started as a personal tool. I wanted a fast, keyboard-first way to jump between papers anywhere inside Zotero, but couldn’t find an existing plugin that offered this experience. I built it for my own workflow and decided to open-source it so others can use it, adapt it, or help improve it.

## What it does

- Global shortcut (default: `Cmd+P` on macOS, `Ctrl+P` on Windows/Linux) opens a lightweight command palette.
- Works inside the PDF reader, note editor, and main window.
- Search tokens/filters: `type:`, `tag:`, and `year:` for faster narrowing.
- Rich result rows with metadata preview (authors, year, tags, abstract snippet) and badges (`PDF`, `NOTE`, `ITEM`, `GROUP`, `TAB`).
- Ranking boosts for recency, frequency, and active library scope.
- Smart recents and per-window search history (including one-click removal from history).
- Command mode: type `>` in the palette to run actions (`Copy Citation`, `Copy Bibliography`, `New Note`, `Open Collection`, `Add Note + Open PDF`) based on current context.
- Keyboard-first:
  - Type to filter
  - ↑ ↓ to select
  - Enter to open
  - `Cmd/Ctrl+Enter` to open in alternate window mode
  - `Shift+Enter` to reveal selected item in library
  - Esc to close

---

## Roadmap

Zotero Spotlight aims to become a **universal command surface inside Zotero** — available everywhere, fast enough to feel invisible.

### Phase 1 — Quick Open Foundation (current)

- [x] Global palette in all Zotero windows (main window + PDF reader + note editor)
- [x] Fast fuzzy search over items and attachments
- [x] Open PDFs, notes,or jump to already-open reader tabs

### Phase 2 — Actions & Commands

- [x] Command registry (e.g. _New note_, _Copy citation_, _Open collection_)
- [x] Context-aware actions (item-focused vs reader-focused)
- [x] Discoverable commands with keyboard shortcuts

### Phase 3 — Rich Results & Filters

- [x] Search tokens / filters (e.g. `type:`, `tag:`, `year:`)
- [x] Result badges (PDF, Note, Group, Tab)
- [x] Improved ranking (recent, frequency, library scope)

### Phase 4 — Productivity Layer

- [x] Quick actions on results (e.g. Enter vs modifier keys)
- [x] Lightweight multi-step workflows  
       _(select item → add note → open PDF)_
- [x] Smart recents and search history (per window)

### Phase 5 — UI Polish

- [x] Styling aligned with Zotero light / dark themes
- [x] Rich preview rows (authors, year, tags, abstract snippet)
- [x] Subtle animations with minimal distraction

---

## Status

- Version: v0.1 (experimental)
- Developed for Zotero 8.x, should work with Zotero 7.x.
- MacOS tested.
- Windows / Linux expected to work but not fully tested.

Feedback welcome.
