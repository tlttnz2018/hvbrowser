import type { OfflineChapterRecord, OfflineChapterSearchCacheMatch } from '../db/offline';

export type OfflineChapterTextMatch = {
  matchType: 'Chinese' | 'Han-Viet';
  snippet: string;
  occurrenceIndex: number;
};
export type OfflineChapterTextMatchesByChapter = Record<number, OfflineChapterTextMatch[]>;

export function flattenOfflineChapterTextMatchesByChapter(
  matchesByChapter: OfflineChapterTextMatchesByChapter,
): OfflineChapterSearchCacheMatch[] {
  return Object.entries(matchesByChapter).flatMap(([chapterId, matches]) =>
    matches.map((match) => ({
      chapterId: Number(chapterId),
      matchType: match.matchType,
      snippet: match.snippet,
      occurrenceIndex: match.occurrenceIndex,
    })),
  );
}

export function groupOfflineChapterSearchCacheMatches(
  matches: OfflineChapterSearchCacheMatch[],
): OfflineChapterTextMatchesByChapter {
  return matches.reduce<OfflineChapterTextMatchesByChapter>((grouped, match) => {
    grouped[match.chapterId] = [
      ...(grouped[match.chapterId] ?? []),
      {
        matchType: match.matchType,
        snippet: match.snippet,
        occurrenceIndex: match.occurrenceIndex,
      },
    ];
    return grouped;
  }, {});
}

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

function normalizeChineseSearchIndex(value: string) {
  let text = '';
  const sourceMap: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const char = value.charAt(index);
    if (/\s/.test(char)) {
      continue;
    }
    text += char.toLowerCase();
    sourceMap.push(index);
  }
  return { text, sourceMap };
}

function normalizeHanVietSearchIndex(value: string) {
  let text = '';
  const sourceMap: number[] = [];
  let pendingSpaceIndex: number | null = null;

  for (let index = 0; index < value.length; index += 1) {
    const char = value.charAt(index);
    if (/\s/.test(char)) {
      if (text) {
        pendingSpaceIndex ??= index;
      }
      continue;
    }

    if (pendingSpaceIndex != null && text) {
      text += ' ';
      sourceMap.push(pendingSpaceIndex);
    }
    pendingSpaceIndex = null;
    text += char.toLowerCase();
    sourceMap.push(index);
  }

  return { text, sourceMap };
}

function convertTextToHanViet(text: string, dictionary: Record<string, string>) {
  let output = '';
  for (const ch of text) {
    const hvWord = dictionary[ch];
    output += hvWord ? `${hvWord} ` : ch;
  }
  return output;
}

function buildSearchSnippet(text: string, normalizedIndex: number) {
  const start = Math.max(0, normalizedIndex - 42);
  const end = Math.min(text.length, normalizedIndex + 88);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

function collectOfflineTextMatches(
  searchText: string,
  snippetText: string,
  sourceMap: number[],
  query: string,
  matchType: OfflineChapterTextMatch['matchType'],
  occurrenceOffset: number,
) {
  const matches: OfflineChapterTextMatch[] = [];
  if (!query) {
    return matches;
  }

  let index = searchText.indexOf(query);
  while (index >= 0) {
    matches.push({
      matchType,
      snippet: buildSearchSnippet(snippetText, sourceMap[index] ?? index),
      occurrenceIndex: occurrenceOffset + matches.length,
    });
    index = searchText.indexOf(query, index + Math.max(1, query.length));
  }
  return matches;
}

export function findOfflineChapterTextMatches(
  chapter: OfflineChapterRecord,
  rawQuery: string,
  dictionary: Record<string, string>,
): OfflineChapterTextMatch[] {
  const chineseQuery = normalizeChineseSearch(rawQuery);
  const hanVietQuery = normalizeHanVietSearch(rawQuery);

  if (!chineseQuery && !hanVietQuery) {
    return [];
  }

  const originalText = stripHtmlToText(chapter.originalHtml);
  const normalizedOriginal = normalizeChineseSearchIndex(originalText);
  const originalMatches = collectOfflineTextMatches(
    normalizedOriginal.text,
    originalText,
    normalizedOriginal.sourceMap,
    chineseQuery,
    'Chinese',
    0,
  );

  const hanVietText = chapter.convertedHvHtml
    ? stripHtmlToText(chapter.convertedHvHtml)
    : convertTextToHanViet(originalText, dictionary);
  const normalizedHanViet = normalizeHanVietSearchIndex(hanVietText);
  const hanVietMatches = collectOfflineTextMatches(
    normalizedHanViet.text,
    hanVietText,
    normalizedHanViet.sourceMap,
    hanVietQuery,
    'Han-Viet',
    originalMatches.length,
  );

  return [...originalMatches, ...hanVietMatches];
}

export function findOfflineChapterTextMatch(
  chapter: OfflineChapterRecord,
  rawQuery: string,
  dictionary: Record<string, string>,
): OfflineChapterTextMatch | null {
  return findOfflineChapterTextMatches(chapter, rawQuery, dictionary)[0] ?? null;
}
