import type { ActionHandler } from "./actions";
import type { QuickOpenResult } from "./search";
import type { SearchService } from "./search";

const HTML_NS = "http://www.w3.org/1999/xhtml";

export class PaletteUI {
  private win: Window;
  private doc: Document;
  private root: HTMLDivElement;
  private input: HTMLInputElement;
  private list: HTMLDivElement;
  private styleElement: HTMLStyleElement;
  private searchService: SearchService;
  private actionHandler: ActionHandler;
  private results: QuickOpenResult[] = [];
  private selectedIndex = 0;
  private open = false;
  private searchToken = 0;
  private outsideClickHandler: (event: MouseEvent) => void;
  private currentQuery = "";
  private showRecentHeader = false;
  private lastOpenReaderIDs = new Set<number>();
  private recentClosedAttachmentIDs: number[] = [];

  constructor(
    win: Window,
    searchService: SearchService,
    actionHandler: ActionHandler,
  ) {
    this.win = win;
    this.doc = win.document;
    this.searchService = searchService;
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
    this.root.style.display = "block";
    this.input.value = "";
    this.results = [];
    this.selectedIndex = 0;
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
        void this.activateSelection(event.metaKey || event.ctrlKey);
      }
    });
  }

  private async updateResults(query: string): Promise<void> {
    const token = (this.searchToken += 1);
    this.currentQuery = query.trim();
    if (!this.currentQuery) {
      this.results = this.buildRecentResults();
      this.showRecentHeader = true;
      this.selectedIndex = 0;
      this.renderResults();
      return;
    }
    const results = await this.searchService.search(this.currentQuery, 20);
    if (token !== this.searchToken) {
      return;
    }
    this.results = results;
    this.showRecentHeader = false;
    this.selectedIndex = 0;
    this.renderResults();
  }

  private moveSelection(delta: number): void {
    if (!this.results.length) {
      return;
    }
    const maxIndex = this.results.length - 1;
    this.selectedIndex = Math.max(
      0,
      Math.min(maxIndex, this.selectedIndex + delta),
    );
    this.renderResults();
  }

  private async activateSelection(alternate: boolean): Promise<void> {
    const result = this.results[this.selectedIndex];
    if (!result) {
      return;
    }
    await this.actionHandler.openResult(result, alternate);
    this.hide();
  }

  private renderResults(): void {
    this.list.textContent = "";
    const openTabItemIDs = new Set(
      this.getOpenTabEntries().map((entry) => entry.itemID),
    );
    if (this.showRecentHeader) {
      const header = this.createElement("div", "spotlight-section");
      header.textContent = "Recent";
      this.list.appendChild(header);
    }
    if (!this.results.length) {
      const empty = this.createElement("div", "spotlight-empty");
      empty.textContent = this.showRecentHeader
        ? "No recent items"
        : "No results";
      this.list.appendChild(empty);
      return;
    }
    this.results.forEach((result, index) => {
      const row = this.createElement("div", "spotlight-result");
      if (index === this.selectedIndex) {
        row.classList.add("is-selected");
      }
      const content = this.createElement("div", "spotlight-content");
      const title = this.createElement("div", "spotlight-title");
      title.textContent = result.title;
      const subtitle = this.createElement("div", "spotlight-subtitle");
      subtitle.textContent = result.subtitle;
      content.appendChild(title);
      content.appendChild(subtitle);
      row.appendChild(content);
      if (openTabItemIDs.has(result.id)) {
        const tag = this.createElement("span", "spotlight-tag");
        tag.textContent = "TAB";
        row.appendChild(tag);
      }
      row.addEventListener("mousemove", () => {
        this.selectedIndex = index;
        this.renderResults();
      });
      row.addEventListener("click", () => {
        void this.activateSelection(false);
      });
      this.list.appendChild(row);
    });
    const selected = this.list.querySelector(".is-selected");
    if (selected && "scrollIntoView" in selected) {
      (selected as HTMLElement).scrollIntoView({ block: "nearest" });
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
    const list = this.createElement("div", "spotlight-list") as HTMLDivElement;
    list.id = "zotero-spotlight-list";
    root.appendChild(input);
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

#zotero-spotlight-list {
  margin-top: 10px;
  max-height: 280px;
  overflow-y: auto;
}

.spotlight-result {
  padding: 8px 10px;
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

  private buildRecentResults(): QuickOpenResult[] {
    this.updateRecentClosed();
    const activeID = this.getActiveTabItemID();
    const openEntries = this.getOpenTabEntries().filter(
      (entry) => entry.itemID !== activeID,
    );
    const recentOpen = openEntries.slice(-3).reverse();
    const recentClosed = this.recentClosedAttachmentIDs
      .filter((id) => id !== activeID)
      .slice(0, 2)
      .map((id) => ({ kind: "attachment" as const, itemID: id }));
    const entries = [...recentOpen, ...recentClosed];
    const results: QuickOpenResult[] = [];
    for (const entry of entries) {
      const result =
        entry.kind === "note"
          ? this.createNoteResult(entry.itemID)
          : this.createAttachmentResult(entry.itemID);
      if (result) {
        results.push(result);
      }
    }
    return results;
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
      .filter((entry) => typeof entry.itemID === "number");
  }

  private getActiveTabItemID(): number | null {
    const localTabs = (this.win as any).Zotero_Tabs as
      | _ZoteroTypes.Zotero_Tabs
      | undefined;
    const mainTabs = Zotero.getMainWindow()?.Zotero_Tabs as
      | _ZoteroTypes.Zotero_Tabs
      | undefined;
    if (localTabs) {
      const tabID =
        localTabs.selectedID ||
        localTabs.selectedTabID ||
        localTabs.selectedTab?.id;
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
      const tabID =
        mainTabs.selectedID ||
        mainTabs.selectedTabID ||
        mainTabs.selectedTab?.id;
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
    const title =
      filename || attachment.getField("title") || attachment.getDisplayTitle();
    const parentID =
      (attachment as any).parentID ?? (attachment as any).parentItemID;
    const parent = parentID
      ? (Zotero.Items.get(parentID) as Zotero.Item)
      : null;
    const subtitle = parent
      ? parent.getField("title") || parent.getDisplayTitle()
      : "";
    return {
      id: attachmentID,
      kind: "attachment",
      title: title || "Attachment",
      subtitle,
      score: 0,
    };
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
    const subtitle = parent
      ? parent.getField("title") || parent.getDisplayTitle()
      : "Note";
    return {
      id: noteID,
      kind: "item",
      title,
      subtitle,
      score: 0,
    };
  }
}
