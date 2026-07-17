import type { OfflineChapterRecord } from '../db/offline';

export type OfflineChapterTextMatch = {
  matchType: 'Chinese' | 'Han-Viet';
  snippet: string;
  occurrenceIndex: number;
};

export function stripHtmlToText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeChineseSearch(value: string) {
  return value.toLowerCase().replace(/\s+/g, '');
}

export function normalizeHanVietSearch(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function convertTextToHanViet(text: string, dictionary: Record<string, string>) {
  let output = '';
  for (const ch of text) {
    const hvWord = dictionary[ch];
    output += hvWord ? `${hvWord} ` : ch;
  }
  return output;
}

function countMatchesBefore(text: string, query: string, beforeIndex: number) {
  if (!query) return 0;
  let count = 0;
  let index = text.indexOf(query);
  while (index >= 0 && index < beforeIndex) {
    count += 1;
    index = text.indexOf(query, index + Math.max(1, query.length));
  }
  return count;
}

function countAllMatches(text: string, query: string) {
  if (!query) return 0;
  let count = 0;
  let index = text.indexOf(query);
  while (index >= 0) {
    count += 1;
    index = text.indexOf(query, index + Math.max(1, query.length));
  }
  return count;
}

function buildSearchSnippet(text: string, normalizedIndex: number) {
  const start = Math.max(0, normalizedIndex - 42);
  const end = Math.min(text.length, normalizedIndex + 88);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

export function findOfflineChapterTextMatch(
  chapter: OfflineChapterRecord,
  rawQuery: string,
  dictionary: Record<string, string>,
): OfflineChapterTextMatch | null {
  const chineseQuery = normalizeChineseSearch(rawQuery);
  const hanVietQuery = normalizeHanVietSearch(rawQuery);

  if (!chineseQuery && !hanVietQuery) {
    return null;
  }

  const originalText = stripHtmlToText(chapter.originalHtml);
  const normalizedOriginal = normalizeChineseSearch(originalText);
  const originalIndex = chineseQuery ? normalizedOriginal.indexOf(chineseQuery) : -1;

  if (originalIndex >= 0) {
    return {
      matchType: 'Chinese',
      snippet: buildSearchSnippet(originalText, originalIndex),
      occurrenceIndex: countMatchesBefore(normalizedOriginal, chineseQuery, originalIndex),
    };
  }

  const hanVietText = chapter.convertedHvHtml
    ? stripHtmlToText(chapter.convertedHvHtml)
    : convertTextToHanViet(originalText, dictionary);
  const normalizedHanViet = normalizeHanVietSearch(hanVietText);
  const hanVietIndex = hanVietQuery ? normalizedHanViet.indexOf(hanVietQuery) : -1;

  if (hanVietIndex < 0) {
    return null;
  }

  return {
    matchType: 'Han-Viet',
    snippet: buildSearchSnippet(hanVietText, hanVietIndex),
    occurrenceIndex:
      countAllMatches(normalizedOriginal, chineseQuery) +
      countMatchesBefore(normalizedHanViet, hanVietQuery, hanVietIndex),
  };
}
