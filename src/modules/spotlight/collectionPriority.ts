/**
 * Library selection configuration.
 *
 * Stored as a JSON string in a single pref (`collectionPriorities`) and
 * is the single source of truth for both default search scoping and any
 * GUI. All reads/writes go through this module so the data model can
 * evolve without touching consumers.
 *
 * Model:
 * - `libraries`: which libraries are searched by default (selection,
 *   not ranking — order is irrelevant).
 * - `includeUnlisted`: false (default) excludes unlisted libraries from
 *   default results entirely; true keeps them searchable but ranked
 *   below listed ones.
 * - `resultTypes`: strict tiers as a ranked order where 1 is the
 *   highest priority. Types without a rank fall back to match quality,
 *   below all ranked types.
 */

export const LIBRARY_BOOST_STEP = 8;

export const PRIORITIZED_RESULT_TYPES = [
  "item",
  "note",
  "pdf",
  "epub",
  "snapshot",
  "annotation",
  "link",
] as const;

export type PrioritizedResultType = (typeof PRIORITIZED_RESULT_TYPES)[number];

/** Ranked order per result type; 1 is the highest priority. */
export type ResultTypeRanks = Partial<Record<PrioritizedResultType, number>>;

export interface PriorityConfig {
  libraries: number[];
  includeUnlisted: boolean;
  resultTypes: ResultTypeRanks;
}

export function emptyPriorityConfig(): PriorityConfig {
  return { libraries: [], includeUnlisted: false, resultTypes: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Parse user-authored JSON. Tolerates unknown fields (e.g. display names),
 * drops malformed entries, and falls back to an empty config on failure.
 */
export function parsePriorityConfig(
  raw: string | null | undefined,
): PriorityConfig {
  if (!raw || typeof raw !== "string") {
    return emptyPriorityConfig();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    return emptyPriorityConfig();
  }
  if (!isRecord(parsed)) {
    return emptyPriorityConfig();
  }

  const libraries: number[] = [];
  const seen = new Set<number>();
  const rawLibraries = Array.isArray(parsed.libraries) ? parsed.libraries : [];
  for (const entry of rawLibraries) {
    if (
      typeof entry === "number" &&
      Number.isFinite(entry) &&
      !seen.has(entry)
    ) {
      seen.add(entry);
      libraries.push(entry);
    }
  }

  return {
    libraries,
    includeUnlisted: parsed.includeUnlisted === true,
    resultTypes: parseResultTypeRanks(parsed.resultTypes),
  };
}

function parseResultTypeRanks(raw: unknown): ResultTypeRanks {
  const resultTypes: ResultTypeRanks = {};
  if (!isRecord(raw)) {
    return resultTypes;
  }
  for (const [key, value] of Object.entries(raw)) {
    if (
      (PRIORITIZED_RESULT_TYPES as readonly string[]).includes(key) &&
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 1
    ) {
      resultTypes[key as PrioritizedResultType] = Math.round(value);
    }
  }
  return resultTypes;
}

export function serializePriorityConfig(config: PriorityConfig): string {
  return JSON.stringify(config, null, 2);
}

/** True when default results should be restricted to `libraries`. */
export function restrictsToSelectedLibraries(config: PriorityConfig): boolean {
  // An empty selection means "no restriction" so a fresh install or an
  // accidentally emptied checklist never hides the whole library.
  return !config.includeUnlisted && config.libraries.length > 0;
}

/** True when unlisted libraries should be searchable but demoted. */
export function includesUnlistedAsLow(config: PriorityConfig): boolean {
  return config.includeUnlisted && config.libraries.length > 0;
}

/**
 * Rank of a result type in the strict-tier order; 1 is highest.
 * Returns undefined for unranked types, which fall back to match
 * quality below every ranked type.
 */
export function getResultTypeRank(
  type: string,
  config: PriorityConfig,
): number | undefined {
  return config.resultTypes[type as PrioritizedResultType];
}

/**
 * Build the clipboard/prefs-editor template from live Zotero state.
 * Extra fields (`name`) are ignored by parsePriorityConfig and exist
 * purely to make hand-editing feasible.
 */
export function buildPriorityTemplate(
  libraries: CollectionTemplateInfo[],
): string {
  return serializePriorityConfig({
    libraries: libraries.map((library) => library.libraryID),
    includeUnlisted: false,
    resultTypes: {},
  });
}

export interface CollectionTemplateInfo {
  libraryID: number;
  name?: string;
}
