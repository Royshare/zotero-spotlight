import {
  getItemAbstractSnippetSafe,
  getItemAuthorsSafe,
  getItemSubtitleSafe,
  getItemTagsSafe,
  getItemTitleSafe,
  getItemYearSafe,
  isPDFAttachment,
} from "./itemMetadata";

export type QuickOpenResult = ItemResult | AttachmentResult;

export type ResultKind = "item" | "attachment";
export type ResultType = "item" | "note" | "pdf";

export interface BaseResult {
  id: number;
  kind: ResultKind;
  resultType: ResultType;
  title: string;
  subtitle: string;
  score: number;
  year?: number;
  libraryKind?: "user" | "group";
  authors?: string;
  tags?: string[];
  abstractSnippet?: string;
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
  resultType: ResultType;
  title: string;
  subtitle: string;
  authors: string;
  tags: string[];
  abstractSnippet: string;
  year: number | null;
  libraryID: number;
  libraryKind: "user" | "group";
  searchText: string;
};

type ParsedQuery = {
  textQuery: string;
  filters: {
    types: Set<ResultType>;
    tags: string[];
    yearMin?: number;
    yearMax?: number;
  };
};

export class SearchService {
  private index: IndexedEntry[] = [];
  private indexReady = false;
  private indexStale = true;
  private lastIndexedAt = 0;
  private notifierID: string | null = null;
  private usageCounts = new Map<number, number>();
  private recentItemIDs: number[] = [];

  constructor() {
    this.registerNotifier();
  }

  destroy(): void {
    if (this.notifierID) {
      Zotero.Notifier.unregisterObserver(this.notifierID);
      this.notifierID = null;
    }
  }

