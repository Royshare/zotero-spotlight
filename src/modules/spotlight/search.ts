import {
  getAttachmentResultType,
  getItemAbstractSnippetSafe,
  getItemAuthorsSafe,
  getItemSubtitleSafe,
  getItemTagsSafe,
  getItemTitleSafe,
  getItemYearSafe,
} from "./itemMetadata";
import { getPref } from "../../utils/prefs";

export type QuickOpenResult = ItemResult | AttachmentResult | AnnotationResult;

export type SearchRankingState = {
  usageCounts: Map<number, number>;
  recentItemIDs: number[];
};

export type ResultKind = "item" | "attachment" | "annotation";
export type ResultType =
  | "item"
  | "note"
  | "pdf"
  | "epub"
  | "snapshot"
  | "annotation";

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

export interface AnnotationResult extends BaseResult {
  kind: "annotation";
  annotationColor?: string;
  attachmentID?: number;
  attachmentKey?: string;
  annoKey?: string;
  pageLabel?: string;
  pageIndex?: number;
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
  // annotation-specific
  annotationColor?: string;
  annotationText?: string;
  annotationComment?: string;
  annotationParentTitle?: string;
  attachmentID?: number;
  attachmentKey?: string;
  annoKey?: string;
  pageLabel?: string;
  pageIndex?: number;
};

type ParsedQuery = {
  textQuery: string;
  annotationOnly: boolean;
  filters: {
    types: Set<ResultType>;
    tags: string[];
    yearMin?: number;
    yearMax?: number;
  };
};

export class SearchService {
  private baseIndex: IndexedEntry[] = [];
  private annotationIndex: IndexedEntry[] = [];
  private baseIndexReady = false;
  private annotationIndexReady = false;
  private baseIndexStale = true;
  private annotationIndexStale = true;
  private lastBaseIndexedAt = 0;
  private lastAnnotationIndexedAt = 0;
  private baseIndexPromise: Promise<void> | null = null;
  private annotationIndexPromise: Promise<void> | null = null;
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

