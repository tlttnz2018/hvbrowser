import { FontAwesome6 } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  InteractionManager,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';

import type { OfflineChapterRecord } from '../db/offline';
import { usePageLoader } from '../hooks/usePageLoader';
import { useAppStore } from '../stores/useAppStore';
import { type ReaderSearchResult, useWebPageStore } from '../stores/useWebPageStore';
import { absoluteFill, Theme, useTheme } from '../theme';
import {
  getDebugCount,
  getDebugDuration,
  getDebugLength,
  logReaderDebug,
} from '../utils/debug-log';
import {
  DefinitionEntry,
  findBestDefinitionMatch,
  findDefinitionByWord,
} from '../utils/definition-dictionary';
import { extractBaseUrl } from '../utils/normalize-url';
import {
  getOfflineChapterPreload,
  preloadOfflineChapterConversion,
} from '../utils/offline-chapter-preload';
import { normalizeChineseSearch, normalizeHanVietSearch } from '../utils/offline-chapter-search';
import {
  scheduleReaderWorkletTask,
  warmReaderWorkletRuntime,
} from '../utils/reader-worklet-runtime';
import { buildReaderHtmlSourceWorklet } from '../utils/reader-worklet-tasks';
import { getBottomInsetWithSystemBarPadding } from '../utils/safe-area';
import {
  buildPresentationHtmlWithChineseDefinitions,
  buildPresentationHtmlWithHvDefinitions,
  normalizeEpubFullSiteHtml,
  type ReaderDefinitionSegment,
  type ReaderHtmlWithDefinitionSegments,
} from '../utils/webview-html';

type DefinitionLookupMode = 'best' | 'exact';

interface DefinitionLookupPayload {
  type?: string;
  url?: string;
  ratio?: number;
  requestId?: number;
  query?: string;
  activeIndex?: number | null;
  lookupId?: string;
  lookupMode?: DefinitionLookupMode;
  segmentId?: number;
  chineseContext?: string;
  characterIndex?: number;
  selectedWord?: string;
  selectedStart?: number;
  selectedEnd?: number;
  segmentLength?: number;
  fallbackWord?: string;
  results?: Array<{
    id: string;
    label: string;
    matchType: 'chinese' | 'han-viet';
    snippet: string;
  }>;
}

interface DefinitionSheetState {
  lookupId: string;
  word: string;
  pinyin: string;
  hanViet: string;
  meaning: string;
  loading: boolean;
  segmentId: number | null;
  start: number;
  end: number;
  activeIndex: number;
  segmentLength: number;
  canPrev: boolean;
  canNext: boolean;
  canShrink: boolean;
  canExpand: boolean;
}

const MAX_READER_SCROLL_CACHE_ENTRIES = 40;
const MAX_SAVED_CHAPTER_CACHE_ENTRIES = 80;
const MAX_READER_HTML_CACHE_ENTRIES = 6;
const MAX_READER_HTML_PREWARM_ENTRIES = 1;
const MAX_READER_HTML_PREWARM_BYTES = 3 * 1024 * 1024;
const READER_HTML_WORKLET_TIMEOUT_MS = 8000;
const EMPTY_OFFLINE_CHAPTERS: OfflineChapterRecord[] = [];
const EMPTY_READER_HTML_SOURCE: ReaderHtmlWithDefinitionSegments = {
  html: '',
  definitionSegments: {},
};

function getReaderHtmlSourceCacheKey(input: {
  currentUrl: string;
  htmlOrig: string;
  htmlHV: string;
  fullSite: boolean;
  isCurrentEpub: boolean;
  isHV: boolean;
  fontSize: number;
  readerBottomInset: number;
  themeMode: Theme['mode'];
}) {
  return [
    input.currentUrl,
    getDebugLength(input.htmlOrig),
    getDebugLength(input.htmlHV),
    input.fullSite ? 'full' : 'reader',
    input.isCurrentEpub ? 'epub' : 'web',
    input.isHV ? 'hv' : 'zh',
    input.fontSize,
    input.readerBottomInset,
    input.themeMode,
  ].join(':');
}

function pruneStringKeyedRecord<T>(record: Record<string, T>, maxEntries: number) {
  const keys = Object.keys(record);
  if (keys.length <= maxEntries) {
    return;
  }

  keys.slice(0, keys.length - maxEntries).forEach((key) => {
    delete record[key];
  });
}

function pruneSavedChapterRecord<T extends { savedAt: number }>(
  record: Record<number, T>,
  maxEntries: number,
) {
  const entries = Object.entries(record);
  if (entries.length <= maxEntries) {
    return;
  }

  entries
    .sort(([, left], [, right]) => left.savedAt - right.savedAt)
    .slice(0, entries.length - maxEntries)
    .forEach(([key]) => {
      delete record[Number(key)];
    });
}

function getReaderHtmlPrewarmSizeBytes(result: ReaderHtmlWithDefinitionSegments) {
  const segmentBytes = Object.values(result.definitionSegments).reduce(
    (total, segment) =>
      total +
      (segment.text.length + segment.sourceText.length + segment.hanVietText.length) * 2 +
      (segment.breakBeforeIndexes.length +
        segment.sourceIndexes.length +
        segment.hanVietIndexes.length) *
        8,
    0,
  );

  return result.html.length * 2 + segmentBytes;
}

function canCacheReaderHtmlPrewarm(result: ReaderHtmlWithDefinitionSegments) {
  return getReaderHtmlPrewarmSizeBytes(result) <= MAX_READER_HTML_PREWARM_BYTES;
}

interface DefinitionSelectionState {
  segmentId: number | null;
  word: string;
  pinyin: string;
  start: number;
  end: number;
  activeIndex: number;
  segmentLength: number;
}

interface ReaderSearchTargetRange {
  segmentId: number;
  start: number;
  end: number;
}

interface ReaderSearchWebMatch {
  id: string;
  ranges: ReaderSearchTargetRange[];
}

interface ReaderSearchIndexPosition {
  segmentId: number;
  characterIndex: number;
}

interface ReaderSearchIndex {
  text: string;
  map: ReaderSearchIndexPosition[];
}

interface ReaderSearchCollection {
  results: ReaderSearchResult[];
  webMatches: ReaderSearchWebMatch[];
}

interface ReaderSearchPreparedIndexes {
  chinese: ReaderSearchIndex;
  hanViet: ReaderSearchIndex;
}

function buildFullSiteFontScript(fontSize: number): string {
  const fullSiteScale = 1 + (fontSize - 1) * 0.5;

  return `
    (function() {
      var scale = ${JSON.stringify(fullSiteScale)};
      var root = document.body || document.documentElement;
      if (!root) {
        return true;
      }

      var nodes = [root].concat(Array.prototype.slice.call(root.querySelectorAll('*')));
      for (var index = 0; index < nodes.length; index += 1) {
        var node = nodes[index];
        if (!node || !node.style) {
          continue;
        }

        var computed = window.getComputedStyle(node);
        if (!computed) {
          continue;
        }

        var baseFontSize = node.getAttribute('data-hvbrowser-base-font-size');
        if (!baseFontSize) {
          var currentFontSize = parseFloat(computed.fontSize || '');
          if (Number.isFinite(currentFontSize) && currentFontSize > 0) {
            baseFontSize = String(currentFontSize);
            node.setAttribute('data-hvbrowser-base-font-size', baseFontSize);
          }
        }

        var fontSizePx = parseFloat(baseFontSize || '');
        if (Number.isFinite(fontSizePx) && fontSizePx > 0) {
          node.style.setProperty('font-size', (fontSizePx * scale) + 'px', 'important');
        }

        var computedLineHeight = computed.lineHeight || '';
        if (computedLineHeight.slice(-2) !== 'px') {
          if (scale === 1) {
            node.style.removeProperty('line-height');
          }
          continue;
        }

        var baseLineHeight = node.getAttribute('data-hvbrowser-base-line-height');
        if (!baseLineHeight) {
          var currentLineHeight = parseFloat(computedLineHeight);
          if (Number.isFinite(currentLineHeight) && currentLineHeight > 0) {
            baseLineHeight = String(currentLineHeight);
            node.setAttribute('data-hvbrowser-base-line-height', baseLineHeight);
          }
        }

        var lineHeightPx = parseFloat(baseLineHeight || '');
        if (Number.isFinite(lineHeightPx) && lineHeightPx > 0) {
          node.style.setProperty('line-height', (lineHeightPx * scale) + 'px', 'important');
        }
      }

      return true;
    })();
  `;
}

function getCharacterLength(value: string): number {
  return Array.from(value || '').length;
}

function getSelectionControls(selection: DefinitionSelectionState) {
  return {
    canPrev: selection.activeIndex > 0,
    canNext: selection.activeIndex < selection.segmentLength - 1,
    canShrink: selection.end - selection.start > 1,
    canExpand: selection.start > 0 || selection.end < selection.segmentLength,
  };
}

