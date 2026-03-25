import type { QuickOpenResult } from "./search";
import { getAttachmentResultType } from "./itemMetadata";
import { shouldUseExternalHandler } from "./commands";
import {
  getBestOpenableAttachmentID,
  isOpenableAttachment,
} from "./attachmentHelpers";

export type OpenIntent = "default" | "alternate" | "reveal";

export class ActionHandler {
  async focusItemInLibrary(itemID: number): Promise<void> {
    const mainWindow = Zotero.getMainWindow();
    mainWindow?.Zotero_Tabs?.select?.("zotero-pane");
    const pane = mainWindow?.ZoteroPane;
    if (pane?.selectItem) {
      await pane.selectItem(itemID);
    }
  }

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
    if (
      alternate &&
      isOpenableAttachment(attachment) &&
      typeof (Zotero as any).FileHandlers?.open === "function"
    ) {
      try {
        await (Zotero as any).FileHandlers.open(attachment, {
          openInWindow: true,
        });
        return;
      } catch (error) {
        ztoolkit.log(
          "FileHandlers.open failed, falling back to Reader.open",
          error,
        );
      }
    }
    const mainWindow = Zotero.getMainWindow();
    const pane = mainWindow?.ZoteroPane;
    if (shouldUseExternalHandler(getAttachmentResultType(attachment))) {
      pane?.viewAttachment?.(attachmentID);
      return;
    }
    const existing = getExistingReader(attachmentID);
    if (existing && !alternate) {
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
          allowDuplicate: alternate,
        });
        return;
      } catch (error) {
        ztoolkit.log(
          "Reader.open failed, falling back to viewAttachment",
          error,
        );
      }
    }
    if (pane?.viewAttachment) {
      pane.viewAttachment(attachmentID);
    }
  }

  async revealAttachmentFile(attachmentID: number): Promise<void> {
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

  async openItem(itemID: number, alternate = false): Promise<void> {
    const mainWindow = Zotero.getMainWindow();
    if (!alternate && mainWindow?.Zotero_Tabs?.select) {
      mainWindow.Zotero_Tabs.select("zotero-pane");
    }
    const pane = mainWindow?.ZoteroPane;
    const item = Zotero.Items.get(itemID) as Zotero.Item;
    if (item?.isNote && item.isNote()) {
      if (alternate) {
        try {
          if (typeof (item as any).loadDataType === "function") {
            await (item as any).loadDataType("note");
          }
          const notes = (Zotero as any).Notes;
          if (notes?.open) {
            await notes.open(itemID, null, { openInWindow: true });
            return;
          }
        } catch (error) {
          ztoolkit.log("Failed to open note window", error);
        }
        pane?.openNoteWindow?.(itemID);
        return;
      }
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
    await this.focusItemInLibrary(itemID);
  }

  private async getPrimaryAttachmentID(itemID: number): Promise<number | null> {
    const item = Zotero.Items.get(itemID) as Zotero.Item;
    if (!item) {
      return null;
    }
    return getBestOpenableAttachmentID(item);
  }
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
