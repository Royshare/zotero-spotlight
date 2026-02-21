export type CommandContext = "main" | "reader" | "note";

export interface CommandResult {
  kind: "command";
  commandId: string;
  title: string;
  subtitle: string;
  score: number;
  shortcut?: string;
  icon?: string;
  group?: string;
}

type Availability = {
  enabled: boolean;
  reason?: string;
};

type CommandRunContext = {
  win: Window;
  pane: _ZoteroTypes.ZoteroPane | null;
  mainWindow: _ZoteroTypes.MainWindow | null;
  context: CommandContext;
  activeItem: Zotero.Item | null;
};

type SpotlightCommand = {
  id: string;
  title: string;
  subtitle: string;
  keywords: string[];
  contexts: CommandContext[];
  shortcut?: string;
  icon?: string;
  group?: string;
  isAvailable: (context: CommandRunContext) => Availability;
  run: (context: CommandRunContext) => Promise<void>;
};

export class CommandRegistry {
  private usageCounts = new Map<string, number>();
  private commands: SpotlightCommand[];

  constructor() {
    this.commands = this.createBuiltInCommands();
  }

  async search(
    query: string,
    win: Window,
    limit = 20,
  ): Promise<CommandResult[]> {
    const runContext = this.getRunContext(win);
    const normalizedQuery = normalize(query);
    const results: CommandResult[] = [];
    for (const command of this.commands) {
      if (!command.contexts.includes(runContext.context)) {
        continue;
      }
      const available = command.isAvailable(runContext);
      if (!available.enabled) {
        continue;
      }
      const searchText = normalize(
        `${command.title} ${command.keywords.join(" ")}`,
      );
      const baseScore = normalizedQuery
        ? fuzzyScore(normalizedQuery, searchText)
        : 10;
      if (baseScore <= 0) {
        continue;
      }
      const usageBoost = this.usageCounts.get(command.id) || 0;
      results.push({
        kind: "command",
        commandId: command.id,
        title: command.title,
        subtitle: command.subtitle,
        score: baseScore + usageBoost * 4,
        shortcut: command.shortcut,
        icon: command.icon,
        group: command.group,
      });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async run(commandId: string, win: Window): Promise<boolean> {
    const command = this.commands.find((entry) => entry.id === commandId);
    if (!command) {
      return false;
    }
    const runContext = this.getRunContext(win);
    const available = command.isAvailable(runContext);
    if (!available.enabled) {
      return false;
    }
    try {
      await command.run(runContext);
      this.usageCounts.set(
        command.id,
        (this.usageCounts.get(command.id) || 0) + 1,
      );
      return true;
    } catch (error) {
      ztoolkit.log(`Failed to run command: ${command.id}`, error);
      return false;
    }
  }

  private getRunContext(win: Window): CommandRunContext {
    const mainWindow = Zotero.getMainWindow() || null;
    const pane = this.getPane(mainWindow);
    return {
      win,
      pane,
      mainWindow,
      context: detectCommandContext(win),
      activeItem: this.getActiveItem(win, pane),
    };
  }

  private getPane(
    mainWindow: _ZoteroTypes.MainWindow | null,
  ): _ZoteroTypes.ZoteroPane | null {
    if (mainWindow?.ZoteroPane) {
      return mainWindow.ZoteroPane;
    }
    try {
      return Zotero.getActiveZoteroPane() || null;
    } catch (error) {
      ztoolkit.log("Failed to resolve active Zotero pane", error);
      return null;
    }
  }

  private getActiveItem(
    win: Window,
    pane: _ZoteroTypes.ZoteroPane | null,
  ): Zotero.Item | null {
    const selectedItem = pane?.getSelectedItems?.()?.[0] as
      | Zotero.Item
      | undefined;
    if (selectedItem) {
      return selectedItem;
    }
    const tabItemID = getActiveTabItemID(win);
    if (tabItemID) {
      const item = Zotero.Items.get(tabItemID) as Zotero.Item;
      if (item) {
        return item;
      }
    }
    return null;
  }

  private createBuiltInCommands(): SpotlightCommand[] {
    return [
      {
        id: "new-note",
        title: "New Note",
        subtitle: "Create a note from current item or library root",
        keywords: ["create", "note", "child", "standalone"],
        contexts: ["main", "reader", "note"],
        icon: "note",
        group: "Items",
        isAvailable: ({ pane }) => {
          if (!pane) {
            return {
              enabled: false,
              reason: "Main Zotero pane is unavailable",
            };
          }
          if (typeof pane.canEdit === "function" && !pane.canEdit()) {
            return { enabled: false, reason: "Selected library is read-only" };
          }
          return { enabled: true };
        },
        run: async ({ pane, activeItem }) => {
          if (!pane) {
            return;
          }
          const parent = getParentForCommand(activeItem);
          const parentKey = parent?.key;
          await pane.newNote(false, parentKey);
        },
      },
      {
        id: "copy-citation",
        title: "Copy Citation",
        subtitle: "Copy citation for selected/current item",
        keywords: ["quick copy", "reference", "cite", "clipboard"],
        contexts: ["main", "reader", "note"],
        shortcut: "Shift+Cmd/Ctrl+A",
        icon: "copy-citation",
        group: "Export",
        isAvailable: ({ pane, activeItem }) => {
          if (!pane) {
            return {
              enabled: false,
              reason: "Main Zotero pane is unavailable",
            };
          }
          if (!getCitationTarget(activeItem)) {
            return {
              enabled: false,
              reason: "Select an item with citation metadata",
            };
          }
          return { enabled: true };
        },
        run: async ({ pane, activeItem }) => {
          const target = getCitationTarget(activeItem);
          if (!pane || !target) {
            return;
          }
          const previousSelection = (pane.getSelectedItems?.(true) ||
            []) as number[];
          const alreadyOnlyTarget =
            previousSelection.length === 1 &&
            previousSelection[0] === target.id;
          if (!alreadyOnlyTarget) {
            await pane.selectItems([target.id]);
          }
          pane.copySelectedItemsToClipboard(true);
          if (!alreadyOnlyTarget && previousSelection.length) {
            void pane.selectItems(previousSelection).catch((error: unknown) => {
              ztoolkit.log("Failed to restore previous item selection", error);
            });
          }
        },
      },
      {
        id: "copy-bibliography",
        title: "Copy Bibliography",
        subtitle: "Copy bibliography for selected/current item",
        keywords: ["quick copy", "reference", "bibliography", "clipboard"],
        contexts: ["main", "reader", "note"],
        shortcut: "Shift+Cmd/Ctrl+C",
        icon: "copy-bibliography",
        group: "Export",
        isAvailable: ({ pane, activeItem }) => {
          if (!pane) {
            return {
              enabled: false,
              reason: "Main Zotero pane is unavailable",
            };
          }
          if (!getCitationTarget(activeItem)) {
            return {
              enabled: false,
              reason: "Select an item with bibliography metadata",
            };
          }
          return { enabled: true };
        },
        run: async ({ pane, activeItem }) => {
          const target = getCitationTarget(activeItem);
          if (!pane || !target) {
            return;
          }
          const previousSelection = (pane.getSelectedItems?.(true) ||
            []) as number[];
          const alreadyOnlyTarget =
            previousSelection.length === 1 &&
            previousSelection[0] === target.id;
          if (!alreadyOnlyTarget) {
            await pane.selectItems([target.id]);
          }
          pane.copySelectedItemsToClipboard(false);
          if (!alreadyOnlyTarget && previousSelection.length) {
            void pane.selectItems(previousSelection).catch((error: unknown) => {
              ztoolkit.log("Failed to restore previous item selection", error);
            });
          }
        },
      },
      {
        id: "note-and-open-pdf",
        title: "Add Note + Open PDF",
        subtitle: "Create note for current item and open its PDF",
        keywords: ["workflow", "note", "pdf", "open", "focus"],
        contexts: ["main", "reader", "note"],
        icon: "note",
        group: "Workflow",
        isAvailable: ({ pane, activeItem }) => {
          if (!pane) {
            return {
              enabled: false,
              reason: "Main Zotero pane is unavailable",
            };
          }
          if (typeof pane.canEdit === "function" && !pane.canEdit()) {
            return { enabled: false, reason: "Selected library is read-only" };
          }
          const parent = getParentForCommand(activeItem);
          if (!parent || !parent.isRegularItem()) {
            return { enabled: false, reason: "Select an item first" };
          }
          return { enabled: true };
        },
        run: async ({ pane, activeItem }) => {
          if (!pane) {
            return;
          }
          const parent = getParentForCommand(activeItem);
          if (!parent || !parent.isRegularItem()) {
            return;
          }
          await pane.newNote(false, parent.key);
          const attachmentID = await getBestPdfAttachmentID(parent);
          if (!attachmentID) {
            return;
          }
          if (typeof (Zotero as any).Reader?.open === "function") {
            await (Zotero as any).Reader.open(attachmentID, {
              openInWindow: false,
            });
            return;
          }
          pane.viewAttachment?.(attachmentID);
        },
      },
      {
        id: "open-collection",
        title: "Open Collection",
        subtitle: "Jump to parent collection for current item",
        keywords: ["navigate", "folder", "collection", "library"],
        contexts: ["main", "reader", "note"],
        icon: "collection",
        group: "Navigation",
        isAvailable: ({ pane, activeItem }) => {
          if (!pane) {
            return {
              enabled: false,
              reason: "Main Zotero pane is unavailable",
            };
          }
          const target = getCollectionTarget(activeItem);
          if (!target) {
            return { enabled: false, reason: "No current item to resolve" };
          }
          if (!getFirstCollectionID(target)) {
            return {
              enabled: false,
              reason: "Item is not assigned to any collection",
            };
          }
          return { enabled: true };
        },
        run: async ({ pane, mainWindow, activeItem }) => {
          const target = getCollectionTarget(activeItem);
          const collectionID = target ? getFirstCollectionID(target) : null;
          if (!pane || !mainWindow || !target || !collectionID) {
            return;
          }
          mainWindow.Zotero_Tabs?.select?.("zotero-pane");
          const collectionsView = pane.collectionsView;
          if (collectionsView) {
            const rowIndex = collectionsView.getRowIndexByID?.(
              `C${collectionID}`,
            );
            if (typeof rowIndex === "number" && rowIndex >= 0) {
              (collectionsView as any).selection?.select?.(rowIndex);
              collectionsView.ensureRowIsVisible?.(rowIndex);
            }
          }
          pane.selectItem?.(target.id);
        },
      },
    ];
  }
}

export function detectCommandContext(win: Window): CommandContext {
  const windowType =
    win.document?.documentElement?.getAttribute("windowtype") || "";
  if (windowType === "zotero:reader") {
    return "reader";
  }
  if (windowType.toLowerCase().includes("note")) {
    return "note";
  }
  const href = win.location?.href || "";
  if (href.toLowerCase().includes("note")) {
    return "note";
  }
  if ((win as any).Reader || (win as any).ZoteroReader) {
    return "reader";
  }
  return "main";
}

function getCitationTarget(item: Zotero.Item | null): Zotero.Item | null {
  const parent = getParentForCommand(item);
  if (!parent) {
    return null;
  }
  if (parent.isRegularItem()) {
    return parent;
  }
  if (parent.isNote && parent.isNote()) {
    return null;
  }
  return parent;
}

function getCollectionTarget(item: Zotero.Item | null): Zotero.Item | null {
  return getParentForCommand(item);
}

function getParentForCommand(item: Zotero.Item | null): Zotero.Item | null {
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

function getFirstCollectionID(item: Zotero.Item): number | null {
  const collections = item.getCollections?.();
  if (!collections || !collections.length) {
    return null;
  }
  const collectionID = collections[0];
  return typeof collectionID === "number" ? collectionID : null;
}

async function getBestPdfAttachmentID(
  item: Zotero.Item,
): Promise<number | null> {
  const candidate = item as any;
  if (typeof candidate.getBestAttachment === "function") {
    const best = await candidate.getBestAttachment();
    if (typeof best === "number") {
      const bestItem = Zotero.Items.get(best) as Zotero.Item;
      return bestItem && isPDFAttachment(bestItem) ? best : null;
    }
    if (best?.id) {
      const bestItem = Zotero.Items.get(best.id) as Zotero.Item;
      return bestItem && isPDFAttachment(bestItem) ? (best.id as number) : null;
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

function isPDFAttachment(item: Zotero.Item): boolean {
  const candidate = item as any;
  if (typeof candidate.isPDFAttachment === "function") {
    return !!candidate.isPDFAttachment();
  }
  const contentType =
    candidate.attachmentContentType || candidate.attachmentMIMEType || "";
  return String(contentType).toLowerCase().includes("pdf");
}

function getActiveTabItemID(win: Window): number | null {
  const localTabs = (win as any).Zotero_Tabs as
    | _ZoteroTypes.Zotero_Tabs
    | undefined;
  if (localTabs) {
    const tabID = localTabs.selectedID;
    if (tabID && localTabs._tabs) {
      const match = localTabs._tabs.find((entry) => entry.id === tabID);
      if (match?.data?.itemID && typeof match.data.itemID === "number") {
        return match.data.itemID;
      }
    }
  }
  const reader = (Zotero as any).Reader;
  const readers = reader?._readers as _ZoteroTypes.ReaderInstance[] | undefined;
  const matchByWindow = readers?.find((entry) => entry._window === win);
  if (matchByWindow?.itemID) {
    return matchByWindow.itemID;
  }
  const mainTabs = Zotero.getMainWindow()?.Zotero_Tabs;
  if (mainTabs?.selectedID && mainTabs._tabs) {
    const match = mainTabs._tabs.find(
      (entry) => entry.id === mainTabs.selectedID,
    );
    if (match?.data?.itemID && typeof match.data.itemID === "number") {
      return match.data.itemID;
    }
  }
  return null;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function fuzzyScore(query: string, text: string): number {
  const q = normalize(query);
  const t = normalize(text);
  if (!q || !t) {
    return -1;
  }
  let score = 0;
  let tIndex = 0;
  let lastMatch = -1;
  let consecutive = 0;
  for (let i = 0; i < q.length; i += 1) {
    const char = q[i];
    let found = false;
    while (tIndex < t.length) {
      if (t[tIndex] === char) {
        found = true;
        break;
      }
      tIndex += 1;
    }
    if (!found) {
      return -1;
    }
    if (tIndex === lastMatch + 1) {
      consecutive += 1;
      score += 5 + consecutive;
    } else {
      consecutive = 0;
      score += 1;
    }
    if (tIndex === 0 || " /-_".includes(t[tIndex - 1])) {
      score += 3;
    }
    lastMatch = tIndex;
    tIndex += 1;
  }
  if (t.includes(q)) {
    score += 8;
  }
  score += Math.max(0, 10 - (t.length - q.length));
  return score;
}
