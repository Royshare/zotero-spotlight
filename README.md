# Zotero Spotlight

[![zotero target version](https://img.shields.io/badge/Zotero-7%2F8%2F9%2F10-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support-orange?style=flat-square&logo=buy-me-a-coffee)](https://www.buymeacoffee.com/royshare)

**Intent-first navigation for Zotero.**

Zotero Spotlight adds a **command-palette–style switcher** to Zotero.  
Press one shortcut inside Zotero and jump to the paper you want.

[review](https://github.com/user-attachments/assets/ced3c2ae-31a2-40e5-9418-2d29553bca1e)

---

## Why

Zotero search, by default, searches only the current collection/sub-list.

Spotlight is different:

- **Always starts from intent**, not where you are in the UI
- Optimized for **fast switching**, not browsing

> You think of a paper → you’re there.

> **Zotero Spotlight started as a personal tool. I wanted a fast, keyboard-first way to jump between papers anywhere inside Zotero, but couldn’t find an existing plugin that offered this experience. I built it for my own workflow and decided to open-source it so others can use it, adapt it, or help improve it.**

## Quick Start

Spotlight works from the main Zotero window, the reader, and the note editor.
The default shortcuts are:

| Action                  | macOS         | Windows / Linux |
| ----------------------- | ------------- | --------------- |
| Open library search     | `Cmd+P`       | `Ctrl+P`        |
| Open command mode       | `Cmd+Shift+P` | `Ctrl+Shift+P`  |
| Open the shortcut guide | `Cmd+/`       | `Ctrl+/`        |

Inside Spotlight:

- Use `Up` / `Down` to select a result and `Enter` to open it.
- Press `Tab` to open and search the selected result's contextual actions.
- Press `Ctrl+1` through `Ctrl+9` to open a numbered result immediately.
- Press `Cmd+Enter` on macOS or `Ctrl+Enter` elsewhere to reveal an item result in the Zotero library.
- Press `Shift+Enter` for an item's alternate open behavior, such as opening a reader or note in a separate window.
- Press `Escape` to return from actions or close Spotlight.

Search and command shortcuts can be assigned independently in Preferences to
`Cmd/Ctrl+P`, `Cmd/Ctrl+Shift+P`, `Cmd/Ctrl+K`, or `Cmd/Ctrl+O`. Command mode can
also be disabled.

## Features

### 1. Library-Wide Search and Navigation

- Fuzzy-search items, notes, PDFs, EPUBs, snapshots, and annotations across personal and group libraries.
- Optionally restrict a normal search to the currently selected collection, including its subcollections.
- Type `:col query` to enter a separate collection-only mode, search collection paths and group libraries, and switch the Zotero collection tree with `Enter`.
- Use `>tabs` to search and switch across open Zotero tabs.
- Start from a smart recent view containing recent searches, open readers, recently closed readers, and recently activated items.
- Rank results using text relevance, active-library scope, recency, and usage frequency.
- Identify result types, group-library content, open tabs, reading-queue items, and the best attachment from compact badges.

### 2. Search Syntax

| Syntax                                                        | Purpose                                     | Example                   |
| ------------------------------------------------------------- | ------------------------------------------- | ------------------------- |
| Plain text                                                    | Fuzzy-search item metadata                  | `attention transformer`   |
| `:pdf`, `:epub`, `:snapshot`, `:note`, `:item`, `:annotation` | Restrict result type                        | `:pdf neural`             |
| `#tag`                                                        | Require a Zotero tag                        | `#methods regression`     |
| `y:`                                                          | Match an exact year, range, or comparison   | `y:2020-2024`, `y:>=2022` |
| `@query`                                                      | Search annotations only                     | `@limitations`            |
| `=phrase`                                                     | Search indexed PDF text for an exact phrase | `=attention mechanism`    |
| `:queue`                                                      | Show papers in the synced Reading Queue     | `:queue :pdf y:>=2024`    |
| `:col query`                                                  | Search collections and group libraries only | `:col machine learning`   |
| `>query`                                                      | Search commands                             | `>copy citation`          |
| `>tabs`                                                       | List open Zotero tabs                       | `>tabs`                   |

Normal item filters can be combined. A clickable hint bar exposes the available
syntax, while inline autocomplete completes colon and year filters. Collection
mode stays separate so collection destinations are never mixed into paper
results.

### 3. Preview and Contextual Actions

- Inspect authors, year, tags, abstract snippets, attachment details, note content, and annotation context before opening a result.
- Jump annotation matches directly to their location in the PDF.
- Press `Tab` or right-click to open a searchable action panel for the selected result.
- Open the best attachment or parent item, reveal an item in the library, or show an attachment in Finder, Explorer, or the system file manager.
- Copy citations, bibliographies, note text, or annotation content without leaving Spotlight.
- Open supported attachments and notes in the current tab or a separate window.

### 4. Commands and Workflows

- Use `>` for context-aware commands such as `New Note`, `Copy Citation`, `Copy Bibliography`, `Open Collection`, and `Show Attachment in Finder/Explorer`.
- Run `>add note + open best attachment` to create a child note and immediately open the paper's preferred PDF, EPUB, or snapshot.
- Use `>literature note` to create a structured literature note or `>extract highlights` to create a note from PDF, EPUB, or snapshot annotations.
- Run commands from the main window, reader, or note editor; availability adapts to the active item and window.
- Let other Zotero plugins register and unregister commands through Spotlight's command API.

### 5. Synced Reading Queue

- Add a paper from its `Tab` action panel or with `> Add to Reading Queue`.
- Find queued papers with `:queue`, combined with text, type, tag, or year filters when needed.
- Mark a paper as handled with `> Remove from Reading Queue` or the corresponding contextual action.
- Queue state is stored as a normal `📚 Reading Queue` Zotero tag, so it syncs across devices and remains portable outside Spotlight.

### 6. Preferences and Shortcut Reference

- Configure independent search and command shortcuts with automatic conflict swapping.
- Set the result limit and Spotlight window width and height.
- Enable or disable annotation search, restoration of the previous query, and the filter hint bar.
- Reset all Spotlight preferences to their defaults in one click.
- Open the built-in shortcut guide with `Cmd/Ctrl+/` to see Spotlight controls, frequent Zotero shortcuts, available command shortcuts, and shortcuts contributed by other plugins or the active window.

### 7. Default Search Scope

- Choose which libraries (My Library and group libraries) are searched by default with a simple checklist in Preferences → Spotlight; unchecked libraries are excluded from default results.
- Optionally keep deselected libraries searchable at a lower rank instead of excluding them.
- The search command always has full authority over the defaults: `:col query` searches every collection in every library regardless of the checklist, and the existing "search current collection" option still applies when active.
- Sort result types into strict tiers (`1` = highest): any type ranked higher always appears above one ranked lower; unranked types fall back to match quality. Valid keys: `item`, `note`, `pdf`, `epub`, `snapshot`, `annotation`, `link`.
- An empty library checklist means no restriction, so a fresh install never hides anything.
- All settings save immediately; an Advanced drawer exposes the raw JSON (with a validity indicator) for hand-editing or sharing configurations.

## Contributing

Contributions are welcome.

- Read `CONTRIBUTING.md` for setup, workflow, and pull request guidance.
- Run `npm run lint:fix` before opening a pull request.

---

## Roadmap

The implementation roadmap and phase-by-phase development notes live in `doc/roadmap.md`.

---

## Status

- Version: v0.6.0 (experimental)
- Supports Zotero 7 through Zotero 10.
- Zotero 10.0 tested on macOS.
- Windows / Linux expected to work but not fully tested.

Feedback welcome.