function getSegmentCharacters(segment: ReaderDefinitionSegment | null | undefined) {
  return Array.from(segment?.text ?? '');
}

function getSegmentBreaks(segment: ReaderDefinitionSegment | null | undefined) {
  return new Set(segment?.breakBeforeIndexes ?? []);
}

function getSegmentWordRange(segment: ReaderDefinitionSegment, activeIndex: number) {
  const chars = getSegmentCharacters(segment);
  const breaks = getSegmentBreaks(segment);
  const safeActiveIndex = Math.max(0, Math.min(chars.length - 1, activeIndex));
  let start = safeActiveIndex;
  while (start > 0 && !breaks.has(start)) {
    start -= 1;
  }

  let end = safeActiveIndex + 1;
  while (end < chars.length && !breaks.has(end)) {
    end += 1;
  }

  return { start, end };
}

function getSegmentTextRange(
  segment: ReaderDefinitionSegment | null | undefined,
  start: number,
  end: number,
) {
  return getSegmentCharacters(segment).slice(start, end).join('');
}

function getOrderedReaderSegments(segments: Record<number, ReaderDefinitionSegment>) {
  return Object.values(segments).sort((left, right) => left.id - right.id);
}

function appendReaderSearchText(
  index: ReaderSearchIndex,
  text: string,
  position: ReaderSearchIndexPosition,
) {
  for (const ch of text) {
    index.text += ch;
    index.map.push(position);
  }
}

