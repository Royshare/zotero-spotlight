/**
 * Pure helpers for user-configured result type priorities.
 *
 * The preference format is comma-separated `type:rank` pairs, for example
 * `pdf:1,item:2`. Spaces around entries, types, and ranks are ignored.
 * Non-string input or an empty string means no priorities.
 *
 * Unknown types (including `annotation`), ranks that are not whole numbers
 * from 1 to MAX_RESULT_TYPE_RANK, and malformed entries are dropped; the rest
 * are kept. If a type repeats, the first entry wins. Several types may share a
 * rank.
 *
 * Ranked types sort before unranked types. Types with the same tier, including
 * two unranked types, compare as equal so callers can break ties by relevance.
 */
export const RANKABLE_RESULT_TYPES = [
  "item",
  "note",
  "pdf",
  "epub",
  "snapshot",
  "link",
] as const;

/** A result type that can be assigned an explicit rank. */
export type RankableResultType = (typeof RANKABLE_RESULT_TYPES)[number];

/** Rank per type; 1 is the highest priority. Missing types are unranked. */
export type ResultTypePriorities = Partial<Record<RankableResultType, number>>;

/** Highest allowed rank, equal to the number of rankable result types. */
export const MAX_RESULT_TYPE_RANK = RANKABLE_RESULT_TYPES.length; // 6

const RANKABLE_TYPE_SET = new Set<string>(RANKABLE_RESULT_TYPES);

/** Parse a `type:rank` preference string into result type priorities. */
export function parseResultTypePriorities(raw: unknown): ResultTypePriorities {
  if (typeof raw !== "string" || raw.trim() === "") {
    return {};
  }

  const priorities: ResultTypePriorities = {};
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }

    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex < 0) {
      continue;
    }

    const type = trimmed.slice(0, separatorIndex).trim();
    const rankRaw = trimmed.slice(separatorIndex + 1).trim();
    if (!type || !rankRaw) {
      continue;
    }
    if (trimmed.indexOf(":", separatorIndex + 1) >= 0) {
      continue;
    }
    if (!RANKABLE_TYPE_SET.has(type)) {
      continue;
    }
    if (type in priorities) {
      continue;
    }

    const rank = Number(rankRaw);
    if (!Number.isInteger(rank) || rank < 1 || rank > MAX_RESULT_TYPE_RANK) {
      continue;
    }

    priorities[type as RankableResultType] = rank;
  }

  return priorities;
}

/** Serialize result type priorities to the `type:rank` preference format. */
export function serializeResultTypePriorities(
  priorities: ResultTypePriorities,
): string {
  const entries = RANKABLE_RESULT_TYPES.flatMap((type) => {
    const rank = priorities[type];
    if (
      typeof rank !== "number" ||
      !Number.isInteger(rank) ||
      rank < 1 ||
      rank > MAX_RESULT_TYPE_RANK
    ) {
      return [];
    }
    return [{ type, rank }];
  });

  entries.sort((a, b) => {
    if (a.rank !== b.rank) {
      return a.rank - b.rank;
    }
    return (
      RANKABLE_RESULT_TYPES.indexOf(a.type) -
      RANKABLE_RESULT_TYPES.indexOf(b.type)
    );
  });

  return entries.map(({ type, rank }) => `${type}:${rank}`).join(",");
}

/** Return the priority tier for a result type, or Infinity when unranked. */
export function getResultTypeTier(
  priorities: ResultTypePriorities,
  resultType: string,
): number {
  if (!RANKABLE_TYPE_SET.has(resultType)) {
    return Infinity;
  }
  const rank = priorities[resultType as RankableResultType];
  if (
    typeof rank !== "number" ||
    !Number.isInteger(rank) ||
    rank < 1 ||
    rank > MAX_RESULT_TYPE_RANK
  ) {
    return Infinity;
  }
  return rank;
}

/** Compare two results by configured type priority, leaving ties to relevance. */
export function compareResultTypePriority(
  priorities: ResultTypePriorities,
  a: { resultType: string },
  b: { resultType: string },
): number {
  const tierA = getResultTypeTier(priorities, a.resultType);
  const tierB = getResultTypeTier(priorities, b.resultType);
  if (tierA === tierB) {
    return 0;
  }
  return tierA - tierB;
}
