# Zotero Spotlight Roadmap

Zotero Spotlight aims to become a universal command surface inside Zotero: available everywhere, fast enough to feel invisible, and extensible enough to support both built-in and plugin-defined actions.

## Phase 1 — Quick Open Foundation

- [x] Global palette in all Zotero windows (main window + PDF reader + note editor)
- [x] Fast fuzzy search over items and attachments
- [x] Open PDFs, notes, or jump to already-open reader tabs

## Phase 2 — Actions & Commands

- [x] Command registry (e.g. New Note, Copy Citation, Open Collection)
- [x] Context-aware actions (item-focused vs reader-focused)
- [x] Discoverable commands with keyboard shortcuts

## Phase 3 — Rich Results & Filters

- [x] Search tokens / filters (e.g. `type:`, `tag:`, `year:`)
- [ ] Better UX for filter discovery and usage
- [x] Result badges (PDF, Note, Group, Tab)
- [x] Improved ranking (recent, frequency, library scope)

## Phase 4 — Productivity Layer

- [x] Quick actions on results (e.g. Enter vs modifier keys)
- [x] Lightweight multi-step workflows
  - select item -> add note -> open PDF
- [x] Smart recents and search history (per window)

## Phase 5 — UI Polish

- [x] Styling aligned with Zotero light / dark themes
- [x] Rich preview rows (authors, year, tags, abstract snippet)
- [x] Subtle animations with minimal distraction

## Phase 6 — Right-Side Preview Panel

- [x] Add a right-side preview panel for the currently selected result
- [x] Show enough context to make Spotlight feel faster and smarter during review

## Phase 7 — Command Workflows

- [x] Expand command mode into reusable workflows for common research tasks
- [x] Examples: `>literature note`, `>extract highlights`

## Phase 8 — Annotation Search Improvements

- [x] Improve annotation search relevance, matching, and navigation
- [x] Optimize for annotation-heavy research workflows

## Phase 9 — Command API for Other Plugins

- [x] Expose a command API so other Zotero plugins can register Spotlight actions
- [x] Grow Spotlight into a shared command surface for the wider plugin ecosystem

## Phase 10 — LLM-Assisted Commands

- [x] Provider abstraction with OpenAI-compatible streaming (covers OpenAI, Ollama, Azure OpenAI)
- [x] `>ask [question]` — stream an answer about the active paper into the preview panel
- [x] `>summarize` — stream a 3-5 sentence summary of abstract + annotations
- [x] `>draft note` — draft a structured reading note; save-as-note action
- [x] Streaming output in preview panel with "Thinking…" indicator, Save and Copy actions
- [x] Escape cancels in-flight stream via AbortController
- [x] Graceful error states (no API key, network failure)
- [x] AI preferences: enable toggle, provider, model, API key, base URL

## Future Directions

- `>explain [term]` — explain a technical concept in context of this paper
- `>suggest tags` — suggest Zotero tags with one-click apply
- `>find related` — semantic similarity search over local library
- `>compare` — compare two selected items side-by-side
- Semantic search mode (natural language queries without `>` prefix)
- Better onboarding for filters and advanced search syntax
- Deeper integrations with other Zotero plugins through the command API