function buildReaderChineseSearchIndex(
  segments: Record<number, ReaderDefinitionSegment>,
): ReaderSearchIndex {
  const index: ReaderSearchIndex = { text: '', map: [] };

  getOrderedReaderSegments(segments).forEach((segment) => {
    getSegmentCharacters(segment).forEach((ch, characterIndex) => {
      const normalized = normalizeChineseSearch(ch);
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
  const index: ReaderSearchIndex = { text: '', map: [] };

  getOrderedReaderSegments(segments).forEach((segment) => {
    getSegmentCharacters(segment).forEach((ch, characterIndex) => {
      const normalized = normalizeHanVietSearch(dictionary[ch] || ch);
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

function buildReaderSearchIndexes(
  segments: Record<number, ReaderDefinitionSegment>,
  dictionary: Record<string, string>,
): ReaderSearchPreparedIndexes {
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
    seen: Set<string>;
    maxResults: number;
  },
  output: ReaderSearchCollection,
) {
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
      if (!input.seen.has(seenKey)) {
        input.seen.add(seenKey);
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

function findReaderSegmentSearchMatches(input: {
  segments: Record<number, ReaderDefinitionSegment>;
  indexes: ReaderSearchPreparedIndexes;
  rawQuery: string;
  requestId: number;
  maxResults?: number;
}): ReaderSearchCollection {
  const chineseQuery = normalizeChineseSearch(input.rawQuery);
  const hanVietQuery = normalizeHanVietSearch(input.rawQuery);
  const output: ReaderSearchCollection = { results: [], webMatches: [] };
  const maxResults = input.maxResults && input.maxResults > 0 ? input.maxResults : 80;
  const seen = new Set<string>();

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

function getInitialSelectionFromPayload(
  payload: DefinitionLookupPayload,
  segments: Record<number, ReaderDefinitionSegment>,
): DefinitionSelectionState {
  const segmentId =
    typeof payload.segmentId === 'number' && Number.isFinite(payload.segmentId)
      ? Math.floor(payload.segmentId)
      : null;
  const segment = segmentId == null ? null : segments[segmentId];
  const segmentCharacters = getSegmentCharacters(segment);
  const activeIndex =
    typeof payload.characterIndex === 'number' && Number.isFinite(payload.characterIndex)
      ? Math.max(
          0,
          Math.min(Math.max(0, segmentCharacters.length - 1), Math.floor(payload.characterIndex)),
        )
      : 0;
  const segmentLength =
    segmentCharacters.length > 0
      ? segmentCharacters.length
      : typeof payload.segmentLength === 'number' && Number.isFinite(payload.segmentLength)
        ? Math.max(1, Math.floor(payload.segmentLength))
        : Math.max(1, getCharacterLength(payload.chineseContext ?? payload.selectedWord ?? ''));
  const defaultRange = segment ? getSegmentWordRange(segment, activeIndex) : null;
  const start =
    typeof payload.selectedStart === 'number' && Number.isFinite(payload.selectedStart)
      ? Math.max(0, Math.min(segmentLength - 1, Math.floor(payload.selectedStart)))
      : (defaultRange?.start ?? activeIndex);
  const end =
    typeof payload.selectedEnd === 'number' && Number.isFinite(payload.selectedEnd)
      ? Math.min(segmentLength, Math.max(start + 1, Math.floor(payload.selectedEnd)))
      : (defaultRange?.end ??
        Math.min(
          segmentLength,
          start + Math.max(1, getCharacterLength(payload.selectedWord ?? '')),
        ));
  const word = segment
    ? getSegmentTextRange(segment, start, end)
    : (payload.selectedWord ?? payload.fallbackWord ?? '');

  return {
    segmentId,
    word,
    pinyin: '',
    start,
    end,
    activeIndex,
    segmentLength,
  };
}

function getSelectionForResult(
  payload: DefinitionLookupPayload,
  entry: DefinitionEntry | null,
  segments: Record<number, ReaderDefinitionSegment>,
): DefinitionSelectionState {
  const initial = getInitialSelectionFromPayload(payload, segments);
  const segment = initial.segmentId == null ? null : segments[initial.segmentId];
  const contextCharacters = getSegmentCharacters(segment);
  const entryCharacters = Array.from(entry?.word ?? '');

  if (
    payload.lookupMode !== 'exact' &&
    entryCharacters.length > 0 &&
    contextCharacters.length > 0
  ) {
    for (let start = 0; start <= contextCharacters.length - entryCharacters.length; start += 1) {
      const end = start + entryCharacters.length;
      if (start > initial.activeIndex || initial.activeIndex >= end) {
        continue;
      }
      if (contextCharacters.slice(start, end).join('') === entry?.word) {
        return {
          ...initial,
          word: entry.word,
          pinyin: entry.pinyin,
          start,
          end,
        };
      }
    }
  }

  return {
    ...initial,
    word: payload.lookupMode === 'exact' ? initial.word : (entry?.word ?? initial.word),
    pinyin: entry?.pinyin ?? initial.pinyin,
  };
}

function buildDefinitionSheetState(
  lookupId: string,
  entry: DefinitionEntry | null,
  selection: DefinitionSelectionState,
): DefinitionSheetState {
  const controls = getSelectionControls(selection);
  const meaning = entry?.meaning ?? 'No dictionary entry found.';

  return {
    lookupId,
    word: selection.word,
    pinyin: selection.pinyin,
    hanViet: entry?.hanViet ?? '',
    meaning,
    loading: false,
    segmentId: selection.segmentId,
    start: selection.start,
    end: selection.end,
    activeIndex: selection.activeIndex,
    segmentLength: selection.segmentLength,
    ...controls,
  };
}

function getDefinitionPayloadForAction(
  current: DefinitionSheetState,
  action: 'prev' | 'next' | 'shrink' | 'expand',
): DefinitionLookupPayload | null {
  if (current.segmentId == null) {
    return null;
  }

  let activeIndex = current.activeIndex;
  let start = current.start;
  let end = current.end;

  if (action === 'prev') {
    if (activeIndex <= 0) return null;
    activeIndex -= 1;
    start = activeIndex;
    end = activeIndex + 1;
  } else if (action === 'next') {
    if (activeIndex >= current.segmentLength - 1) return null;
    activeIndex += 1;
    start = activeIndex;
    end = activeIndex + 1;
  } else if (action === 'shrink') {
    if (end - start <= 1) return null;
    if (end - 1 > activeIndex) {
      end -= 1;
    } else {
      start += 1;
    }
  } else if (action === 'expand') {
    if (end < current.segmentLength) {
      end += 1;
    } else if (start > 0) {
      start -= 1;
    } else {
      return null;
    }
  }

  return {
    type: 'definition-press',
    lookupId: current.lookupId,
    lookupMode: 'exact',
    segmentId: current.segmentId,
    characterIndex: activeIndex,
    selectedStart: start,
    selectedEnd: end,
    segmentLength: current.segmentLength,
  };
}

export default function IndexScreen() {
  const webViewRef = useRef<WebView>(null);
  const readerScrollPositionsRef = useRef<Record<string, number>>({});
  const readerDefinitionSegmentsRef = useRef<Record<number, ReaderDefinitionSegment>>({});
  const readerSearchWebMatchesRef = useRef<ReaderSearchWebMatch[]>([]);
  const readerSearchIndexCacheRef = useRef<{
    segments: Record<number, ReaderDefinitionSegment>;
    dictionary: Record<string, string>;
    indexes: ReaderSearchPreparedIndexes;
  } | null>(null);
  const readerHtmlSourceCacheRef = useRef<
    Record<string, { html: string; definitionSegments: Record<number, ReaderDefinitionSegment> }>
  >({});
  const readerHtmlPrewarmCacheRef = useRef<
    Record<string, { html: string; definitionSegments: Record<number, ReaderDefinitionSegment> }>
  >({});
  const readerHtmlSourceCacheScopeRef = useRef<{
    currentUrl: string;
    htmlOrig: string;
    htmlHV: string;
  } | null>(null);
  const pendingReaderRestoreUrlRef = useRef<string | null>(null);
  const currentOfflineChapterScrollRatioRef = useRef<number | null>(null);
  const readerScrollSaveChainsRef = useRef<Record<number, Promise<void>>>({});
  const activeOfflineReaderRef = useRef<{
    chapterId: number;
    storyId: number;
    url: string;
  } | null>(null);
  const savedReaderPreferencesRef = useRef<
    Record<number, { fontSize: number; isHV: boolean; savedAt: number }>
  >({});
  const { loadPage, loadOfflineChapter } = usePageLoader();
  const theme = useTheme();
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [definitionSheet, setDefinitionSheet] = useState<DefinitionSheetState | null>(null);
  const [htmlSourceResult, setHtmlSourceResult] =
    useState<ReaderHtmlWithDefinitionSegments>(EMPTY_READER_HTML_SOURCE);
  const [readerHtmlPreparing, setReaderHtmlPreparing] = useState(false);

  const loading = useAppStore((s) => s.loading);
  const loadingStage = useAppStore((s) => s.loadingStage);
  const htmlOrig = useAppStore((s) => s.htmlOrig);
  const htmlHV = useAppStore((s) => s.htmlHV);
  const currentUrl = useAppStore((s) => s.currentUrl);
  const currentContentSource = useAppStore((s) => s.currentContentSource);
  const currentOfflineChapterId = useAppStore((s) => s.currentOfflineChapterId);
  const pendingContentAnchor = useAppStore((s) => s.pendingContentAnchor);
  const getOfflineChapterByUrlFromState = useAppStore((s) => s.getOfflineChapterByUrlFromState);
  const currentOfflineChapter = useAppStore((s) =>
    s.currentOfflineChapterId ? s.getOfflineChapterByIdFromState(s.currentOfflineChapterId) : null,
  );
  const currentOfflineStory = useAppStore((s) => s.getCurrentOfflineStoryFromState());
  const currentOfflineStoryChapters = useAppStore((s) => {
    const story = s.getCurrentOfflineStoryFromState();
    return story ? s.getOfflineChaptersForStoryFromState(story.id) : EMPTY_OFFLINE_CHAPTERS;
  });
  const dictionary = useAppStore((s) => s.dictionary);
  const setLoading = useAppStore((s) => s.setLoading);
  const setLoadingStage = useAppStore((s) => s.setLoadingStage);
  const setPendingContentAnchor = useAppStore((s) => s.setPendingContentAnchor);
  const updateOfflineChapterReaderScrollRatio = useAppStore(
    (s) => s.updateOfflineChapterReaderScrollRatio,
  );
  const updateOfflineChapterReaderPreferences = useAppStore(
    (s) => s.updateOfflineChapterReaderPreferences,
  );

  const isHV = useWebPageStore((s) => s.isHV);
  const fullSite = useWebPageStore((s) => s.fullSite);
  const fontSize = useWebPageStore((s) => s.fontSize);
  const setMoreMenu = useWebPageStore((s) => s.setMoreMenu);
  const readerSearchRequest = useWebPageStore((s) => s.readerSearchRequest);
  const readerSearchJumpRequest = useWebPageStore((s) => s.readerSearchJumpRequest);
  const readerSearchAutoJumpRequest = useWebPageStore((s) => s.readerSearchAutoJumpRequest);
  const setReaderSearchResults = useWebPageStore((s) => s.setReaderSearchResults);
  const setReaderSearchAutoResults = useWebPageStore((s) => s.setReaderSearchAutoResults);
  const clearReaderSearchAutoJump = useWebPageStore((s) => s.clearReaderSearchAutoJump);
  const hasReaderHtml = !!(isHV ? htmlHV : htmlOrig);

  useEffect(() => {
    InteractionManager.runAfterInteractions(() => {
      warmReaderWorkletRuntime();
    });
  }, []);

  const getActiveWebView = useCallback(() => {
    return webViewRef.current;
  }, []);

  const registerReaderSearchMatchesInWebView = useCallback(
    (matches: ReaderSearchWebMatch[]) => {
      readerSearchWebMatchesRef.current = matches;
      getActiveWebView()?.injectJavaScript(`
        (function() {
          if (window.__HVBROWSER_READER_SEARCH__REGISTER__) {
            window.__HVBROWSER_READER_SEARCH__REGISTER__(${JSON.stringify(matches)});
          }
          return true;
        })();
      `);
    },
    [getActiveWebView],
  );

  const getReaderSearchIndexes = useCallback(
    (segments: Record<number, ReaderDefinitionSegment>) => {
      const cached = readerSearchIndexCacheRef.current;
      if (cached && cached.segments === segments && cached.dictionary === dictionary) {
        return cached.indexes;
      }

      const indexes = buildReaderSearchIndexes(segments, dictionary);
      readerSearchIndexCacheRef.current = {
        segments,
        dictionary,
        indexes,
      };
      return indexes;
    },
    [dictionary],
  );

  const runCurrentReaderSearch = useCallback(
    (requestId: number, query: string, maxResults?: number) => {
      const startedAt = Date.now();
      const segments = readerDefinitionSegmentsRef.current;
      logReaderDebug('reader.search.direct.start', {
        requestId,
        query,
        maxResults: maxResults ?? null,
        segmentCount: getDebugCount(segments),
      });
      const matches = findReaderSegmentSearchMatches({
        segments,
        indexes: getReaderSearchIndexes(segments),
        rawQuery: query,
        requestId,
        maxResults,
      });
      registerReaderSearchMatchesInWebView(matches.webMatches);
      logReaderDebug('reader.search.direct.done', {
        requestId,
        resultCount: matches.results.length,
        webMatchCount: matches.webMatches.length,
        durationMs: getDebugDuration(startedAt),
      });
      return matches.results;
    },
    [getReaderSearchIndexes, registerReaderSearchMatchesInWebView],
  );

  useEffect(() => {
    currentOfflineChapterScrollRatioRef.current = currentOfflineChapter?.readerScrollRatio ?? null;
  }, [currentOfflineChapter?.readerScrollRatio]);

  useEffect(() => {
    if (fullSite || !currentUrl) {
      pendingReaderRestoreUrlRef.current = null;
      return;
    }

    if (pendingContentAnchor) {
      pendingReaderRestoreUrlRef.current = null;
      return;
    }

    const scrollRatio =
      readerScrollPositionsRef.current[currentUrl] ??
      currentOfflineChapterScrollRatioRef.current ??
      null;
    if (scrollRatio != null && Number.isFinite(scrollRatio)) {
      readerScrollPositionsRef.current[currentUrl] = scrollRatio;
      pruneStringKeyedRecord(readerScrollPositionsRef.current, MAX_READER_SCROLL_CACHE_ENTRIES);
    }
    pendingReaderRestoreUrlRef.current =
      scrollRatio != null && Number.isFinite(scrollRatio) ? currentUrl : null;
  }, [
    currentUrl,
    currentContentSource,
    fontSize,
    fullSite,
    isHV,
    pendingContentAnchor,
    theme.mode,
  ]);

  const saveOfflineReaderScrollRatio = useCallback(
    (chapterId: number, ratio: number | null | undefined) => {
      if (ratio == null || !Number.isFinite(ratio)) {
        return readerScrollSaveChainsRef.current[chapterId] ?? Promise.resolve();
      }

      const safeRatio = Math.max(0, Math.min(1, ratio));
      const previousSave = readerScrollSaveChainsRef.current[chapterId] ?? Promise.resolve();
      const nextSave = previousSave
        .catch(() => undefined)
        .then(() => updateOfflineChapterReaderScrollRatio(chapterId, safeRatio))
        .catch((error) => {
          console.error('Offline reader scroll save error:', error);
        })
        .finally(() => {
          if (readerScrollSaveChainsRef.current[chapterId] === nextSave) {
            delete readerScrollSaveChainsRef.current[chapterId];
          }
        });

      readerScrollSaveChainsRef.current[chapterId] = nextSave;
      return nextSave;
    },
    [updateOfflineChapterReaderScrollRatio],
  );

  useEffect(() => {
    const previousReader = activeOfflineReaderRef.current;
    const nextStoryId = currentOfflineChapter?.storyId;
    const nextChapterUrl = currentOfflineChapter?.chapterUrl;

    if (
      previousReader &&
      currentOfflineChapterId &&
      nextStoryId &&
      previousReader.chapterId !== currentOfflineChapterId &&
      previousReader.storyId !== nextStoryId
    ) {
      void saveOfflineReaderScrollRatio(
        previousReader.chapterId,
        readerScrollPositionsRef.current[previousReader.url],
      );
    }

    if (currentOfflineChapterId && nextStoryId && nextChapterUrl && currentUrl === nextChapterUrl) {
      activeOfflineReaderRef.current = {
        chapterId: currentOfflineChapterId,
        storyId: nextStoryId,
        url: nextChapterUrl,
      };
    }
  }, [
    currentOfflineChapter?.chapterUrl,
    currentOfflineChapter?.storyId,
    currentOfflineChapterId,
    currentUrl,
    saveOfflineReaderScrollRatio,
  ]);

  const persistOfflineReaderPreferences = useCallback(
    (chapterId: number, nextFontSize: number, nextIsHV: boolean) => {
      const safeFontSize = Math.max(1, Math.min(4, Number(nextFontSize.toFixed(2))));
      const previous = savedReaderPreferencesRef.current[chapterId];
      const now = Date.now();

      if (
        previous &&
        now - previous.savedAt < 1000 &&
        previous.fontSize === safeFontSize &&
        previous.isHV === nextIsHV
      ) {
        return;
      }

      savedReaderPreferencesRef.current[chapterId] = {
        fontSize: safeFontSize,
        isHV: nextIsHV,
        savedAt: now,
      };
      pruneSavedChapterRecord(savedReaderPreferencesRef.current, MAX_SAVED_CHAPTER_CACHE_ENTRIES);

      updateOfflineChapterReaderPreferences(chapterId, {
        readerFontSize: safeFontSize,
        readerIsHv: nextIsHV,
      }).catch((error) => {
        console.error('Offline reader preference save error:', error);
      });
    },
    [updateOfflineChapterReaderPreferences],
  );

  useEffect(() => {
    if (
      currentContentSource !== 'offline' ||
      !currentOfflineChapterId ||
      (currentOfflineStory?.sourceType !== 'epub' && currentOfflineStory?.sourceType !== 'txt')
    ) {
      return;
    }

    persistOfflineReaderPreferences(currentOfflineChapterId, fontSize, isHV);
  }, [
    currentContentSource,
    currentOfflineChapterId,
    currentOfflineStory?.sourceType,
    fontSize,
    isHV,
    persistOfflineReaderPreferences,
  ]);

  useEffect(() => {
    if (webViewRef.current && fullSite) {
      const script = buildFullSiteFontScript(fontSize);
      webViewRef.current.injectJavaScript(script);
    }
  }, [fontSize, fullSite]);

  useEffect(() => {
    if (!readerSearchRequest) {
      return;
    }

    if (!readerSearchRequest.query.trim()) {
      registerReaderSearchMatchesInWebView([]);
      setReaderSearchResults(readerSearchRequest.id, readerSearchRequest.query, []);
      return;
    }

    if (fullSite || !hasReaderHtml) {
      registerReaderSearchMatchesInWebView([]);
      setReaderSearchResults(readerSearchRequest.id, readerSearchRequest.query, []);
      return;
    }

    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) {
        return;
      }
      const results = runCurrentReaderSearch(readerSearchRequest.id, readerSearchRequest.query);
      if (!cancelled) {
        setReaderSearchResults(readerSearchRequest.id, readerSearchRequest.query, results);
      }
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [
    fullSite,
    hasReaderHtml,
    readerSearchRequest,
    registerReaderSearchMatchesInWebView,
    runCurrentReaderSearch,
    setReaderSearchResults,
  ]);

  useEffect(() => {
    const activeWebView = getActiveWebView();
    if (!readerSearchJumpRequest || !activeWebView) {
      return;
    }

    activeWebView.injectJavaScript(`
      (function() {
        if (window.__HVBROWSER_READER_SEARCH__JUMP__) {
          window.__HVBROWSER_READER_SEARCH__JUMP__(
            ${JSON.stringify(readerSearchJumpRequest.resultId)}
          );
        }
        return true;
      })();
    `);
  }, [getActiveWebView, readerSearchJumpRequest]);

  const initialScript = `
    (function() {
      ${buildFullSiteFontScript(fontSize)}
      if (window.__HVBROWSER_LINK_BRIDGE__) { return true; }
      window.__HVBROWSER_LINK_BRIDGE__ = true;
      var lastPostedScrollRatio = null;
      var postScrollPosition = function(force) {
        if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) {
          return;
        }
        var doc = document.documentElement;
        var body = document.body;
        var scrollTop = window.scrollY || (doc && doc.scrollTop) || (body && body.scrollTop) || 0;
        var scrollHeight = Math.max(
          doc ? doc.scrollHeight : 0,
          body ? body.scrollHeight : 0,
          doc ? doc.offsetHeight : 0,
          body ? body.offsetHeight : 0
        );
        var maxScroll = Math.max(0, scrollHeight - window.innerHeight);
        var ratio = maxScroll > 0 ? scrollTop / maxScroll : 0;
        if (
          !force &&
          lastPostedScrollRatio !== null &&
          Math.abs(lastPostedScrollRatio - ratio) < 0.003
        ) {
          return;
        }
        lastPostedScrollRatio = ratio;
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'scroll-position', ratio: ratio }));
      };
      var scheduledScrollPost = null;
      var scheduleScrollPositionPost = function(force) {
        if (scheduledScrollPost !== null) {
          window.clearTimeout(scheduledScrollPost);
        }
        scheduledScrollPost = window.setTimeout(function() {
          scheduledScrollPost = null;
          postScrollPosition(!!force);
        }, force ? 40 : 240);
      };
      window.addEventListener('scroll', function() { scheduleScrollPositionPost(false); }, { passive: true });
      window.addEventListener('touchend', function() { scheduleScrollPositionPost(true); }, { passive: true });
      window.addEventListener('pagehide', function() { postScrollPosition(true); });
      window.addEventListener('load', function() { postScrollPosition(true); });
      document.addEventListener('click', function() {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'page-press' }));
        }
      }, true);
      document.addEventListener('click', function(event) {
        var target = event.target;
        var link = target && target.closest ? target.closest('a[href]') : null;
        if (!link) { return; }
        var rawHref = link.getAttribute('href') || '';
        if (rawHref.charAt(0) === '#') { return; }
        var href = link.href || rawHref;
        if (!href || href.indexOf('javascript:') === 0) { return; }
        try {
          var nextUrl = new URL(href, window.location.href);
          var currentUrl = new URL(window.location.href);
          if (
            nextUrl.origin === currentUrl.origin &&
            nextUrl.pathname === currentUrl.pathname &&
            nextUrl.search === currentUrl.search &&
            nextUrl.hash &&
            nextUrl.hash !== currentUrl.hash
          ) {
            return;
          }
        } catch (error) {}
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'link-press', url: href }));
          event.preventDefault();
        }
      }, true);
      if (!window.__HVBROWSER_READER_SEARCH__) {
        window.__HVBROWSER_READER_SEARCH__ = true;
        window.__HVBROWSER_READER_SEARCH_MATCHES__ = {};
        var searchStyle = document.createElement('style');
        searchStyle.textContent = '.hv-reader-search-hit { background: rgba(255, 214, 102, 0.55) !important; outline: 2px solid rgba(224, 159, 0, 0.9) !important; border-radius: 3px !important; }';
        document.head.appendChild(searchStyle);
        var clearReaderSearchHighlights = function() {
          var existing = document.querySelectorAll('.hv-reader-search-hit');
          for (var index = 0; index < existing.length; index += 1) {
            existing[index].classList.remove('hv-reader-search-hit');
          }
        };
        var collectRangeTargets = function(range) {
          var targets = [];
          if (!range || typeof range.segmentId !== 'number') {
            return targets;
          }
          var candidates = document.querySelectorAll(
            '.hv-word[data-hv-segment-id="' + String(range.segmentId) + '"]'
          );
          var start = typeof range.start === 'number' ? range.start : 0;
          var end = typeof range.end === 'number' ? range.end : start + 1;
          for (var index = 0; index < candidates.length; index += 1) {
            var candidate = candidates[index];
            var segmentIndex = parseInt(candidate.getAttribute('data-hv-segment-index') || '-1', 10);
            if (!Number.isFinite(segmentIndex)) {
              continue;
            }
            if (start <= segmentIndex && segmentIndex < end) {
              targets.push(candidate);
            }
          }
          return targets;
        };
        window.__HVBROWSER_READER_SEARCH__REGISTER__ = function(matches) {
          window.__HVBROWSER_READER_SEARCH_MATCHES__ = {};
          clearReaderSearchHighlights();
          var nextMatches = Array.isArray(matches) ? matches : [];
          for (var index = 0; index < nextMatches.length; index += 1) {
            var match = nextMatches[index];
            if (match && match.id) {
              window.__HVBROWSER_READER_SEARCH_MATCHES__[match.id] = match;
            }
          }
        };
        window.__HVBROWSER_READER_SEARCH__JUMP__ = function(resultId) {
          clearReaderSearchHighlights();
          var match = window.__HVBROWSER_READER_SEARCH_MATCHES__[resultId];
          if (!match) return false;
          var targets = [];
          var ranges = Array.isArray(match.ranges) ? match.ranges : [];
          for (var rangeIndex = 0; rangeIndex < ranges.length; rangeIndex += 1) {
            targets = targets.concat(collectRangeTargets(ranges[rangeIndex]));
          }
          if (targets.length === 0) return false;
          for (var targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
            if (targets[targetIndex] && targets[targetIndex].classList) {
              targets[targetIndex].classList.add('hv-reader-search-hit');
            }
          }
          var scrollTarget = targets[0];
          if (scrollTarget && scrollTarget.scrollIntoView) {
            scrollTarget.scrollIntoView({ block: 'center', inline: 'nearest' });
          }
          return true;
        };
      }
      return true;
    })();
  `;

  const runDefinitionLookup = useCallback(
    (lookupPayload: DefinitionLookupPayload) => {
      const lookupId = lookupPayload.lookupId;
      if (!lookupId) {
        return;
      }

      const segments = readerDefinitionSegmentsRef.current;
      const initialSelection = getInitialSelectionFromPayload(lookupPayload, segments);
      const context =
        initialSelection.segmentId == null
          ? (lookupPayload.chineseContext ?? '')
          : (segments[initialSelection.segmentId]?.text ?? '');
      setDefinitionSheet({
        lookupId,
        word: initialSelection.word,
        pinyin: initialSelection.pinyin,
        hanViet: '',
        meaning: 'Looking up...',
        loading: true,
        segmentId: initialSelection.segmentId,
        start: initialSelection.start,
        end: initialSelection.end,
        activeIndex: initialSelection.activeIndex,
        segmentLength: initialSelection.segmentLength,
        ...getSelectionControls(initialSelection),
      });

      void (async () => {
        const entry =
          lookupPayload.lookupMode === 'exact' && initialSelection.word
            ? await findDefinitionByWord(initialSelection.word, {
                chineseContext: context,
              })
            : context
              ? await findBestDefinitionMatch(context, initialSelection.activeIndex)
              : null;
        const selection = getSelectionForResult(lookupPayload, entry, segments);
        setDefinitionSheet(buildDefinitionSheetState(lookupId, entry, selection));
        const result = {
          lookupId,
          segmentId: selection.segmentId,
          activeIndex: selection.activeIndex,
          selectedStart: selection.start,
          selectedEnd: selection.end,
          segmentLength: selection.segmentLength,
        };

        getActiveWebView()?.injectJavaScript(`
          (function() {
            if (window.__HVBROWSER_DEFINITION_LOOKUP__SHOW__) {
              window.__HVBROWSER_DEFINITION_LOOKUP__SHOW__(${JSON.stringify(result)});
            }
            return true;
          })();
        `);
      })().catch((error) => {
        console.error('Definition lookup error:', error);
      });
    },
    [getActiveWebView],
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const payload = JSON.parse(event.nativeEvent.data) as DefinitionLookupPayload;
        if (
          payload.type &&
          payload.type !== 'scroll-position' &&
          payload.type !== 'restore-complete'
        ) {
          logReaderDebug('webview.message', {
            type: payload.type,
            url: payload.url,
            requestId: payload.requestId,
            lookupId: payload.lookupId,
            segmentId: payload.segmentId,
          });
        }
        if (payload.type === 'page-press') {
          setMoreMenu(false);
          return;
        }

        if (payload.type === 'scroll-position') {
          if (
            !fullSite &&
            currentUrl &&
            typeof payload.ratio === 'number' &&
            Number.isFinite(payload.ratio)
          ) {
            if (pendingReaderRestoreUrlRef.current === currentUrl) {
              return;
            }
            const scrollRatio = Math.max(0, Math.min(1, payload.ratio));
            readerScrollPositionsRef.current[currentUrl] = scrollRatio;
            pruneStringKeyedRecord(
              readerScrollPositionsRef.current,
              MAX_READER_SCROLL_CACHE_ENTRIES,
            );
          }
          return;
        }

        if (payload.type === 'restore-complete') {
          if (currentUrl && pendingReaderRestoreUrlRef.current === currentUrl) {
            pendingReaderRestoreUrlRef.current = null;
          }
          return;
        }

        if (payload.type === 'reader-search-results') {
          if (typeof payload.requestId === 'number') {
            setReaderSearchResults(payload.requestId, payload.query ?? '', payload.results ?? []);
          }
          return;
        }

        if (payload.type === 'reader-search-auto-results') {
          setReaderSearchAutoResults(
            payload.query ?? '',
            payload.results ?? [],
            typeof payload.activeIndex === 'number' ? payload.activeIndex : null,
          );
          return;
        }

        if (payload.type === 'definition-press' && payload.lookupId) {
          runDefinitionLookup(payload);
          return;
        }

        if (payload.type !== 'link-press' || !payload.url || payload.url === currentUrl) {
          return;
        }

        const offlineChapter = getOfflineChapterByUrlFromState(payload.url);

        if (offlineChapter) {
          loadOfflineChapter(offlineChapter.id, {
            anchor: payload.url.includes('#') ? payload.url.slice(payload.url.indexOf('#')) : null,
          });
        } else {
          loadPage(payload.url);
        }
      } catch {
        // Ignore non-JSON messages from the page.
      }
    },
    [
      currentUrl,
      fullSite,
      getOfflineChapterByUrlFromState,
      loadOfflineChapter,
      loadPage,
      runDefinitionLookup,
      setReaderSearchAutoResults,
      setReaderSearchResults,
      setMoreMenu,
    ],
  );

  const handleNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      const { url, title, navigationType } = navState;

      if (!url || url === currentUrl || !title) return;
      if (currentContentSource === 'offline') return;
      if (
        currentUrl &&
        url.replace(/#.*$/, '') === currentUrl.replace(/#.*$/, '') &&
        /#/.test(url)
      ) {
        return;
      }
      if (url.indexOf('about') !== -1 || url.match(/data:/) || url.indexOf('postMessage') !== -1) {
        return;
      }

      try {
        const base = extractBaseUrl(url);
        if (url === base + '/' && navigationType !== 'click') return;
      } catch {
        // Ignore URL parse errors and let the loader handle them.
      }

      useAppStore.getState().setHtmlContent('', '');
      loadPage(url);
    },
    [currentContentSource, currentUrl, loadPage],
  );

  const activeHtml = isHV ? htmlHV : htmlOrig;
  const isCurrentEpub = currentOfflineStory?.sourceType === 'epub';
  const readerBottomInset = getBottomInsetWithSystemBarPadding(insets.bottom);
  useEffect(() => {
    const prepareStartedAt = Date.now();
    let cancelled = false;
    const cacheScope = readerHtmlSourceCacheScopeRef.current;
    if (
      !cacheScope ||
      cacheScope.currentUrl !== currentUrl ||
      cacheScope.htmlOrig !== htmlOrig ||
      cacheScope.htmlHV !== htmlHV
    ) {
      readerHtmlSourceCacheRef.current = {};
      readerSearchIndexCacheRef.current = null;
      readerSearchWebMatchesRef.current = [];
      readerDefinitionSegmentsRef.current = {};
      readerHtmlSourceCacheScopeRef.current = {
        currentUrl,
        htmlOrig,
        htmlHV,
      };
      setHtmlSourceResult(EMPTY_READER_HTML_SOURCE);
      logReaderDebug('reader.prepare.scope-reset', {
        currentUrl,
        htmlOrigLength: getDebugLength(htmlOrig),
        htmlHvLength: getDebugLength(htmlHV),
      });
    }

    if (!activeHtml) {
      logReaderDebug('reader.prepare.no-active-html', {
        currentUrl,
        fullSite,
        isHV,
        htmlOrigLength: getDebugLength(htmlOrig),
        htmlHvLength: getDebugLength(htmlHV),
      });
      setReaderHtmlPreparing(false);
      setHtmlSourceResult(EMPTY_READER_HTML_SOURCE);
      readerDefinitionSegmentsRef.current = {};
      readerSearchIndexCacheRef.current = null;
      return;
    }

    const cacheKey = getReaderHtmlSourceCacheKey({
      currentUrl,
      htmlOrig,
      htmlHV,
      fullSite,
      isCurrentEpub,
      isHV,
      fontSize,
      readerBottomInset,
      themeMode: theme.mode,
    });
    const cachedHtmlSource = readerHtmlSourceCacheRef.current[cacheKey];
    if (cachedHtmlSource != null) {
      logReaderDebug('reader.prepare.cache-hit', {
        currentUrl,
        cacheKey,
        htmlLength: getDebugLength(cachedHtmlSource.html),
        segmentCount: getDebugCount(cachedHtmlSource.definitionSegments),
      });
      setReaderHtmlPreparing(false);
      setHtmlSourceResult(cachedHtmlSource);
      readerDefinitionSegmentsRef.current = cachedHtmlSource.definitionSegments;
      readerSearchIndexCacheRef.current = null;
      return;
    }

    const prewarmedHtmlSource = readerHtmlPrewarmCacheRef.current[cacheKey];
    if (prewarmedHtmlSource != null) {
      delete readerHtmlPrewarmCacheRef.current[cacheKey];
      readerHtmlSourceCacheRef.current[cacheKey] = prewarmedHtmlSource;
      pruneStringKeyedRecord(readerHtmlSourceCacheRef.current, MAX_READER_HTML_CACHE_ENTRIES);
      logReaderDebug('reader.prepare.prewarm-hit', {
        currentUrl,
        cacheKey,
        htmlLength: getDebugLength(prewarmedHtmlSource.html),
        segmentCount: getDebugCount(prewarmedHtmlSource.definitionSegments),
      });
      setReaderHtmlPreparing(false);
      setHtmlSourceResult(prewarmedHtmlSource);
      readerDefinitionSegmentsRef.current = prewarmedHtmlSource.definitionSegments;
      readerSearchIndexCacheRef.current = null;
      return;
    }

    let settled = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    const applyHtmlSourceResult = (nextResult: ReaderHtmlWithDefinitionSegments) => {
      if (cancelled || settled) {
        return;
      }

      settled = true;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }

      readerHtmlSourceCacheRef.current[cacheKey] = nextResult;
      pruneStringKeyedRecord(readerHtmlSourceCacheRef.current, MAX_READER_HTML_CACHE_ENTRIES);
      readerDefinitionSegmentsRef.current = nextResult.definitionSegments;
      readerSearchIndexCacheRef.current = null;
      setHtmlSourceResult(nextResult);
      setReaderHtmlPreparing(false);
      logReaderDebug('reader.prepare.apply', {
        currentUrl,
        cacheKey,
        htmlLength: getDebugLength(nextResult.html),
        segmentCount: getDebugCount(nextResult.definitionSegments),
        durationMs: getDebugDuration(prepareStartedAt),
      });
    };

    const prepareHtmlSourceOnRn = () => {
      logReaderDebug('reader.prepare.rn.start', {
        currentUrl,
        fullSite,
        isHV,
        fontSize,
        activeHtmlLength: getDebugLength(activeHtml),
        htmlOrigLength: getDebugLength(htmlOrig),
        dictionarySize: getDebugCount(dictionary),
      });
      return fullSite
        ? {
            html: isCurrentEpub
              ? normalizeEpubFullSiteHtml(activeHtml, theme.reader, 14, readerBottomInset)
              : activeHtml,
            definitionSegments: {},
          }
        : isHV
          ? buildPresentationHtmlWithHvDefinitions(
              htmlOrig,
              fontSize,
              dictionary,
              theme.reader,
              readerBottomInset,
            )
          : buildPresentationHtmlWithChineseDefinitions(
              htmlOrig,
              fontSize,
              dictionary,
              theme.reader,
              readerBottomInset,
            );
    };

    const fallbackToRnPrepare = (message?: string) => {
      if (cancelled || settled) {
        return;
      }
      if (__DEV__ && message) {
        console.warn('Reader HTML Worklet fallback:', message);
      }
      logReaderDebug('reader.prepare.worklet.fallback', {
        currentUrl,
        cacheKey,
        message: message ?? 'schedule returned false',
        durationMs: getDebugDuration(prepareStartedAt),
      });
      applyHtmlSourceResult(prepareHtmlSourceOnRn());
    };

    if (fullSite) {
      logReaderDebug('reader.prepare.fullSite', {
        currentUrl,
        activeHtmlLength: getDebugLength(activeHtml),
        isCurrentEpub,
      });
      applyHtmlSourceResult(prepareHtmlSourceOnRn());
      return;
    }

    setReaderHtmlPreparing(true);
    setHtmlSourceResult(EMPTY_READER_HTML_SOURCE);
    readerDefinitionSegmentsRef.current = {};
    readerSearchIndexCacheRef.current = null;
    logReaderDebug('reader.prepare.clear-stale', {
      currentUrl,
      cacheKey,
    });
    logReaderDebug('reader.prepare.worklet.wait-interactions', {
      currentUrl,
      cacheKey,
      isHV,
      htmlOrigLength: getDebugLength(htmlOrig),
      activeHtmlLength: getDebugLength(activeHtml),
      dictionarySize: getDebugCount(dictionary),
    });
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) {
        return;
      }

      logReaderDebug('reader.prepare.worklet.schedule', {
        currentUrl,
        cacheKey,
        mode: isHV ? 'han-viet' : 'chinese',
        htmlOrigLength: getDebugLength(htmlOrig),
        dictionarySize: getDebugCount(dictionary),
      });
      const scheduled = scheduleReaderWorkletTask(
        buildReaderHtmlSourceWorklet,
        {
          mode: isHV ? 'han-viet' : 'chinese',
          htmlOrig,
          fontSize,
          dictionary,
          readerTheme: theme.reader,
          safeAreaBottom: readerBottomInset,
        },
        (nextResult) => {
          logReaderDebug('reader.prepare.worklet.success', {
            currentUrl,
            cacheKey,
            htmlLength: getDebugLength(nextResult.html),
            segmentCount: getDebugCount(nextResult.definitionSegments),
            durationMs: getDebugDuration(prepareStartedAt),
          });
          applyHtmlSourceResult(nextResult);
        },
        fallbackToRnPrepare,
        'reader-html-source',
      );

      if (!scheduled) {
        fallbackToRnPrepare();
        return;
      }

      fallbackTimer = setTimeout(
        () => fallbackToRnPrepare(`timed out after ${READER_HTML_WORKLET_TIMEOUT_MS}ms`),
        READER_HTML_WORKLET_TIMEOUT_MS,
      );
      logReaderDebug('reader.prepare.worklet.scheduled', {
        currentUrl,
        cacheKey,
        timeoutMs: READER_HTML_WORKLET_TIMEOUT_MS,
      });
    });

    return () => {
      cancelled = true;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }
      task.cancel();
    };
  }, [
    activeHtml,
    currentUrl,
    dictionary,
    fontSize,
    fullSite,
    htmlHV,
    htmlOrig,
    isCurrentEpub,
    isHV,
    readerBottomInset,
    theme.mode,
    theme.reader,
  ]);

  useEffect(() => {
    if (
      currentContentSource !== 'offline' ||
      fullSite ||
      !currentOfflineChapterId ||
      !currentOfflineStory ||
      !htmlOrig ||
      !htmlHV ||
      !htmlSourceResult.html
    ) {
      return;
    }

    const activeIndex = currentOfflineStoryChapters.findIndex(
      (chapter) => chapter.id === currentOfflineChapterId,
    );
    const nextChapter =
      activeIndex >= 0 && activeIndex < currentOfflineStoryChapters.length - 1
        ? currentOfflineStoryChapters[activeIndex + 1]
        : null;

    if (!nextChapter || nextChapter.downloadStatus !== 'downloaded') {
      return;
    }

    const prewarmStartedAt = Date.now();
    let cancelled = false;
    let settled = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    const mode = isHV ? 'han-viet' : 'chinese';

    const interactionTask = InteractionManager.runAfterInteractions(async () => {
      const preload =
        getOfflineChapterPreload(nextChapter.id, nextChapter.chapterUrl) ??
        (await preloadOfflineChapterConversion(nextChapter.id, dictionary, 'shape-next'));

      if (cancelled || !preload) {
        return;
      }

      const nextHtmlOrig = '\ufeff' + preload.htmlOrig;
      const nextHtmlHv = '\ufeff' + preload.htmlHv;
      if (nextHtmlOrig.length * 2 > MAX_READER_HTML_PREWARM_BYTES) {
        logReaderDebug('reader.prewarm.shape.skip-source-too-large', {
          currentUrl,
          nextChapterId: nextChapter.id,
          htmlOrigLength: getDebugLength(nextHtmlOrig),
          maxBytes: MAX_READER_HTML_PREWARM_BYTES,
        });
        return;
      }
      const cacheKey = getReaderHtmlSourceCacheKey({
        currentUrl: preload.chapterUrl,
        htmlOrig: nextHtmlOrig,
        htmlHV: nextHtmlHv,
        fullSite: false,
        isCurrentEpub: currentOfflineStory.sourceType === 'epub',
        isHV,
        fontSize,
        readerBottomInset,
        themeMode: theme.mode,
      });

      if (
        readerHtmlPrewarmCacheRef.current[cacheKey] ||
        readerHtmlSourceCacheRef.current[cacheKey]
      ) {
        logReaderDebug('reader.prewarm.shape.cache-hit', {
          currentUrl,
          nextChapterId: nextChapter.id,
          cacheKey,
        });
        return;
      }

      const applyPrewarmResult = (nextResult: ReaderHtmlWithDefinitionSegments) => {
        if (cancelled || settled) {
          return;
        }
        settled = true;
        if (fallbackTimer) {
          clearTimeout(fallbackTimer);
          fallbackTimer = null;
        }
        if (!canCacheReaderHtmlPrewarm(nextResult)) {
          logReaderDebug('reader.prewarm.shape.skip-too-large', {
            currentUrl,
            nextChapterId: nextChapter.id,
            cacheKey,
            htmlLength: getDebugLength(nextResult.html),
            estimatedBytes: getReaderHtmlPrewarmSizeBytes(nextResult),
            maxBytes: MAX_READER_HTML_PREWARM_BYTES,
            durationMs: getDebugDuration(prewarmStartedAt),
          });
          return;
        }
        readerHtmlPrewarmCacheRef.current[cacheKey] = nextResult;
        pruneStringKeyedRecord(readerHtmlPrewarmCacheRef.current, MAX_READER_HTML_PREWARM_ENTRIES);
        logReaderDebug('reader.prewarm.shape.ready', {
          currentUrl,
          nextChapterId: nextChapter.id,
          cacheKey,
          htmlLength: getDebugLength(nextResult.html),
          segmentCount: getDebugCount(nextResult.definitionSegments),
          durationMs: getDebugDuration(prewarmStartedAt),
        });
      };

      const prepareOnRn = () =>
        isHV
          ? buildPresentationHtmlWithHvDefinitions(
              nextHtmlOrig,
              fontSize,
              dictionary,
              theme.reader,
              readerBottomInset,
            )
          : buildPresentationHtmlWithChineseDefinitions(
              nextHtmlOrig,
              fontSize,
              dictionary,
              theme.reader,
              readerBottomInset,
            );

      const fallbackToRnPrepare = (message?: string) => {
        if (cancelled) {
          return;
        }
        logReaderDebug('reader.prewarm.shape.fallback', {
          currentUrl,
          nextChapterId: nextChapter.id,
          cacheKey,
          message: message ?? 'schedule returned false',
          durationMs: getDebugDuration(prewarmStartedAt),
        });
        applyPrewarmResult(prepareOnRn());
      };

      logReaderDebug('reader.prewarm.shape.schedule', {
        currentUrl,
        nextChapterId: nextChapter.id,
        nextChapterUrl: preload.chapterUrl,
        cacheKey,
        mode,
        htmlOrigLength: getDebugLength(nextHtmlOrig),
        dictionarySize: getDebugCount(dictionary),
      });
      const scheduled = scheduleReaderWorkletTask(
        buildReaderHtmlSourceWorklet,
        {
          mode,
          htmlOrig: nextHtmlOrig,
          fontSize,
          dictionary,
          readerTheme: theme.reader,
          safeAreaBottom: readerBottomInset,
        },
        applyPrewarmResult,
        fallbackToRnPrepare,
        'reader-html-source-prewarm',
      );

      if (!scheduled) {
        fallbackToRnPrepare();
        return;
      }

      fallbackTimer = setTimeout(
        () => fallbackToRnPrepare(`timed out after ${READER_HTML_WORKLET_TIMEOUT_MS}ms`),
        READER_HTML_WORKLET_TIMEOUT_MS,
      );
    });

    return () => {
      cancelled = true;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }
      interactionTask.cancel();
    };
  }, [
    currentContentSource,
    currentOfflineChapterId,
    currentOfflineStory,
    currentOfflineStoryChapters,
    currentUrl,
    dictionary,
    fontSize,
    fullSite,
    htmlHV,
    htmlOrig,
    htmlSourceResult.html,
    isHV,
    readerBottomInset,
    theme.mode,
    theme.reader,
  ]);

  const htmlSource = htmlSourceResult.html;
  const hasPreparedHtml = !!htmlSource;

  const baseUrl =
    currentUrl && /^(https?:|file:)/i.test(currentUrl) ? extractBaseUrl(currentUrl) : undefined;
  const restoreReaderScrollPosition = useCallback(() => {
    const activeWebView = getActiveWebView();
    if (!activeWebView || fullSite || !currentUrl) {
      return;
    }

    const scrollRatio = readerScrollPositionsRef.current[currentUrl];
    if (scrollRatio == null || !Number.isFinite(scrollRatio)) {
      return;
    }

    const restoreScript = `
      (function() {
        var ratio = ${JSON.stringify(scrollRatio)};
        var maxScroll = Math.max(
          0,
          (document.documentElement ? document.documentElement.scrollHeight : 0) - window.innerHeight,
          (document.body ? document.body.scrollHeight : 0) - window.innerHeight
        );
        window.scrollTo(0, Math.max(0, maxScroll * ratio));
        window.setTimeout(function() {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'restore-complete' }));
          }
        }, 80);
        return true;
      })();
    `;

    activeWebView.injectJavaScript(restoreScript);
  }, [currentUrl, fullSite, getActiveWebView]);
  useEffect(() => {
    if (!fullSite && hasPreparedHtml) {
      const handle = setTimeout(() => {
        restoreReaderScrollPosition();
      }, 32);

      return () => clearTimeout(handle);
    }
  }, [fullSite, hasPreparedHtml, isHV, restoreReaderScrollPosition]);

  const restorePendingAnchor = useCallback(() => {
    const activeWebView = getActiveWebView();
    if (!activeWebView || !pendingContentAnchor) {
      return;
    }

    const anchorValue = pendingContentAnchor.replace(/^#/, '');
    const anchorScript = `
      (function() {
        var targetId = ${JSON.stringify(anchorValue)};
        var anchor = document.getElementById(targetId) || document.getElementsByName(targetId)[0];
        if (anchor && typeof anchor.scrollIntoView === 'function') {
          anchor.scrollIntoView({ block: 'start' });
        }
        return true;
      })();
    `;

    activeWebView.injectJavaScript(anchorScript);
    setPendingContentAnchor(null);
  }, [getActiveWebView, pendingContentAnchor, setPendingContentAnchor]);

  const jumpToPendingReaderSearch = useCallback(() => {
    const activeWebView = getActiveWebView();
    if (
      !activeWebView ||
      !readerSearchAutoJumpRequest ||
      !currentOfflineChapterId ||
      readerSearchAutoJumpRequest.chapterId !== currentOfflineChapterId
    ) {
      return false;
    }

    const jumpRequest = readerSearchAutoJumpRequest;
    const targetResultCount = Math.max(80, jumpRequest.occurrenceIndex + 1);
    const results = runCurrentReaderSearch(jumpRequest.id, jumpRequest.query, targetResultCount);
    const activeIndex = Math.max(0, Math.min(results.length - 1, jumpRequest.occurrenceIndex || 0));
    const result = results[activeIndex];
    setReaderSearchAutoResults(jumpRequest.query, results, result ? activeIndex : null);

    if (!result) {
      clearReaderSearchAutoJump(jumpRequest.id);
      return false;
    }

    const jumpScript = `
      (function() {
        if (window.__HVBROWSER_READER_SEARCH__JUMP__) {
          window.__HVBROWSER_READER_SEARCH__JUMP__(
            ${JSON.stringify(result.id)}
          );
        }
        return true;
      })();
    `;

    activeWebView.injectJavaScript(jumpScript);
    clearReaderSearchAutoJump(jumpRequest.id);
    return true;
  }, [
    clearReaderSearchAutoJump,
    currentOfflineChapterId,
    getActiveWebView,
    readerSearchAutoJumpRequest,
    runCurrentReaderSearch,
    setReaderSearchAutoResults,
  ]);

  useEffect(() => {
    if (!readerSearchAutoJumpRequest?.immediate) {
      return;
    }

    jumpToPendingReaderSearch();
  }, [jumpToPendingReaderSearch, readerSearchAutoJumpRequest]);

  const loadingLabel =
    loadingStage === 'downloading'
      ? 'Downloading page'
      : loadingStage === 'converting'
        ? 'Converting to Han-Viet'
        : 'Preparing page';
  const showLoadingOverlay = loading || readerHtmlPreparing;

  const handleLoadStart = useCallback(() => {
    logReaderDebug('webview.loadStart', {
      currentUrl,
      loading,
      loadingStage,
      fullSite,
      isHV,
      htmlSourceLength: getDebugLength(htmlSource),
    });
    if (!loading) {
      return;
    }

    setLoadingStage('rendering');
  }, [currentUrl, fullSite, htmlSource, isHV, loading, loadingStage, setLoadingStage]);

  const handleLoadEnd = useCallback(() => {
    logReaderDebug('webview.loadEnd', {
      currentUrl,
      loading,
      loadingStage,
      fullSite,
      isHV,
      htmlSourceLength: getDebugLength(htmlSource),
      pendingAnchor: pendingContentAnchor,
      pendingSearch: !!readerSearchAutoJumpRequest,
    });
    if (readerSearchWebMatchesRef.current.length > 0) {
      registerReaderSearchMatchesInWebView(readerSearchWebMatchesRef.current);
    }
    if (pendingContentAnchor) {
      restorePendingAnchor();
    } else if (jumpToPendingReaderSearch()) {
      // Search jumps should take precedence over stored scroll restoration.
    } else {
      restoreReaderScrollPosition();
    }
    setLoading(false);
  }, [
    jumpToPendingReaderSearch,
    pendingContentAnchor,
    currentUrl,
    fullSite,
    htmlSource,
    isHV,
    registerReaderSearchMatchesInWebView,
    restorePendingAnchor,
    restoreReaderScrollPosition,
    readerSearchAutoJumpRequest,
    loading,
    loadingStage,
    setLoading,
  ]);

  const definitionSheetHeight = Math.max(168, Math.min(300, windowHeight * 0.25));
  const definitionSheetBottom = readerBottomInset + theme.spacing.md;
  const definitionWordIsSingle = definitionSheet
    ? getCharacterLength(definitionSheet.word) === 1
    : false;
  const definitionLines = definitionSheet
    ? definitionWordIsSingle
      ? [
          definitionSheet.pinyin ? `PYN: ${definitionSheet.pinyin}` : '',
          definitionSheet.hanViet ? `HV: ${definitionSheet.hanViet}` : '',
          definitionSheet.meaning,
        ].filter((line): line is string => !!line)
      : [
          definitionSheet.pinyin,
          definitionSheet.hanViet ? `HV: ${definitionSheet.hanViet}` : '',
          definitionSheet.meaning,
        ].filter(Boolean)
    : [];

  const sendDefinitionAction = useCallback(
    (action: 'prev' | 'next' | 'shrink' | 'expand') => {
      if (!definitionSheet || definitionSheet.loading) {
        return;
      }

      const nextPayload = getDefinitionPayloadForAction(definitionSheet, action);
      if (nextPayload) {
        runDefinitionLookup(nextPayload);
      }
    },
    [definitionSheet, runDefinitionLookup],
  );

  const closeDefinitionSheet = useCallback(() => {
    setDefinitionSheet(null);
    setTimeout(() => {
      getActiveWebView()?.injectJavaScript(`
        (function() {
          if (window.__HVBROWSER_DEFINITION_LOOKUP__CLOSE__) {
            window.__HVBROWSER_DEFINITION_LOOKUP__CLOSE__();
          }
          return true;
        })();
      `);
    }, 32);
  }, [getActiveWebView]);

  return (
    <View style={styles.screen}>
      {hasPreparedHtml && (
        <WebView
          key={`${currentContentSource}:${currentUrl}:${fullSite ? 'full' : 'reader'}`}
          ref={webViewRef}
          source={{
            html: htmlSource,
            baseUrl,
          }}
          style={styles.webView}
          mixedContentMode="compatibility"
          injectedJavaScript={initialScript}
          onLoadStart={handleLoadStart}
          onLoadEnd={handleLoadEnd}
          onMessage={handleMessage}
          onNavigationStateChange={handleNavigationStateChange}
        />
      )}
      <Modal
        animationType="none"
        transparent
        visible={!!definitionSheet}
        onRequestClose={closeDefinitionSheet}
      >
        <View style={styles.definitionModalLayer}>
          <Pressable style={styles.definitionBackdrop} onPress={closeDefinitionSheet} />
          {definitionSheet && (
            <View
              style={[
                styles.definitionSheet,
                { bottom: definitionSheetBottom, height: definitionSheetHeight },
              ]}
            >
              <View style={styles.definitionHeader}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.definitionWord,
                    definitionWordIsSingle && styles.definitionWordSingle,
                  ]}
                >
                  {definitionSheet.word || 'Definition'}
                </Text>
                <View style={styles.definitionControls}>
                  <Pressable
                    accessibilityLabel="Previous character"
                    disabled={!definitionSheet.canPrev || definitionSheet.loading}
                    onPress={() => sendDefinitionAction('prev')}
                    style={[
                      styles.definitionButton,
                      (!definitionSheet.canPrev || definitionSheet.loading) &&
                        styles.definitionButtonDisabled,
                    ]}
                  >
                    <FontAwesome6 name="chevron-left" size={14} color={theme.colors.text} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Reduce selected characters"
                    disabled={!definitionSheet.canShrink || definitionSheet.loading}
                    onPress={() => sendDefinitionAction('shrink')}
                    style={[
                      styles.definitionButton,
                      (!definitionSheet.canShrink || definitionSheet.loading) &&
                        styles.definitionButtonDisabled,
                    ]}
                  >
                    <FontAwesome6 name="minus" size={14} color={theme.colors.text} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Include more characters"
                    disabled={!definitionSheet.canExpand || definitionSheet.loading}
                    onPress={() => sendDefinitionAction('expand')}
                    style={[
                      styles.definitionButton,
                      (!definitionSheet.canExpand || definitionSheet.loading) &&
                        styles.definitionButtonDisabled,
                    ]}
                  >
                    <FontAwesome6 name="plus" size={14} color={theme.colors.text} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Next character"
                    disabled={!definitionSheet.canNext || definitionSheet.loading}
                    onPress={() => sendDefinitionAction('next')}
                    style={[
                      styles.definitionButton,
                      (!definitionSheet.canNext || definitionSheet.loading) &&
                        styles.definitionButtonDisabled,
                    ]}
                  >
                    <FontAwesome6 name="chevron-right" size={14} color={theme.colors.text} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Close definition"
                    onPress={closeDefinitionSheet}
                    style={styles.definitionButton}
                  >
                    <FontAwesome6 name="xmark" size={15} color={theme.colors.text} />
                  </Pressable>
                </View>
              </View>
              <ScrollView
                style={styles.definitionBody}
                contentContainerStyle={styles.definitionBodyPad}
              >
                {definitionLines.map((line, index) => (
                  <Text key={`${definitionSheet.lookupId}-${index}`} style={styles.definitionLine}>
                    {line}
                  </Text>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>
      {showLoadingOverlay && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator
              animating={showLoadingOverlay}
              color={theme.colors.accent}
              size="small"
            />
            <Text style={styles.loadingTitle}>{loadingLabel}</Text>
            <Text style={styles.loadingSubtitle}>
              Please wait while the reader finishes loading.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    loadingOverlay: {
      ...absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.overlay,
      zIndex: 2,
    },
    loadingCard: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 22,
      paddingVertical: 18,
      borderRadius: theme.radius.xxl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.borderMuted,
      minWidth: 220,
      gap: theme.spacing.xs,
      ...theme.shadows.md,
    },
    loadingTitle: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
      textAlign: 'center',
      marginTop: theme.spacing.xs,
    },
    loadingSubtitle: {
      ...theme.typography.caption,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
    webView: {
      flex: 1,
      backgroundColor: theme.reader.background,
    },
    definitionModalLayer: {
      ...absoluteFill,
      justifyContent: 'flex-end',
    },
    definitionBackdrop: {
      ...absoluteFill,
      backgroundColor: 'transparent',
    },
    definitionSheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.sm,
      backgroundColor: theme.colors.surface,
      borderTopWidth: 1,
      borderTopColor: theme.colors.borderStrong,
      zIndex: 3,
      ...theme.shadows.lg,
    },
    definitionHeader: {
      minHeight: 38,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    definitionWord: {
      ...theme.typography.bodyStrong,
      fontSize: 22,
      lineHeight: 28,
      flex: 1,
      color: theme.colors.textAccent,
    },
    definitionWordSingle: {
      fontSize: 32,
      lineHeight: 38,
    },
    definitionControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xxs,
    },
    definitionButton: {
      minWidth: 34,
      height: 32,
      paddingHorizontal: theme.spacing.xs,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.sm,
      backgroundColor: theme.colors.surfaceMuted,
    },
    definitionButtonDisabled: {
      opacity: 0.36,
    },
    definitionBody: {
      flex: 1,
    },
    definitionBodyPad: {
      paddingTop: theme.spacing.xs,
      paddingBottom: theme.spacing.md,
    },
    definitionLine: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
      marginBottom: theme.spacing.xs,
    },
  });
