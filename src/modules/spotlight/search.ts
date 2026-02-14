export type QuickOpenResult = ItemResult | AttachmentResult;

export type ResultKind = "item" | "attachment";

export interface BaseResult {
  id: number;
  kind: ResultKind;
  title: string;
  subtitle: string;
  score: number;
}

export interface ItemResult extends BaseResult {
  kind: "item";
}

export interface AttachmentResult extends BaseResult {
  kind: "attachment";
}

type IndexedEntry = {
  id: number;
  kind: ResultKind;
  title: string;
  subtitle: string;
  searchText: string;
};

export class SearchService {
  private index: IndexedEntry[] = [];
  private indexReady = false;
  private indexStale = true;
  private lastIndexedAt = 0;
  private notifierID: string | null = null;

  constructor() {
    this.registerNotifier();
  }

  destroy(): void {
    if (this.notifierID) {
      Zotero.Notifier.unregisterObserver(this.notifierID);
      this.notifierID = null;
    }
  }

  async search(query: string, limit = 20): Promise<QuickOpenResult[]> {
    const trimmed = query.trim();
    await this.ensureIndex();
    if (!trimmed) {
      return this.index.slice(0, limit).map(
        (entry, index) =>
          ({
            id: entry.id,
            kind: entry.kind,
            title: entry.title,
            subtitle: entry.subtitle,
            score: limit - index,
          }) as QuickOpenResult,
      );
    }
    const results: QuickOpenResult[] = [];
    for (const entry of this.index) {
      const score = fuzzyScore(trimmed, entry.searchText);
      if (score <= 0) {
        continue;
      }
      results.push({
        id: entry.id,
        kind: entry.kind,
        title: entry.title,
        subtitle: entry.subtitle,
        score,
      } as QuickOpenResult);
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async warmIndex(): Promise<void> {
    await this.ensureIndex();
  }

  private async ensureIndex(): Promise<void> {
    const now = Date.now();
    if (
      this.indexReady &&
      !this.indexStale &&
      now - this.lastIndexedAt < 300000
    ) {
      return;
    }
    this.index = await buildIndex();
    this.indexReady = true;
    this.indexStale = false;
    this.lastIndexedAt = now;
  }

  private registerNotifier(): void {
    const callback = {
      notify: () => {
        this.indexStale = true;
      },
    };
    this.notifierID = Zotero.Notifier.registerObserver(callback, [
      "item",
      "file",
    ]);
  }
}

async function buildIndex(): Promise<IndexedEntry[]> {
  const libraries = Zotero.Libraries.getAll();
  const entries: IndexedEntry[] = [];
  const parentsWithAttachment = new Set<number>();
  for (const library of libraries) {
    const items = await Zotero.Items.getAll(library.libraryID, false, false);
    for (const item of items) {
      if (!item || !item.isAttachment()) {
        continue;
      }
      if (!isSearchableAttachment(item)) {
        continue;
      }
      const parentID = (item as any).parentID ?? (item as any).parentItemID;
      if (typeof parentID === "number") {
        parentsWithAttachment.add(parentID);
      }
    }
    for (const item of items) {
      try {
        if (!item) {
          continue;
        }
        if (item.isRegularItem()) {
          if (parentsWithAttachment.has(item.id)) {
            continue;
          }
          const title = getItemTitle(item);
          const subtitle = getItemSubtitle(item);
          entries.push({
            id: item.id,
            kind: "item",
            title,
            subtitle,
            searchText: normalize(`${title} ${subtitle}`),
          });
        } else if (item.isNote && item.isNote()) {
          const title = getNoteTitle(item);
          const subtitle = getNoteSubtitle(item);
          entries.push({
            id: item.id,
            kind: "item",
            title,
            subtitle,
            searchText: normalize(`${title} ${subtitle}`),
          });
        } else if (item.isAttachment() && isSearchableAttachment(item)) {
          const title = getAttachmentTitle(item);
          const subtitle = getAttachmentSubtitle(item);
          entries.push({
            id: item.id,
            kind: "attachment",
            title,
            subtitle,
            searchText: normalize(`${title} ${subtitle}`),
          });
        }
      } catch (error) {
        ztoolkit.log("Spotlight skipped item during index build", error);
      }
    }
  }
  return entries;
}

function getItemTitle(item: Zotero.Item): string {
  return safeGetField(item, "title") || item.getDisplayTitle() || "Untitled";
}

function getItemSubtitle(item: Zotero.Item): string {
  const creator = (item as any).firstCreator || "";
  const year = getItemYear(item);
  return [creator, year].filter(Boolean).join(" ");
}

function getItemYear(item: Zotero.Item): string {
  const date = safeGetField(item, "date", true, true);
  if (!date) {
    return "";
  }
  const match = date.match(/\b\d{4}\b/);
  return match ? match[0] : "";
}

function getAttachmentTitle(item: Zotero.Item): string {
  const filename = (item as any).attachmentFilename as string | undefined;
  if (filename) {
    return filename;
  }
  const title = safeGetField(item, "title") || item.getDisplayTitle();
  return filename || title || "Attachment";
}

function getAttachmentSubtitle(item: Zotero.Item): string {
  const parent = getParentItem(item);
  return parent ? getItemTitle(parent) : "";
}

function getNoteTitle(item: Zotero.Item): string {
  const note = (item as any).getNote?.() as string | undefined;
  if (!note) {
    return "Note";
  }
  const text = note
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return "Note";
  }
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function getNoteSubtitle(item: Zotero.Item): string {
  const parent = getParentItem(item);
  if (parent) {
    return getItemTitle(parent);
  }
  return "Note";
}

function getParentItem(item: Zotero.Item): Zotero.Item | null {
  const parentID = (item as any).parentID ?? (item as any).parentItemID;
  if (!parentID) {
    return null;
  }
  return Zotero.Items.get(parentID) as Zotero.Item;
}

function isSearchableAttachment(item: Zotero.Item): boolean {
  if (!item.isAttachment()) {
    return false;
  }
  const candidate = item as any;
  if (typeof item.isAnnotation === "function" && item.isAnnotation()) {
    return false;
  }
  if (
    typeof candidate.isEmbeddedImageAttachment === "function" &&
    candidate.isEmbeddedImageAttachment()
  ) {
    return false;
  }
  if (typeof candidate.isFileAttachment === "function") {
    if (candidate.isFileAttachment()) {
      return true;
    }
  }
  if (typeof candidate.isWebAttachment === "function") {
    if (candidate.isWebAttachment()) {
      return true;
    }
  }
  const contentType =
    candidate.attachmentContentType || candidate.attachmentMIMEType;
  return !!contentType;
}

function safeGetField(
  item: Zotero.Item,
  field: string,
  unformatted?: boolean,
  includeBaseMapped?: boolean,
): string {
  try {
    const value = item.getField(
      field,
      unformatted as any,
      includeBaseMapped as any,
    ) as string | undefined;
    return value || "";
  } catch (error) {
    if (isUnloadedItemDataError(error)) {
      return "";
    }
    throw error;
  }
}

function isUnloadedItemDataError(error: unknown): boolean {
  const candidate = error as any;
  return (
    candidate?.name === "UnloadedDataException" ||
    candidate?.dataType === "itemData"
  );
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
