import type { ActionHandler, OpenIntent } from "./actions";
import { CommandRegistry } from "./commands";
import type { CommandResult } from "./commands";
import type {
  QuickOpenResult,
  AnnotationResult,
  SearchRankingState,
} from "./search";
import type { SearchService } from "./search";
import {
  getItemAbstractSnippetSafe,
  getItemAuthorsSafe,
  getItemNoteSnippetSafe,
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

type PanelAction = {
  id: string;
  label: string;
  icon?: {
    text?: string;
    url?: string;
    itemType?: string;
  };
  hint?: string;
  run: () => Promise<void>;
};

export class PaletteUI {
  private win: Window;
  private doc: Document;
  private root: HTMLDivElement;
  private input: HTMLInputElement;
  private body: HTMLDivElement;
  private previewModeHeader: HTMLDivElement;
  private list: HTMLDivElement;
  private previewPanel: HTMLDivElement;
  private collectionBar: HTMLElement | null = null;
  private collectionCheckbox: HTMLInputElement | null = null;
  private styleElement: HTMLStyleElement;
  private searchService: SearchService;
  private commandRegistry: CommandRegistry;
  private actionHandler: ActionHandler;
  private results: Array<QuickOpenResult | CommandResult | HistoryResult> = [];
  private selectedIndex = 0;
  private panelMode: "preview" | "actions" = "preview";
  private selectedActionIndex = 0;
  private open = false;
  private searchToken = 0;
  private outsideClickHandler: (event: MouseEvent) => void;
  private keydownHandler: (event: KeyboardEvent) => void;
  private currentQuery = "";
  private sectionHeader = "";
  private displayMode: "recent" | "search" | "command" = "recent";
  private lastOpenReaderIDs = new Set<number>();
  private recentClosedAttachmentIDs: number[] = [];
  private recentActivatedItemIDs: number[] = [];
  private recentSearches: string[] = [];
  private rankingState: SearchRankingState = {
    usageCounts: new Map<number, number>(),
    recentItemIDs: [],
  };
  private _savedQuery = "";
  private _savedScrollTop = 0;
  private _activeCollection: any = null;
  private _sectionCollapsed: Record<string, boolean> = {};
  private filterHintBar: HTMLDivElement | null = null;
  private autocompleteDropdown: HTMLDivElement | null = null;
  private autocompleteItems: Array<{ label: string; value: string }> = [];
  private autocompleteSelectedIndex = -1;

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
    this.keydownHandler = (event: KeyboardEvent) => {
      this.handleKeydown(event);
    };
    this.styleElement = this.createStyleElement();
    this.root = this.createRoot();
    this.input = this.root.querySelector(
      "#zotero-spotlight-input",
    ) as HTMLInputElement;
    this.body = this.root.querySelector(".spotlight-body") as HTMLDivElement;
    this.previewModeHeader = this.root.querySelector(
      "#zotero-spotlight-preview-mode-header",
    ) as HTMLDivElement;
    this.list = this.root.querySelector(
      "#zotero-spotlight-list",
    ) as HTMLDivElement;
    this.previewPanel = this.root.querySelector(
      "#zotero-spotlight-preview-panel",
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
    this.filterHintBar = this.root.querySelector(
      "#zotero-spotlight-filter-hint-bar",
    ) as HTMLDivElement | null;
    this.autocompleteDropdown = this.root.querySelector(
      "#zotero-spotlight-autocomplete",
    ) as HTMLDivElement | null;
    this.buildFilterHintBar();
    this.bindEvents();
    this.doc.addEventListener("mousedown", this.outsideClickHandler, true);
    this.doc.addEventListener("keydown", this.keydownHandler, true);
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
    if (this.previewPanel) {
      this.previewPanel.style.maxHeight = getWindowHeight() + "px";
    }
    if (this.root) {
      this.root.style.width = getWindowWidth() + "px";
    }
    const shouldRestore =
      !!(getPref as any)("restoreSearch") && this._savedQuery !== "";
    this.input.value = shouldRestore ? this._savedQuery : "";
    this.updateFilterHintBar(this.input.value);
    this.closeAutocomplete();
    this.results = [];
    this.selectedIndex = 0;
    this.panelMode = "preview";
    this.selectedActionIndex = 0;
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
    void this.updateResults(shouldRestore ? this._savedQuery : "").then(() => {
      if (shouldRestore) {
        this.list.scrollTop = this._savedScrollTop;
      }
    });
    this.input.focus();
    if (shouldRestore) {
      this.input.select();
    }
    this.updateBodyMode();
  }

  hide(): void {
    this.open = false;
    this._savedQuery = this.input.value;
    this._savedScrollTop = this.list.scrollTop;
    this.root.style.display = "none";
    this.closeAutocomplete();
    this.updateBodyMode();
  }

  destroy(): void {
    this.doc.removeEventListener("mousedown", this.outsideClickHandler, true);
    this.doc.removeEventListener("keydown", this.keydownHandler, true);
    this.root.remove();
    this.styleElement.remove();
  }

  private bindEvents(): void {
    this.input.addEventListener("input", () => {
      const query = this.input.value;
      void this.updateResults(query);
      this.updateFilterHintBar(query);
      this.updateAutocomplete(query, this.input.selectionStart ?? query.length);
    });
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (!this.open) {
      return;
    }
    // Autocomplete interception
    const acOpen =
      this.autocompleteDropdown?.style.display === "block" &&
      this.autocompleteItems.length > 0;
    if (acOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.autocompleteSelectedIndex = Math.min(
          this.autocompleteSelectedIndex + 1,
          this.autocompleteItems.length - 1,
        );
        this.renderAutocompleteSelection();
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        this.autocompleteSelectedIndex = Math.max(
          this.autocompleteSelectedIndex - 1,
          -1,
        );
        this.renderAutocompleteSelection();
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        const idx =
          this.autocompleteSelectedIndex >= 0
            ? this.autocompleteSelectedIndex
            : 0;
        const item = this.autocompleteItems[idx];
        if (item) {
          this.insertAutocompleteValue(item.value);
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeAutocomplete();
        return;
      }
    }
    if (event.key === "Tab") {
      event.preventDefault();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (this.panelMode === "actions") {
        this.closeActionsPanel();
        return;
      }
      this.hide();
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      this.openActionsPanel();
      return;
    }
    if (event.key === "ArrowLeft") {
      if (this.panelMode === "actions") {
        event.preventDefault();
        this.closeActionsPanel();
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (this.panelMode === "actions") {
        this.moveActionSelection(1);
      } else {
        this.moveSelection(1);
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (this.panelMode === "actions") {
        this.moveActionSelection(-1);
      } else {
        this.moveSelection(-1);
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (this.panelMode === "actions") {
        void this.activateSelectedPanelAction();
        return;
      }
      const intent: OpenIntent = event.shiftKey
        ? "reveal"
        : event.metaKey || event.ctrlKey
          ? "alternate"
          : "default";
      void this.activateSelection(intent);
    }
  }

  private async updateResults(query: string): Promise<void> {
    const token = (this.searchToken += 1);
    const parsedQuery = this.parseQuery(query);
    this.currentQuery = parsedQuery.query;
    const resultsLimit = this.getResultsLimit();
    // >tabs command
    if (
      parsedQuery.isCommandMode &&
      (parsedQuery.query === "tabs" || parsedQuery.query === "tab")
    ) {
      const mainWin = Zotero.getMainWindow() as any;
      const allTabs = mainWin?.Zotero_Tabs?._tabs ?? [];
      const tabResults: QuickOpenResult[] = [];
      for (const tab of allTabs) {
        const itemID = tab?.data?.itemID;
        if (!itemID) continue;
        const item = Zotero.Items.get(itemID) as any;
        if (!item) continue;
        const parent = item.isAttachment?.()
          ? (Zotero.Items.get(item.parentID) as any)
          : item;
        tabResults.push({
          kind: item.isAttachment?.() ? "attachment" : "item",
          id: itemID,
          title: item.isAttachment?.()
            ? parent?.getDisplayTitle?.() ||
              (item as any).attachmentFilename ||
              "PDF"
            : item.getDisplayTitle?.() || "Untitled",
          subtitle: item.isAttachment?.() ? "PDF" : "Item",
          resultType: item.isAttachment?.() ? "pdf" : "item",
          libraryKind: "user",
          score: 10,
        });
      }
      this.results = tabResults;
      this.sectionHeader = `Open Tabs (${tabResults.length})`;
      this.displayMode = "search";
      this.selectedIndex = 0;
      this.renderResults();
      return;
    }
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
          this.rankingState,
        );
    if (token !== this.searchToken) {
      return;
    }
    this.results = results;
    this.panelMode = "preview";
    this.selectedActionIndex = 0;
    this.updateBodyMode();
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
    this.selectedActionIndex = 0;
    this.updateSelectionState();
  }

  private moveActionSelection(delta: number): void {
    const actions = this.getPanelActions();
    if (!actions.length) {
      return;
    }
    const maxIndex = actions.length - 1;
    this.selectedActionIndex = Math.max(
      0,
      Math.min(maxIndex, this.selectedActionIndex + delta),
    );
    this.renderPreview();
  }

  private openActionsPanel(): void {
    if (!this.results.length) {
      return;
    }
    const actions = this.getPanelActions();
    if (!actions.length) {
      return;
    }
    this.panelMode = "actions";
    this.selectedActionIndex = Math.max(
      0,
      Math.min(actions.length - 1, this.selectedActionIndex),
    );
    this.updateBodyMode();
    this.renderPreview();
  }

  private closeActionsPanel(): void {
    this.panelMode = "preview";
    this.selectedActionIndex = 0;
    this.updateBodyMode();
    this.renderPreview();
  }

  private async activateSelectedPanelAction(): Promise<void> {
    const actions = this.getPanelActions();
    const action = actions[this.selectedActionIndex];
    if (!action) {
      return;
    }
    await action.run();
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
      this.recordOpen(result.id);
    }
    this.pushRecentSearch(this.currentQuery);
    this.hide();
  }

  private async openAnnotation(
    result: AnnotationResult,
    alternate: OpenIntent,
  ): Promise<void> {
    if (alternate === "reveal") {
      const attachmentID = result.attachmentID;
      if (typeof attachmentID === "number") {
        await this.actionHandler.openAttachment(attachmentID, false);
        await this.actionHandler.openResult(
          {
            id: attachmentID,
            kind: "attachment",
            resultType: "pdf",
            title: result.subtitle || "PDF",
            subtitle: "PDF",
            score: result.score,
          },
          "reveal",
        );
      }
      return;
    }
    const attachmentID = result.attachmentID;
    if (typeof attachmentID !== "number") return;
    let openedWithFileHandlers = false;
    if (
      alternate === "alternate" &&
      typeof (Zotero as any).FileHandlers?.open === "function"
    ) {
      const attachment = Zotero.Items.get(attachmentID) as Zotero.Item;
      if (attachment) {
        try {
          await (Zotero as any).FileHandlers.open(attachment, {
            openInWindow: true,
          });
          openedWithFileHandlers = true;
          await new Promise((resolve) => setTimeout(resolve, 600));
        } catch (error) {
          ztoolkit.log("FileHandlers.open failed for annotation result", error);
        }
      }
    }
    if (!openedWithFileHandlers) {
      await (Zotero as any).Reader.open(attachmentID, {
        openInWindow: alternate === "alternate",
        allowDuplicate: alternate === "alternate",
      });
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
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
      this.renderPreview();
      return;
    }

    // Category counts
    const itemCount = this.results.filter(
      (r) => r.kind !== "annotation",
    ).length;
    const annoCount = this.results.filter(
      (r) => r.kind === "annotation",
    ).length;
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
      row.dataset.resultIndex = String(index);
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
        this.input.focus();
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
    rows.forEach((row) => {
      row.classList.toggle(
        "is-selected",
        Number(row.dataset.resultIndex) === this.selectedIndex,
      );
    });
    const selected = rows.find(
      (row) => Number(row.dataset.resultIndex) === this.selectedIndex,
    );
    if (selected && "scrollIntoView" in selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
    const actions = this.getPanelActions();
    if (!actions.length) {
      this.panelMode = "preview";
      this.selectedActionIndex = 0;
    } else if (this.panelMode === "actions") {
      this.selectedActionIndex = Math.min(
        this.selectedActionIndex,
        actions.length - 1,
      );
    }
    this.updateBodyMode();
    this.renderPreview();
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
    collectionLabel.setAttribute("for", "zotero-spotlight-collection-filter");
    collectionLabel.id = "zotero-spotlight-collection-label";
    collectionLabel.textContent = "Search in this folder only";
    collectionBar.appendChild(collectionCheckbox);
    collectionBar.appendChild(collectionLabel);
    collectionBar.style.display = "none";

    const body = this.createElement("div", "spotlight-body") as HTMLDivElement;
    const previewModeHeader = this.createElement(
      "div",
      "spotlight-section spotlight-preview-mode-header",
    ) as HTMLDivElement;
    previewModeHeader.id = "zotero-spotlight-preview-mode-header";
    previewModeHeader.textContent = "Preview";
    const listPane = this.createElement(
      "div",
      "spotlight-list-pane",
    ) as HTMLDivElement;
    const list = this.createElement("div", "spotlight-list") as HTMLDivElement;
    list.id = "zotero-spotlight-list";
    const previewPanel = this.createElement(
      "div",
      "spotlight-preview-panel",
    ) as HTMLDivElement;
    previewPanel.id = "zotero-spotlight-preview-panel";
    // Filter hint bar (shown when input is empty)
    const filterHintBar = this.createElement(
      "div",
      "spotlight-filter-hint-bar",
    ) as HTMLDivElement;
    filterHintBar.id = "zotero-spotlight-filter-hint-bar";

    // Autocomplete dropdown (shown on colon-triggered filter token)
    const autocompleteDropdown = this.createElement(
      "div",
      "spotlight-autocomplete",
    ) as HTMLDivElement;
    autocompleteDropdown.id = "zotero-spotlight-autocomplete";
    autocompleteDropdown.style.display = "none";

    root.appendChild(input);
    root.appendChild(autocompleteDropdown);
    root.appendChild(filterHintBar);
    root.appendChild(collectionBar);
    root.appendChild(previewModeHeader);
    listPane.appendChild(list);
    body.appendChild(listPane);
    body.appendChild(previewPanel);
    root.appendChild(body);
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
  cursor: auto;
}


.spotlight-body {
  display: block;
  margin-top: 10px;
}

.spotlight-list-pane {
  min-width: 0;
}

.spotlight-body.is-panel-open .spotlight-list-pane {
  display: none;
}

.spotlight-preview-mode-header {
  display: none;
  margin-top: 10px;
  padding-left: 6px;
  padding-right: 6px;
  box-sizing: border-box;
}

#zotero-spotlight-root.is-animate {
  animation: spotlight-pop-in 0.14s ease-out;
}

#zotero-spotlight-input {
  width: 100%;
  margin: 0;
  box-sizing: border-box;
  border: 1px solid var(--quick-open-border);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 14px;
  background: var(--quick-open-input-bg);
  color: var(--quick-open-text);
  outline: none;
  cursor: text;
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
  max-height: 280px;
  overflow-y: auto;
  scrollbar-gutter: stable;
  cursor: auto;
}

#zotero-spotlight-preview-panel {
  display: none;
  min-width: 0;
  min-height: 280px;
  max-height: 280px;
  overflow-y: auto;
  border: 1px solid var(--quick-open-border);
  border-radius: 8px;
  background: var(--quick-open-panel-bg);
  padding: 12px;
  cursor: auto;
}

.spotlight-body.is-panel-open #zotero-spotlight-preview-panel {
  display: block;
}

