/**
 * Precise word-based query scoring.
 *
 * Matching rules: words are runs of Unicode letters/digits, lowercased, and
 * everything else separates words. A query with no words does not match. A
 * query containing Han, Hiragana, Katakana, or Hangul characters defers to the
 * script-aware substring/fuzzy scorer unchanged. Otherwise every query word
 * must match at least one word in at least one field (AND); different query
 * words may match different fields, but one query word never spans two fields.
 * Word order does not matter. A query word scores best as an exact word, a
 * prefix, a word containing the query, or a typo within the configured edit
 * tolerance for long-enough words. The total is the sum of each query word's
 * best score, or -1 when any query word does not match.
 */

import { scoreSearchText } from "./textMatching";

/** Supported matching modes. */
export const MATCH_MODES = ["fuzzy", "precise"] as const;

/** Matching mode name. */
export type MatchMode = (typeof MATCH_MODES)[number];

/** Options controlling precise matching behavior. */
export interface MatchOptions {
  mode: MatchMode;
  /** Max Damerau-Levenshtein edits per word (0 turns typos off). */
  typoTolerance: number;
  /** Words shorter than this must match without typos. */
  minTypoWordLength: number;
}

/** Default matching options: fuzzy mode with one typo edit for long words. */
export const DEFAULT_MATCH_OPTIONS: MatchOptions = {
  mode: "fuzzy",
  typoTolerance: 1,
  minTypoWordLength: 4,
};

const TOKEN_RE = /[\p{L}\p{N}]+/gu;
const CJK_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

function tokenize(value: string): string[] {
  return value.toLowerCase().match(TOKEN_RE) || [];
}

function clampInteger(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Create validated match options, falling back to defaults for invalid input. */
export function createMatchOptions(
  mode: unknown,
  typoTolerance: unknown,
  minTypoWordLength: unknown,
): MatchOptions {
  return {
    mode: mode === "precise" ? "precise" : "fuzzy",
    typoTolerance: clampInteger(
      typoTolerance,
      0,
      2,
      DEFAULT_MATCH_OPTIONS.typoTolerance,
    ),
    minTypoWordLength: clampInteger(
      minTypoWordLength,
      1,
      20,
      DEFAULT_MATCH_OPTIONS.minTypoWordLength,
    ),
  };
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

/** Best score for one query word against one field's words; -1 if none. */
function scoreWord(
  queryWord: string,
  fieldWords: readonly string[],
  options: MatchOptions,
): number {
  let best = -1;
  const canTypo =
    options.typoTolerance > 0 && queryWord.length >= options.minTypoWordLength;
  for (const fieldWord of fieldWords) {
    let score = -1;
    if (fieldWord === queryWord) {
      score = EXACT_SCORE;
    } else if (queryWord.length >= 2 && fieldWord.startsWith(queryWord)) {
      score = PREFIX_SCORE - Math.min(4, fieldWord.length - queryWord.length);
    } else if (
      queryWord.length >= 3 &&
      fieldWord.length >= 3 &&
      fieldWord.includes(queryWord)
    ) {
      score = SUBSTRING_SCORE;
    } else if (canTypo && fieldWord.length >= options.minTypoWordLength) {
      const distance = editDistanceAtMost(
        queryWord,
        fieldWord,
        options.typoTolerance,
      );
      if (distance <= options.typoTolerance) {
        score = TYPO_SCORE - distance * 4;
      }
    }
    if (score > best) {
      best = score;
    }
  }
  return best;
}

/** Score a query against fields using precise word matching; -1 when no match. */
export function scorePreciseMatch(
  query: string,
  fields: readonly string[],
  options: MatchOptions,
): number {
  const queryWords = tokenize(query);
  if (!queryWords.length) {
    return -1;
  }
  if (CJK_SCRIPT.test(query)) {
    return scoreSearchText(query, fields.join(" "));
  }
  const fieldsAsWords = fields.map((field) => tokenize(field));
  let total = 0;
  for (const queryWord of queryWords) {
    let best = -1;
    for (const fieldWords of fieldsAsWords) {
      const score = scoreWord(queryWord, fieldWords, options);
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
