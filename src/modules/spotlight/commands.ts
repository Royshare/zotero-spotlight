import { createAICommands } from "./aiCommands";

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

export type StreamAction = {
  label: string;
  run: () => void | Promise<void>;
};

export type AIStreamHandle = {
  /** Show the streaming panel with a title before the first chunk arrives. */
  begin: (title: string) => void;
  /** Append a text chunk to the streaming panel. */
  append: (text: string) => void;
  /** Signal streaming is done. Optionally supply a save action. */
  end: (saveAction?: StreamAction) => void;
  /** Display an error message in the streaming panel. */
  error: (message: string) => void;
  /** AbortSignal — aborted when the user presses Escape during streaming. */
  signal: AbortSignal;
};

export type CommandRunOutcome = {
  executed: boolean;
  keepOpen: boolean;
};

export type SpotlightCommandDefinition = {
  id: string;
  title: string;
  subtitle: string;
  keywords?: string[];
  contexts?: CommandContext[];
  shortcut?: string;
  icon?: string;
  group?: string;
  /** If true, text typed after the command keyword is passed as queryArgs. */
  acceptsArgs?: boolean;
  isAvailable?: (context: CommandRunContext) => Availability;
  run: (context: CommandRunContext) => Promise<void>;
};

type Availability = {
  enabled: boolean;
  reason?: string;
};

export type CommandRunContext = {
  win: Window;
  pane: _ZoteroTypes.ZoteroPane | null;
  mainWindow: _ZoteroTypes.MainWindow | null;
  context: CommandContext;
  activeItem: Zotero.Item | null;
  /** Text typed after the command keyword. Populated for commands with acceptsArgs: true. */
  queryArgs?: string;
  /** Streaming output handle. Present when the command is expected to stream output. */
  stream?: AIStreamHandle;
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
  acceptsArgs?: boolean;
  isAvailable: (context: CommandRunContext) => Availability;
  run: (context: CommandRunContext) => Promise<void>;
};

export class CommandRegistry {
  private usageCounts = new Map<string, number>();
  private builtInCommands: SpotlightCommand[];
  private static externalCommands = new Map<string, SpotlightCommand>();

  constructor() {
    this.builtInCommands = this.createBuiltInCommands();
  }

  static registerExternalCommand(command: SpotlightCommandDefinition): void {
    if (!command.id?.trim()) {
      throw new Error("Spotlight command id is required");
    }
    if (CommandRegistry.externalCommands.has(command.id)) {
      throw new Error(`Spotlight command already registered: ${command.id}`);
    }
    CommandRegistry.externalCommands.set(
      command.id,
      normalizeExternalCommand(command),
    );
  }

  static unregisterExternalCommand(commandId: string): boolean {
    return CommandRegistry.externalCommands.delete(commandId);
  }

  static listExternalCommands(): string[] {
    return Array.from(CommandRegistry.externalCommands.keys()).sort();
  }