.spotlight-result {
  position: relative;
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

.spotlight-preview-empty {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  min-height: 100%;
  color: var(--quick-open-subtext);
}

.spotlight-preview-eyebrow {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--quick-open-muted);
}

.spotlight-preview-title {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--quick-open-text);
}

.spotlight-preview-subtitle {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--quick-open-subtext);
}

.spotlight-preview-meta,
.spotlight-preview-actions,
.spotlight-preview-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.spotlight-preview-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--quick-open-chip-bg);
  color: var(--quick-open-chip-text);
  font-size: 11px;
}

.spotlight-preview-meta .spotlight-preview-chip {
  background: var(--quick-open-meta-chip-bg);
  color: var(--quick-open-meta-chip-text);
}

.spotlight-preview-actions .spotlight-preview-chip {
  background: var(--quick-open-action-chip-bg);
  color: var(--quick-open-action-chip-text);
}

.spotlight-preview-tags .spotlight-preview-chip {
  background: var(--quick-open-tag-chip-bg);
  color: var(--quick-open-tag-chip-text);
}

.spotlight-preview-section {
  margin-top: 14px;
}

.spotlight-preview-shell {
  min-height: 100%;
}

.spotlight-preview-shell.is-actions-mode {
  display: grid;
  grid-template-columns: minmax(150px, 0.8fr) minmax(0, 1.2fr);
  gap: 12px;
  align-items: stretch;
}

