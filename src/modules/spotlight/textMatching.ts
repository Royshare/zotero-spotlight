/** Normalize text in the same way for indexed text and user queries. */
export function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

const CJK_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/**
 * Score a query against searchable text. CJK scripts commonly omit spaces
 * between words, so an exact substring is a strong match even when it occurs
 * in the middle of a title. Other queries retain the existing fuzzy behavior.
 */
export function scoreSearchText(rawQuery: string, rawText: string): number {
  const query = normalizeSearchText(rawQuery);
  const text = normalizeSearchText(rawText);
  if (!query) {
    return 10;
  }
  if (!text) {
    return -1;
  }

  if (CJK_SCRIPT.test(query) && text.includes(query)) {
    const index = text.indexOf(query);
    return 100 + query.length * 5 + Math.max(0, 20 - index);
  }

  return fuzzyScore(query, text);
}

function fuzzyScore(query: string, text: string): number {
  let score = 0;
  let textIndex = 0;
  let lastMatch = -1;
  let consecutive = 0;
  for (let queryIndex = 0; queryIndex < query.length; queryIndex += 1) {
    const char = query[queryIndex];
    let found = false;
    while (textIndex < text.length) {
      if (text[textIndex] === char) {
        found = true;
        break;
      }
      textIndex += 1;
    }
    if (!found) {
      return -1;
    }
    if (textIndex === lastMatch + 1) {
      consecutive += 1;
      score += 5 + consecutive;
    } else {
      consecutive = 0;
      score += 1;
    }
    if (textIndex === 0 || " /-_".includes(text[textIndex - 1])) {
      score += 3;
    }
    lastMatch = textIndex;
    textIndex += 1;
  }
  if (text.includes(query)) {
    score += 8;
  }
  score += Math.max(0, 10 - (text.length - query.length));
  return score;
}
