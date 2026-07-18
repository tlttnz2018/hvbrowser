import { FontAwesome6 } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

import { usePageLoader } from '../hooks/usePageLoader';
import { useAppStore } from '../stores/useAppStore';
import { useWebPageStore } from '../stores/useWebPageStore';
import { absoluteFill, Theme, useTheme } from '../theme';
import {
  DefinitionEntry,
  findBestDefinitionMatch,
  findDefinitionByWord,
} from '../utils/definition-dictionary';
import { extractBaseUrl } from '../utils/normalize-url';
import {
  normalizeEpubFullSiteHtml,
  stripPresentationHtmlWithChineseTooltips,
  stripPresentationHtmlWithHvTooltips,
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
  chineseContext?: string;
  characterIndex?: number;
  selectedWord?: string;
  selectedPinyin?: string;
  selectedHanViet?: string;
  selectedStart?: number;
  selectedEnd?: number;
  segmentLength?: number;
  fallbackWord?: string;
  fallbackPinyin?: string;
  fallbackHanViet?: string;
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
  canPrev: boolean;
  canNext: boolean;
  canShrink: boolean;
  canExpand: boolean;
}

interface DefinitionSelectionState {
  word: string;
  pinyin: string;
  hanViet: string;
  start: number;
  end: number;
  activeIndex: number;
  segmentLength: number;
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

function getInitialSelectionFromPayload(
  payload: DefinitionLookupPayload,
): DefinitionSelectionState {
  const activeIndex =
    typeof payload.characterIndex === 'number' && Number.isFinite(payload.characterIndex)
      ? Math.max(0, Math.floor(payload.characterIndex))
      : 0;
  const segmentLength =
    typeof payload.segmentLength === 'number' && Number.isFinite(payload.segmentLength)
      ? Math.max(1, Math.floor(payload.segmentLength))
      : Math.max(1, getCharacterLength(payload.chineseContext ?? payload.selectedWord ?? ''));
  const start =
    typeof payload.selectedStart === 'number' && Number.isFinite(payload.selectedStart)
      ? Math.max(0, Math.floor(payload.selectedStart))
      : activeIndex;
  const end =
    typeof payload.selectedEnd === 'number' && Number.isFinite(payload.selectedEnd)
      ? Math.min(segmentLength, Math.max(start + 1, Math.floor(payload.selectedEnd)))
      : Math.min(
          segmentLength,
          start + Math.max(1, getCharacterLength(payload.selectedWord ?? '')),
        );

  return {
    word: payload.selectedWord ?? payload.fallbackWord ?? '',
    pinyin: payload.selectedPinyin ?? payload.fallbackPinyin ?? '',
    hanViet: payload.selectedHanViet ?? payload.fallbackHanViet ?? '',
    start,
    end,
    activeIndex,
    segmentLength,
  };
}

function getSelectionForResult(
  payload: DefinitionLookupPayload,
  entry: DefinitionEntry | null,
): DefinitionSelectionState {
  const initial = getInitialSelectionFromPayload(payload);
  const contextCharacters = Array.from(payload.chineseContext ?? '');
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
    word: entry?.word ?? initial.word,
    pinyin: entry?.pinyin ?? initial.pinyin,
  };
}

function buildDefinitionSheetState(
  lookupId: string,
  entry: DefinitionEntry | null,
  selection: DefinitionSelectionState,
): DefinitionSheetState {
  const controls = getSelectionControls(selection);
  const hanViet = selection.hanViet;
  const meaning =
    entry?.meaning ?? (hanViet ? `Han-Viet: ${hanViet}` : 'No dictionary entry found.');

  return {
    lookupId,
    word: selection.word,
    pinyin: selection.pinyin,
    hanViet,
    meaning,
    loading: false,
    ...controls,
  };
}

