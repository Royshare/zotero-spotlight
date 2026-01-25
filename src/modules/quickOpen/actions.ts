import type { QuickOpenResult } from "./search";

export class ActionHandler {
  async openResult(result: QuickOpenResult, alternate = false): Promise<void> {
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
    if (typeof (Zotero as any).Reader?.open === "function") {
      await (Zotero as any).Reader.open(attachmentID, {
        openInWindow: alternate,
      });
      return;
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
    if (pane?.selectItem) {
      pane.selectItem(itemID);
    }
    const attachmentID = await this.getPrimaryAttachmentID(itemID);
    if (attachmentID) {
      await this.openAttachment(attachmentID, alternate);
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