  async search(
    query: string,
    win: Window,
    limit = 20,
  ): Promise<QuickOpenResult[]> {
    const parsedQuery = parseStructuredQuery(query);
    const activeLibraryID = this.getActiveLibraryID(win);
    await this.ensureIndex();
    const results: QuickOpenResult[] = [];
    for (const entry of this.index) {
      if (!matchesFilters(entry, parsedQuery.filters)) {
        continue;
      }
      const baseScore = parsedQuery.textQuery
        ? fuzzyScore(parsedQuery.textQuery, entry.searchText)
        : 10;
      if (baseScore <= 0) {
        continue;
      }
      const frequencyBoost = (this.usageCounts.get(entry.id) || 0) * 3;
      const recencyBoost = this.getRecencyBoost(entry.id);
      const libraryBoost =
        activeLibraryID !== null && activeLibraryID === entry.libraryID ? 6 : 0;
      results.push({
        id: entry.id,
        kind: entry.kind,
        resultType: entry.resultType,
        title: entry.title,
        subtitle: entry.subtitle,
        score: baseScore + frequencyBoost + recencyBoost + libraryBoost,
        year: entry.year === null ? undefined : entry.year,
        libraryKind: entry.libraryKind,
        authors: entry.authors || undefined,
        tags: entry.tags.length ? entry.tags : undefined,
        abstractSnippet: entry.abstractSnippet || undefined,
      } as QuickOpenResult);
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  recordOpen(itemID: number): void {
    if (!itemID || typeof itemID !== "number") {
      return;
    }
    this.usageCounts.set(itemID, (this.usageCounts.get(itemID) || 0) + 1);
    this.recentItemIDs = this.recentItemIDs.filter((id) => id !== itemID);
    this.recentItemIDs.unshift(itemID);
    this.recentItemIDs = this.recentItemIDs.slice(0, 80);
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

  private getRecencyBoost(itemID: number): number {
    const index = this.recentItemIDs.indexOf(itemID);
    if (index < 0) {
      return 0;
    }
    return Math.max(0, 8 - index);
  }

  private getActiveLibraryID(win: Window): number | null {
    const localPane = (win as any).ZoteroPane as
      | _ZoteroTypes.ZoteroPane
      | undefined;
    const mainPane = Zotero.getMainWindow()?.ZoteroPane;
    const activePane =
      localPane || mainPane || (Zotero.getActiveZoteroPane?.() as any);
    const selectedLibraryID = activePane?.getSelectedLibraryID?.();
    return typeof selectedLibraryID === "number" ? selectedLibraryID : null;
  }
}

async function buildIndex(): Promise<IndexedEntry[]> {
  const libraries = Zotero.Libraries.getAll();
  const entries: IndexedEntry[] = [];
  const parentsWithAttachment = new Set<number>();
  for (const library of libraries) {
    const libraryKind =
      (library as any).libraryType === "group" ? "group" : "user";
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
          const authors = getItemAuthors(item);
          const tags = getItemTags(item);
          const abstractSnippet = getItemAbstractSnippet(item);
          entries.push({
            id: item.id,
            kind: "item",
            resultType: "item",
            title,
            subtitle,
            authors,
            tags,
            abstractSnippet,
            year: getItemYearNumber(item),
            libraryID: library.libraryID,
            libraryKind,
            searchText: normalize(
              `${title} ${subtitle} ${authors} ${tags.join(" ")} ${abstractSnippet}`,
            ),
          });
        } else if (item.isNote && item.isNote()) {
          const title = getNoteTitle(item);
          const subtitle = getNoteSubtitle(item);
          const parent = getParentItem(item);
          const authors = parent ? getItemAuthors(parent) : "";
          const tags = getItemTags(item);
          const abstractSnippet = parent ? getItemAbstractSnippet(parent) : "";
          entries.push({
            id: item.id,
            kind: "item",
            resultType: "note",
            title,
            subtitle,
            authors,
            tags,
            abstractSnippet,
            year: getParentYearNumber(item),
            libraryID: library.libraryID,
            libraryKind,
            searchText: normalize(
              `${title} ${subtitle} ${authors} ${tags.join(" ")} ${abstractSnippet}`,
            ),
          });
        } else if (item.isAttachment() && isSearchableAttachment(item)) {
          const title = getAttachmentTitle(item);
          const subtitle = getAttachmentSubtitle(item);
          const parent = getAttachmentParentItem(item);
          const authors = parent ? getItemAuthors(parent) : "";
          const attachmentTags = getItemTags(item);
          const parentTags = parent ? getItemTags(parent) : [];
          const tags = [...attachmentTags, ...parentTags].filter(Boolean);
          const abstractSnippet = parent ? getItemAbstractSnippet(parent) : "";
          entries.push({
            id: item.id,
            kind: "attachment",
            resultType: isPDFAttachment(item) ? "pdf" : "item",
            title,
            subtitle,
            authors,
            tags,
            abstractSnippet,
            year: getAttachmentYearNumber(item),
            libraryID: library.libraryID,
            libraryKind,
            searchText: normalize(
              `${title} ${subtitle} ${authors} ${tags.join(" ")} ${abstractSnippet}`,
            ),
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
  return getItemTitleSafe(item) || "Untitled";
}

function getItemSubtitle(item: Zotero.Item): string {
  return getItemSubtitleSafe(item);
}

function getItemAuthors(item: Zotero.Item): string {
  return getItemAuthorsSafe(item);
}

function getItemAbstractSnippet(item: Zotero.Item): string {
  return getItemAbstractSnippetSafe(item, 120);
}

function getAttachmentTitle(item: Zotero.Item): string {
  const filename = (item as any).attachmentFilename as string | undefined;
  if (filename) {
    return filename;
  }
  const title = getItemTitleSafe(item);
  return filename || title || "Attachment";
}

function getAttachmentSubtitle(item: Zotero.Item): string {
  const parent = getAttachmentParentItem(item);
  return parent ? getItemTitle(parent) : "";
}

function getItemTags(item: Zotero.Item): string[] {
  return getItemTagsSafe(item);
}

function getItemYearNumber(item: Zotero.Item): number | null {
  return getItemYearSafe(item) ?? null;
}

function getParentYearNumber(item: Zotero.Item): number | null {
  const parent = getParentItem(item);
  return parent ? getItemYearNumber(parent) : null;
}

function getAttachmentYearNumber(item: Zotero.Item): number | null {
  const parent = getAttachmentParentItem(item);
  return parent ? getItemYearNumber(parent) : null;
}

function getNoteTitle(item: Zotero.Item): string {
  const note = safeGetNote(item);
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

function getAttachmentParentItem(item: Zotero.Item): Zotero.Item | null {
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

function safeGetNote(item: Zotero.Item): string {
  try {
    const noteValue = (item as any).getNote?.() as string | undefined;
    return noteValue || "";
  } catch (error) {
    if (isUnloadedDataError(error)) {
      return "";
    }
    throw error;
  }
}

function isUnloadedDataError(error: unknown): boolean {
  const candidate = error as any;
  return (
    candidate?.name === "UnloadedDataException" ||
    typeof candidate?.dataType === "string"
  );
}

function parseStructuredQuery(rawQuery: string): ParsedQuery {
  const tokens = tokenize(rawQuery);
  const textTokens: string[] = [];
  const types = new Set<ResultType>();
  const tags: string[] = [];
  let yearMin: number | undefined;
  let yearMax: number | undefined;

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (lower.startsWith("type:")) {
      const parsedTypes = parseTypeFilter(token.slice(5));
      parsedTypes.forEach((type) => types.add(type));
      continue;
    }
    if (lower.startsWith("tag:")) {
      const tagValue = normalize(unquoteToken(token.slice(4)));
      if (tagValue) {
        tags.push(tagValue);
      }
      continue;
    }
    if (lower.startsWith("year:")) {
      const yearRange = parseYearFilter(token.slice(5));
      if (yearRange) {
        yearMin =
          typeof yearRange.min === "number"
            ? typeof yearMin === "number"
              ? Math.max(yearMin, yearRange.min)
              : yearRange.min
            : yearMin;
        yearMax =
          typeof yearRange.max === "number"
            ? typeof yearMax === "number"
              ? Math.min(yearMax, yearRange.max)
              : yearRange.max
            : yearMax;
      }
      continue;
    }
    textTokens.push(token);
  }

  return {
    textQuery: textTokens.join(" ").trim(),
    filters: {
      types,
      tags,
      yearMin,
      yearMax,
    },
  };
}

function tokenize(query: string): string[] {
  const matches = query.match(/(?:[^\s"]+|"[^"]*")+/g);
  return matches ? matches.map((token) => token.trim()).filter(Boolean) : [];
}

function unquoteToken(token: string): string {
  const trimmed = token.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseTypeFilter(rawValue: string): ResultType[] {
  const value = unquoteToken(rawValue);
  if (!value) {
    return [];
  }
  const values = value
    .split("|")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const parsed: ResultType[] = [];
  for (const entry of values) {
    if (entry === "pdf" || entry === "note" || entry === "item") {
      parsed.push(entry);
    }
  }
  return parsed;
}

function parseYearFilter(
  rawValue: string,
): { min?: number; max?: number } | null {
  const value = unquoteToken(rawValue).trim();
  if (!value) {
    return null;
  }
  const rangeMatch = value.match(/^(\d{4})-(\d{4})$/);
  if (rangeMatch) {
    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    if (!Number.isNaN(start) && !Number.isNaN(end)) {
      return {
        min: Math.min(start, end),
        max: Math.max(start, end),
      };
    }
    return null;
  }
  const gteMatch = value.match(/^>=?(\d{4})$/);
  if (gteMatch) {
    return { min: Number(gteMatch[1]) };
  }
  const lteMatch = value.match(/^<=?(\d{4})$/);
  if (lteMatch) {
    return { max: Number(lteMatch[1]) };
  }
  const exactMatch = value.match(/^(\d{4})$/);
  if (exactMatch) {
    const exact = Number(exactMatch[1]);
    return { min: exact, max: exact };
  }
  return null;
}

function matchesFilters(
  entry: IndexedEntry,
  filters: ParsedQuery["filters"],
): boolean {
  if (filters.types.size > 0 && !filters.types.has(entry.resultType)) {
    return false;
  }
  if (filters.tags.length > 0) {
    const entryTags = new Set(entry.tags);
    for (const tag of filters.tags) {
      if (!entryTags.has(tag)) {
        return false;
      }
    }
  }
  if (typeof filters.yearMin === "number") {
    if (entry.year === null || entry.year < filters.yearMin) {
      return false;
    }
  }
  if (typeof filters.yearMax === "number") {
    if (entry.year === null || entry.year > filters.yearMax) {
      return false;
    }
  }
  return true;
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