export default function IndexScreen() {
  const webViewRef = useRef<WebView>(null);
  const readerScrollPositionsRef = useRef<Record<string, number>>({});
  const pendingReaderRestoreUrlRef = useRef<string | null>(null);
  const currentOfflineChapterScrollRatioRef = useRef<number | null>(null);
  const savedReaderScrollPositionsRef = useRef<Record<number, { ratio: number; savedAt: number }>>(
    {},
  );
  const savedReaderPreferencesRef = useRef<
    Record<number, { fontSize: number; isHV: boolean; savedAt: number }>
  >({});
  const { loadPage, loadOfflineChapter } = usePageLoader();
  const theme = useTheme();
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [definitionSheet, setDefinitionSheet] = useState<DefinitionSheetState | null>(null);

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
  const dictionary = useAppStore((s) => s.dictionary);
  const pinyinDictionary = useAppStore((s) => s.pinyinDictionary);
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

  const persistOfflineReaderScrollRatio = useCallback(
    (chapterId: number, ratio: number) => {
      const safeRatio = Math.max(0, Math.min(1, ratio));
      const previous = savedReaderScrollPositionsRef.current[chapterId];
      const now = Date.now();

      if (
        previous &&
        now - previous.savedAt < 1000 &&
        Math.abs(previous.ratio - safeRatio) < 0.005
      ) {
        return;
      }

      savedReaderScrollPositionsRef.current[chapterId] = {
        ratio: safeRatio,
        savedAt: now,
      };

      updateOfflineChapterReaderScrollRatio(chapterId, safeRatio).catch((error) => {
        console.error('Offline reader scroll save error:', error);
      });
    },
    [updateOfflineChapterReaderScrollRatio],
  );

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
      setReaderSearchResults(readerSearchRequest.id, readerSearchRequest.query, []);
      return;
    }

    if (!webViewRef.current || !hasReaderHtml) {
      setReaderSearchResults(readerSearchRequest.id, readerSearchRequest.query, []);
      return;
    }

    webViewRef.current.injectJavaScript(`
      (function() {
        if (window.__HVBROWSER_READER_SEARCH__RUN__) {
          window.__HVBROWSER_READER_SEARCH__RUN__(
            ${JSON.stringify(readerSearchRequest.id)},
            ${JSON.stringify(readerSearchRequest.query)}
          );
        }
        return true;
      })();
    `);
  }, [hasReaderHtml, readerSearchRequest, setReaderSearchResults]);

  useEffect(() => {
    if (!readerSearchJumpRequest || !webViewRef.current) {
      return;
    }

    webViewRef.current.injectJavaScript(`
      (function() {
        if (window.__HVBROWSER_READER_SEARCH__JUMP__) {
          var jumped = window.__HVBROWSER_READER_SEARCH__JUMP__(
            ${JSON.stringify(readerSearchJumpRequest.resultId)}
          );
          if (
            !jumped &&
            window.__HVBROWSER_READER_SEARCH__JUMP_TO_QUERY__ &&
            ${JSON.stringify(readerSearchJumpRequest.query)}.trim()
          ) {
            window.__HVBROWSER_READER_SEARCH__JUMP_TO_QUERY__(
              ${JSON.stringify(readerSearchJumpRequest.query)},
              ${JSON.stringify(readerSearchJumpRequest.resultIndex ?? 0)}
            );
          }
        }
        return true;
      })();
    `);
  }, [readerSearchJumpRequest]);

  const initialScript = `
    (function() {
      ${buildFullSiteFontScript(fontSize)}
      if (window.__HVBROWSER_LINK_BRIDGE__) { return true; }
      window.__HVBROWSER_LINK_BRIDGE__ = true;
      var postScrollPosition = function() {
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
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'scroll-position', ratio: ratio }));
      };
      var scheduledScrollPost = null;
      var scheduleScrollPositionPost = function() {
        if (scheduledScrollPost !== null) {
          window.clearTimeout(scheduledScrollPost);
        }
        scheduledScrollPost = window.setTimeout(function() {
          scheduledScrollPost = null;
          postScrollPosition();
        }, 80);
      };
      window.addEventListener('scroll', scheduleScrollPositionPost, { passive: true });
      window.addEventListener('load', postScrollPosition);
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
        var normalizeHvSearch = function(value) {
          return String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
        };
        var normalizeChineseSearch = function(value) {
          return String(value || '').replace(/\\s+/g, '');
        };
        var hasChinese = function(value) {
          return /[\\u3400-\\u9fff\\uf900-\\ufaff]/.test(value || '');
        };
        var collectReaderSearchTokens = function() {
          var tokens = [];
          var root = document.body;
          var visit = function(node) {
            if (!node) return;
            if (node.nodeType === 1) {
              var element = node;
              var tagName = (element.tagName || '').toLowerCase();
              if (tagName === 'script' || tagName === 'style' || element.id === 'hv-tooltip') {
                return;
              }
              if (element.classList && element.classList.contains('hv-word')) {
                var visible = element.textContent || '';
                var original = element.getAttribute('data-original') || '';
                var lines = original.split('\\n');
                var chinese = hasChinese(visible) ? visible : (lines[0] || visible);
                var hanViet = hasChinese(visible) ? (lines[lines.length - 1] || visible) : visible;
                tokens.push({ visible: visible, chinese: chinese, hanViet: hanViet, target: element });
                return;
              }
              var children = element.childNodes || [];
              for (var childIndex = 0; childIndex < children.length; childIndex += 1) {
                visit(children[childIndex]);
              }
              return;
            }
            if (node.nodeType === 3) {
              var text = node.nodeValue || '';
              if (!text.trim()) return;
              tokens.push({
                visible: text,
                chinese: text,
                hanViet: text,
                target: node.parentElement || document.body
              });
            }
          };
          visit(root);
          return tokens;
        };
        var appendIndexText = function(index, text, tokenIndex, keepSpaces) {
          var normalized = keepSpaces ? normalizeHvSearch(text) : normalizeChineseSearch(text);
          if (!normalized) return;
          if (keepSpaces && index.text && index.text.charAt(index.text.length - 1) !== ' ') {
            index.text += ' ';
            index.map.push(tokenIndex);
          }
          for (var charIndex = 0; charIndex < normalized.length; charIndex += 1) {
            index.text += normalized.charAt(charIndex);
            index.map.push(tokenIndex);
          }
        };
        var buildSearchIndex = function(tokens, key, keepSpaces) {
          var index = { text: '', map: [] };
          for (var tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
            appendIndexText(index, tokens[tokenIndex][key], tokenIndex, keepSpaces);
          }
          return index;
        };
        var buildSearchSnippet = function(tokens, tokenIndex) {
          var start = Math.max(0, tokenIndex - 6);
          var end = Math.min(tokens.length, tokenIndex + 12);
          var snippet = '';
          for (var index = start; index < end; index += 1) {
            snippet += tokens[index].visible;
            if (tokens[index].visible && !/\\s$/.test(tokens[index].visible)) {
              snippet += ' ';
            }
          }
          return snippet.replace(/\\s+/g, ' ').trim().slice(0, 120);
        };
        var collectIndexMatches = function(searchIndex, query, tokens, matchType, seen, results) {
          if (!query) return;
          var startAt = 0;
          while (results.length < 80) {
            var foundAt = searchIndex.text.indexOf(query, startAt);
            if (foundAt < 0) break;
            var tokenIndex = searchIndex.map[foundAt];
            var token = tokens[tokenIndex];
            var target = token && token.target;
            if (target) {
              var seenKey = matchType + ':' + tokenIndex + ':' + foundAt;
              if (!seen[seenKey]) {
                seen[seenKey] = true;
                var id = 'reader-search-' + results.length + '-' + Date.now();
                window.__HVBROWSER_READER_SEARCH_MATCHES__[id] = target;
                results.push({
                  id: id,
                  label: matchType === 'chinese' ? 'Chinese match' : 'Han-Viet match',
                  matchType: matchType === 'chinese' ? 'chinese' : 'han-viet',
                  snippet: buildSearchSnippet(tokens, tokenIndex)
                });
              }
            }
            startAt = foundAt + Math.max(1, query.length);
          }
        };
        window.__HVBROWSER_READER_SEARCH__RUN__ = function(requestId, query) {
          window.__HVBROWSER_READER_SEARCH_MATCHES__ = {};
          var tokens = collectReaderSearchTokens();
          var chineseIndex = buildSearchIndex(tokens, 'chinese', false);
          var hvIndex = buildSearchIndex(tokens, 'hanViet', true);
          var results = [];
          var seen = {};
          collectIndexMatches(chineseIndex, normalizeChineseSearch(query), tokens, 'chinese', seen, results);
          collectIndexMatches(hvIndex, normalizeHvSearch(query), tokens, 'han-viet', seen, results);
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'reader-search-results',
              requestId: requestId,
              query: query,
              results: results
            }));
          }
        };
        window.__HVBROWSER_READER_SEARCH__JUMP__ = function(resultId) {
          var existing = document.querySelector('.hv-reader-search-hit');
          if (existing) existing.classList.remove('hv-reader-search-hit');
          var target = window.__HVBROWSER_READER_SEARCH_MATCHES__[resultId];
          if (!target) return false;
          target.classList.add('hv-reader-search-hit');
          if (target.scrollIntoView) {
            target.scrollIntoView({ block: 'center', inline: 'nearest' });
          }
          return true;
        };
        window.__HVBROWSER_READER_SEARCH__JUMP_TO_QUERY__ = function(query, occurrenceIndex) {
          window.__HVBROWSER_READER_SEARCH_MATCHES__ = {};
          var tokens = collectReaderSearchTokens();
          var chineseIndex = buildSearchIndex(tokens, 'chinese', false);
          var hvIndex = buildSearchIndex(tokens, 'hanViet', true);
          var results = [];
          var seen = {};
          collectIndexMatches(chineseIndex, normalizeChineseSearch(query), tokens, 'chinese', seen, results);
          collectIndexMatches(hvIndex, normalizeHvSearch(query), tokens, 'han-viet', seen, results);
          var activeIndex = Math.max(0, Math.min(results.length - 1, occurrenceIndex || 0));
          var result = results[activeIndex];
          if (result) {
            window.__HVBROWSER_READER_SEARCH__JUMP__(result.id);
          }
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'reader-search-auto-results',
              query: query,
              activeIndex: result ? activeIndex : null,
              results: results
            }));
          }
        };
      }
      return true;
    })();
  `;

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const payload = JSON.parse(event.nativeEvent.data) as DefinitionLookupPayload;
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
            if (
              (currentOfflineStory?.sourceType === 'epub' ||
                currentOfflineStory?.sourceType === 'txt') &&
              currentOfflineChapterId
            ) {
              persistOfflineReaderScrollRatio(currentOfflineChapterId, scrollRatio);
            }
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
          const lookupPayload = payload;
          const lookupId = payload.lookupId;
          const initialSelection = getInitialSelectionFromPayload(lookupPayload);
          setDefinitionSheet({
            lookupId,
            word: initialSelection.word,
            pinyin: initialSelection.pinyin,
            hanViet: initialSelection.hanViet,
            meaning: 'Looking up...',
            loading: true,
            ...getSelectionControls(initialSelection),
          });
          void (async () => {
            const entry =
              lookupPayload.lookupMode === 'exact' && lookupPayload.selectedWord
                ? await findDefinitionByWord(lookupPayload.selectedWord)
                : typeof lookupPayload.chineseContext === 'string' &&
                    typeof lookupPayload.characterIndex === 'number'
                  ? await findBestDefinitionMatch(
                      lookupPayload.chineseContext,
                      lookupPayload.characterIndex,
                    )
                  : null;
            const selection = getSelectionForResult(lookupPayload, entry);
            setDefinitionSheet(buildDefinitionSheetState(lookupId, entry, selection));
            const result: {
              lookupId: string;
              entry: DefinitionEntry | null;
              fallback: { word: string; pinyin: string; hanViet: string; meaning: string };
            } = {
              lookupId,
              entry,
              fallback: {
                word: selection.word,
                pinyin: selection.pinyin,
                hanViet: selection.hanViet,
                meaning:
                  entry?.meaning ??
                  (selection.hanViet
                    ? `Han-Viet: ${selection.hanViet}`
                    : 'No dictionary entry found.'),
              },
            };

            webViewRef.current?.injectJavaScript(`
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
      currentOfflineChapterId,
      currentOfflineStory?.sourceType,
      getOfflineChapterByUrlFromState,
      loadOfflineChapter,
      loadPage,
      persistOfflineReaderScrollRatio,
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
  const hasHtml = !!activeHtml;
  const isCurrentEpub = currentOfflineStory?.sourceType === 'epub';
  const htmlSource = fullSite
    ? isCurrentEpub
      ? normalizeEpubFullSiteHtml(activeHtml, theme.reader)
      : activeHtml
    : isHV
      ? stripPresentationHtmlWithHvTooltips(
          htmlOrig,
          fontSize,
          dictionary,
          pinyinDictionary,
          theme.reader,
        )
      : stripPresentationHtmlWithChineseTooltips(
          htmlOrig,
          fontSize,
          dictionary,
          pinyinDictionary,
          theme.reader,
        );
  const baseUrl =
    currentUrl && /^(https?:|file:)/i.test(currentUrl) ? extractBaseUrl(currentUrl) : undefined;
  const restoreReaderScrollPosition = useCallback(() => {
    if (!webViewRef.current || fullSite || !currentUrl) {
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

    webViewRef.current.injectJavaScript(restoreScript);
  }, [currentUrl, fullSite]);

  const restorePendingAnchor = useCallback(() => {
    if (!webViewRef.current || !pendingContentAnchor) {
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

    webViewRef.current.injectJavaScript(anchorScript);
    setPendingContentAnchor(null);
  }, [pendingContentAnchor, setPendingContentAnchor]);

  const jumpToPendingReaderSearch = useCallback(() => {
    if (
      !webViewRef.current ||
      !readerSearchAutoJumpRequest ||
      !currentOfflineChapterId ||
      readerSearchAutoJumpRequest.chapterId !== currentOfflineChapterId
    ) {
      return false;
    }

    const jumpRequest = readerSearchAutoJumpRequest;
    const jumpScript = `
      (function() {
        if (window.__HVBROWSER_READER_SEARCH__JUMP_TO_QUERY__) {
          window.__HVBROWSER_READER_SEARCH__JUMP_TO_QUERY__(
            ${JSON.stringify(jumpRequest.query)},
            ${JSON.stringify(jumpRequest.occurrenceIndex)}
          );
        }
        return true;
      })();
    `;

    webViewRef.current.injectJavaScript(jumpScript);
    clearReaderSearchAutoJump(jumpRequest.id);
    return true;
  }, [clearReaderSearchAutoJump, currentOfflineChapterId, readerSearchAutoJumpRequest]);

  const loadingLabel =
    loadingStage === 'downloading'
      ? 'Downloading page'
      : loadingStage === 'converting'
        ? 'Converting to Han-Viet'
        : 'Preparing page';

  const handleLoadStart = useCallback(() => {
    if (!loading) {
      return;
    }

    setLoadingStage('rendering');
  }, [loading, setLoadingStage]);

  const handleLoadEnd = useCallback(() => {
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
    restorePendingAnchor,
    restoreReaderScrollPosition,
    setLoading,
  ]);

  const definitionSheetHeight = Math.max(168, Math.min(300, windowHeight * 0.25));
  const definitionSheetBottom = Math.max(insets.bottom + 12, 56);
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
      : [definitionSheet.pinyin, definitionSheet.meaning].filter(Boolean)
    : [];

  const sendDefinitionAction = useCallback((action: 'prev' | 'next' | 'shrink' | 'expand') => {
    webViewRef.current?.injectJavaScript(`
      (function() {
        if (window.__HVBROWSER_DEFINITION_LOOKUP__ACTION__) {
          window.__HVBROWSER_DEFINITION_LOOKUP__ACTION__(${JSON.stringify(action)});
        }
        return true;
      })();
    `);
  }, []);

  const closeDefinitionSheet = useCallback(() => {
    setDefinitionSheet(null);
    setTimeout(() => {
      webViewRef.current?.injectJavaScript(`
        (function() {
          if (window.__HVBROWSER_DEFINITION_LOOKUP__CLOSE__) {
            window.__HVBROWSER_DEFINITION_LOOKUP__CLOSE__();
          }
          return true;
        })();
      `);
    }, 32);
  }, []);

  return (
    <View style={styles.screen}>
      {hasHtml && (
        <WebView
          key={`${currentContentSource}:${currentUrl}:${fullSite ? 'full' : 'reader'}:${isHV ? 'hv' : 'orig'}`}
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
      {loading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator animating={loading} color={theme.colors.accent} size="small" />
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
