import type { ActionHandler, OpenIntent } from "./actions";
import { CommandRegistry } from "./commands";
import type { CommandResult } from "./commands";
import type { QuickOpenResult, AnnotationResult } from "./search";
import type { SearchService } from "./search";
import {
  getItemAbstractSnippetSafe,
  getItemAuthorsSafe,
  getItemSubtitleSafe,
  getItemTagsSafe,
  getItemTitleSafe,
  getItemYearSafe,
  isPDFAttachment,
} from "./itemMetadata";
import { getPref } from "../../utils/prefs";

const HTML_NS = "http://www.w3.org/1999/xhtml";

type HistoryResult = {
  kind: "history";
  query: string;
  title: string;
  subtitle: string;
  score: number;
};

export class PaletteUI {
  private win: Window;
  private doc: Document;
  private root: HTMLDivElement;
  private input: HTMLInputElement;
  private list: HTMLDivElement;
  private collectionBar: HTMLElement | null = null;
  private collectionCheckbox: HTMLInputElement | null = null;
  private styleElement: HTMLStyleElement;
  private searchService: SearchService;
  private commandRegistry: CommandRegistry;
  private actionHandler: ActionHandler;
  private results: Array<QuickOpenResult | CommandResult | HistoryResult> = [];
  private selectedIndex = 0;
  private open = false;
  private searchToken = 0;
  private outsideClickHandler: (event: MouseEvent) => void;
  private currentQuery = "";
  private sectionHeader = "";
  private displayMode: "recent" | "search" | "command" = "recent";
  private lastOpenReaderIDs = new Set<number>();
  private recentClosedAttachmentIDs: number[] = [];
  private recentActivatedItemIDs: number[] = [];
  private recentSearches: string[] = [];
  private _activeCollection: any = null;
  private _sectionCollapsed: Record<string, boolean> = {};

  constructor(
    win: Window,
    searchService: SearchService,
    actionHandler: ActionHandler,
  ) {
    this.win = win;
    this.doc = win.document;
    this.searchService = searchService;
    this.commandRegistry = new CommandRegistry();
    this.actionHandler = actionHandler;
    this.outsideClickHandler = (event: MouseEvent) => {
      if (!this.open) {
        return;
      }
      const target = event.target as Node | null;
      if (target && this.root.contains(target)) {
        return;
      }
      this.hide();
    };
    this.styleElement = this.createStyleElement();
    this.root = this.createRoot();
    this.input = this.root.querySelector(
      "#zotero-spotlight-input",
    ) as HTMLInputElement;
    this.list = this.root.querySelector(
      "#zotero-spotlight-list",
    ) as HTMLDivElement;
    this.collectionBar = this.root.querySelector(
      "#zotero-spotlight-collection-bar",
    );
    this.collectionCheckbox = this.root.querySelector(
      "#zotero-spotlight-collection-filter",
    ) as HTMLInputElement | null;
    this.collectionCheckbox?.addEventListener("change", () => {
      void this.updateResults(this.input.value);
    });
    this.bindEvents();
    this.doc.addEventListener("mousedown", this.outsideClickHandler, true);
    this.hide();
  }

  toggle(): void {
    if (this.open) {
      this.hide();
    } else {
      this.show();
    }
  }

  show(): void {
    this.open = true;
    this.root.classList.remove("is-animate");
    this.root.style.display = "block";
    this.root.classList.add("is-animate");
    // Apply dimensions from preferences on every open
    if (this.list) {
      this.list.style.maxHeight = getWindowHeight() + "px";
    }
    if (this.root) {
      this.root.style.width = getWindowWidth() + "px";
    }
    this.input.value = "";
    this.results = [];
    this.selectedIndex = 0;
    // Detect active collection for folder-scoped search
    this._activeCollection = null;
    try {
      const pane =
        (this.win as any).ZoteroPane ||
        Zotero.getMainWindow()?.ZoteroPane ||
        (Zotero.getActiveZoteroPane?.() as any);
      const col = pane?.getSelectedCollection?.();
      if (col) {
        this._activeCollection = col;
        const label = this.root.querySelector(
          "#zotero-spotlight-collection-label",
        );
        if (label) {
          label.textContent = `Search in "${col.name}" only (including subcollections)`;
        }
        if (this.collectionBar) this.collectionBar.style.display = "flex";
      } else {
        if (this.collectionBar) this.collectionBar.style.display = "none";
        if (this.collectionCheckbox) this.collectionCheckbox.checked = false;
      }
    } catch (_) {
      if (this.collectionBar) this.collectionBar.style.display = "none";
    }
    this.renderResults();
    void this.updateResults("");
    this.input.focus();
  }

  hide(): void {
    this.open = false;
    this.root.style.display = "none";
  }