.spotlight-actions-panel {
  min-width: 0;
  border-right: 1px solid var(--quick-open-border-soft);
  padding-right: 12px;
  min-height: 100%;
  align-self: stretch;
}

.spotlight-preview-detail {
  min-width: 0;
}

.spotlight-action-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 0;
}

.spotlight-action-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 9px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  color: var(--quick-open-text);
  cursor: pointer;
}

.spotlight-action-item.is-selected {
  background: var(--quick-open-hover);
  border-color: var(--quick-open-border-soft);
}

.spotlight-action-title {
  font-size: 12px;
  font-weight: 600;
}

.spotlight-action-icon {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  line-height: 1;
  opacity: 0.9;
  background-size: 16px 16px;
  background-repeat: no-repeat;
  background-position: center;
}

.spotlight-action-icon.has-image-icon {
  filter: var(--quick-open-image-icon-filter);
}

.spotlight-preview-label {
  margin-bottom: 5px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--quick-open-muted);
}

.spotlight-preview-text,
.spotlight-preview-quote {
  font-size: 12px;
  line-height: 1.55;
  color: var(--quick-open-text);
  white-space: pre-wrap;
  word-break: break-word;
}

.spotlight-preview-quote {
  padding: 10px;
  border-radius: 8px;
  background: var(--quick-open-quote-bg);
}

.spotlight-preview-swatch {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex: 0 0 auto;
}

@media (max-width: 760px) {
  #zotero-spotlight-preview-panel {
    min-height: 180px;
    max-height: 220px;
  }

  .spotlight-preview-shell.is-actions-mode {
    grid-template-columns: minmax(0, 1fr);
  }

  .spotlight-actions-panel {
    border-right: none;
    border-bottom: 1px solid var(--quick-open-border-soft);
    padding-right: 0;
    padding-bottom: 12px;
  }
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
  color: var(--quick-open-command-icon-text);
  text-align: center;
  line-height: 18px;
  font-size: 11px;
  font-weight: 700;
  opacity: 1;
  filter: var(--quick-open-image-icon-filter);
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

.spotlight-tab-dot {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);

  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #0078d4;
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

.spotlight-filter-hint-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
  padding-left: 6px;
}

.spotlight-filter-hint-label {
  font-size: 11px;
  color: var(--quick-open-muted);
  margin-right: 2px;
}

.spotlight-filter-hint-label--commands {
  margin-left: 10px;
}

.spotlight-filter-hint-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--quick-open-tag-bg);
  color: var(--quick-open-tag-text);
  font-size: 11px;
  font-family: monospace;
  font-weight: 600;
  border: 1px solid transparent;
  cursor: pointer;
  line-height: 1.5;
}

.spotlight-filter-hint-badge:hover {
  background: var(--quick-open-hover);
  color: var(--quick-open-text);
  border-color: var(--quick-open-border-soft);
}

.spotlight-autocomplete {
  margin-top: 4px;
  background: var(--quick-open-input-bg);
  border: 1px solid var(--quick-open-border);
  border-radius: 6px;
  overflow: hidden;
}

.spotlight-autocomplete-item {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
  color: var(--quick-open-text);
}

.spotlight-autocomplete-item:hover,
.spotlight-autocomplete-item.is-selected {
  background: var(--quick-open-hover);
}

.spotlight-autocomplete-prefix {
  font-family: monospace;
  color: var(--quick-open-muted);
}

.spotlight-autocomplete-value {
  font-family: monospace;
  font-weight: 600;
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
  --quick-open-border-soft: #ddd6cc;
  --quick-open-border-focus: #8f8a81;
  --quick-open-focus-ring: rgba(143, 138, 129, 0.25);
  --quick-open-input-bg: #ffffff;
  --quick-open-text: #1f1d1a;
  --quick-open-subtext: #5b564f;
  --quick-open-muted: #8b877f;
  --quick-open-hover: #e7e2da;
  --quick-open-tag-text: #6f6a62;
  --quick-open-tag-bg: #ece8e2;
  --quick-open-panel-bg: rgba(255, 255, 255, 0.72);
  --quick-open-chip-bg: #ebe6df;
  --quick-open-chip-text: #474139;
  --quick-open-meta-chip-bg: #e9e2d6;
  --quick-open-meta-chip-text: #584c3b;
  --quick-open-action-chip-bg: #e1e8de;
  --quick-open-action-chip-text: #36513a;
  --quick-open-tag-chip-bg: #dbe8ef;
  --quick-open-tag-chip-text: #294c63;
  --quick-open-quote-bg: #efe9e0;
  --quick-open-command-icon-text: #3f3a32;
  --quick-open-image-icon-filter: none;
}

