import type { QuickOpenResult } from "./search";

export type OpenIntent = "default" | "alternate" | "reveal";

export class ActionHandler {
  async openResult(
    result: QuickOpenResult,
    intent: OpenIntent = "default",
  ): Promise<void> {
    if (intent === "reveal") {
      await this.revealInLibrary(result.id);
      return;
    }
    const alternate = intent === "alternate";
    if (result.kind === "attachment") {
      await this.openAttachment(result.id, alternate);
      return;
    }
    await this.openItem(result.id, alternate);
  }

  async openAttachment(attachmentID: number, alternate = false): Promise<void> {
    const attachment = Zotero.Items.get(attachmentID) as Zotero.Item;
    if (!attachment) {
      return;
    }
    const existing = getExistingReader(attachmentID);
    if (existing) {
      const mainWindow = Zotero.getMainWindow();
      if (existing.tabID && mainWindow?.Zotero_Tabs?.select) {
        mainWindow.Zotero_Tabs.select(existing.tabID);
      }
      existing.focus?.();
      return;
    }
    if (typeof (Zotero as any).Reader?.open === "function") {
      try {
        await (Zotero as any).Reader.open(attachmentID, {
          openInWindow: alternate,
        });
        return;
      } catch (error) {
        ztoolkit.log(
          "Reader.open failed, falling back to viewAttachment",
          error,
        );
      }
    }
    const mainWindow = Zotero.getMainWindow();
    const pane = mainWindow?.ZoteroPane;
    if (pane?.viewAttachment) {
      pane.viewAttachment(attachmentID);
    }
  }

  async openItem(itemID: number, alternate = false): Promise<void> {
    const mainWindow = Zotero.getMainWindow();
    if (mainWindow?.Zotero_Tabs?.select) {
      mainWindow.Zotero_Tabs.select("zotero-pane");
    }
    const pane = mainWindow?.ZoteroPane;
    const item = Zotero.Items.get(itemID) as Zotero.Item;
    if (item?.isNote && item.isNote()) {
      const tabs = mainWindow?.Zotero_Tabs as
        | _ZoteroTypes.Zotero_Tabs
        | undefined;
      const existingID = tabs?.getTabIDByItemID?.(itemID);
      if (existingID) {
        tabs?.select?.(existingID);
        return;
      }
      try {
        if (typeof (item as any).loadDataType === "function") {
          await (item as any).loadDataType("note");
        }
        const notes = (Zotero as any).Notes;
        if (notes?.open) {
          await notes.open(itemID, null, { openInWindow: false });
          return;
        }
      } catch (error) {
        ztoolkit.log("Failed to open note tab", error);
      }
      pane?.selectItem?.(itemID);
      pane?.openNoteWindow?.(itemID);
      return;
    }
    if (pane?.selectItem) {
      pane.selectItem(itemID);
    }
    const attachmentID = await this.getPrimaryAttachmentID(itemID);
    if (attachmentID) {
      await this.openAttachment(attachmentID, alternate);
    }
  }

  private async revealInLibrary(itemID: number): Promise<void> {
    const mainWindow = Zotero.getMainWindow();
    mainWindow?.Zotero_Tabs?.select?.("zotero-pane");
    const pane = mainWindow?.ZoteroPane;
    if (pane?.selectItem) {
      await pane.selectItem(itemID);
    }
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
      if (attachment && isPdfAttachment(attachment)) {
        return attachmentID;
      }
    }
    return null;
  }
}

function isPdfAttachment(item: Zotero.Item): boolean {
  const candidate = item as any;
  if (typeof candidate.isPDFAttachment === "function") {
    return candidate.isPDFAttachment();
  }
  const contentType =
    candidate.attachmentContentType || candidate.attachmentMIMEType;
  return item.isAttachment() && contentType === "application/pdf";
}

function getExistingReader(
  attachmentID: number,
): _ZoteroTypes.ReaderInstance | null {
  const reader = (Zotero as any).Reader;
  const readers = reader?._readers as _ZoteroTypes.ReaderInstance[] | undefined;
  if (!readers || !Array.isArray(readers)) {
    return null;
  }
  return readers.find((entry) => entry.itemID === attachmentID) || null;
}
