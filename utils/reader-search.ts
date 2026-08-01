import type { ReaderSearchResult } from '../stores/useWebPageStore';
import type { ReaderDefinitionSegment } from './webview-html';

export interface ReaderSearchTargetRange {
  segmentId: number;
  start: number;
  end: number;
}

export interface ReaderSearchWebMatch {
  id: string;
  ranges: ReaderSearchTargetRange[];
}

export interface ReaderSearchIndexPosition {
  segmentId: number;
  characterIndex: number;
}

export interface ReaderSearchIndex {
  text: string;
  map: ReaderSearchIndexPosition[];
}

export interface ReaderSearchCollection {
  results: ReaderSearchResult[];
  webMatches: ReaderSearchWebMatch[];
}

export interface ReaderSearchPreparedIndexes {
  chinese: ReaderSearchIndex;
  hanViet: ReaderSearchIndex;
}

function normalizeReaderChineseSearch(value: string) {
  'worklet';

  return value.toLowerCase().replace(/\s+/g, '');
}

function normalizeReaderHanVietSearch(value: string) {
  'worklet';

  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function getSegmentCharacters(segment: ReaderDefinitionSegment | null | undefined) {
  'worklet';

  return Array.from(segment?.text ?? '');
}

function getOrderedReaderSegments(segments: Record<number, ReaderDefinitionSegment>) {
  'worklet';

  return Object.values(segments).sort((left, right) => left.id - right.id);
}

function appendReaderSearchText(
  index: ReaderSearchIndex,
  text: string,
  position: ReaderSearchIndexPosition,
) {
  'worklet';

  for (const ch of text) {
    index.text += ch;
    index.map.push(position);
  }
}

function buildReaderChineseSearchIndex(
  segments: Record<number, ReaderDefinitionSegment>,
): ReaderSearchIndex {
  'worklet';

  const index: ReaderSearchIndex = { text: '', map: [] };

  getOrderedReaderSegments(segments).forEach((segment) => {
    getSegmentCharacters(segment).forEach((ch, characterIndex) => {
      const normalized = normalizeReaderChineseSearch(ch);
      if (!normalized) {
        return;
      }
      appendReaderSearchText(index, normalized, { segmentId: segment.id, characterIndex });
    });
  });

  return index;
}

function buildReaderHanVietSearchIndex(
  segments: Record<number, ReaderDefinitionSegment>,
  dictionary: Record<string, string>,
): ReaderSearchIndex {
  'worklet';

  const index: ReaderSearchIndex = { text: '', map: [] };

  getOrderedReaderSegments(segments).forEach((segment) => {
    getSegmentCharacters(segment).forEach((ch, characterIndex) => {
      const normalized = normalizeReaderHanVietSearch(dictionary[ch] || ch);
      if (!normalized) {
        return;
      }
      const position = { segmentId: segment.id, characterIndex };
      if (index.text && index.text.charAt(index.text.length - 1) !== ' ') {
        appendReaderSearchText(index, ' ', position);
      }
      appendReaderSearchText(index, normalized, position);
    });
  });

  return index;
}

export function buildReaderSearchIndexes(
  segments: Record<number, ReaderDefinitionSegment>,
  dictionary: Record<string, string>,
): ReaderSearchPreparedIndexes {
  'worklet';

  return {
    chinese: buildReaderChineseSearchIndex(segments),
    hanViet: buildReaderHanVietSearchIndex(segments, dictionary),
  };
}

function buildReaderSearchRanges(
  searchIndex: ReaderSearchIndex,
  foundAt: number,
  queryLength: number,
): ReaderSearchTargetRange[] {
  'worklet';

  const positions = searchIndex.map.slice(foundAt, foundAt + queryLength);
  const ranges: ReaderSearchTargetRange[] = [];

  positions.forEach((position) => {
    const current = ranges[ranges.length - 1];
    if (
      current &&
      current.segmentId === position.segmentId &&
      position.characterIndex <= current.end
    ) {
      current.end = Math.max(current.end, position.characterIndex + 1);
      return;
    }

    ranges.push({
      segmentId: position.segmentId,
      start: position.characterIndex,
      end: position.characterIndex + 1,
    });
  });

  return ranges;
}

function buildReaderSearchSnippet(
  segment: ReaderDefinitionSegment | null | undefined,
  matchType: ReaderSearchResult['matchType'],
  characterIndex: number,
) {
  'worklet';

  if (!segment) {
    return '';
  }

  const sourceText =
    matchType === 'han-viet' ? segment.hanVietText || segment.sourceText : segment.sourceText;
  const sourceCharacters = Array.from(sourceText || segment.text);
  const sourceIndex =
    matchType === 'han-viet'
      ? (segment.hanVietIndexes[characterIndex] ?? characterIndex)
      : (segment.sourceIndexes[characterIndex] ?? characterIndex);
  const start = Math.max(0, sourceIndex - 42);
  const end = Math.min(sourceCharacters.length, sourceIndex + 88);

  return sourceCharacters.slice(start, end).join('').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function collectReaderSearchIndexMatches(
  input: {
    searchIndex: ReaderSearchIndex;
    query: string;
    segments: Record<number, ReaderDefinitionSegment>;
    matchType: ReaderSearchResult['matchType'];
    requestId: number;
    seen: Record<string, true>;
    maxResults: number;
  },
  output: ReaderSearchCollection,
) {
  'worklet';

  if (!input.query) {
    return;
  }

  let startAt = 0;
  while (output.results.length < input.maxResults) {
    const foundAt = input.searchIndex.text.indexOf(input.query, startAt);
    if (foundAt < 0) {
      break;
    }

    const ranges = buildReaderSearchRanges(input.searchIndex, foundAt, input.query.length);
    const firstRange = ranges[0];
    if (firstRange) {
      const seenKey = `${input.matchType}:${ranges
        .map((range) => `${range.segmentId}:${range.start}:${range.end}`)
        .join('|')}`;
      if (!input.seen[seenKey]) {
        input.seen[seenKey] = true;
        const id = `reader-search-${input.requestId}-${output.results.length}`;
        const label = input.matchType === 'chinese' ? 'Chinese match' : 'Han-Viet match';
        output.results.push({
          id,
          label,
          matchType: input.matchType,
          snippet: buildReaderSearchSnippet(
            input.segments[firstRange.segmentId],
            input.matchType,
            firstRange.start,
          ),
          occurrenceIndex: output.results.length,
        });
        output.webMatches.push({ id, ranges });
      }
    }

    startAt = foundAt + Math.max(1, input.query.length);
  }
}

export function findReaderSegmentSearchMatches(input: {
  segments: Record<number, ReaderDefinitionSegment>;
  indexes: ReaderSearchPreparedIndexes;
  rawQuery: string;
  requestId: number;
  maxResults?: number;
}): ReaderSearchCollection {
  'worklet';

  const chineseQuery = normalizeReaderChineseSearch(input.rawQuery);
  const hanVietQuery = normalizeReaderHanVietSearch(input.rawQuery);
  const output: ReaderSearchCollection = { results: [], webMatches: [] };
  const maxResults = input.maxResults && input.maxResults > 0 ? input.maxResults : 80;
  const seen: Record<string, true> = {};

  collectReaderSearchIndexMatches(
    {
      searchIndex: input.indexes.chinese,
      query: chineseQuery,
      segments: input.segments,
      matchType: 'chinese',
      requestId: input.requestId,
      seen,
      maxResults,
    },
    output,
  );
  collectReaderSearchIndexMatches(
    {
      searchIndex: input.indexes.hanViet,
      query: hanVietQuery,
      segments: input.segments,
      matchType: 'han-viet',
      requestId: input.requestId,
      seen,
      maxResults,
    },
    output,
  );

  return output;
}