  async search(
    query: string,
    win: Window,
    limit = 20,
  ): Promise<CommandResult[]> {
    const runContext = this.getRunContext(win);
    const normalizedQuery = normalize(query);
    const results: CommandResult[] = [];
    for (const command of this.getCommands()) {
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

  async run(
    commandId: string,
    win: Window,
    queryArgs?: string,
    streamHandle?: AIStreamHandle,
  ): Promise<CommandRunOutcome> {
    const command = this.getCommands().find((entry) => entry.id === commandId);
    if (!command) {
      return { executed: false, keepOpen: false };
    }
    const runContext = this.getRunContext(win, queryArgs, streamHandle);
    const available = command.isAvailable(runContext);
    if (!available.enabled) {
      return { executed: false, keepOpen: false };
    }
    try {
      await command.run(runContext);
      this.usageCounts.set(
        command.id,
        (this.usageCounts.get(command.id) || 0) + 1,
      );
      return { executed: true, keepOpen: false };
    } catch (error) {
      ztoolkit.log(`Failed to run command: ${command.id}`, error);
      return { executed: false, keepOpen: false };
    }
  }

  private getRunContext(
    win: Window,
    queryArgs?: string,
    streamHandle?: AIStreamHandle,
  ): CommandRunContext {
    const mainWindow = Zotero.getMainWindow() || null;
    const pane = this.getPane(mainWindow);
    return {
      win,
      pane,
      mainWindow,
      context: detectCommandContext(win),
      activeItem: this.getActiveItem(win, pane),
      queryArgs,
      stream: streamHandle,
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
          if (shouldUseExternalPdfHandler()) {
            pane.viewAttachment?.(attachmentID);
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
        id: "literature-note",
        title: "Literature Note",
        subtitle: "Create a structured literature note for the current item",
        keywords: [
          "workflow",
          "literature note",
          "research note",
          "summary",
          "template",
        ],
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
          const parent = getParentForCommand(activeItem);
          if (!pane || !parent || !parent.isRegularItem()) {
            return;
          }
          const note = await createChildNote(
            parent,
            buildLiteratureNoteContent(parent),
          );
          await openNoteForWorkflow(note.id, pane);
        },
      },
      {
        id: "extract-highlights",
        title: "Extract Highlights",
        subtitle: "Create a note from PDF highlights and annotation comments",
        keywords: [
          "workflow",
          "extract highlights",
          "annotations",
          "highlights",
          "pdf",
        ],
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
          if (!hasPdfAttachment(parent)) {
            return {
              enabled: false,
              reason: "Current item does not have a PDF attachment",
            };
          }
          return { enabled: true };
        },
        run: async ({ pane, activeItem }) => {
          const parent = getParentForCommand(activeItem);
          if (!pane || !parent || !parent.isRegularItem()) {
            return;
          }
          const attachmentID = await getBestPdfAttachmentID(parent);
          if (!attachmentID) {
            return;
          }
          const attachment = Zotero.Items.get(attachmentID) as Zotero.Item;
          if (!attachment) {
            return;
          }
          const note = await createChildNote(
            parent,
            buildExtractHighlightsNoteContent(parent, attachment),
          );
          await openNoteForWorkflow(note.id, pane);
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
      {
        id: "show-pdf-in-file-manager",
        title: `Show PDF in ${getFileManagerLabel()}`,
        subtitle: `Reveal the current PDF file in ${getFileManagerLabel()}`,
        keywords: [
          "finder",
          "explorer",
          "reveal",
          "show file",
          "pdf",
          "attachment",
        ],
        contexts: ["main", "reader", "note"],
        icon: "collection",
        group: "Navigation",
        isAvailable: ({ activeItem }) => {
          const parent = getParentForCommand(activeItem);
          if (!parent || !parent.isRegularItem()) {
            return { enabled: false, reason: "Select an item first" };
          }
          if (!hasPdfAttachment(parent)) {
            return {
              enabled: false,
              reason: "Current item does not have a PDF attachment",
            };
          }
          return { enabled: true };
        },
        run: async ({ activeItem }) => {
          const parent = getParentForCommand(activeItem);
          if (!parent || !parent.isRegularItem()) {
            return;
          }
          const attachmentID = await getBestPdfAttachmentID(parent);
          if (!attachmentID) {
            return;
          }
          await revealAttachmentInFileManager(attachmentID);
        },
      },
    ];
  }

  private getCommands(): SpotlightCommand[] {
    return [
      ...this.builtInCommands,
      ...createAICommands().map(normalizeExternalCommand),
      ...Array.from(CommandRegistry.externalCommands.values()),
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

async function createChildNote(
  parent: Zotero.Item,
  noteHTML: string,
): Promise<Zotero.Item> {
  const note = new Zotero.Item("note");
  note.libraryID = parent.libraryID;
  (note as any).parentID = parent.id;
  note.setNote(noteHTML);
  await note.saveTx();
  return note;
}

async function openNoteForWorkflow(
  noteID: number,
  pane: _ZoteroTypes.ZoteroPane,
): Promise<void> {
  try {
    const notes = (Zotero as any).Notes;
    if (notes?.open) {
      await notes.open(noteID, null, { openInWindow: false });
      return;
    }
  } catch (error) {
    ztoolkit.log("Failed to open workflow note", error);
  }
  pane.selectItem?.(noteID);
}

function buildLiteratureNoteContent(item: Zotero.Item): string {
  const title = escapeHTML(item.getDisplayTitle?.() || "Untitled");
  const creators = escapeHTML(getCreatorLine(item) || "");
  const year = escapeHTML(getYearLine(item) || "");
  const publication = escapeHTML(getPublicationLine(item) || "");
  const tags =
    item
      .getTags?.()
      .map((entry) => entry.tag)
      .filter(Boolean) || [];
  const abstractText = escapeHTML(getAbstractLine(item) || "");
  const tagsHTML = tags.length
    ? `<p><strong>Tags</strong>: ${tags.map(escapeHTML).join(", ")}</p>`
    : "";
  return `
    <h1>Literature note</h1>
    <h2>${title}</h2>
    ${creators ? `<p><strong>Authors</strong>: ${creators}</p>` : ""}
    ${year ? `<p><strong>Year</strong>: ${year}</p>` : ""}
    ${publication ? `<p><strong>Source</strong>: ${publication}</p>` : ""}
    ${tagsHTML}
    ${abstractText ? `<h3>Abstract</h3><p>${abstractText}</p>` : ""}
    <h3>Key contribution</h3>
    <p></p>
    <h3>Main ideas</h3>
    <ul><li></li></ul>
    <h3>Evidence / methods</h3>
    <ul><li></li></ul>
    <h3>Questions</h3>
    <ul><li></li></ul>
    <h3>Connections</h3>
    <ul><li></li></ul>
  `;
}

function buildExtractHighlightsNoteContent(
  parent: Zotero.Item,
  attachment: Zotero.Item,
): string {
  const title = escapeHTML(parent.getDisplayTitle?.() || "Untitled");
  const annotations = [...(attachment.getAnnotations?.() || [])]
    .filter((annotation) => {
      const text = annotation.annotationText?.trim() || "";
      const comment = annotation.annotationComment?.trim() || "";
      return !!text || !!comment;
    })
    .sort((a, b) => {
      const left = String(a.annotationSortIndex || "");
      const right = String(b.annotationSortIndex || "");
      return left.localeCompare(right, undefined, { numeric: true });
    });
  const entriesHTML = annotations.length
    ? annotations
        .map((annotation) => {
          const page = escapeHTML(annotation.annotationPageLabel || "");
          const quote = escapeHTML(annotation.annotationText || "");
          const comment = escapeHTML(annotation.annotationComment || "");
          const color = normalizeAnnotationColor(annotation.annotationColor);
          return `
            <li>
              <p><strong>${page ? `p. ${page}` : "Annotation"}</strong></p>
              ${quote ? `<blockquote>${quote}</blockquote>` : ""}
              ${comment ? `<p>${comment}</p>` : ""}
              <p><em>${escapeHTML(color)}</em></p>
            </li>
          `;
        })
        .join("")
    : "<li><p>No extracted highlights were available.</p></li>";
  return `
    <h1>Extracted highlights</h1>
    <h2>${title}</h2>
    <p><strong>Source PDF</strong>: ${escapeHTML(
      (attachment as any).attachmentFilename ||
        attachment.getDisplayTitle?.() ||
        "PDF",
    )}</p>
    <p><strong>Total annotations</strong>: ${annotations.length}</p>
    <ol>${entriesHTML}</ol>
  `;
}

function hasPdfAttachment(item: Zotero.Item): boolean {
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

async function revealAttachmentInFileManager(
  attachmentID: number,
): Promise<void> {
  const attachment = Zotero.Items.get(attachmentID) as Zotero.Item;
  if (!attachment || !attachment.isAttachment()) {
    return;
  }
  const filePath =
    typeof (attachment as any).getFilePathAsync === "function"
      ? await (attachment as any).getFilePathAsync()
      : (attachment as any).getFilePath?.();
  if (!filePath || typeof filePath !== "string") {
    return;
  }
  await Zotero.File.reveal(filePath);
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

function shouldUseExternalPdfHandler(): boolean {
  const handler = String(Zotero.Prefs.get("fileHandler.pdf") || "").trim();
  return handler.length > 0;
}

function getFileManagerLabel(): string {
  if ((Zotero as any).isMac) {
    return "Finder";
  }
  if ((Zotero as any).isWin) {
    return "Explorer";
  }
  return "File Manager";
}

function getCreatorLine(item: Zotero.Item): string {
  const creators = item.getCreators?.() || [];
  return creators
    .map((creator) => {
      const first = creator.firstName || "";
      const last = creator.lastName || "";
      return `${first} ${last}`.trim();
    })
    .filter(Boolean)
    .join(", ");
}

function getYearLine(item: Zotero.Item): string {
  const date = String(item.getField?.("date", true, true) || "").trim();
  const match = date.match(/\b(\d{4})\b/);
  return match ? match[1] : "";
}

function getPublicationLine(item: Zotero.Item): string {
  const fields = [
    "publicationTitle",
    "proceedingsTitle",
    "bookTitle",
    "publisher",
  ];
  for (const field of fields) {
    const value = String(item.getField?.(field, true, true) || "").trim();
    if (value) {
      return value;
    }
  }
  return "";
}

function getAbstractLine(item: Zotero.Item): string {
  return String(item.getField?.("abstractNote", true, true) || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAnnotationColor(value: string): string {
  const normalized = value.toLowerCase();
  const map: Record<string, string> = {
    "#ffd400": "Yellow highlight",
    "#ff6666": "Red highlight",
    "#5fb236": "Green highlight",
    "#2ea8e5": "Blue highlight",
    "#a28ae5": "Purple highlight",
  };
  return map[normalized] || value || "Highlight";
}

function escapeHTML(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function normalizeExternalCommand(
  command: SpotlightCommandDefinition,
): SpotlightCommand {
  return {
    id: command.id,
    title: command.title,
    subtitle: command.subtitle,
    keywords: command.keywords || [],
    contexts: command.contexts?.length
      ? command.contexts
      : ["main", "reader", "note"],
    shortcut: command.shortcut,
    icon: command.icon,
    group: command.group,
    acceptsArgs: command.acceptsArgs ?? false,
    isAvailable: command.isAvailable || (() => ({ enabled: true })),
    run: command.run,
  };
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
