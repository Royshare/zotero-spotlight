export type CollectionNavigationResult = {
  kind: "collection";
  id: number;
  targetType: "collection" | "library";
  treeViewID: string;
  title: string;
  subtitle: string;
  score: number;
  libraryID: number;
  libraryKind: "user" | "group";
};

export type CollectionModeQuery = {
  isCollectionMode: boolean;
  query: string;
};

/**
 * Collection navigation is intentionally an exclusive search mode. Keeping the
 * sigil at the start prevents collection rows from being mixed into item results.
 */
export function parseCollectionModeQuery(
  rawQuery: string,
): CollectionModeQuery {
  const trimmedStart = rawQuery.trimStart();
  const match = trimmedStart.match(/^:col(?:\s+|$)/i);
  if (!match) {
    return { isCollectionMode: false, query: rawQuery.trim() };
  }
  return {
    isCollectionMode: true,
    query: trimmedStart.slice(match[0].length).trim(),
  };
}

export function searchCollections(
  query: string,
  win: Window,
  limit = 20,
): CollectionNavigationResult[] {
  const normalizedQuery = normalize(query);
  const activeLibraryID = getActiveLibraryID(win);
  const results: CollectionNavigationResult[] = [];

  for (const library of Zotero.Libraries.getAll()) {
    if (
      library.archived ||
      (library.libraryType !== "user" && library.libraryType !== "group")
    ) {
      continue;
    }
    const libraryKind = library.libraryType;
    const libraryTitle = library.name || "Library";
    const libraryScore = scoreLocation(
      normalizedQuery,
      libraryTitle,
      libraryTitle,
      library.libraryID === activeLibraryID,
    );
    if (libraryScore > 0) {
      results.push({
        kind: "collection",
        id: library.libraryID,
        targetType: "library",
        treeViewID: library.treeViewID || `L${library.libraryID}`,
        title: libraryTitle,
        subtitle: libraryKind === "group" ? "Group Library" : "My Library",
        score: libraryScore,
        libraryID: library.libraryID,
        libraryKind,
      });
    }

    for (const collection of Zotero.Collections.getByLibrary(
      library.libraryID,
      true,
    )) {
      const ancestors = getAncestorNames(collection);
      const path = [libraryTitle, ...ancestors].join(" › ");
      const searchableText = `${collection.name} ${path}`;
      const score = scoreLocation(
        normalizedQuery,
        collection.name,
        searchableText,
        collection.libraryID === activeLibraryID,
      );
      if (score <= 0) {
        continue;
      }
      results.push({
        kind: "collection",
        id: collection.id,
        targetType: "collection",
        treeViewID: collection.treeViewID || `C${collection.id}`,
        title: collection.name || "Untitled Collection",
        subtitle: path,
        score,
        libraryID: collection.libraryID,
        libraryKind,
      });
    }
  }

  return results
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}

function getAncestorNames(collection: Zotero.Collection): string[] {
  const names: string[] = [];
  const visited = new Set<number>([collection.id]);
  let parentID = collection.parentID;
  while (parentID && !visited.has(parentID)) {
    visited.add(parentID);
    const parent = Zotero.Collections.get(parentID) as
      Zotero.Collection | false;
    if (!parent) {
      break;
    }
    names.unshift(parent.name || "Untitled Collection");
    parentID = parent.parentID;
  }
  return names;
}

function getActiveLibraryID(win: Window): number | null {
  try {
    const pane =
      (win as any).ZoteroPane ||
      Zotero.getMainWindow()?.ZoteroPane ||
      Zotero.getActiveZoteroPane?.();
    const libraryID = pane?.getSelectedLibraryID?.();
    return typeof libraryID === "number" ? libraryID : null;
  } catch (_) {
    return null;
  }
}

function scoreLocation(
  query: string,
  rawTitle: string,
  rawSearchText: string,
  isActiveLibrary: boolean,
): number {
  const activeLibraryBoost = isActiveLibrary ? 5 : 0;
  if (!query) {
    return 10 + activeLibraryBoost;
  }
  const title = normalize(rawTitle);
  const searchText = normalize(rawSearchText);
  const base = fuzzyScore(query, searchText);
  if (base <= 0) {
    return -1;
  }
  const titleBoost =
    title === query
      ? 30
      : title.startsWith(query)
        ? 18
        : title.includes(query)
          ? 8
          : 0;
  return base + titleBoost + activeLibraryBoost;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function fuzzyScore(query: string, text: string): number {
  if (!query) {
    return 10;
  }
  if (text.includes(query)) {
    return 100 - Math.max(0, text.indexOf(query));
  }
  let queryIndex = 0;
  let score = 0;
  let lastMatch = -1;
  for (
    let index = 0;
    index < text.length && queryIndex < query.length;
    index++
  ) {
    if (text[index] !== query[queryIndex]) {
      continue;
    }
    score += lastMatch === index - 1 ? 4 : 1;
    lastMatch = index;
    queryIndex += 1;
  }
  return queryIndex === query.length ? score : -1;
}