  destroy(): void {
    this.doc.removeEventListener("mousedown", this.outsideClickHandler, true);
    this.searchService.destroy();
    this.root.remove();
    this.styleElement.remove();
  }

  private bindEvents(): void {
    this.input.addEventListener("input", () => {
      void this.updateResults(this.input.value);
    });
    this.input.addEventListener("keydown", (event: KeyboardEvent) => {
      if (!this.open) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        this.hide();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.moveSelection(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        this.moveSelection(-1);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const intent: OpenIntent = event.shiftKey
          ? "reveal"
          : event.metaKey || event.ctrlKey
            ? "alternate"
            : "default";
        void this.activateSelection(intent);
      }
    });
  }

  private async updateResults(query: string): Promise<void> {
    const token = (this.searchToken += 1);
    const parsedQuery = this.parseQuery(query);
    this.currentQuery = parsedQuery.query;
    const resultsLimit = this.getResultsLimit();
    if (!parsedQuery.isCommandMode && !this.currentQuery) {
      this.results = this.buildRecentResults();
      this.sectionHeader = "Recent";
      this.displayMode = "recent";
      this.selectedIndex = 0;
      this.renderResults();
      return;
    }
    const collectionFilter =
      this.collectionCheckbox?.checked && this._activeCollection
        ? this._activeCollection
        : null;
    const results = parsedQuery.isCommandMode
      ? await this.commandRegistry.search(
          this.currentQuery,
          this.win,
          resultsLimit,
        )
      : await this.searchService.search(
          this.currentQuery,
          this.win,
          resultsLimit * 2,
          collectionFilter,
        );
    if (token !== this.searchToken) {
      return;
    }
    this.results = results;
    this.sectionHeader = parsedQuery.isCommandMode ? "Commands" : "Results";
    this.displayMode = parsedQuery.isCommandMode ? "command" : "search";
    this.selectedIndex = 0;
    this.renderResults();
  }

  private moveSelection(delta: number): void {
    if (!this.results.length) {
      return;
    }
    const maxIndex = this.results.length - 1;
    const nextIndex = Math.max(
      0,
      Math.min(maxIndex, this.selectedIndex + delta),
    );
    if (nextIndex === this.selectedIndex) {
      return;
    }
    this.selectedIndex = nextIndex;
    this.updateSelectionState();
  }

  private async activateSelection(intent: OpenIntent): Promise<void> {
    const result = this.results[this.selectedIndex];
    if (!result) {
      return;
    }
    if (result.kind === "history") {
      this.input.value = result.query;
      await this.updateResults(result.query);
      return;
    }
    if (result.kind === "command") {
      const executed = await this.commandRegistry.run(
        result.commandId,
        this.win,
      );
      if (executed) {
        this.hide();
      }
      return;
    }
    if (result.kind === "annotation") {
      await this.openAnnotation(result as AnnotationResult, intent);
      this.hide();
      return;
    }
    await this.actionHandler.openResult(result, intent);
    this.pushRecentActivated(result.id);
    if (intent !== "reveal") {
      this.searchService.recordOpen(result.id);
    }
    this.pushRecentSearch(this.currentQuery);
    this.hide();
  }

  private async openAnnotation(
    result: AnnotationResult,
    alternate: OpenIntent,
  ): Promise<void> {
    const attachmentID = result.attachmentID;
    if (typeof attachmentID !== "number") return;
    await (Zotero as any).Reader.open(attachmentID, {
      openInWindow: alternate === "alternate",
    });
    await new Promise((resolve) => setTimeout(resolve, 600));
    const reader = (Zotero as any).Reader._readers?.find(
      (r: any) => r._item?.id === attachmentID,
    );
    if (reader && result.annoKey) {
      await reader.navigate({ annotationID: result.annoKey });
    }
  }

