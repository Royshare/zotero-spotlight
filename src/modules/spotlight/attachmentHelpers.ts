import {
  getAttachmentResultType,
  type AttachmentResultType,
} from "./itemMetadata";

const OPENABLE_ATTACHMENT_TYPE_ORDER = ["pdf", "epub", "snapshot"] as const;

type OpenableAttachmentType = (typeof OPENABLE_ATTACHMENT_TYPE_ORDER)[number];

function getAttachmentID(value: unknown): number | null {
  if (typeof value === "number") {
    return value;
  }
  const candidate = value as { id?: unknown };
  return typeof candidate?.id === "number" ? candidate.id : null;
}

export function isOpenableAttachmentType(
  type: AttachmentResultType | string,
): type is OpenableAttachmentType {
  return type === "pdf" || type === "epub" || type === "snapshot";
}

export function isOpenableAttachment(item: Zotero.Item): boolean {
  return isOpenableAttachmentType(getAttachmentResultType(item));
}

export function getPreferredOpenableAttachmentResultType(
  item: Zotero.Item,
): OpenableAttachmentType | null {
  const candidate = item as any;
  const attachmentIDs = candidate.getAttachments?.() || [];
  for (const targetType of OPENABLE_ATTACHMENT_TYPE_ORDER) {
    for (const attachmentID of attachmentIDs) {
      const attachment = Zotero.Items.get(attachmentID) as Zotero.Item | null;
      if (!attachment?.isAttachment?.()) {
        continue;
      }
      if (getAttachmentResultType(attachment) === targetType) {
        return targetType;
      }
    }
  }
  return null;
}

export async function getBestOpenableAttachmentID(
  item: Zotero.Item,
): Promise<number | null> {
  const candidate = item as any;
  if (typeof candidate.getBestAttachment === "function") {
    const bestID = getAttachmentID(await candidate.getBestAttachment());
    if (bestID) {
      const attachment = Zotero.Items.get(bestID) as Zotero.Item | null;
      if (attachment && isOpenableAttachment(attachment)) {
        return bestID;
      }
    }
  }
  if (typeof candidate.getPrimaryAttachment === "function") {
    const primaryID = getAttachmentID(await candidate.getPrimaryAttachment());
    if (primaryID) {
      const attachment = Zotero.Items.get(primaryID) as Zotero.Item | null;
      if (attachment && isOpenableAttachment(attachment)) {
        return primaryID;
      }
    }
  }
  const attachmentIDs = candidate.getAttachments?.() || [];
  const firstByType: Partial<Record<OpenableAttachmentType, number>> = {};
  for (const attachmentID of attachmentIDs) {
    const attachment = Zotero.Items.get(attachmentID) as Zotero.Item | null;
    if (!attachment?.isAttachment?.()) {
      continue;
    }
    const type = getAttachmentResultType(attachment);
    if (!isOpenableAttachmentType(type)) {
      continue;
    }
    if (typeof firstByType[type] !== "number") {
      firstByType[type] = attachmentID;
    }
  }
  for (const targetType of OPENABLE_ATTACHMENT_TYPE_ORDER) {
    const selected = firstByType[targetType];
    if (typeof selected === "number") {
      return selected;
    }
  }
  return null;
}

export function getParentItem(item: Zotero.Item): Zotero.Item | null {
  const parentID = (item as any).parentID ?? (item as any).parentItemID;
  if (typeof parentID === "number") {
    return Zotero.Items.get(parentID) as Zotero.Item;
  }
  return null;
}

export function getAttachmentParentItem(item: Zotero.Item): Zotero.Item | null {
  const directParent = getParentItem(item);
  if (directParent) {
    return directParent;
  }
  const topLevel = (item as any).topLevelItem as Zotero.Item | undefined;
  if (topLevel && topLevel.id && topLevel.id !== item.id) {
    return topLevel;
  }
  return null;
}

export function getParentForCommand(
  item: Zotero.Item | null,
): Zotero.Item | null {
  if (!item) {
    return null;
  }
  if (item.isRegularItem()) {
    return item;
  }
  return getAttachmentParentItem(item) || item;
}

export function getAttachmentTypeMeta(type: AttachmentResultType): {
  label: string;
  itemType: string;
} {
  if (type === "pdf") {
    return { label: "PDF", itemType: "attachmentPDF" };
  }
  if (type === "epub") {
    return { label: "EPUB", itemType: "attachmentEPUB" };
  }
  if (type === "snapshot") {
    return { label: "Snapshot", itemType: "attachmentSnapshot" };
  }
  return { label: "Attachment", itemType: "attachment" };
}
