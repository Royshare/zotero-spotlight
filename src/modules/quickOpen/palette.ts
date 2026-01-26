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
      "#zotero-quick-open-input",
    ) as HTMLInputElement;
    this.list = this.root.querySelector(
      "#zotero-quick-open-list",
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
    const results = await this.searchService.search(query, 20);
    if (token !== this.searchToken) {
      return;
    }
    this.results = results;
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
    if (!this.results.length) {
      const empty = this.createElement("div", "quick-open-empty");
      empty.textContent = "No results";
      this.list.appendChild(empty);
      return;
    }
    this.results.forEach((result, index) => {
      const row = this.createElement("div", "quick-open-result");
      if (index === this.selectedIndex) {
        row.classList.add("is-selected");
      }
      const title = this.createElement("div", "quick-open-title");
      title.textContent = result.title;
      const subtitle = this.createElement("div", "quick-open-subtitle");
      subtitle.textContent = result.subtitle;
      row.appendChild(title);
      row.appendChild(subtitle);
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
    const root = this.createElement("div", "quick-open-root") as HTMLDivElement;
    root.id = "zotero-quick-open-root";
    const input = this.createElement(
      "input",
      "quick-open-input",
    ) as HTMLInputElement;
    input.id = "zotero-quick-open-input";
    input.type = "text";
    input.placeholder = "Quick Open...";
    const list = this.createElement("div", "quick-open-list") as HTMLDivElement;
    list.id = "zotero-quick-open-list";
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
    style.id = "zotero-quick-open-style";
    style.textContent = `
#zotero-quick-open-root {
  position: fixed;
  top: 18%;
  left: 50%;
  transform: translateX(-50%);
  width: 560px;
  max-width: 80vw;
  background: #f6f5f2;
  border: 1px solid #c9c5bf;
  border-radius: 10px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.25);
  padding: 12px;
  z-index: 999999;
  font: inherit;
}

#zotero-quick-open-input {
  width: calc(100% - 6px);
  box-sizing: border-box;
  border: 1px solid #c9c5bf;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 14px;
  background: #ffffff;
  color: #1f1d1a;
  outline: none;
}

#zotero-quick-open-input:focus {
  border-color: #8f8a81;
  box-shadow: 0 0 0 2px rgba(143, 138, 129, 0.25);
}

#zotero-quick-open-list {
  margin-top: 10px;
  max-height: 280px;
  overflow-y: auto;
}

.quick-open-result {
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
}

.quick-open-result.is-selected {
  background: #e7e2da;
}

.quick-open-title {
  font-size: 13px;
  font-weight: 600;
  color: #1f1d1a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.quick-open-subtitle {
  font-size: 12px;
  color: #5b564f;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.quick-open-empty {
  padding: 10px;
  color: #5b564f;
  font-size: 12px;
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
}