  private renderResults(): void {
    this.list.textContent = "";
    const openTabItemIDs = new Set(
      this.getOpenTabEntries().map((entry) => entry.itemID),
    );
    if (this.sectionHeader) {
      const header = this.createElement("div", "spotlight-section");
      header.textContent = this.sectionHeader;
      this.list.appendChild(header);
    }
    if (!this.results.length) {
      const empty = this.createElement("div", "spotlight-empty");
      empty.textContent =
        this.displayMode === "recent"
          ? "No recent items"
          : this.displayMode === "command"
            ? "No commands"
            : "No results";
      this.list.appendChild(empty);
      return;
    }

    // Category counts
    const itemCount = this.results.filter((r) => r.kind !== "annotation").length;
    const annoCount = this.results.filter((r) => r.kind === "annotation").length;
    let lastSectionKind: string | null = null;

    this.results.forEach((result, index) => {
      // Insert section header when category changes
      const sectionKind = result.kind === "annotation" ? "annotation" : "item";
      if (sectionKind !== lastSectionKind && this.displayMode === "search") {
        const count = sectionKind === "annotation" ? annoCount : itemCount;
        const label = sectionKind === "annotation" ? "Annotations" : "Items";
        const isCollapsed = this._sectionCollapsed[sectionKind] || false;
        const header = this.createElement(
          "div",
          "spotlight-section spotlight-section-toggle",
        );
        (header as HTMLElement).style.cursor = "pointer";
        (header as HTMLElement).style.userSelect = "none";
        header.textContent = `${label} (${count}) ${isCollapsed ? "▸" : "▾"}`;
        header.addEventListener("click", () => {
          this._sectionCollapsed[sectionKind] =
            !this._sectionCollapsed[sectionKind];
          this.renderResults();
        });
        this.list.appendChild(header);
        lastSectionKind = sectionKind;
      }

      // Skip collapsed section items
      if (this._sectionCollapsed[sectionKind]) return;

      const row = this.createElement("div", "spotlight-result");
      if (index === this.selectedIndex) {
        row.classList.add("is-selected");
      }
      const icon = this.createElement("span", "spotlight-icon");
      this.applyResultIcon(icon, result);
      const content = this.createElement("div", "spotlight-content");
      const title = this.createElement("div", "spotlight-title");
      title.textContent = result.title;
      const subtitle = this.createElement("div", "spotlight-subtitle");
      subtitle.textContent = result.subtitle;
      content.appendChild(title);
      content.appendChild(subtitle);
      if (result.kind === "item" || result.kind === "attachment") {
        const preview = this.buildPreviewText(result);
        if (preview) {
          const previewNode = this.createElement("div", "spotlight-preview");
          previewNode.textContent = preview;
          content.appendChild(previewNode);
        }
      }
      row.appendChild(icon);
      row.appendChild(content);
      const isOpenTab =
        (result.kind === "item" || result.kind === "attachment") &&
        openTabItemIDs.has(result.id);
      this.appendResultBadges(row, result, isOpenTab);
      if (result.kind === "history") {
        const deleteButton = this.createElement(
          "button",
          "spotlight-history-delete",
        ) as HTMLButtonElement;
        deleteButton.type = "button";
        deleteButton.textContent = "x";
        deleteButton.title = "Remove from history";
        deleteButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.removeRecentSearch((result as HistoryResult).query);
          void this.updateResults(this.input.value);
        });
        row.appendChild(deleteButton);
      }
      row.addEventListener("mouseenter", () => {
        if (this.selectedIndex === index) {
          return;
        }
        this.selectedIndex = index;
        this.updateSelectionState();
      });
      row.addEventListener("click", () => {
        void this.activateSelection("default");
      });
      this.list.appendChild(row);
    });
    this.updateSelectionState();
  }

  private updateSelectionState(): void {
    const rows = Array.from(
      this.list.querySelectorAll(".spotlight-result"),
    ) as HTMLElement[];
    rows.forEach((row, index) => {
      row.classList.toggle("is-selected", index === this.selectedIndex);
    });
    const selected = rows[this.selectedIndex];
    if (selected && "scrollIntoView" in selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }

  private createRoot(): HTMLDivElement {
    const root = this.createElement("div", "spotlight-root") as HTMLDivElement;
    root.id = "zotero-spotlight-root";
    const input = this.createElement(
      "input",
      "spotlight-input",
    ) as HTMLInputElement;
    input.id = "zotero-spotlight-input";
    input.type = "text";
    input.placeholder = "Spotlight...";

    // Collection filter bar
    const collectionBar = this.createElement(
      "div",
      "spotlight-collection-bar",
    ) as HTMLElement;
    collectionBar.id = "zotero-spotlight-collection-bar";
    const collectionCheckbox = this.doc.createElementNS(
      HTML_NS,
      "input",
    ) as HTMLInputElement;
    collectionCheckbox.type = "checkbox";
    collectionCheckbox.id = "zotero-spotlight-collection-filter";
    collectionCheckbox.style.margin = "0";
    const collectionLabel = this.doc.createElementNS(
      HTML_NS,
      "label",
    ) as HTMLElement;
    collectionLabel.setAttribute(
      "for",
      "zotero-spotlight-collection-filter",
    );
    collectionLabel.id = "zotero-spotlight-collection-label";
    collectionLabel.textContent = "Search in this folder only";
    collectionBar.appendChild(collectionCheckbox);
    collectionBar.appendChild(collectionLabel);
    collectionBar.style.display = "none";

    const list = this.createElement("div", "spotlight-list") as HTMLDivElement;
    list.id = "zotero-spotlight-list";
    root.appendChild(input);
    root.appendChild(collectionBar);
    root.appendChild(list);
    this.doc.documentElement?.appendChild(root);
    return root;
  }

  private createStyleElement(): HTMLStyleElement {
    const style = this.doc.createElementNS(
      HTML_NS,
      "style",
    ) as HTMLStyleElement;
    style.id = "zotero-spotlight-style";
    style.textContent = `
#zotero-spotlight-root {
  position: fixed;
  top: 18%;
  left: 50%;
  transform: translateX(-50%);
  width: 560px;
  max-width: 80vw;
  background: var(--quick-open-bg);
  border: 1px solid var(--quick-open-border);
  border-radius: 10px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.25);
  padding: 12px;
  z-index: 999999;
  font: inherit;
}

#zotero-spotlight-root.is-animate {
  animation: spotlight-pop-in 0.14s ease-out;
}

#zotero-spotlight-input {
  width: calc(100% - 6px);
  box-sizing: border-box;
  border: 1px solid var(--quick-open-border);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 14px;
  background: var(--quick-open-input-bg);
  color: var(--quick-open-text);
  outline: none;
}

#zotero-spotlight-input:focus {
  border-color: var(--quick-open-border-focus);
  box-shadow: 0 0 0 2px var(--quick-open-focus-ring);
}

.spotlight-collection-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding: 4px 6px;
  background: var(--quick-open-tag-bg);
  border-radius: 5px;
  font-size: 11px;
  color: var(--quick-open-subtext);
}

.spotlight-collection-bar label {
  cursor: pointer;
  user-select: none;
}

#zotero-spotlight-list {
  margin-top: 10px;
  max-height: 280px;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.spotlight-result {
  padding: 8px 26px 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
}

.spotlight-result.is-selected {
  background: var(--quick-open-hover);
}

.spotlight-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--quick-open-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.spotlight-subtitle {
  font-size: 12px;
  color: var(--quick-open-subtext);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.spotlight-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1 1 auto;
}

.spotlight-preview {
  margin-top: 2px;
  font-size: 11px;
  color: var(--quick-open-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.spotlight-icon {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  display: inline-block;
  background-size: 16px 16px;
  background-repeat: no-repeat;
  background-position: center;
  opacity: 0.9;
}

.spotlight-command-icon {
  width: 18px;
  height: 18px;
  background-repeat: no-repeat;
  background-position: center;
  background-size: 14px 14px;
  background-color: var(--quick-open-command-icon-bg);
  border: 1px solid var(--quick-open-command-icon-border);
  border-radius: 4px;
  color: var(--quick-open-command-icon-text);
  text-align: center;
  line-height: 16px;
  font-size: 11px;
  font-weight: 700;
  opacity: 1;
}

.spotlight-tag {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--quick-open-tag-text);
  background: var(--quick-open-tag-bg);
  border-radius: 999px;
  padding: 3px 6px;
  flex: 0 0 auto;
}

.spotlight-history-delete {
  margin-left: 6px;
  border: none;
  background: transparent;
  color: var(--quick-open-subtext);
  font-size: 12px;
  line-height: 1;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  cursor: pointer;
  flex: 0 0 auto;
}

.spotlight-history-delete:hover {
  background: var(--quick-open-tag-bg);
  color: var(--quick-open-text);
}

@keyframes spotlight-pop-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

.spotlight-empty {
  padding: 10px;
  color: var(--quick-open-subtext);
  font-size: 12px;
}

.spotlight-section {
  padding: 2px 6px 6px 6px;
  font-size: 11px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--quick-open-muted);
}

.spotlight-section + .spotlight-section,
.spotlight-result + .spotlight-section,
.spotlight-section-toggle + .spotlight-section,
.spotlight-result + .spotlight-section-toggle {
  margin-top: 8px;
}

.spotlight-section-toggle:hover {
  color: var(--quick-open-text);
}

#zotero-spotlight-root {
  --quick-open-bg: #f6f5f2;
  --quick-open-border: #c9c5bf;
  --quick-open-border-focus: #8f8a81;
  --quick-open-focus-ring: rgba(143, 138, 129, 0.25);
  --quick-open-input-bg: #ffffff;
  --quick-open-text: #1f1d1a;
  --quick-open-subtext: #5b564f;
  --quick-open-muted: #8b877f;
  --quick-open-hover: #e7e2da;
  --quick-open-tag-text: #6f6a62;
  --quick-open-tag-bg: #ece8e2;
  --quick-open-command-icon-bg: #f3efe8;
  --quick-open-command-icon-border: #d5cec3;
  --quick-open-command-icon-text: #3f3a32;
}

@media (prefers-color-scheme: dark) {
  #zotero-spotlight-root {
    --quick-open-bg: #1f1f1d;
    --quick-open-border: #3a3732;
    --quick-open-border-focus: #7b756c;
    --quick-open-focus-ring: rgba(123, 117, 108, 0.35);
    --quick-open-input-bg: #2b2925;
    --quick-open-text: #f0ede7;
    --quick-open-subtext: #c2bcb2;
    --quick-open-muted: #9a9489;
    --quick-open-hover: #2f2c27;
    --quick-open-tag-text: #d7d2c8;
    --quick-open-tag-bg: #3a3530;
    --quick-open-command-icon-bg: #d8d2c6;
    --quick-open-command-icon-border: #b5aea2;
    --quick-open-command-icon-text: #26231f;
  }
}
`;
    this.doc.documentElement?.appendChild(style);
    return style;
  }

  private createElement<T extends HTMLElement>(
    tag: string,
    className: string,
  ): T {
    const element = this.doc.createElementNS(HTML_NS, tag) as T;
    element.className = className;
    return element;
  }

  private buildRecentResults(): Array<QuickOpenResult | HistoryResult> {
    this.updateRecentClosed();
    const activeID = this.getActiveTabItemID();
    const seenIDs = new Set<number>();
    if (typeof activeID === "number") {
      seenIDs.add(activeID);
    }
    const openEntries = this.getOpenTabEntries().filter(
      (entry) => entry.itemID !== activeID,
    );
    const resultsLimit = this.getResultsLimit();
    const historyLimit = Math.min(3, Math.floor(resultsLimit / 2));
    const recentOpenLimit = Math.min(
      3,
      Math.max(0, resultsLimit - historyLimit),
    );
    const recentClosedLimit = Math.max(
      0,
      Math.min(2, resultsLimit - historyLimit - recentOpenLimit),
    );
    const recentActivatedLimit = Math.max(
      0,
      resultsLimit - historyLimit - recentOpenLimit - recentClosedLimit,
    );

    const historyResults: HistoryResult[] = this.recentSearches
      .slice(0, historyLimit)
      .map((query, index) => ({
        kind: "history" as const,
        query,
        title: query,
        subtitle: "Recent search",
        score: historyLimit - index,
      }));

    const recentOpen = openEntries.slice(-recentOpenLimit).reverse();
    const recentClosed = this.recentClosedAttachmentIDs
      .filter((id) => id !== activeID)
      .slice(0, recentClosedLimit)
      .map((id) => ({ kind: "attachment" as const, itemID: id }));
    const recentActivated = this.recentActivatedItemIDs
      .filter((id) => !seenIDs.has(id))
      .slice(0, recentActivatedLimit)
      .map((id) => {
        const item = Zotero.Items.get(id) as Zotero.Item;
        if (!item) {
          return null;
        }
        if (item.isAttachment()) {
          return { kind: "attachment" as const, itemID: id };
        }
        return { kind: "item" as const, itemID: id };
      })
      .filter(
        (entry): entry is { kind: "attachment" | "item"; itemID: number } =>
          !!entry,
      );

    const entries = [...recentOpen, ...recentClosed, ...recentActivated];
    const results: QuickOpenResult[] = [];
    for (const entry of entries) {
      seenIDs.add(entry.itemID);
      const result =
        (entry as any).kind === "note"
          ? this.createNoteResult(entry.itemID)
          : entry.kind === "attachment"
            ? this.createAttachmentResult(entry.itemID)
            : this.createItemResult(entry.itemID);
      if (result) {
        results.push(result);
      }
    }
    return [...historyResults, ...results].slice(0, resultsLimit);
  }

  private updateRecentClosed(): void {
    const currentOpenAttachments = new Set(
      this.getOpenTabEntries()
        .filter((entry) => entry.kind === "attachment")
        .map((entry) => entry.itemID),
    );
    for (const attachmentID of this.lastOpenReaderIDs) {
      if (!currentOpenAttachments.has(attachmentID)) {
        this.pushRecentClosed(attachmentID);
      }
    }
    this.lastOpenReaderIDs = currentOpenAttachments;
  }

  private pushRecentClosed(attachmentID: number): void {
    this.recentClosedAttachmentIDs = this.recentClosedAttachmentIDs.filter(
      (id) => id !== attachmentID,
    );
    this.recentClosedAttachmentIDs.unshift(attachmentID);
    this.recentClosedAttachmentIDs = this.recentClosedAttachmentIDs.slice(
      0,
      10,
    );
  }

  private getOpenTabEntries(): Array<{
    kind: "attachment" | "note";
    itemID: number;
  }> {
    const tabs = ((this.win as any).Zotero_Tabs ||
      Zotero.getMainWindow()?.Zotero_Tabs) as
      | _ZoteroTypes.Zotero_Tabs
      | undefined;
    if (tabs?._tabs && Array.isArray(tabs._tabs)) {
      return tabs._tabs
        .filter((tab) => tab.id !== "zotero-pane")
        .map((tab) => {
          const type = String(tab.type || "").split("-")[0];
          if (type === "note") {
            return { kind: "note" as const, itemID: tab.data?.itemID };
          }
          if (type === "reader") {
            return { kind: "attachment" as const, itemID: tab.data?.itemID };
          }
          return null;
        })
        .filter(
          (entry): entry is { kind: "attachment" | "note"; itemID: number } =>
            !!entry && typeof entry.itemID === "number",
        );
    }
    const reader = (Zotero as any).Reader;
    const readers = reader?._readers as
      | _ZoteroTypes.ReaderInstance[]
      | undefined;
    if (!readers || !Array.isArray(readers)) {
      return [];
    }
    return readers
      .map((entry) => ({ kind: "attachment" as const, itemID: entry.itemID }))
      .filter(
        (entry): entry is { kind: "attachment"; itemID: number } =>
          typeof entry.itemID === "number",
      );
  }

  private getActiveTabItemID(): number | null {
    const localTabs = (this.win as any).Zotero_Tabs as
      | _ZoteroTypes.Zotero_Tabs
      | undefined;
    const mainTabs = Zotero.getMainWindow()?.Zotero_Tabs as
      | _ZoteroTypes.Zotero_Tabs
      | undefined;
    if (localTabs) {
      const tabID = localTabs.selectedID;
      if (tabID && localTabs._tabs) {
        const match = localTabs._tabs.find((tab) => tab.id === tabID);
        if (match?.data?.itemID) {
          return match.data.itemID as number;
        }
      }
    }
    const reader = (Zotero as any).Reader;
    const readers = reader?._readers as
      | _ZoteroTypes.ReaderInstance[]
      | undefined;
    if (!readers || !Array.isArray(readers)) {
      return null;
    }
    const matchByWindow = readers.find((entry) => entry._window === this.win);
    if (matchByWindow?.itemID) {
      return matchByWindow.itemID;
    }
    if (mainTabs) {
      const tabID = mainTabs.selectedID;
      if (tabID && mainTabs._tabs) {
        const match = mainTabs._tabs.find((tab) => tab.id === tabID);
        if (match?.data?.itemID) {
          return match.data.itemID as number;
        }
      }
    }
    return null;
  }

  private createAttachmentResult(attachmentID: number): QuickOpenResult | null {
    const attachment = Zotero.Items.get(attachmentID) as Zotero.Item;
    if (!attachment || !attachment.isAttachment()) {
      return null;
    }
    const filename = (attachment as any).attachmentFilename as
      | string
      | undefined;
    const title = filename || getItemTitleSafe(attachment);
    const parent = this.getAttachmentParentItem(attachment);
    const subtitle = parent ? getItemTitleSafe(parent) : "";
    const tags = parent ? getItemTagsSafe(parent, 3) : [];
    const abstractSnippet = parent
      ? getItemAbstractSnippetSafe(parent, 90)
      : undefined;
    const year = parent ? getItemYearSafe(parent) : undefined;
    return {
      id: attachmentID,
      kind: "attachment",
      resultType: isPDFAttachment(attachment) ? "pdf" : "item",
      title: title || "Attachment",
      subtitle,
      score: 0,
      year,
      tags,
      abstractSnippet,
    };
  }

  private createItemResult(itemID: number): QuickOpenResult | null {
    const item = Zotero.Items.get(itemID) as Zotero.Item;
    if (!item || !item.isRegularItem()) {
      return null;
    }
    return {
      id: itemID,
      kind: "item",
      resultType: "item",
      title: getItemTitleSafe(item) || "Item",
      subtitle: getItemSubtitleSafe(item),
      score: 0,
      year: getItemYearSafe(item),
      tags: getItemTagsSafe(item, 3),
      authors: getItemAuthorsSafe(item),
      abstractSnippet: getItemAbstractSnippetSafe(item, 90),
    };
  }

  private getAttachmentParentItem(attachment: Zotero.Item): Zotero.Item | null {
    const parentID =
      (attachment as any).parentID ?? (attachment as any).parentItemID;
    if (typeof parentID === "number") {
      return Zotero.Items.get(parentID) as Zotero.Item;
    }
    const topLevel = (attachment as any).topLevelItem as
      | Zotero.Item
      | undefined;
    if (topLevel && topLevel.id && topLevel.id !== attachment.id) {
      return topLevel;
    }
    return null;
  }

  private createNoteResult(noteID: number): QuickOpenResult | null {
    const note = Zotero.Items.get(noteID) as Zotero.Item;
    if (!note || !note.isNote()) {
      return null;
    }
    const title =
      (note as any).getNoteTitle?.() || note.getDisplayTitle() || "Note";
    const parentID = (note as any).parentID ?? (note as any).parentItemID;
    const parent = parentID
      ? (Zotero.Items.get(parentID) as Zotero.Item)
      : null;
    const subtitle = parent ? getItemTitleSafe(parent) : "Note";
    return {
      id: noteID,
      kind: "item",
      resultType: "note",
      title,
      subtitle,
      score: 0,
      year: parent ? getItemYearSafe(parent) : undefined,
      tags: getItemTagsSafe(note, 3),
      authors: parent ? getItemAuthorsSafe(parent) : undefined,
      abstractSnippet: parent
        ? getItemAbstractSnippetSafe(parent, 90)
        : undefined,
    };
  }

  private buildPreviewText(result: QuickOpenResult): string {
    const leading = [result.authors, result.year ? String(result.year) : ""]
      .filter(Boolean)
      .join(" - ");
    const tags = (result.tags || []).slice(0, 2).map((tag) => `#${tag}`);
    const parts = [leading, ...tags, result.abstractSnippet || ""].filter(
      Boolean,
    );
    return parts.join("  ");
  }

  private applyResultIcon(
    icon: HTMLElement,
    result: QuickOpenResult | CommandResult | HistoryResult,
  ): void {
    if (result.kind === "history") {
      icon.textContent = "*";
      return;
    }
    if (result.kind === "command") {
      icon.classList.add("spotlight-command-icon");
      const commandIconURL = this.getCommandIconURL((result as CommandResult).icon);
      if (commandIconURL) {
        icon.style.backgroundImage = `url("${commandIconURL}")`;
      } else {
        icon.textContent = ">";
      }
      return;
    }
    if (result.kind === "annotation") {
      const annoResult = result as AnnotationResult;
      icon.textContent = "✏";
      icon.style.fontSize = "13px";
      icon.style.textAlign = "center";
      icon.style.lineHeight = "16px";
      if (annoResult.annotationColor) {
        icon.style.color = annoResult.annotationColor;
      }
      return;
    }
    const item = Zotero.Items.get(result.id) as Zotero.Item;
    const itemTypeIcon = this.getResultItemTypeIcon(item, result as any);
    if (itemTypeIcon) {
      icon.classList.add("icon", "icon-css", "icon-item-type");
      icon.setAttribute("data-item-type", itemTypeIcon);
      return;
    }
    const iconURL = this.getResultIconURL(item, result as any);
    if (iconURL) {
      icon.style.backgroundImage = `url("${iconURL.replace(/"/g, '\\"')}")`;
    }
  }

  private getResultItemTypeIcon(
    item: Zotero.Item | null,
    result: QuickOpenResult,
  ): string | null {
    if (item?.isAttachment()) {
      const candidate = item as any;
      if (
        typeof candidate.isPDFAttachment === "function" &&
        candidate.isPDFAttachment()
      ) {
        if (
          typeof candidate.isLinkedFileAttachment === "function" &&
          candidate.isLinkedFileAttachment()
        ) {
          return "attachmentPDFLink";
        }
        return "attachmentPDF";
      }
    }
    if (item) {
      try {
        const typeIconName =
          typeof (item as any).getItemTypeIconName === "function"
            ? (item as any).getItemTypeIconName()
            : null;
        if (typeof typeIconName === "string" && typeIconName.trim()) {
          return typeIconName.trim();
        }
      } catch (error) {
        ztoolkit.log("Failed to get item-type icon name", error);
      }
    }
    if (result.kind === "attachment") {
      return "attachment";
    }
    return "document";
  }

  private getResultIconURL(
    item: Zotero.Item | null,
    result: QuickOpenResult,
  ): string | null {
    if (item) {
      try {
        const imageSrc =
          typeof (item as any).getImageSrc === "function"
            ? (item as any).getImageSrc()
            : null;
        const normalizedImageSrc = this.normalizeIconURL(imageSrc);
        if (normalizedImageSrc) {
          return normalizedImageSrc;
        }
      } catch (error) {
        ztoolkit.log("Failed to load item icon from getImageSrc", error);
      }
    }
    return this.getFallbackIconURL(result);
  }

  private getFallbackIconURL(result: QuickOpenResult): string | null {
    if (typeof (Zotero.ItemTypes as any)?.getImageSrc !== "function") {
      return null;
    }
    try {
      const fallbackType =
        result.kind === "attachment" ? "attachment" : "document";
      const fallback = (Zotero.ItemTypes as any).getImageSrc(fallbackType);
      return this.normalizeIconURL(fallback);
    } catch (error) {
      ztoolkit.log("Failed to load fallback icon", error);
      return null;
    }
  }

  private normalizeIconURL(icon: unknown): string | null {
    if (!icon) {
      return null;
    }
    if (typeof icon === "string") {
      const trimmed = icon.trim();
      return trimmed || null;
    }
    const candidate = icon as {
      spec?: unknown;
      asciiSpec?: unknown;
      href?: unknown;
    };
    if (typeof candidate.spec === "string" && candidate.spec.trim()) {
      return candidate.spec.trim();
    }
    if (typeof candidate.asciiSpec === "string" && candidate.asciiSpec.trim()) {
      return candidate.asciiSpec.trim();
    }
    if (typeof candidate.href === "string" && candidate.href.trim()) {
      return candidate.href.trim();
    }
    return null;
  }

  private getResultsLimit(): number {
    const raw = Number(getPref("resultsLimit"));
    if (Number.isNaN(raw)) {
      return 20;
    }
    return Math.min(100, Math.max(5, raw));
  }

  private parseQuery(rawQuery: string): {
    isCommandMode: boolean;
    query: string;
  } {
    const trimmedStart = rawQuery.trimStart();
    if (trimmedStart.startsWith(">")) {
      return {
        isCommandMode: true,
        query: trimmedStart.slice(1).trim(),
      };
    }
    return {
      isCommandMode: false,
      query: rawQuery.trim(),
    };
  }

  private getCommandIconURL(iconName?: string): string | null {
    if (iconName === "note") {
      return "chrome://zotero/skin/16/universal/note.svg";
    }
    if (iconName === "copy-citation") {
      return "chrome://zotero/skin/16/universal/citation-dialog-list.svg";
    }
    if (iconName === "copy-bibliography") {
      return "chrome://zotero/skin/16/universal/list-number.svg";
    }
    if (iconName === "collection") {
      return "chrome://zotero/skin/16/universal/library-collection.svg";
    }
    return null;
  }

  private appendResultBadges(
    row: HTMLElement,
    result: QuickOpenResult | CommandResult | HistoryResult,
    isOpenTab: boolean,
  ): void {
    if (result.kind === "history") {
      const historyTag = this.createElement("span", "spotlight-tag");
      historyTag.textContent = "HISTORY";
      row.appendChild(historyTag);
      return;
    }
    if (result.kind === "command") {
      if ((result as CommandResult).shortcut) {
        const shortcutTag = this.createElement("span", "spotlight-tag");
        shortcutTag.textContent = (result as CommandResult).shortcut!;
        row.appendChild(shortcutTag);
      }
      return;
    }
    if (result.kind === "annotation") {
      const badge = this.createElement("span", "spotlight-tag");
      badge.textContent = "ANNO";
      row.appendChild(badge);
      return;
    }

    const badges: string[] = [];
    badges.push(this.getResultTypeBadge((result as QuickOpenResult).resultType));
    if ((result as QuickOpenResult).libraryKind === "group") {
      badges.push("GROUP");
    }
    if (isOpenTab) {
      badges.push("TAB");
    }

    badges.forEach((label) => {
      const badge = this.createElement("span", "spotlight-tag");
      badge.textContent = label;
      row.appendChild(badge);
    });
  }

  private getResultTypeBadge(type: QuickOpenResult["resultType"]): string {
    if (type === "pdf") {
      return "PDF";
    }
    if (type === "note") {
      return "NOTE";
    }
    if (type === "annotation") {
      return "ANNO";
    }
    return "ITEM";
  }

  private pushRecentActivated(itemID: number): void {
    if (!itemID || typeof itemID !== "number") {
      return;
    }
    this.recentActivatedItemIDs = this.recentActivatedItemIDs.filter(
      (id) => id !== itemID,
    );
    this.recentActivatedItemIDs.unshift(itemID);
    this.recentActivatedItemIDs = this.recentActivatedItemIDs.slice(0, 20);
  }

  private pushRecentSearch(query: string): void {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || this.displayMode !== "search") {
      return;
    }
    this.recentSearches = this.recentSearches.filter(
      (entry) => entry !== normalizedQuery,
    );
    this.recentSearches.unshift(normalizedQuery);
    this.recentSearches = this.recentSearches.slice(0, 20);
  }

  private removeRecentSearch(query: string): void {
    this.recentSearches = this.recentSearches.filter(
      (entry) => entry !== query,
    );
  }
}

function getWindowHeight(): number {
  const raw = Number(( getPref as any)("windowHeight"));
  if (Number.isNaN(raw) || raw <= 0) return 400;
  return Math.min(800, Math.max(200, raw));
}

function getWindowWidth(): number {
  const raw = Number(( getPref as any)("windowWidth"));
  if (Number.isNaN(raw) || raw <= 0) return 560;
  return Math.min(1200, Math.max(300, raw));
}
