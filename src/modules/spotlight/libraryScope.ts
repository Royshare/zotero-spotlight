/**
 * Default library scope for normal searches.
 *
 * Users choose which libraries are searched by default. The pref stores the
 * libraries that are *not* selected, so the default (empty) keeps the
 * all-libraries behavior and libraries joined later are searched until the
 * user deselects them.
 *
 * Unselected libraries are either excluded from default results or kept
 * searchable and listed after results from selected libraries. A search
 * limited to a collection always searches that collection.
 */

import { getPref } from "../../utils/prefs";

export const UNSELECTED_LIBRARY_MODES = ["exclude", "lower"] as const;

export type UnselectedLibraryMode = (typeof UNSELECTED_LIBRARY_MODES)[number];

export interface LibraryScope {
  unselected: ReadonlySet<number>;
  mode: UnselectedLibraryMode;
}

/** Parse a comma-separated list of library IDs, dropping invalid entries. */
export function parseLibraryIDList(raw: unknown): number[] {
  if (typeof raw !== "string") {
    return [];
  }
  const ids: number[] = [];
  for (const part of raw.split(",")) {
    const value = part.trim();
    if (!/^\d+$/.test(value)) {
      continue;
    }
    const id = Number(value);
    if (!ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

export function serializeLibraryIDList(ids: Iterable<number>): string {
  return Array.from(new Set(ids))
    .sort((a, b) => a - b)
    .join(",");
}

export function parseUnselectedLibraryMode(
  raw: unknown,
): UnselectedLibraryMode {
  return raw === "lower" ? "lower" : "exclude";
}

export function createLibraryScope(
  unselectedRaw: unknown,
  modeRaw: unknown,
): LibraryScope {
  return {
    unselected: new Set(parseLibraryIDList(unselectedRaw)),
    mode: parseUnselectedLibraryMode(modeRaw),
  };
}

/** The library scope currently configured in preferences. */
export function getLibraryScope(): LibraryScope {
  return createLibraryScope(
    getPref("unselectedLibraries"),
    getPref("unselectedLibraryMode"),
  );
}

/**
 * True when results from `libraryID` should be left out. Searches limited
 * to a collection are never filtered, so the current-collection option
 * still works inside an unselected library.
 */
export function isLibraryExcluded(
  scope: LibraryScope,
  libraryID: number,
  collectionScoped: boolean,
): boolean {
  return (
    !collectionScoped &&
    scope.mode === "exclude" &&
    scope.unselected.has(libraryID)
  );
}

/**
 * Sort tier for results from `libraryID`: 0 for selected libraries, 1 for
 * unselected libraries kept searchable at lower priority. Lower tiers sort
 * first; relevance orders results within a tier.
 */
export function getLibraryTier(scope: LibraryScope, libraryID: number): number {
  return scope.mode === "lower" && scope.unselected.has(libraryID) ? 1 : 0;
}
