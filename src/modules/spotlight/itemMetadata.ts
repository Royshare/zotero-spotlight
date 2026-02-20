export function getItemTitleSafe(item: Zotero.Item): string {
  return safeGetField(item, "title") || safeGetDisplayTitle(item) || "";
}

export function getItemYearSafe(item: Zotero.Item): number | undefined {
  const date = safeGetField(item, "date", true, true);
  if (!date) {
    return undefined;
  }
  const match = date.match(/\b\d{4}\b/);
  if (!match) {
    return undefined;
  }
  const year = Number(match[0]);
  return Number.isNaN(year) ? undefined : year;
}

export function getItemSubtitleSafe(item: Zotero.Item): string {
  const creator = normalizeWhitespace(String((item as any).firstCreator || ""));
  const year = getItemYearSafe(item);
  return [creator, year ? String(year) : ""].filter(Boolean).join(" ");
}

export function getItemAuthorsSafe(item: Zotero.Item): string {
  const firstCreator = normalizeWhitespace(
    String((item as any).firstCreator || ""),
  );
  if (firstCreator) {
    return firstCreator;
  }
  const creators = safeGetCreators(item)
    .map((entry) => {
      const firstName = normalizeWhitespace(String(entry.firstName || ""));
      const lastName = normalizeWhitespace(String(entry.lastName || ""));
      return normalizeWhitespace(`${firstName} ${lastName}`);
    })
    .filter(Boolean);
  return creators.slice(0, 2).join(", ");
}

export function getItemTagsSafe(item: Zotero.Item, max = 0): string[] {
  const rawTags = safeGetTags(item);
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const entry of rawTags as Array<{ tag?: string } | string>) {
    const label =
      typeof entry === "string"
        ? entry
        : typeof entry?.tag === "string"
          ? entry.tag
          : "";
    const normalizedLabel = normalize(label);
    if (!normalizedLabel || seen.has(normalizedLabel)) {
      continue;
    }
    seen.add(normalizedLabel);
    tags.push(normalizedLabel);
    if (max > 0 && tags.length >= max) {
      break;
    }
  }
  return tags;
}

export function getItemAbstractSnippetSafe(
  item: Zotero.Item,
  maxLength = 120,
): string {
  const abstractText = safeGetField(item, "abstractNote");
  if (!abstractText) {
    return "";
  }
  const normalized = normalizeWhitespace(stripHTML(abstractText));
  if (!normalized) {
    return "";
  }
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 3).trimEnd()}...`
    : normalized;
}

export function isPDFAttachment(item: Zotero.Item): boolean {
  const candidate = item as any;
  if (typeof candidate.isPDFAttachment === "function") {
    return !!candidate.isPDFAttachment();
  }
  const contentType =
    candidate.attachmentContentType || candidate.attachmentMIMEType || "";
  return String(contentType).toLowerCase().includes("pdf");
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
    if (isUnloadedDataError(error)) {
      return "";
    }
    throw error;
  }
}

function safeGetDisplayTitle(item: Zotero.Item): string {
  try {
    return item.getDisplayTitle() || "";
  } catch (error) {
    if (isUnloadedDataError(error)) {
      return "";
    }
    throw error;
  }
}

function safeGetTags(item: Zotero.Item): Array<{ tag?: string } | string> {
  try {
    return (item.getTags?.() as Array<{ tag?: string } | string>) || [];
  } catch (error) {
    if (isUnloadedDataError(error)) {
      return [];
    }
    throw error;
  }
}

function safeGetCreators(item: Zotero.Item): Array<{
  firstName?: string;
  lastName?: string;
}> {
  try {
    return (
      ((item as any).getCreators?.() as Array<{
        firstName?: string;
        lastName?: string;
      }>) || []
    );
  } catch (error) {
    if (isUnloadedDataError(error)) {
      return [];
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

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripHTML(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}