@media (prefers-color-scheme: dark) {
  #zotero-spotlight-root {
    --quick-open-bg: #1f1f1d;
    --quick-open-border: #3a3732;
    --quick-open-border-soft: #4a443d;
    --quick-open-border-focus: #7b756c;
    --quick-open-focus-ring: rgba(123, 117, 108, 0.35);
    --quick-open-input-bg: #2b2925;
    --quick-open-text: #f0ede7;
    --quick-open-subtext: #c2bcb2;
    --quick-open-muted: #9a9489;
    --quick-open-hover: #2f2c27;
    --quick-open-tag-text: #d7d2c8;
    --quick-open-tag-bg: #3a3530;
    --quick-open-panel-bg: rgba(27, 25, 23, 0.8);
    --quick-open-chip-bg: #37322d;
    --quick-open-chip-text: #e2dbcf;
    --quick-open-meta-chip-bg: #4a4034;
    --quick-open-meta-chip-text: #f0dfc4;
    --quick-open-action-chip-bg: #2f4233;
    --quick-open-action-chip-text: #cde6d1;
    --quick-open-tag-chip-bg: #243c4d;
    --quick-open-tag-chip-text: #c7e3f4;
    --quick-open-quote-bg: #2e2a26;
    --quick-open-command-icon-text: #26231f;
    --quick-open-image-icon-filter: invert(0.92) brightness(1.05);
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

  private updateBodyMode(): void {
    if (!this.body) {
      return;
    }
    this.body.classList.toggle("is-panel-open", this.panelMode === "actions");
    if (this.previewModeHeader) {
      this.previewModeHeader.style.display =
        this.panelMode === "actions" ? "block" : "none";
    }
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

  private renderPreview(): void {
    if (!this.previewPanel) {
      return;
    }
    this.previewPanel.textContent = "";

    if (!this.results.length) {
      this.previewPanel.appendChild(
        this.createPreviewEmpty(
          this.displayMode === "recent"
            ? "Start typing to search your Zotero library."
            : this.displayMode === "command"
              ? "Type after `>` to discover commands."
              : "No matching result to preview.",
          this.displayMode === "recent"
            ? "Recent searches, open tabs, and recently visited items appear here."
            : this.displayMode === "command"
              ? "Arrow through commands to inspect shortcuts and context before running them."
              : "Try a broader query or use filters like `:pdf`, `#tag`, `y:2024`.",
        ),
      );
      return;
    }

    const result = this.results[this.selectedIndex];
    if (!result) {
      return;
    }
    const shell = this.createElement("div", "spotlight-preview-shell");
    const detailContainer = this.createElement(
      "div",
      "spotlight-preview-detail",
    );
    if (this.panelMode === "actions") {
      const actions = this.getPanelActions();
      if (actions.length) {
        shell.classList.add("is-actions-mode");
        shell.appendChild(this.createActionsPanel(actions));
      }
    }
    if (result.kind === "history") {
      this.renderHistoryPreview(detailContainer, result as HistoryResult);
      shell.appendChild(detailContainer);
      this.previewPanel.appendChild(shell);
      return;
    }
    if (result.kind === "command") {
      this.renderCommandPreview(detailContainer, result as CommandResult);
      shell.appendChild(detailContainer);
      this.previewPanel.appendChild(shell);
      return;
    }
    if (result.kind === "annotation") {
      this.renderAnnotationPreview(detailContainer, result as AnnotationResult);
      shell.appendChild(detailContainer);
      this.previewPanel.appendChild(shell);
      return;
    }
    this.renderItemPreview(detailContainer, result as QuickOpenResult);
    shell.appendChild(detailContainer);
    this.previewPanel.appendChild(shell);
  }

  private renderHistoryPreview(
    container: HTMLElement,
    result: HistoryResult,
  ): void {
    container.appendChild(
      this.createPreviewHeader("Recent Search", result.title, result.subtitle),
    );
    this.appendPreviewChips(container, "spotlight-preview-meta", [
      { label: "Enter reruns search" },
      { label: "Search history" },
    ]);
    this.appendPreviewSection(container, "Query", result.query, false);
    this.appendPreviewSection(
      container,
      "What happens",
      "Press Enter to restore this query and refresh the result list without leaving the keyboard.",
      false,
    );
  }

  private renderCommandPreview(
    container: HTMLElement,
    result: CommandResult,
  ): void {
    container.appendChild(
      this.createPreviewHeader("Command", result.title, result.subtitle),
    );
    this.appendPreviewChips(container, "spotlight-preview-meta", [
      result.group ? { label: result.group } : null,
      result.shortcut ? { label: result.shortcut } : null,
      { label: "Command mode" },
    ]);
    this.appendPreviewSection(container, "Behavior", result.subtitle, false);
    this.appendPreviewSection(
      container,
      "How to run",
      "Press Enter to execute the command immediately. Spotlight stays keyboard-first and never moves focus into the preview.",
      false,
    );
  }

  private renderAnnotationPreview(
    container: HTMLElement,
    result: AnnotationResult,
  ): void {
    const meta = [result.authors, result.year ? String(result.year) : ""]
      .filter(Boolean)
      .join(" - ");
    container.appendChild(
      this.createPreviewHeader(
        "Annotation",
        result.subtitle || "Annotation result",
        meta || "Jump directly to the matching annotation in the PDF reader.",
      ),
    );
    this.appendPreviewChips(container, "spotlight-preview-meta", [
      {
        label: result.pageLabel ? `Page ${result.pageLabel}` : "Annotation",
        color: result.annotationColor,
      },
      { label: "PDF jump" },
    ]);
    this.appendPreviewSection(container, "Matched text", result.title, true);
    if (result.abstractSnippet) {
      this.appendPreviewSection(
        container,
        "Comment",
        result.abstractSnippet,
        false,
      );
    }
  }

  private renderItemPreview(
    container: HTMLElement,
    result: QuickOpenResult,
  ): void {
    const item = Zotero.Items.get(result.id) as Zotero.Item | null;
    const itemTypeLabel = this.getResultTypeBadge(result.resultType);
    const meta = [result.authors, result.year ? String(result.year) : ""]
      .filter(Boolean)
      .join(" - ");
    container.appendChild(
      this.createPreviewHeader(
        itemTypeLabel,
        result.title,
        result.subtitle || meta || this.getPreviewFallbackSubtitle(result),
      ),
    );
    this.appendPreviewChips(container, "spotlight-preview-meta", [
      { label: itemTypeLabel },
      result.libraryKind === "group" ? { label: "Group library" } : null,
      meta ? { label: meta } : null,
    ]);

    const bodyText = this.getPreviewBodyText(result, item);
    if (bodyText) {
      this.appendPreviewSection(container, "Preview", bodyText, false);
    }

    const tags = (result.tags || []).slice(0, 6).map((tag) => ({
      label: `#${tag}`,
    }));
    if (tags.length) {
      this.appendPreviewChips(container, "spotlight-preview-tags", tags);
    }
  }

  private createActionsPanel(actions: PanelAction[]): HTMLElement {
    const panel = this.createElement("div", "spotlight-actions-panel");
    const list = this.createElement("div", "spotlight-action-list");
    actions.forEach((action, index) => {
      const button = this.createElement(
        "button",
        "spotlight-action-item",
      ) as HTMLButtonElement;
      button.type = "button";
      if (index === this.selectedActionIndex) {
        button.classList.add("is-selected");
      }
      if (action.icon) {
        const icon = this.createElement("span", "spotlight-action-icon");
        this.applyPanelActionIcon(icon, action.icon);
        button.appendChild(icon);
      }
      const title = this.createElement("div", "spotlight-action-title");
      title.textContent = action.label;
      button.appendChild(title);
      button.addEventListener("mouseenter", () => {
        this.selectedActionIndex = index;
        this.input.focus();
        this.renderPreview();
      });
      button.addEventListener("click", () => {
        void action.run();
      });
      list.appendChild(button);
    });
    panel.appendChild(list);
    return panel;
  }

  private createPreviewEmpty(message: string, detail: string): HTMLElement {
    const container = this.createElement("div", "spotlight-preview-empty");
    const title = this.createElement("div", "spotlight-preview-title");
    title.textContent = message;
    const subtitle = this.createElement("div", "spotlight-preview-subtitle");
    subtitle.textContent = detail;
    container.appendChild(title);
    container.appendChild(subtitle);
    return container;
  }

  private createPreviewHeader(
    eyebrowText: string,
    titleText: string,
    subtitleText: string,
  ): HTMLElement {
    const header = this.createElement("div", "spotlight-preview-header");
    const eyebrow = this.createElement("div", "spotlight-preview-eyebrow");
    eyebrow.textContent = eyebrowText;
    const title = this.createElement("div", "spotlight-preview-title");
    title.textContent = titleText;
    const subtitle = this.createElement("div", "spotlight-preview-subtitle");
    subtitle.textContent = subtitleText;
    header.appendChild(eyebrow);
    header.appendChild(title);
    header.appendChild(subtitle);
    return header;
  }

  private appendPreviewSection(
    container: HTMLElement,
    labelText: string,
    bodyText: string,
    quoted: boolean,
  ): void {
    const normalized = bodyText.trim();
    if (!normalized) {
      return;
    }
    const section = this.createElement("div", "spotlight-preview-section");
    const label = this.createElement("div", "spotlight-preview-label");
    label.textContent = labelText;
    const body = this.createElement(
      "div",
      quoted ? "spotlight-preview-quote" : "spotlight-preview-text",
    );
    body.textContent = normalized;
    section.appendChild(label);
    section.appendChild(body);
    container.appendChild(section);
  }

  private appendPreviewChips(
    container: HTMLElement,
    className: string,
    chips: Array<{ label: string; color?: string } | null>,
  ): void {
    const valid = chips.filter(
      (chip): chip is { label: string; color?: string } => !!chip?.label,
    );
    if (!valid.length) {
      return;
    }
    const row = this.createElement("div", className);
    valid.forEach((chip) => {
      const element = this.createElement("span", "spotlight-preview-chip");
      if (chip.color) {
        const swatch = this.createElement("span", "spotlight-preview-swatch");
        swatch.style.background = chip.color;
        element.appendChild(swatch);
      }
      const text = this.doc.createTextNode(chip.label);
      element.appendChild(text);
      row.appendChild(element);
    });
    container.appendChild(row);
  }

  private getPreviewBodyText(
    result: QuickOpenResult,
    item: Zotero.Item | null,
  ): string {
    if (result.resultType === "note" && item?.isNote?.()) {
      return (
        getItemNoteSnippetSafe(item, 420) ||
        result.abstractSnippet ||
        "Open the note to continue reading or editing."
      );
    }
    if (result.kind === "attachment" && item?.isAttachment?.()) {
      const parent = this.getAttachmentParentItem(item);
      if (parent) {
        return (
          getItemAbstractSnippetSafe(parent, 420) ||
          this.buildPreviewText({
            ...result,
            authors: getItemAuthorsSafe(parent),
            year: getItemYearSafe(parent),
            tags: getItemTagsSafe(parent, 4),
          }) ||
          "Open the attachment in the reader."
        );
      }
    }
    return (
      result.abstractSnippet ||
      this.buildPreviewText(result) ||
      this.getPreviewFallbackSubtitle(result)
    );
  }

  private getPreviewFallbackSubtitle(result: QuickOpenResult): string {
    if (result.resultType === "note") {
      return "Open the note directly from Spotlight.";
    }
    if (result.resultType === "pdf") {
      return "Open the PDF in the Zotero reader.";
    }
    return "Inspect the result here, then open it when you are ready.";
  }

  private getSelectedResult():
    | QuickOpenResult
    | CommandResult
    | HistoryResult
    | null {
    return this.results[this.selectedIndex] || null;
  }

  private getPanelActions(): PanelAction[] {
    const result = this.getSelectedResult();
    if (!result) {
      return [];
    }
    if (result.kind === "history") {
      return [
        {
          id: "rerun-search",
          label: "Run search",
          icon: {
            url: "chrome://zotero/skin/16/universal/arrow-clockwise.svg",
            text: "↺",
          },
          hint: "Restore this query in the list",
          run: async () => {
            this.input.value = result.query;
            this.closeActionsPanel();
            await this.updateResults(result.query);
          },
        },
      ];
    }
    if (result.kind === "command") {
      return [
        {
          id: "run-command",
          label: "Run command",
          icon: {
            url: this.getCommandIconURL(result.icon) || undefined,
            text: ">",
          },
          hint: result.subtitle,
          run: async () => {
            const executed = await this.commandRegistry.run(
              result.commandId,
              this.win,
            );
            if (executed) {
              this.hide();
            }
          },
        },
      ];
    }
    if (result.kind === "annotation") {
      const actions: PanelAction[] = [
        {
          id: "open-annotation",
          label: "Open annotation",
          icon: {
            url: "chrome://zotero/skin/16/universal/annotate-highlight.svg",
            text: "✦",
          },
          hint: "Jump to the exact annotation in the PDF reader",
          run: async () => {
            await this.openAnnotation(result, "default");
            this.hide();
          },
        },
        {
          id: "open-pdf-window",
          label: "Open PDF in window",
          icon: {
            itemType: "attachmentPDF",
            text: "□",
          },
          hint: "Open the source PDF in a separate reader window",
          run: async () => {
            await this.openAnnotation(result, "alternate");
            this.hide();
          },
        },
        {
          id: "reveal-attachment",
          label: "Reveal in library",
          icon: {
            url: "chrome://zotero/skin/16/universal/library-collection.svg",
            text: "⌕",
          },
          hint: "Select the source PDF in Zotero",
          run: async () => {
            const attachmentResult = this.createAttachmentResult(
              result.attachmentID || 0,
            );
            if (attachmentResult) {
              await this.actionHandler.openResult(attachmentResult, "reveal");
              this.hide();
            }
          },
        },
      ];
      const copyAction = this.createCopyContentPanelAction(result);
      if (copyAction) {
        actions.push(copyAction);
      }
      return actions.filter((action) =>
        action.id === "reveal-attachment"
          ? typeof result.attachmentID === "number"
          : true,
      );
    }
    const actions: PanelAction[] = [
      {
        id: "open-default",
        label: result.resultType === "pdf" ? "Open PDF" : "Open",
        icon:
          result.resultType === "pdf"
            ? { itemType: "attachmentPDF", text: "↗" }
            : result.resultType === "note"
              ? {
                  url: "chrome://zotero/skin/16/universal/note.svg",
                  text: "↵",
                }
              : { itemType: "document", text: "↵" },
        hint: "Open the selected result",
        run: async () => {
          await this.finishQuickOpen(result, "default");
        },
      },
      {
        id: "reveal-item",
        label: "Reveal in library",
        icon: {
          url: "chrome://zotero/skin/16/universal/library-collection.svg",
          text: "⌕",
        },
        hint: "Select this item in the Zotero main pane",
        run: async () => {
          await this.finishQuickOpen(result, "reveal");
        },
      },
      {
        id: "open-alternate",
        label:
          result.resultType === "pdf" || result.resultType === "note"
            ? "Open in new window"
            : "Open in alternate mode",
        icon:
          result.resultType === "pdf"
            ? { itemType: "attachmentPDF", text: "□" }
            : { itemType: "document", text: "□" },
        hint: "Use the alternate open behavior",
        run: async () => {
          await this.finishQuickOpen(result, "alternate");
        },
      },
    ].filter((action) =>
      action.id === "open-alternate"
        ? result.resultType === "pdf" || result.resultType === "note"
        : true,
    );

    const pdfAction = this.createOpenPdfPanelAction(result);
    if (pdfAction) {
      actions.splice(1, 0, pdfAction);
    }

    const revealFileAction = this.createRevealPdfFilePanelAction(result);
    if (revealFileAction) {
      actions.splice(2, 0, revealFileAction);
    }

    const parentAction = this.createOpenParentPanelAction(result);
    if (parentAction) {
      actions.push(parentAction);
    }

    const citationActions = this.createCitationPanelActions(result);
    if (citationActions.length) {
      actions.push(...citationActions);
    }

    const copyAction = this.createCopyContentPanelAction(result);
    if (copyAction) {
      actions.push(copyAction);
    }

    return actions;
  }

  private createOpenPdfPanelAction(
    result: QuickOpenResult,
  ): PanelAction | null {
    if (result.kind === "attachment" && result.resultType === "pdf") {
      return null;
    }
    if (result.resultType === "note") {
      const note = Zotero.Items.get(result.id) as Zotero.Item | null;
      const parent = note ? this.getParentItem(note) : null;
      if (!parent || !this.hasPdfAttachment(parent)) {
        return null;
      }
      return {
        id: "open-parent-pdf",
        label: "Open parent PDF",
        icon: { itemType: "attachmentPDF", text: "↗" },
        hint: "Open the closest PDF attached to the parent item",
        run: async () => {
          const attachmentID = await this.getPrimaryAttachmentID(parent.id);
          if (!attachmentID) {
            return;
          }
          await this.actionHandler.openAttachment(attachmentID, false);
          this.recordOpen(attachmentID);
          this.hide();
        },
      };
    }
    if (result.kind !== "item") {
      return null;
    }
    const item = Zotero.Items.get(result.id) as Zotero.Item | null;
    if (!item || !this.hasPdfAttachment(item)) {
      return null;
    }
    return {
      id: "open-pdf",
      label: "Open PDF",
      icon: { itemType: "attachmentPDF", text: "↗" },
      hint: "Open the best attachment for this item",
      run: async () => {
        const attachmentID = await this.getPrimaryAttachmentID(result.id);
        if (!attachmentID) {
          return;
        }
        await this.actionHandler.openAttachment(attachmentID, false);
        this.recordOpen(result.id);
        this.pushRecentActivated(result.id);
        this.pushRecentSearch(this.currentQuery);
        this.hide();
      },
    };
  }

  private createOpenParentPanelAction(
    result: QuickOpenResult,
  ): PanelAction | null {
    const item = Zotero.Items.get(result.id) as Zotero.Item | null;
    if (!item) {
      return null;
    }
    const parent =
      item.isAttachment?.() || item.isNote?.()
        ? this.getParentItem(item) || this.getAttachmentParentItem(item)
        : null;
    if (!parent) {
      return null;
    }
    return {
      id: "open-parent-item",
      label: "Open parent item",
      icon: {
        itemType: this.getItemTypeIconNameForItem(parent) || "document",
        text: "↑",
      },
      hint: "Jump to the parent bibliographic record",
      run: async () => {
        await this.actionHandler.focusItemInLibrary(parent.id);
        this.hide();
      },
    };
  }

  private createCitationPanelActions(result: QuickOpenResult): PanelAction[] {
    const item = Zotero.Items.get(result.id) as Zotero.Item | null;
    const target = this.getCitationTarget(item);
    const pane = Zotero.getMainWindow()?.ZoteroPane;
    if (!target || !pane) {
      return [];
    }
    return [
      {
        id: "copy-citation",
        label: "Copy Citation",
        icon: this.getActionCommandIcon("copy-citation", "C"),
        run: async () => {
          await this.copyItemToClipboard(target, true);
          this.hide();
        },
      },
      {
        id: "copy-bibliography",
        label: "Copy Bibliography",
        icon: this.getActionCommandIcon("copy-bibliography", "B"),
        run: async () => {
          await this.copyItemToClipboard(target, false);
          this.hide();
        },
      },
    ];
  }

  private createCopyContentPanelAction(
    result: QuickOpenResult | AnnotationResult,
  ): PanelAction | null {
    if (result.kind === "annotation") {
      const content = [result.title, result.abstractSnippet || ""]
        .filter(Boolean)
        .join("\n\n")
        .trim();
      if (!content) {
        return null;
      }
      return {
        id: "copy-annotation-content",
        label: "Copy Content",
        icon: this.getActionCommandIcon("copy-citation", "C"),
        run: async () => {
          this.copyTextToClipboard(content);
          this.hide();
        },
      };
    }
    if (result.resultType !== "note") {
      return null;
    }
    const item = Zotero.Items.get(result.id) as Zotero.Item | null;
    if (!item?.isNote?.()) {
      return null;
    }
    const content = getItemNoteSnippetSafe(item, 20000).trim();
    if (!content) {
      return null;
    }
    return {
      id: "copy-note-content",
      label: "Copy Content",
      icon: this.getActionCommandIcon("copy-citation", "C"),
      run: async () => {
        this.copyTextToClipboard(content);
        this.hide();
      },
    };
  }

  private createRevealPdfFilePanelAction(
    result: QuickOpenResult,
  ): PanelAction | null {
    const label = `Show in ${this.getFileManagerLabel()}`;
    if (result.kind === "attachment" && result.resultType === "pdf") {
      return {
        id: "reveal-pdf-file",
        label,
        icon: {
          url: "chrome://zotero/skin/16/universal/library-collection.svg",
          text: "⌕",
        },
        run: async () => {
          await this.actionHandler.revealAttachmentFile(result.id);
          this.hide();
        },
      };
    }
    if (
      result.kind === "annotation" &&
      typeof result.attachmentID === "number"
    ) {
      return {
        id: "reveal-annotation-pdf-file",
        label,
        icon: {
          url: "chrome://zotero/skin/16/universal/library-collection.svg",
          text: "⌕",
        },
        run: async () => {
          await this.actionHandler.revealAttachmentFile(result.attachmentID!);
          this.hide();
        },
      };
    }
    if (result.resultType === "note") {
      const note = Zotero.Items.get(result.id) as Zotero.Item | null;
      const parent = note ? this.getParentItem(note) : null;
      if (!parent || !this.hasPdfAttachment(parent)) {
        return null;
      }
      return {
        id: "reveal-parent-pdf-file",
        label,
        icon: {
          url: "chrome://zotero/skin/16/universal/library-collection.svg",
          text: "⌕",
        },
        run: async () => {
          const attachmentID = await this.getPrimaryAttachmentID(parent.id);
          if (!attachmentID) {
            return;
          }
          await this.actionHandler.revealAttachmentFile(attachmentID);
          this.hide();
        },
      };
    }
    if (result.kind !== "item") {
      return null;
    }
    const item = Zotero.Items.get(result.id) as Zotero.Item | null;
    if (!item || !this.hasPdfAttachment(item)) {
      return null;
    }
    return {
      id: "reveal-item-pdf-file",
      label,
      icon: {
        url: "chrome://zotero/skin/16/universal/library-collection.svg",
        text: "⌕",
      },
      run: async () => {
        const attachmentID = await this.getPrimaryAttachmentID(result.id);
        if (!attachmentID) {
          return;
        }
        await this.actionHandler.revealAttachmentFile(attachmentID);
        this.hide();
      },
    };
  }

  private async finishQuickOpen(
    result: QuickOpenResult,
    intent: OpenIntent,
  ): Promise<void> {
    await this.actionHandler.openResult(result, intent);
    this.pushRecentActivated(result.id);
    if (intent !== "reveal") {
      this.recordOpen(result.id);
    }
    this.pushRecentSearch(this.currentQuery);
    this.hide();
  }

  private recordOpen(itemID: number): void {
    if (!itemID || typeof itemID !== "number") {
      return;
    }
    this.rankingState.usageCounts.set(
      itemID,
      (this.rankingState.usageCounts.get(itemID) || 0) + 1,
    );
    this.rankingState.recentItemIDs = this.rankingState.recentItemIDs.filter(
      (id) => id !== itemID,
    );
    this.rankingState.recentItemIDs.unshift(itemID);
    this.rankingState.recentItemIDs = this.rankingState.recentItemIDs.slice(
      0,
      80,
    );
  }

  private async copyItemToClipboard(
    item: Zotero.Item,
    citation: boolean,
  ): Promise<void> {
    const pane = Zotero.getMainWindow()?.ZoteroPane;
    if (!pane) {
      return;
    }
    const previousSelection = (pane.getSelectedItems?.(true) || []) as number[];
    const alreadyOnlyTarget =
      previousSelection.length === 1 && previousSelection[0] === item.id;
    if (!alreadyOnlyTarget) {
      await pane.selectItems?.([item.id]);
    }
    pane.copySelectedItemsToClipboard(citation);
    if (!alreadyOnlyTarget && previousSelection.length) {
      void pane.selectItems?.(previousSelection).catch((error: unknown) => {
        ztoolkit.log("Failed to restore previous item selection", error);
      });
    }
  }

  private copyTextToClipboard(text: string): void {
    const helper = (this.win as any).navigator?.clipboard;
    if (helper?.writeText) {
      void helper.writeText(text).catch(() => {
        Zotero.Utilities.Internal.copyTextToClipboard(text);
      });
      return;
    }
    Zotero.Utilities.Internal.copyTextToClipboard(text);
  }

  private getActionCommandIcon(
    iconName: string,
    fallbackText: string,
  ): NonNullable<PanelAction["icon"]> {
    return {
      url: this.getCommandIconURL(iconName) || undefined,
      text: fallbackText,
    };
  }

  private applyPanelActionIcon(
    icon: HTMLElement,
    definition: NonNullable<PanelAction["icon"]>,
  ): void {
    if (definition.itemType) {
      icon.classList.add("icon", "icon-css", "icon-item-type");
      icon.setAttribute("data-item-type", definition.itemType);
      return;
    }
    if (definition.url) {
      icon.classList.add("has-image-icon");
      icon.style.backgroundImage = `url("${definition.url.replace(/"/g, '\\"')}")`;
      return;
    }
    if (definition.text) {
      icon.textContent = definition.text;
    }
  }

  private getParentItem(item: Zotero.Item): Zotero.Item | null {
    const parentID = (item as any).parentID ?? (item as any).parentItemID;
    if (typeof parentID === "number") {
      return Zotero.Items.get(parentID) as Zotero.Item;
    }
    return null;
  }

  private getCitationTarget(item: Zotero.Item | null): Zotero.Item | null {
    const parent = item ? this.getParentForCommand(item) : null;
    if (!parent) {
      return null;
    }
    if (parent.isRegularItem()) {
      return parent;
    }
    if (parent.isNote?.()) {
      return null;
    }
    return parent;
  }

  private getParentForCommand(item: Zotero.Item | null): Zotero.Item | null {
    if (!item) {
      return null;
    }
    if (item.isRegularItem()) {
      return item;
    }
    const candidate = item as any;
    const parentID = candidate.parentID ?? candidate.parentItemID;
    if (typeof parentID === "number") {
      return Zotero.Items.get(parentID) as Zotero.Item;
    }
    const topLevel = candidate.topLevelItem as Zotero.Item | undefined;
    if (topLevel && topLevel.id && topLevel.id !== item.id) {
      return topLevel;
    }
    return item;
  }

  private async getPrimaryAttachmentID(itemID: number): Promise<number | null> {
    const item = Zotero.Items.get(itemID) as Zotero.Item;
    if (!item) {
      return null;
    }
    const candidate = item as any;
    if (typeof candidate.getBestAttachment === "function") {
      const best = await candidate.getBestAttachment();
      if (typeof best === "number") {
        return best;
      }
      if (best?.id) {
        return best.id as number;
      }
    }
    if (typeof candidate.getPrimaryAttachment === "function") {
      const primary = await candidate.getPrimaryAttachment();
      if (typeof primary === "number") {
        return primary;
      }
      if (primary?.id) {
        return primary.id as number;
      }
    }
    const attachmentIDs = candidate.getAttachments?.() || [];
    for (const attachmentID of attachmentIDs) {
      const attachment = Zotero.Items.get(attachmentID) as Zotero.Item;
      if (attachment && isPDFAttachment(attachment)) {
        return attachmentID;
      }
    }
    return null;
  }

  private getItemTypeIconNameForItem(item: Zotero.Item | null): string | null {
    if (!item) {
      return null;
    }
    if (item.isAttachment()) {
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
    try {
      const typeIconName =
        typeof (item as any).getItemTypeIconName === "function"
          ? (item as any).getItemTypeIconName()
          : null;
      if (typeof typeIconName === "string" && typeIconName.trim()) {
        return typeIconName.trim();
      }
    } catch (error) {
      ztoolkit.log("Failed to get panel item-type icon name", error);
    }
    return item.isAttachment() ? "attachment" : "document";
  }

  private hasPdfAttachment(item: Zotero.Item): boolean {
    const candidate = item as any;
    const attachmentIDs = candidate.getAttachments?.() || [];
    for (const attachmentID of attachmentIDs) {
      const attachment = Zotero.Items.get(attachmentID) as Zotero.Item;
      if (attachment && isPDFAttachment(attachment)) {
        return true;
      }
    }
    return false;
  }

  private getFileManagerLabel(): string {
    if ((Zotero as any).isMac) {
      return "Finder";
    }
    if ((Zotero as any).isWin) {
      return "Explorer";
    }
    return "File Manager";
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
      const commandIconURL = this.getCommandIconURL(
        (result as CommandResult).icon,
      );
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
    badges.push(
      this.getResultTypeBadge((result as QuickOpenResult).resultType),
    );
    if ((result as QuickOpenResult).libraryKind === "group") {
      badges.push("GROUP");
    }

    badges.forEach((label) => {
      const badge = this.createElement("span", "spotlight-tag");
      badge.textContent = label;
      row.appendChild(badge);
    });
    if (isOpenTab) {
      const tabDot = this.createElement("span", "spotlight-tab-dot");
      tabDot.title = "Open tab";
      tabDot.setAttribute("aria-label", "Open tab");
      row.appendChild(tabDot);
    }
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

  // ── Filter hint bar (Option C) ──────────────────────────────────────────────

  private buildFilterHintBar(): void {
    if (!this.filterHintBar) return;
    this.filterHintBar.textContent = "";

    const makeBadge = (
      label: string,
      insert: string,
      title: string,
    ): HTMLButtonElement => {
      const badge = this.createElement(
        "button",
        "spotlight-filter-hint-badge",
      ) as HTMLButtonElement;
      badge.textContent = label;
      badge.title = title;
      badge.addEventListener("mousedown", (e) => {
        e.preventDefault(); // keep input focused
        this.input.value = insert;
        this.input.focus();
        void this.updateResults(this.input.value);
        this.updateFilterHintBar(this.input.value);
        this.updateAutocomplete(this.input.value, this.input.value.length);
      });
      return badge;
    };

    // ── Filters group ────────────────────────────────────────────────────────
    const filtersLabel = this.createElement(
      "span",
      "spotlight-filter-hint-label",
    );
    filtersLabel.textContent = "Filters:";
    this.filterHintBar.appendChild(filtersLabel);

    const filterHints: Array<{ label: string; insert: string; title: string }> =
      [
        {
          label: ":pdf",
          insert: ":pdf ",
          title: "Filter to PDF attachments only\nExample: :pdf Einstein",
        },
        {
          label: ":note",
          insert: ":note ",
          title: "Filter to notes only\nExample: :note meeting",
        },
        {
          label: "#tag",
          insert: "#",
          title:
            "Filter by tag — type the tag name after #\nExample: #machine-learning",
        },
        {
          label: "y:",
          insert: "y:",
          title:
            "Filter by year — supports exact, range, and comparisons\nExamples: y:2024  y:2020-2024  y:>=2020",
        },
        {
          label: "@",
          insert: "@",
          title:
            "Search annotations only\nExample: @ highlighted text in papers",
        },
      ];
    for (const hint of filterHints) {
      this.filterHintBar.appendChild(
        makeBadge(hint.label, hint.insert, hint.title),
      );
    }

    // ── Commands group ───────────────────────────────────────────────────────
    const commandsLabel = this.createElement(
      "span",
      "spotlight-filter-hint-label spotlight-filter-hint-label--commands",
    );
    commandsLabel.textContent = "Commands:";
    this.filterHintBar.appendChild(commandsLabel);

    this.filterHintBar.appendChild(
      makeBadge(
        ">",
        "> ",
        "Switch to command mode\nExample: > Open Tab by URL",
      ),
    );
  }

  private updateFilterHintBar(query: string): void {
    if (!this.filterHintBar) return;
    this.filterHintBar.style.display = query.trim() === "" ? "flex" : "none";
  }

  // ── Colon-triggered autocomplete (Option A) ────────────────────────────────

  private detectAutocompleteContext(
    query: string,
    cursorPos: number,
  ): { prefix: string; tokenStart: number; partialValue: string } | null {
    const beforeCursor = query.slice(0, cursorPos);
    const lastSpaceIdx = beforeCursor.lastIndexOf(" ");
    const tokenStart = lastSpaceIdx + 1;
    const currentToken = beforeCursor.slice(tokenStart);
    // `:` prefix for type — token must start with `:` and have at least the colon
    if (currentToken.startsWith(":")) {
      return {
        prefix: ":",
        tokenStart,
        partialValue: currentToken.slice(1),
      };
    }
    // `y:` prefix for year
    if (currentToken.toLowerCase().startsWith("y:")) {
      return {
        prefix: "y:",
        tokenStart,
        partialValue: currentToken.slice(2),
      };
    }
    return null;
  }

  private updateAutocomplete(query: string, cursorPos: number): void {
    const context = this.detectAutocompleteContext(query, cursorPos);
    if (!context) {
      this.closeAutocomplete();
      return;
    }
    const typeValues = ["pdf", "note", "item", "annotation"];
    const yearValues = ["2024", "2023", "2020-2024", ">=2020", "<=2024"];
    let options: string[];
    if (context.prefix === ":") {
      // Hide if value is already a complete known type
      if (typeValues.includes(context.partialValue)) {
        this.closeAutocomplete();
        return;
      }
      options = context.partialValue
        ? typeValues.filter((v) => v.startsWith(context.partialValue))
        : typeValues;
    } else {
      options = yearValues;
    }
    if (!options.length) {
      this.closeAutocomplete();
      return;
    }
    this.autocompleteItems = options.map((v) => ({ label: v, value: v }));
    this.autocompleteSelectedIndex = -1;
    this.renderAutocomplete(context.prefix);
  }

  private renderAutocomplete(prefix: string): void {
    if (!this.autocompleteDropdown) return;
    this.autocompleteDropdown.textContent = "";
    this.autocompleteItems.forEach((item, i) => {
      const el = this.createElement("div", "spotlight-autocomplete-item");
      if (i === this.autocompleteSelectedIndex) {
        el.classList.add("is-selected");
      }
      const prefixEl = this.createElement(
        "span",
        "spotlight-autocomplete-prefix",
      );
      prefixEl.textContent = prefix;
      const valueEl = this.createElement(
        "span",
        "spotlight-autocomplete-value",
      );
      valueEl.textContent = item.label;
      el.appendChild(prefixEl);
      el.appendChild(valueEl);
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.autocompleteSelectedIndex = i;
        this.insertAutocompleteValue(item.value);
      });
      this.autocompleteDropdown!.appendChild(el);
    });
    this.autocompleteDropdown.style.display = "block";
  }

  private renderAutocompleteSelection(): void {
    if (!this.autocompleteDropdown) return;
    const items = this.autocompleteDropdown.querySelectorAll(
      ".spotlight-autocomplete-item",
    );
    items.forEach((el: Element, i: number) => {
      el.classList.toggle("is-selected", i === this.autocompleteSelectedIndex);
    });
  }

  private insertAutocompleteValue(value: string): void {
    const cursor = this.input.selectionStart ?? this.input.value.length;
    const context = this.detectAutocompleteContext(this.input.value, cursor);
    if (!context) return;
    const before = this.input.value.slice(0, context.tokenStart);
    const after = this.input.value.slice(cursor).trimStart();
    const newValue =
      before + context.prefix + value + (after ? " " + after : " ");
    this.input.value = newValue;
    const newPos =
      context.tokenStart + context.prefix.length + value.length + 1;
    this.input.setSelectionRange(newPos, newPos);
    this.closeAutocomplete();
    void this.updateResults(this.input.value);
    this.updateFilterHintBar(this.input.value);
  }

  private closeAutocomplete(): void {
    if (this.autocompleteDropdown) {
      this.autocompleteDropdown.style.display = "none";
    }
    this.autocompleteItems = [];
    this.autocompleteSelectedIndex = -1;
  }
}

function getWindowHeight(): number {
  const raw = Number((getPref as any)("windowHeight"));
  if (Number.isNaN(raw) || raw <= 0) return 400;
  return Math.min(800, Math.max(200, raw));
}

function getWindowWidth(): number {
  const raw = Number((getPref as any)("windowWidth"));
  if (Number.isNaN(raw) || raw <= 0) return 560;
  return Math.min(1200, Math.max(300, raw));
}
