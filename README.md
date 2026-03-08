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

> **Zotero Spotlight started as a personal tool. I wanted a fast, keyboard-first way to jump between papers anywhere inside Zotero, but couldn’t find an existing plugin that offered this experience. I built it for my own workflow and decided to open-source it so others can use it, adapt it, or help improve it.**

## Features

- Open Spotlight with one shortcut: `Cmd+P` on macOS, `Ctrl+P` on Windows/Linux.
- Works in the main Zotero window, PDF reader, and note editor.

### 1. Search, Switch, Filter

- Search across your library with fuzzy matching instead of being limited to the current collection.
- Switch between items, notes, PDFs, annotations, and open tabs from one place.
- Narrow results with `type:`, `tag:`, and `year:` filters, including combinations like `type:pdf year:2024`, or use `@query` to search annotations directly.
- Use richer result rows and press `Right Arrow` on a selected result to open preview details and contextual actions.
- Jump annotation results directly to the matching location in the PDF, with improved annotation-focused search relevance.
- Get ranking boosts from recency, frequency, library scope, and recent-search history per window.

### 2. Commands and Workflows

- Use `>` to enter command mode for built-in actions like `New Note`, `Copy Citation`, `Copy Bibliography`, `Open Collection`, and `Show PDF in Finder/Explorer`.
- Run reusable workflows like `>literature note` and `>extract highlights` for common research tasks.
- Use `>tabs` to search and switch across currently open Zotero tabs.
- Trigger context-aware commands based on the current Zotero window and selected item.
- Let other Zotero plugins register commands into Spotlight through the command API.

### 3. Future Direction: AI Commands

- Spotlight is designed to grow toward intent-driven AI commands, closer to a Zotero-native Raycast-style command surface.
- Likely future directions include paper summarization, annotation synthesis, note drafting, and paper-to-note comparison workflows.
- This layer is planned, not shipped yet.

## Contributing

Contributions are welcome.

- Read `CONTRIBUTING.md` for setup, workflow, and pull request guidance.
- Run `npm run lint:fix` before opening a pull request.

---

## Roadmap

The implementation roadmap and phase-by-phase development notes live in `doc/roadmap.md`.

---

## Status

- Version: v0.4 (experimental)
- Developed for Zotero 8.x, should work with Zotero 7.x.
- MacOS tested.
- Windows / Linux expected to work but not fully tested.

Feedback welcome.
