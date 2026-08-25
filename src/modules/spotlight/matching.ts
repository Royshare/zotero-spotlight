/**
 * Query-to-entry scoring.
 *
 * "field" mode splits the query and each indexed field into word tokens
 * and requires every query token to match a field token by:
 *   - exact equality,
 *   - prefix ("mach" → "machine"),
 *   - contiguous substring ("pose" → "openpose"), or
 *   - bounded edit distance (Damerau-Levenshtein ≤ typoDistance) for
 *     tokens at least minTokenLength characters long — this is the
 *     "minor typos" tolerance.
 *
 * It never allows letters to scatter arbitrarily, so queries cannot
 * phantom-match distant parts of a sentence.
 *
 * "loose" mode preserves the pre-per-field behavior: one fuzzy
 * subsequence match over the whole concatenated text.
 */

export type MatchMode = "field" | "loose";

export const DEFAULT_MATCH_MODE: MatchMode = "field";

export const MATCH_MODES = ["field", "loose"] as const;

export interface MatchOptions {
  mode: MatchMode;
  /** Max Damerau-Levenshtein edits allowed per word token. */
  typoDistance: number;
  /** Tokens shorter than this must match exactly (no typo tolerance). */
  minTokenLength: number;
}

export const DEFAULT_MATCH_OPTIONS: MatchOptions = {
  mode: DEFAULT_MATCH_MODE,
  typoDistance: 1,
  minTokenLength: 4,
};

const TOKEN_RE = /[\p{L}\p{N}]+/gu;

function tokenize(value: string): string[] {
  return value.toLowerCase().match(TOKEN_RE) || [];
}

/** Damerau-Levenshtein distance, abandoned once it exceeds `max`. */
function editDistanceAtMost(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) {
    return max + 1;
  }
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i += 1) {
    rows.push(new Array(b.length + 1).fill(0));
    rows[i][0] = i;
  }
  for (let j = 0; j <= b.length; j += 1) {
    rows[0][j] = j;
  }
  for (let i = 1; i <= a.length; i += 1) {
    let rowMin = rows[i][0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, rows[i - 2][j - 2] + 1);
      }
      rows[i][j] = value;
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) {
      return max + 1;
    }
  }
  return rows[a.length][b.length];
}

const EXACT_SCORE = 60;
const PREFIX_SCORE = 48;
const SUBSTRING_SCORE = 44;
const TYPO_SCORE = 36;

/** Best score for one query token against one field's tokens; -1 if none. */
function scoreToken(
  queryToken: string,
  fieldTokens: readonly string[],
  options: MatchOptions,
): number {
  let best = -1;
  const canTypo =
    options.typoDistance > 0 && queryToken.length >= options.minTokenLength;
  for (const fieldToken of fieldTokens) {
    let score = -1;
    if (fieldToken === queryToken) {
      score = EXACT_SCORE;
    } else if (queryToken.length >= 2 && fieldToken.startsWith(queryToken)) {
      score = PREFIX_SCORE - Math.min(4, fieldToken.length - queryToken.length);
    } else if (
      queryToken.length >= 3 &&
      fieldToken.length >= 3 &&
      fieldToken.includes(queryToken)
    ) {
      score = SUBSTRING_SCORE;
    } else if (canTypo && fieldToken.length >= options.minTokenLength) {
      const distance = editDistanceAtMost(
        queryToken,
        fieldToken,
        options.typoDistance,
      );
      if (distance <= options.typoDistance) {
        score = TYPO_SCORE - distance * 4;
      }
    }
    if (score > best) {
      best = score;
    }
  }
  return best;
}

function scoreFieldMode(
  query: string,
  searchFields: readonly string[],
  options: MatchOptions,
): number {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) {
    return -1;
  }
  const fieldsAsTokens = searchFields.map((field) => tokenize(field));
  let total = 0;
  // Every query token must be found somewhere (AND semantics).
  for (const queryToken of queryTokens) {
    let best = -1;
    for (const fieldTokens of fieldsAsTokens) {
      const score = scoreToken(queryToken, fieldTokens, options);
      if (score > best) {
        best = score;
      }
    }
    if (best < 0) {
      return -1;
    }
    total += best;
  }
  return total;
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

/** Score a query against an entry. Returns -1 when nothing matches. */
export function scoreQuery(
  query: string,
  searchFields: readonly string[],
  searchText: string,
  options: MatchOptions,
): number {
  if (!query.trim()) {
    return -1;
  }
  if (options.mode === "loose") {
    return fuzzyScore(query, searchText);
  }
  return scoreFieldMode(query, searchFields, options);
}
