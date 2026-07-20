export const READING_QUEUE_TAG = "📚 Reading Queue";
export const NORMALIZED_READING_QUEUE_TAG = READING_QUEUE_TAG.toLowerCase();

export function getReadingQueueTarget(
  item: Zotero.Item | null,
): Zotero.Item | null {
  let current = item;
  const visited = new Set<number>();

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.isRegularItem?.()) {
      return current;
    }
    const parentID = (current as any).parentID ?? (current as any).parentItemID;
    if (typeof parentID !== "number") {
      return null;
    }
    current = (Zotero.Items.get(parentID) as Zotero.Item | null) || null;
  }

  return null;
}

export function isInReadingQueue(item: Zotero.Item | null): boolean {
  const target = getReadingQueueTarget(item);
  if (!target) {
    return false;
  }
  return getExistingQueueTag(target) !== null;
}

export async function setReadingQueueState(
  item: Zotero.Item,
  queued: boolean,
): Promise<Zotero.Item | null> {
  const target = getReadingQueueTarget(item);
  if (!target) {
    return null;
  }

  const existingTag = getExistingQueueTag(target);
  if (queued && !existingTag) {
    target.addTag(READING_QUEUE_TAG);
  } else if (!queued && existingTag) {
    target.removeTag(existingTag);
  } else {
    return target;
  }
  await target.saveTx();
  return target;
}

function getExistingQueueTag(item: Zotero.Item): string | null {
  for (const entry of item.getTags?.() || []) {
    const tag = typeof entry === "string" ? entry : entry.tag || "";
    if (tag.trim().toLowerCase() === NORMALIZED_READING_QUEUE_TAG) {
      return tag;
    }
  }
  return null;
}