  async search(
    query: string,
    win: Window,
    limit = 20,
    collectionFilter: any = null,
    rankingState?: SearchRankingState,
  ): Promise<QuickOpenResult[]> {
    const parsedQuery = parseStructuredQuery(query);
    const activeLibraryID = this.getActiveLibraryID(win);
    await this.ensureBaseIndex();
    const searchAnnotations = shouldSearchAnnotations(parsedQuery);
    if (searchAnnotations) {
      await this.ensureAnnotationIndex();
    }

    // Build collection item ID set if filter is active
    let collectionItemIDs: Set<number> | null = null;
    if (collectionFilter) {
      collectionItemIDs = new Set<number>();
      const collectAllIDs = (col: any) => {
        for (const id of col.getChildItems?.(true) || []) {
          (collectionItemIDs as Set<number>).add(id);
        }
        for (const sub of col.getChildCollections?.() || []) {
          collectAllIDs(sub);
        }
      };
      collectAllIDs(collectionFilter);
    }

    const results: QuickOpenResult[] = [];
    const searchableEntries = searchAnnotations
      ? [...this.baseIndex, ...this.annotationIndex]
      : this.baseIndex;
    for (const entry of searchableEntries) {
      if (!matchesFilters(entry, parsedQuery.filters)) {
        continue;
      }
      // Collection filter
      if (collectionItemIDs !== null) {
        const checkID =
          entry.kind === "annotation" ? entry.attachmentID : entry.id;
        if (!checkID || !collectionItemIDs.has(checkID)) continue;
      }
      const baseScore = getEntryScore(entry, parsedQuery);
      if (baseScore <= 0) {
        continue;
      }
      const frequencyBoost = (rankingState?.usageCounts.get(entry.id) || 0) * 3;
      const recencyBoost = getRecencyBoost(
        entry.id,
        rankingState?.recentItemIDs,
      );
      const libraryBoost =
        activeLibraryID !== null && activeLibraryID === entry.libraryID ? 6 : 0;

      if (entry.kind === "annotation") {
        results.push({
          id: entry.id,
          kind: "annotation",
          resultType: "annotation",
          title: entry.title,
          subtitle: entry.subtitle,
          score: baseScore + frequencyBoost + recencyBoost + libraryBoost,
          year: entry.year === null ? undefined : entry.year,
          libraryKind: entry.libraryKind,
          authors: entry.authors || undefined,
          annotationColor: entry.annotationColor,
          attachmentID: entry.attachmentID,
          attachmentKey: entry.attachmentKey,
          annoKey: entry.annoKey,
          pageLabel: entry.pageLabel,
          pageIndex: entry.pageIndex,
        } as AnnotationResult);
      } else {
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
    }

    const kindOrder = (r: QuickOpenResult) => {
      if (parsedQuery.annotationOnly) {
        return r.kind === "annotation" ? 0 : 1;
      }
      return r.kind === "annotation" ? 1 : 0;
    };
    const sorted = results.sort((a, b) => {
      const kindDiff = kindOrder(a) - kindOrder(b);
      if (kindDiff !== 0) return kindDiff;
      return b.score - a.score;
    });

    const perCategoryLimit = parsedQuery.annotationOnly
      ? limit
      : Math.ceil(limit / 2);
    const itemResults = parsedQuery.annotationOnly
      ? []
      : sorted
          .filter((r) => r.kind !== "annotation")
          .slice(0, perCategoryLimit);
    const annoResults = searchAnnotations
      ? sorted.filter((r) => r.kind === "annotation").slice(0, perCategoryLimit)
      : [];
    return [...itemResults, ...annoResults];
  }

  async warmIndex(): Promise<void> {
    await this.ensureBaseIndex();
  }

  private async ensureBaseIndex(): Promise<void> {
    const now = Date.now();
    if (
      this.baseIndexReady &&
      !this.baseIndexStale &&
      now - this.lastBaseIndexedAt < 300000
    ) {
      return;
    }
    if (!this.baseIndexPromise) {
      this.baseIndexPromise = (async () => {
        this.baseIndex = await buildBaseIndex();
        this.baseIndexReady = true;
        this.baseIndexStale = false;
        this.lastBaseIndexedAt = Date.now();
      })().finally(() => {
        this.baseIndexPromise = null;
      });
    }
    await this.baseIndexPromise;
  }

  private async ensureAnnotationIndex(): Promise<void> {
    const now = Date.now();
    if (
      this.annotationIndexReady &&
      !this.annotationIndexStale &&
      now - this.lastAnnotationIndexedAt < 300000
    ) {
      return;
    }
    if (!this.annotationIndexPromise) {
      this.annotationIndexPromise = (async () => {
        this.annotationIndex = await buildAnnotationIndex();
        this.annotationIndexReady = true;
        this.annotationIndexStale = false;
        this.lastAnnotationIndexedAt = Date.now();
      })().finally(() => {
        this.annotationIndexPromise = null;
      });
    }
    await this.annotationIndexPromise;
  }

  private registerNotifier(): void {
    const callback = {
      notify: () => {
        this.baseIndexStale = true;
        this.annotationIndexStale = true;
      },
    };
    this.notifierID = Zotero.Notifier.registerObserver(callback, [
      "item",
      "file",
    ]);
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

async function buildBaseIndex(): Promise<IndexedEntry[]> {
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
            resultType: getAttachmentResultType(item),
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

async function buildAnnotationIndex(): Promise<IndexedEntry[]> {
  const entries: IndexedEntry[] = [];
  const libraryKinds = getLibraryKinds();
  const attachmentItemCache = new Map<number, Zotero.Item | null>();
  const parentItemCache = new Map<number, Zotero.Item | null>();
  const parentMetaCache = new Map<
    number,
    { title: string; authors: string; year: number | null }
  >();

  try {
    let annoRows: Array<{
      aid: number;
      pid: number;
      cmt?: string;
      col?: string;
      pl?: string;
      pos?: string;
    }> = [];
    let attRows: Array<{ iid: number; ppid: number }> = [];
    let textRows: Array<{ tid: number; xxt?: string }> = [];
    let keyRows: Array<{ iid: number; kkey?: string }> = [];
    let annoKeyRows: Array<{ iid: number; kkey?: string }> = [];

    await (Zotero.DB as any).executeTransaction(async () => {
      annoRows =
        ((await (Zotero.DB as any).queryAsync(
          `SELECT itemID AS aid, parentItemID AS pid, comment AS cmt, color AS col, pageLabel AS pl, position AS pos FROM itemAnnotations`,
        )) as typeof annoRows) || [];
      if (!annoRows.length) {
        return;
      }
      const pids = [...new Set(annoRows.map((row) => row.pid))].join(",");
      const aids = annoRows.map((row) => row.aid).join(",");
      attRows =
        ((await (Zotero.DB as any).queryAsync(
          `SELECT itemID AS iid, parentItemID AS ppid FROM itemAttachments WHERE itemID IN (${pids})`,
        )) as typeof attRows) || [];
      keyRows =
        ((await (Zotero.DB as any).queryAsync(
          `SELECT itemID AS iid, key AS kkey FROM items WHERE itemID IN (${pids})`,
        )) as typeof keyRows) || [];
      annoKeyRows =
        ((await (Zotero.DB as any).queryAsync(
          `SELECT itemID AS iid, key AS kkey FROM items WHERE itemID IN (${aids})`,
        )) as typeof annoKeyRows) || [];
      textRows =
        ((await (Zotero.DB as any).queryAsync(
          `SELECT itemID AS tid, text AS xxt FROM itemAnnotations WHERE text IS NOT NULL AND text != ''`,
        )) as typeof textRows) || [];
    });

    if (!annoRows.length) {
      return entries;
    }

    const textMap = new Map<number, string>();
    for (const row of textRows) {
      textMap.set(row.tid, row.xxt || "");
    }
    const attachmentKeyMap = new Map<number, string>();
    for (const row of keyRows) {
      attachmentKeyMap.set(row.iid, row.kkey || "");
    }
    const annotationKeyMap = new Map<number, string>();
    for (const row of annoKeyRows) {
      annotationKeyMap.set(row.iid, row.kkey || "");
    }
    const attachmentParentMap = new Map<number, number>();
    for (const row of attRows) {
      attachmentParentMap.set(row.iid, row.ppid);
    }

    for (const row of annoRows) {
      try {
        const parentItemID = attachmentParentMap.get(row.pid);
        if (!parentItemID) {
          continue;
        }

        const annotationText = textMap.get(row.aid) || "";
        const annotationComment = row.cmt || "";
        if (!annotationText && !annotationComment) {
          continue;
        }

        let parentItem = parentItemCache.get(parentItemID);
        if (parentItem === undefined) {
          parentItem = (Zotero.Items.get(parentItemID) as Zotero.Item) || null;
          parentItemCache.set(parentItemID, parentItem);
        }
        if (!parentItem) {
          continue;
        }

        let attachmentItem = attachmentItemCache.get(row.pid);
        if (attachmentItem === undefined) {
          attachmentItem = (Zotero.Items.get(row.pid) as Zotero.Item) || null;
          attachmentItemCache.set(row.pid, attachmentItem);
        }

        let parentMeta = parentMetaCache.get(parentItemID);
        if (!parentMeta) {
          parentMeta = {
            title: getItemTitleSafe(parentItem) || "",
            authors: getItemAuthorsSafe(parentItem) || "",
            year: getItemYearNumber(parentItem),
          };
          parentMetaCache.set(parentItemID, parentMeta);
        }

        const pageLabel = row.pl || "";
        const pageIndex = getAnnotationPageIndex(row.pos);
        const title = annotationText
          ? annotationText.slice(0, 120)
          : annotationComment.slice(0, 120);
        const subtitle = `${parentMeta.title}${pageLabel ? ` · p. ${pageLabel}` : ""}`;

        entries.push({
          id: row.aid,
          kind: "annotation",
          resultType: "annotation",
          title,
          subtitle,
          authors: parentMeta.authors,
          tags: [],
          abstractSnippet: annotationComment.slice(0, 120),
          year: parentMeta.year,
          libraryID: getItemLibraryID(attachmentItem, parentItem),
          libraryKind:
            libraryKinds.get(getItemLibraryID(attachmentItem, parentItem)) ||
            "user",
          annotationColor: row.col || "#ffd400",
          annotationText,
          annotationComment,
          annotationParentTitle: parentMeta.title,
          attachmentID: row.pid,
          attachmentKey: attachmentKeyMap.get(row.pid) || "",
          annoKey: annotationKeyMap.get(row.aid) || "",
          pageLabel,
          pageIndex,
          searchText: normalize(
            `${annotationText} ${annotationComment} ${parentMeta.title} ${parentMeta.authors} ${pageLabel}`,
          ),
        });
      } catch (err) {
        ztoolkit.log("Spotlight skipped annotation", err);
      }
    }
  } catch (err) {
    ztoolkit.log("Spotlight annotation index error", err);
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

function getLibraryKinds(): Map<number, "user" | "group"> {
  const result = new Map<number, "user" | "group">();
  for (const library of Zotero.Libraries.getAll()) {
    result.set(
      library.libraryID,
      (library as any).libraryType === "group" ? "group" : "user",
    );
  }
  return result;
}

function getAnnotationPageIndex(rawPosition?: string): number {
  if (!rawPosition) {
    return 0;
  }
  try {
    const position = JSON.parse(rawPosition);
    return typeof position.pageIndex === "number" ? position.pageIndex : 0;
  } catch (_) {
    return 0;
  }
}

function getItemLibraryID(
  attachmentItem: Zotero.Item | null,
  parentItem: Zotero.Item,
): number {
  const attachmentLibraryID = (attachmentItem as any)?.libraryID;
  if (typeof attachmentLibraryID === "number") {
    return attachmentLibraryID;
  }
  const parentLibraryID = (parentItem as any)?.libraryID;
  if (typeof parentLibraryID === "number") {
    return parentLibraryID;
  }
  return Zotero.Libraries.userLibraryID;
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
    if (token.startsWith("@")) {
      types.add("annotation");
      const annotationToken = token.slice(1).trim();
      if (annotationToken) {
        textTokens.push(annotationToken);
      }
      continue;
    }
    if (token.startsWith("#")) {
      const tagValue = normalize(unquoteToken(token.slice(1)));
      if (tagValue) {
        tags.push(tagValue);
      }
      continue;
    }
    if (token.startsWith(":") && token.length > 1) {
      const parsedTypes = parseTypeFilter(token.slice(1));
      parsedTypes.forEach((type) => types.add(type));
      continue;
    }
    if (lower.startsWith("y:")) {
      const yearRange = parseYearFilter(token.slice(2));
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
    annotationOnly:
      types.size === 1 &&
      types.has("annotation") &&
      !Array.from(types).some((type) => type !== "annotation"),
    filters: {
      types,
      tags,
      yearMin,
      yearMax,
    },
  };
}

function getEntryScore(entry: IndexedEntry, query: ParsedQuery): number {
  const baseScore = query.textQuery
    ? fuzzyScore(query.textQuery, entry.searchText)
    : 10;
  if (baseScore <= 0) {
    return -1;
  }
  if (entry.kind !== "annotation" || !query.textQuery) {
    return baseScore;
  }
  return baseScore + getAnnotationQueryBoost(entry, query.textQuery);
}

function getAnnotationQueryBoost(
  entry: IndexedEntry,
  rawQuery: string,
): number {
  const query = normalize(rawQuery);
  if (!query) {
    return 0;
  }
  let boost = 0;
  const text = normalize(entry.annotationText || "");
  const comment = normalize(entry.annotationComment || "");
  const parentTitle = normalize(entry.annotationParentTitle || "");
  const subtitle = normalize(entry.subtitle || "");

  if (text) {
    if (text.startsWith(query)) {
      boost += 18;
    } else if (text.includes(query)) {
      boost += 12;
    }
  }
  if (comment) {
    if (comment.startsWith(query)) {
      boost += 12;
    } else if (comment.includes(query)) {
      boost += 8;
    }
  }
  if (parentTitle.includes(query)) {
    boost += 5;
  }
  if (subtitle.includes(query)) {
    boost += 3;
  }
  return boost;
}

function getRecencyBoost(itemID: number, recentItemIDs?: number[]): number {
  if (!recentItemIDs) {
    return 0;
  }
  const index = recentItemIDs.indexOf(itemID);
  if (index < 0) {
    return 0;
  }
  return Math.max(0, 8 - index);
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
    if (
      entry === "pdf" ||
      entry === "epub" ||
      entry === "snapshot" ||
      entry === "note" ||
      entry === "item" ||
      entry === "annotation"
    ) {
      parsed.push(entry as ResultType);
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

function shouldSearchAnnotations(query: ParsedQuery): boolean {
  if (query.annotationOnly || query.filters.types.has("annotation")) {
    return true;
  }
  return (
    (getPref as any)("searchAnnotations") !== false &&
    (getPref as any)("searchAnnotations") !== null
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
