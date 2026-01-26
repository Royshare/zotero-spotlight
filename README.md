# Zotero Spotlight

[![zotero target version](https://img.shields.io/badge/Zotero-7%2F8-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)

**Intent-first navigation for Zotero.**

Zotero Spotlight adds a **command-palette–style switcher** to Zotero.  
Press one shortcut inside Zotero and jump to the paper you want.

![Spotlight demo](./assets/quick-open.gif)

---

## Why

Zotero search, by default, searches only the current collection/sub-list.

Spotlight is different:

- **Always starts from intent**, not where you are in the UI
- Optimized for **fast switching**, not browsing

> You think of a paper → you’re there.

---

## What it does

- Global shortcut (default: `Cmd+P` on macOS, `Ctrl+P` on Windows/Linux) opens a lightweight command palette.
- Works inside the PDF reader, note editor, and main window.
- Keyboard-first:
  - Type to filter
  - ↑ ↓ to select
  - Enter to open
  - Esc to close

---

## Roadmap

Zotero Spotlight aims to become a **universal command surface inside Zotero** — available everywhere, fast enough to feel invisible.

### Phase 1 — Quick Open Foundation (current)
- [x] Global palette in all Zotero windows (main window + PDF reader + note editor)
- [x] Fast fuzzy search over items and attachments
- [x] Open PDFs, notes,or jump to already-open reader tabs

### Phase 2 — Actions & Commands
- Command registry (e.g. *New note*, *Copy citation*, *Open collection*)
- Context-aware actions (item-focused vs reader-focused)
- Discoverable commands with keyboard shortcuts

### Phase 3 — Rich Results & Filters
- Search tokens / filters (e.g. `type:`, `tag:`, `year:`)
- Result badges (PDF, Note, Collection)
- Improved ranking (recent, frequency, library scope)

### Phase 4 — Productivity Layer
- Quick actions on results (e.g. Enter vs modifier keys)
- Lightweight multi-step workflows  
  *(select item → add note → open PDF)*
- Smart recents and search history (per window)

### Phase 5 — UI Polish
- [x] Styling aligned with Zotero light / dark themes
- Rich preview rows (authors, year, tags, abstract snippet)
- Subtle animations with minimal distraction

---

## Status

- Version: v0.1 (experimental)
- Zotero 8.x
- macOS / Windows (not fully tested)

Feedback welcome.
