import { FontAwesome6 } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  buildOfflineChapterSearchSignature,
  getOfflineChapterById,
  getOfflineChapterSearchCache,
  listOfflineChapterSearchSuggestions,
  type OfflineChapterRecord,
  type OfflineChapterSearchSuggestion,
  recordOfflineChapterSearchKeyword,
  saveOfflineChapterSearchCache,
} from '../../db/offline';
import { useOfflineDownloads } from '../../hooks/useOfflineDownloads';
import { usePageLoader } from '../../hooks/usePageLoader';
import { useAppStore } from '../../stores/useAppStore';
import { type ReaderSearchResult, useWebPageStore } from '../../stores/useWebPageStore';
import { Theme, useTheme } from '../../theme';
import {
  findOfflineChapterTextMatches,
  flattenOfflineChapterTextMatchesByChapter,
  groupOfflineChapterSearchCacheMatches,
  type OfflineChapterTextMatch,
  type OfflineChapterTextMatchesByChapter,
} from '../../utils/offline-chapter-search';
import { getBottomInsetWithSystemBarPadding } from '../../utils/safe-area';
import SegmentedControl from '../buttons/SegmentedControl';
import ToolbarButton from '../buttons/ToolbarButton';

interface WebTextToolbarProps {
  reloadPage: () => void;
}

const EMPTY_CHAPTERS: OfflineChapterRecord[] = [];
const ESTIMATED_CONTENT_ROW_HEIGHT = 78;
const CHAPTER_SEARCH_BATCH_SIZE = 12;

type ContentsFilterKey = 'all' | 'current';
type ContentsRow = {
  chapter: OfflineChapterRecord;
  titleMatch: boolean;
  textMatch: OfflineChapterTextMatch | null;
};

const CONTENTS_FILTER_OPTIONS: Array<{ key: ContentsFilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'current', label: 'Current' },
];

function matchesContentsFilter(
  chapter: OfflineChapterRecord,
  filterKey: ContentsFilterKey,
  currentOfflineChapterId: number | null,
) {
  if (filterKey === 'all') return true;
  return chapter.id === currentOfflineChapterId;
}

function toReaderSearchMatchType(matchType: OfflineChapterTextMatch['matchType']) {
  return matchType === 'Chinese' ? 'chinese' : 'han-viet';
}

function buildChapterSearchResults(rows: ContentsRow[]): ReaderSearchResult[] {
  return rows.reduce<ReaderSearchResult[]>((results, row) => {
    if (!row.textMatch) {
      return results;
    }

    results.push({
      id: `chapter-search-${row.chapter.id}-${row.textMatch.occurrenceIndex}`,
      label: `${row.textMatch.matchType} text match`,
      matchType: toReaderSearchMatchType(row.textMatch.matchType),
      snippet: row.textMatch.snippet,
      chapterId: row.chapter.id,
      chapterName: row.chapter.chapterName,
      occurrenceIndex: row.textMatch.occurrenceIndex,
    });
    return results;
  }, []);
}

export default function WebTextToolbar({ reloadPage }: WebTextToolbarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = getBottomInsetWithSystemBarPadding(insets.bottom);
  const toolbarBottom = bottomInset + theme.spacing.xl;
  const sheetBottomPadding = bottomInset + theme.spacing.lg;
  const styles = createStyles(theme);
  const { startDownloadFromCurrentPage } = useOfflineDownloads();
  const { loadOfflineChapter } = usePageLoader();
  const contentsListRef = useRef<FlatList<ContentsRow>>(null);
  const [contentsVisible, setContentsVisible] = useState(false);
  const [contentsSearchQuery, setContentsSearchQuery] = useState('');
  const [chapterTextMatches, setChapterTextMatches] = useState<OfflineChapterTextMatchesByChapter>(
    {},
  );
  const [contentsSearchFocused, setContentsSearchFocused] = useState(false);
  const [contentsSearchSuggestions, setContentsSearchSuggestions] = useState<
    OfflineChapterSearchSuggestion[]
  >([]);
  const [contentsFilterKey, setContentsFilterKey] = useState<ContentsFilterKey>('all');
  const [readerSearchVisible, setReaderSearchVisible] = useState(false);
  const [readerSearchQuery, setReaderSearchQuery] = useState('');
  const [readerSearchFocused, setReaderSearchFocused] = useState(false);
  const [readerSearchSuggestions, setReaderSearchSuggestions] = useState<
    OfflineChapterSearchSuggestion[]
  >([]);
  const lastRecordedReaderSearchKeyRef = useRef<string | null>(null);
  const {
    moreMenu,
    toggleMoreMenu,
    decreaseFont,
    resetFont,
    increaseFont,
    setThemeMode,
    requestReaderSearch,
    requestReaderSearchJump,
    requestReaderSearchAutoJump,
    setReaderChapterSearchResults,
    setReaderSearchActiveResultIndex,
  } = useWebPageStore();
  const readerSearchResults = useWebPageStore((state) => state.readerSearchResults);
  const readerSearchBusy = useWebPageStore((state) => state.readerSearchBusy);
  const readerSearchActiveResultIndex = useWebPageStore(
    (state) => state.readerSearchActiveResultIndex,
  );
  const readerSearchStoreQuery = useWebPageStore((state) => state.readerSearchQuery);
  const readerSearchScope = useWebPageStore((state) => state.readerSearchScope);
  const jumpReaderSearchResult = useWebPageStore((state) => state.jumpReaderSearchResult);
  const currentUrl = useAppStore((state) => state.currentUrl);
  const dictionary = useAppStore((state) => state.dictionary);
  const currentContentSource = useAppStore((state) => state.currentContentSource);
  const currentOfflineChapterId = useAppStore((state) => state.currentOfflineChapterId);
  const activeDownloadId = useAppStore((state) => state.activeDownloadId);
  const downloadQueue = useAppStore((state) => state.downloadQueue);
  const currentChapter = useAppStore((state) => state.getOfflineChapterByUrlFromState(currentUrl));
  const currentStory = useAppStore((state) => state.getCurrentOfflineStoryFromState());
  const currentStoryChapters = useAppStore((state) =>
    currentStory ? state.getOfflineChaptersForStoryFromState(currentStory.id) : EMPTY_CHAPTERS,
  );
  const nextThemeMode = theme.mode === 'dark' ? 'light' : 'dark';
  const downloadLabel =
    currentChapter?.downloadStatus === 'downloaded'
      ? 'saved'
      : currentChapter?.downloadStatus === 'downloading'
        ? 'busy'
        : currentChapter?.downloadStatus === 'queued'
          ? 'queued'
          : activeDownloadId
            ? `${downloadQueue.length + 1}`
            : 'DL';

  const currentStoryChapterIndex = useMemo(() => {
    if (!currentOfflineChapterId) {
      return -1;
    }

    return currentStoryChapters.findIndex((chapter) => chapter.id === currentOfflineChapterId);
  }, [currentOfflineChapterId, currentStoryChapters]);

  const previousChapter =
    currentStoryChapterIndex > 0 ? currentStoryChapters[currentStoryChapterIndex - 1] : null;
  const nextChapter =
    currentStoryChapterIndex >= 0 && currentStoryChapterIndex < currentStoryChapters.length - 1
      ? currentStoryChapters[currentStoryChapterIndex + 1]
      : null;
  const currentStorySearchSignature = useMemo(
    () => buildOfflineChapterSearchSignature(currentStoryChapters),
    [currentStoryChapters],
  );

  const refreshContentsSearchSuggestions = useCallback(async () => {
    if (!currentStory) {
      setContentsSearchSuggestions([]);
      return;
    }

    const suggestions = await listOfflineChapterSearchSuggestions(currentStory.id);
    setContentsSearchSuggestions(suggestions);
  }, [currentStory]);

  const refreshReaderSearchSuggestions = useCallback(async () => {
    if (!currentStory) {
      setReaderSearchSuggestions([]);
      return;
    }

    const suggestions = await listOfflineChapterSearchSuggestions(currentStory.id);
    setReaderSearchSuggestions(suggestions);
  }, [currentStory]);

  const contentsRows = useMemo<ContentsRow[]>(() => {
    const rawQuery = contentsSearchQuery.trim();
    const titleQuery = rawQuery.toLowerCase();

    return currentStoryChapters.reduce<ContentsRow[]>((rows, chapter) => {
      if (!matchesContentsFilter(chapter, contentsFilterKey, currentOfflineChapterId)) {
        return rows;
      }

      if (!rawQuery) {
        rows.push({ chapter, titleMatch: false, textMatch: null });
        return rows;
      }

      const titleMatch = `${chapter.chapterName} ${chapter.chapterUrl}`
        .toLowerCase()
        .includes(titleQuery);
      const textMatches = chapterTextMatches[chapter.id] ?? [];

      if (textMatches.length > 0) {
        textMatches.forEach((textMatch) => {
          rows.push({ chapter, titleMatch, textMatch });
        });
        return rows;
      }

      if (titleMatch) {
        rows.push({ chapter, titleMatch, textMatch: null });
      }
      return rows;
    }, []);
  }, [
    contentsFilterKey,
    contentsSearchQuery,
    currentOfflineChapterId,
    currentStoryChapters,
    chapterTextMatches,
  ]);
  const contentsSummaryLabel = `${contentsRows.length} visible • ${currentStoryChapters.length} total`;
  const contentsJumpTargets = useMemo(() => {
    const currentIndex = contentsRows.findIndex(
      (row) => row.chapter.id === currentOfflineChapterId,
    );

    return {
      currentIndex,
    };
  }, [contentsRows, currentOfflineChapterId]);
  const contentsBucketActions = useMemo(() => {
    if (contentsRows.length <= 1000) {
      return [];
    }

    const buckets = new Map<number, { label: string; index: number }>();

    contentsRows.forEach(({ chapter }, index) => {
      const order = chapter.chapterOrder ?? index + 1;
      const bucketStart = Math.floor((Math.max(order, 1) - 1) / 1000) * 1000 + 1;
      if (!buckets.has(bucketStart)) {
        const bucketEnd = bucketStart + 999;
        buckets.set(bucketStart, { label: `${bucketStart}-${bucketEnd}`, index });
      }
    });

    return Array.from(buckets.values()).slice(0, 8);
  }, [contentsRows]);

  useEffect(() => {
    if (!contentsVisible) {
      setContentsSearchQuery('');
      setContentsFilterKey('all');
      setChapterTextMatches({});
      setContentsSearchFocused(false);
      setContentsSearchSuggestions([]);
    }
  }, [contentsVisible]);

  useEffect(() => {
    if (contentsVisible && currentStory) {
      void refreshContentsSearchSuggestions();
    }
  }, [contentsVisible, currentStory, refreshContentsSearchSuggestions]);

  useEffect(() => {
    const rawQuery = contentsSearchQuery.trim();
    if (!contentsVisible || !rawQuery) {
      setChapterTextMatches({});
      return;
    }

    let cancelled = false;
    setChapterTextMatches({});

    const chaptersToSearch = currentStoryChapters.filter((chapter) =>
      matchesContentsFilter(chapter, contentsFilterKey, currentOfflineChapterId),
    );

    void (async () => {
      if (currentStory) {
        const cachedSearch = await getOfflineChapterSearchCache(
          currentStory.id,
          rawQuery,
          currentStorySearchSignature,
        );
        if (cancelled) {
          return;
        }

        if (cachedSearch) {
          setChapterTextMatches(groupOfflineChapterSearchCacheMatches(cachedSearch.matches));
          await refreshContentsSearchSuggestions();
          return;
        }
      }

      let pendingMatches: OfflineChapterTextMatchesByChapter = {};
      let collectedMatches: OfflineChapterTextMatchesByChapter = {};

      for (const chapter of chaptersToSearch) {
        const fullChapter = chapter.originalHtml
          ? chapter
          : await getOfflineChapterById(chapter.id);
        if (cancelled) {
          return;
        }

        if (!fullChapter) {
          continue;
        }

        const textMatches = findOfflineChapterTextMatches(fullChapter, rawQuery, dictionary);
        if (textMatches.length === 0) {
          continue;
        }

        pendingMatches[chapter.id] = textMatches;
        collectedMatches[chapter.id] = textMatches;
        if (Object.keys(pendingMatches).length >= CHAPTER_SEARCH_BATCH_SIZE) {
          const nextMatches = pendingMatches;
          pendingMatches = {};
          setChapterTextMatches((currentMatches) => ({ ...currentMatches, ...nextMatches }));
        }
      }

      if (!cancelled && Object.keys(pendingMatches).length > 0) {
        setChapterTextMatches((currentMatches) => ({ ...currentMatches, ...pendingMatches }));
      }

      if (!cancelled && currentStory && contentsFilterKey === 'all') {
        await saveOfflineChapterSearchCache({
          storyId: currentStory.id,
          rawQuery,
          matches: flattenOfflineChapterTextMatchesByChapter(collectedMatches),
          chapterSignature: currentStorySearchSignature,
        });
        if (!cancelled) {
          await refreshContentsSearchSuggestions();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    contentsFilterKey,
    contentsSearchQuery,
    contentsVisible,
    currentOfflineChapterId,
    currentStoryChapters,
    currentStory,
    currentStorySearchSignature,
    dictionary,
    refreshContentsSearchSuggestions,
  ]);

  useEffect(() => {
    if (!readerSearchVisible) {
      setReaderSearchFocused(false);
      setReaderSearchSuggestions([]);
      lastRecordedReaderSearchKeyRef.current = null;
      return;
    }

    if (
      readerSearchQuery.trim() &&
      readerSearchQuery === readerSearchStoreQuery &&
      readerSearchResults.length > 0
    ) {
      return;
    }

    const handle = setTimeout(() => {
      requestReaderSearch(readerSearchQuery);
      const query = readerSearchQuery.trim();
      if (currentStory && query) {
        const recordKey = `${currentStory.id}:${query.toLowerCase()}`;
        if (lastRecordedReaderSearchKeyRef.current !== recordKey) {
          lastRecordedReaderSearchKeyRef.current = recordKey;
          void recordOfflineChapterSearchKeyword(currentStory.id, query).then(() => {
            void refreshReaderSearchSuggestions();
          });
        }
      }
    }, 220);

    return () => clearTimeout(handle);
  }, [
    currentStory,
    readerSearchQuery,
    readerSearchResults.length,
    readerSearchStoreQuery,
    readerSearchVisible,
    refreshReaderSearchSuggestions,
    requestReaderSearch,
  ]);

  const scrollContentsToIndex = (index: number, measuredLength = ESTIMATED_CONTENT_ROW_HEIGHT) => {
    if (index < 0 || index >= contentsRows.length) {
      return;
    }

    contentsListRef.current?.scrollToOffset({
      offset: Math.max(0, index * measuredLength),
      animated: true,
    });
  };

  const openChapterSearchResult = (result: ReaderSearchResult, index: number) => {
    if (result.chapterId == null || result.occurrenceIndex == null) {
      return false;
    }

    setReaderSearchActiveResultIndex(index);
    requestReaderSearchAutoJump({
      chapterId: result.chapterId,
      query: readerSearchStoreQuery,
      occurrenceIndex: result.occurrenceIndex,
      immediate: result.chapterId === currentOfflineChapterId,
    });
    if (result.chapterId !== currentOfflineChapterId) {
      loadOfflineChapter(result.chapterId);
    }
    return true;
  };

  const jumpSearchResult = (direction: 1 | -1) => {
    if (readerSearchScope !== 'chapters') {
      jumpReaderSearchResult(direction);
      return;
    }

    if (readerSearchResults.length === 0) {
      return;
    }

    const nextIndex =
      readerSearchActiveResultIndex == null
        ? direction > 0
          ? 0
          : readerSearchResults.length - 1
        : (readerSearchActiveResultIndex + direction + readerSearchResults.length) %
          readerSearchResults.length;
    const result = readerSearchResults[nextIndex];

    if (!openChapterSearchResult(result, nextIndex)) {
      setReaderSearchActiveResultIndex(nextIndex);
    }
  };

  return (
    <>
      <View style={[styles.container, { bottom: toolbarBottom }]}>
        {moreMenu && (
          <>
            {currentContentSource === 'remote' ? (
              <ToolbarButton
                accessibilityLabel="Download page for offline reading. Long press to edit page roles."
                onPress={() => startDownloadFromCurrentPage(false)}
                onLongPress={() => startDownloadFromCurrentPage(true)}
                delayLongPress={250}
                style={styles.fab}
              >
                <Text style={styles.label}>{downloadLabel}</Text>
              </ToolbarButton>
            ) : (
              <>
                <ToolbarButton
                  accessibilityLabel="Go to previous offline chapter"
                  disabled={!previousChapter}
                  onPress={() => {
                    if (previousChapter) {
                      loadOfflineChapter(previousChapter.id);
                    }
                  }}
                  style={[styles.fab, !previousChapter && styles.fabDisabled]}
                >
                  <Text style={styles.label}>Prev</Text>
                </ToolbarButton>
                <ToolbarButton
                  accessibilityLabel="Open offline chapter contents"
                  disabled={!currentStory}
                  onPress={() => {
                    if (currentStory) {
                      setContentsVisible(true);
                    }
                  }}
                  style={[styles.fab, !currentStory && styles.fabDisabled]}
                >
                  <Text style={styles.label}>TOC</Text>
                </ToolbarButton>
                <ToolbarButton
                  accessibilityLabel="Go to next offline chapter"
                  disabled={!nextChapter}
                  onPress={() => {
                    if (nextChapter) {
                      loadOfflineChapter(nextChapter.id);
                    }
                  }}
                  style={[styles.fab, !nextChapter && styles.fabDisabled]}
                >
                  <Text style={styles.label}>Next</Text>
                </ToolbarButton>
              </>
            )}
            <ToolbarButton
              accessibilityLabel="Search current reading"
              onPress={() => {
                setReaderSearchQuery(readerSearchStoreQuery);
                setReaderSearchVisible(true);
              }}
              style={styles.fab}
            >
              <FontAwesome6 name="magnifying-glass" size={15} color={theme.colors.text} />
            </ToolbarButton>
            <ToolbarButton
              accessibilityLabel={`Switch to ${nextThemeMode} mode`}
              onPress={() => setThemeMode(nextThemeMode)}
              style={styles.fab}
            >
              <FontAwesome6 name="circle-half-stroke" size={16} color={theme.colors.text} />
            </ToolbarButton>
            <ToolbarButton accessibilityLabel="Reload page" onPress={reloadPage} style={styles.fab}>
              <Text style={styles.iconLabel}>{'↻'}</Text>
            </ToolbarButton>
            <ToolbarButton onPress={decreaseFont} style={styles.fab}>
              <Text style={styles.label}>{'A-'}</Text>
            </ToolbarButton>
            <ToolbarButton onPress={resetFont} style={styles.fab}>
              <Text style={styles.label}>{'A'}</Text>
            </ToolbarButton>
            <ToolbarButton onPress={increaseFont} style={styles.fab}>
              <Text style={styles.label}>{'A+'}</Text>
            </ToolbarButton>
          </>
        )}
        {readerSearchResults.length > 0 && (
          <>
            <ToolbarButton
              accessibilityLabel="Go to previous search match"
              onPress={() => jumpSearchResult(-1)}
              style={styles.fab}
            >
              <FontAwesome6 name="chevron-up" size={14} color={theme.colors.text} />
            </ToolbarButton>
            <ToolbarButton
              accessibilityLabel="Show last search results"
              onPress={() => {
                setReaderSearchQuery(readerSearchStoreQuery);
                setReaderSearchVisible(true);
              }}
              style={styles.fab}
            >
              <Text style={styles.label}>
                {readerSearchActiveResultIndex == null
                  ? readerSearchResults.length
                  : `${readerSearchActiveResultIndex + 1}/${readerSearchResults.length}`}
              </Text>
            </ToolbarButton>
            <ToolbarButton
              accessibilityLabel="Go to next search match"
              onPress={() => jumpSearchResult(1)}
              style={styles.fab}
            >
              <FontAwesome6 name="chevron-down" size={14} color={theme.colors.text} />
            </ToolbarButton>
          </>
        )}
        <ToolbarButton
          accessibilityLabel={moreMenu ? 'Collapse reader menu' : 'Expand reader menu'}
          onPress={toggleMoreMenu}
          style={styles.burgerFab}
        >
          <Text style={[styles.burgerLabel, moreMenu && styles.burgerLabelOpen]}>≡</Text>
        </ToolbarButton>
      </View>

      <Modal
        animationType="slide"
        transparent
        visible={contentsVisible}
        onRequestClose={() => setContentsVisible(false)}
      >
        <View style={styles.modalLayer}>
          <Pressable style={styles.modalBackdrop} onPress={() => setContentsVisible(false)} />
          <View style={[styles.contentsSheet, { paddingBottom: sheetBottomPadding }]}>
            <View style={styles.contentsHeader}>
              <Text style={styles.contentsEyebrow}>Contents</Text>
              <View style={styles.contentsHeaderTopRow}>
                <Text numberOfLines={1} style={styles.contentsTitle}>
                  {currentStory?.name ?? 'Contents'}
                </Text>
                <Pressable onPress={() => setContentsVisible(false)} style={styles.contentsClose}>
                  <Text style={styles.contentsCloseLabel}>Close</Text>
                </Pressable>
              </View>
              <Text style={styles.contentsSummary}>{contentsSummaryLabel}</Text>
              <View style={styles.contentsSearchWrap}>
                <TextInput
                  value={contentsSearchQuery}
                  onChangeText={setContentsSearchQuery}
                  onBlur={() => {
                    setTimeout(() => setContentsSearchFocused(false), 120);
                  }}
                  onFocus={() => {
                    setContentsSearchFocused(true);
                    void refreshContentsSearchSuggestions();
                  }}
                  placeholder="Search title, URL, or full text"
                  placeholderTextColor={theme.colors.inputPlaceholder}
                  style={styles.contentsSearchInput}
                />
                {!!contentsSearchQuery && (
                  <Pressable
                    accessibilityLabel="Clear search"
                    onPress={() => setContentsSearchQuery('')}
                    style={styles.contentsClearButton}
                  >
                    <FontAwesome6 name="xmark" size={12} color={theme.colors.textAccent} />
                  </Pressable>
                )}
              </View>
              {contentsSearchFocused &&
                !contentsSearchQuery.trim() &&
                contentsSearchSuggestions.length > 0 && (
                  <View style={styles.searchSuggestionRow}>
                    {contentsSearchSuggestions.map((suggestion, index) => (
                      <Pressable
                        key={suggestion.id}
                        onPressIn={() => {
                          setContentsSearchQuery(suggestion.query);
                          setContentsSearchFocused(false);
                        }}
                        style={styles.searchSuggestionPill}
                      >
                        <Text numberOfLines={1} style={styles.searchSuggestionText}>
                          {index === 0 ? 'Recent' : 'Top'}: {suggestion.query}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              <View style={styles.contentsSegmentWrap}>
                <SegmentedControl
                  accessibilityLabel="Offline contents filters"
                  compact
                  onChange={(key) => setContentsFilterKey(key as ContentsFilterKey)}
                  options={CONTENTS_FILTER_OPTIONS}
                  selectedKey={contentsFilterKey}
                />
              </View>
              <View style={styles.contentsJumpRow}>
                <Pressable onPress={() => scrollContentsToIndex(0)} style={styles.contentsJumpPill}>
                  <Text style={styles.contentsJumpLabel}>Top</Text>
                </Pressable>
                <Pressable
                  disabled={contentsJumpTargets.currentIndex < 0}
                  onPress={() => scrollContentsToIndex(contentsJumpTargets.currentIndex)}
                  style={[
                    styles.contentsJumpPill,
                    contentsJumpTargets.currentIndex < 0 && styles.contentsJumpPillDisabled,
                  ]}
                >
                  <Text style={styles.contentsJumpLabel}>Current</Text>
                </Pressable>
              </View>
              {!!contentsBucketActions.length && (
                <View style={styles.contentsBucketRow}>
                  {contentsBucketActions.map((bucket) => (
                    <Pressable
                      key={bucket.label}
                      onPress={() => scrollContentsToIndex(bucket.index)}
                      style={styles.contentsBucketPill}
                    >
                      <Text style={styles.contentsBucketLabel}>{bucket.label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
            <FlatList
              ref={contentsListRef}
              data={contentsRows}
              keyExtractor={(item) =>
                `${item.chapter.id}:${item.textMatch?.occurrenceIndex ?? 'title'}`
              }
              contentContainerStyle={styles.contentsList}
              getItemLayout={(_, index) => ({
                length: ESTIMATED_CONTENT_ROW_HEIGHT,
                offset: ESTIMATED_CONTENT_ROW_HEIGHT * index,
                index,
              })}
              initialNumToRender={24}
              maxToRenderPerBatch={32}
              removeClippedSubviews
              windowSize={10}
              onScrollToIndexFailed={({ index, averageItemLength }) => {
                requestAnimationFrame(() =>
                  scrollContentsToIndex(
                    Math.min(index, contentsRows.length - 1),
                    averageItemLength || ESTIMATED_CONTENT_ROW_HEIGHT,
                  ),
                );
              }}
              renderItem={({ item }) => {
                const active = item.chapter.id === currentOfflineChapterId;
                return (
                  <Pressable
                    onPress={() => {
                      setContentsVisible(false);
                      if (item.textMatch) {
                        const chapterSearchResults = buildChapterSearchResults(contentsRows);
                        const activeSearchResultIndex = chapterSearchResults.findIndex(
                          (result) =>
                            result.chapterId === item.chapter.id &&
                            result.occurrenceIndex === item.textMatch?.occurrenceIndex,
                        );
                        setReaderChapterSearchResults(
                          contentsSearchQuery,
                          chapterSearchResults,
                          activeSearchResultIndex >= 0 ? activeSearchResultIndex : null,
                        );
                        requestReaderSearchAutoJump({
                          chapterId: item.chapter.id,
                          query: contentsSearchQuery,
                          occurrenceIndex: item.textMatch.occurrenceIndex,
                          immediate: item.chapter.id === currentOfflineChapterId,
                        });
                      }
                      if (item.chapter.id !== currentOfflineChapterId) {
                        loadOfflineChapter(item.chapter.id);
                      }
                    }}
                    style={[styles.contentsRow, active && styles.contentsRowActive]}
                  >
                    <View style={styles.contentsRowContent}>
                      <Text
                        style={[styles.contentsRowText, active && styles.contentsRowTextActive]}
                      >
                        {item.chapter.chapterName}
                      </Text>
                      <Text numberOfLines={1} style={styles.contentsRowMeta}>
                        {item.textMatch
                          ? `${item.textMatch.matchType} text match`
                          : active
                            ? 'Current chapter'
                            : item.chapter.chapterOrder != null
                              ? `Chapter ${item.chapter.chapterOrder}`
                              : item.chapter.chapterUrl}
                      </Text>
                      {!!item.textMatch && (
                        <Text numberOfLines={2} style={styles.contentsRowSnippet}>
                          {item.textMatch.snippet}
                        </Text>
                      )}
                    </View>
                    <View
                      style={[styles.contentsStatusPill, active && styles.contentsStatusPillActive]}
                    >
                      <Text style={styles.contentsStatusLabel}>{active ? 'Reading' : 'Open'}</Text>
                    </View>
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View style={styles.contentsEmptyState}>
                  <Text style={styles.contentsEmptyTitle}>No chapters match this view</Text>
                  <Text style={styles.contentsEmptyText}>
                    Try another filter, clear the search, or switch back to All.
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent
        visible={readerSearchVisible}
        onRequestClose={() => setReaderSearchVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalLayer}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setReaderSearchVisible(false)} />
          <View style={[styles.searchSheet, { paddingBottom: sheetBottomPadding }]}>
            <View style={styles.contentsHeader}>
              <Text style={styles.contentsEyebrow}>Reader Search</Text>
              <View style={styles.contentsHeaderTopRow}>
                <Text numberOfLines={1} style={styles.contentsTitle}>
                  {readerSearchScope === 'chapters' ? 'Chapter results' : 'Current reading'}
                </Text>
                <Pressable
                  onPress={() => setReaderSearchVisible(false)}
                  style={styles.contentsClose}
                >
                  <Text style={styles.contentsCloseLabel}>Close</Text>
                </Pressable>
              </View>
              <View style={styles.contentsSearchWrap}>
                <TextInput
                  autoFocus
                  value={readerSearchQuery}
                  onChangeText={setReaderSearchQuery}
                  onBlur={() => {
                    setTimeout(() => setReaderSearchFocused(false), 120);
                  }}
                  onFocus={() => {
                    setReaderSearchFocused(true);
                    void refreshReaderSearchSuggestions();
                  }}
                  placeholder="Search Chinese or Han-Viet"
                  placeholderTextColor={theme.colors.inputPlaceholder}
                  style={styles.contentsSearchInput}
                />
                {!!readerSearchQuery && (
                  <Pressable
                    accessibilityLabel="Clear search"
                    onPress={() => setReaderSearchQuery('')}
                    style={styles.contentsClearButton}
                  >
                    <FontAwesome6 name="xmark" size={12} color={theme.colors.textAccent} />
                  </Pressable>
                )}
              </View>
              {readerSearchFocused &&
                !readerSearchQuery.trim() &&
                readerSearchSuggestions.length > 0 && (
                  <View style={styles.searchSuggestionRow}>
                    {readerSearchSuggestions.map((suggestion, index) => (
                      <Pressable
                        key={suggestion.id}
                        onPressIn={() => {
                          setReaderSearchQuery(suggestion.query);
                          setReaderSearchFocused(false);
                        }}
                        style={styles.searchSuggestionPill}
                      >
                        <Text numberOfLines={1} style={styles.searchSuggestionText}>
                          {index === 0 ? 'Recent' : 'Top'}: {suggestion.query}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              <Text style={styles.contentsSummary}>
                {readerSearchBusy
                  ? 'Searching'
                  : readerSearchQuery.trim()
                    ? `${readerSearchResults.length} match${readerSearchResults.length === 1 ? '' : 'es'}`
                    : 'Enter a word or phrase'}
              </Text>
            </View>
            <FlatList
              data={readerSearchResults}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.searchResultList}
              renderItem={({ item, index }) => (
                <Pressable
                  onPress={() => {
                    if (!openChapterSearchResult(item, index)) {
                      requestReaderSearchJump(item.id);
                    }
                    setReaderSearchVisible(false);
                  }}
                  style={[
                    styles.searchResultRow,
                    index === readerSearchActiveResultIndex && styles.searchResultRowActive,
                  ]}
                >
                  <View style={styles.contentsRowContent}>
                    <Text style={styles.searchResultLabel}>{item.chapterName ?? item.label}</Text>
                    {!!item.chapterName && (
                      <Text numberOfLines={1} style={styles.contentsRowMeta}>
                        {item.label}
                      </Text>
                    )}
                    <Text numberOfLines={3} style={styles.searchResultSnippet}>
                      {item.snippet}
                    </Text>
                  </View>
                  <FontAwesome6 name="location-dot" size={14} color={theme.colors.textAccent} />
                </Pressable>
              )}
              ListEmptyComponent={
                <View style={styles.contentsEmptyState}>
                  <Text style={styles.contentsEmptyTitle}>
                    {readerSearchQuery.trim() ? 'No matches found' : 'Search this reading'}
                  </Text>
                  <Text style={styles.contentsEmptyText}>No current results.</Text>
                </View>
              }
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      position: 'absolute',
      right: 14,
      alignItems: 'flex-end',
      zIndex: 20,
    },
    label: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.text,
      textTransform: 'uppercase',
    },
    iconLabel: {
      fontSize: 20,
      lineHeight: 20,
      fontWeight: '700',
      color: theme.colors.text,
    },
    fab: {
      minWidth: 48,
      height: 40,
      marginHorizontal: 0,
      marginTop: 8,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      ...theme.shadows.md,
    },
    fabDisabled: {
      opacity: 0.45,
    },
    burgerFab: {
      minWidth: 48,
      width: 48,
      height: 48,
      marginHorizontal: 0,
      marginTop: 10,
      borderRadius: 24,
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
      ...theme.shadows.md,
    },
    burgerLabel: {
      fontSize: 22,
      lineHeight: 22,
      fontWeight: '700',
      color: theme.colors.accentContrast,
      marginTop: -1,
    },
    burgerLabelOpen: {
      transform: [{ rotate: '90deg' }],
    },
    modalLayer: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: theme.colors.overlay,
    },
    modalBackdrop: {
      flex: 1,
    },
    contentsSheet: {
      maxHeight: '82%',
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: theme.radius.xxl,
      borderTopRightRadius: theme.radius.xxl,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.lg,
      paddingBottom: theme.spacing.xl,
    },
    searchSheet: {
      maxHeight: '70%',
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: theme.radius.xxl,
      borderTopRightRadius: theme.radius.xxl,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.lg,
      paddingBottom: theme.spacing.xl,
    },
    contentsHeader: {
      flexShrink: 0,
      marginBottom: theme.spacing.md,
    },
    contentsEyebrow: {
      ...theme.typography.monoCaps,
      color: theme.colors.textAccent,
    },
    contentsHeaderTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: theme.spacing.xs,
    },
    contentsTitle: {
      flex: 1,
      ...theme.typography.headline,
      color: theme.colors.text,
      marginRight: theme.spacing.md,
    },
    contentsClose: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.inputBackground,
    },
    contentsCloseLabel: {
      ...theme.typography.caption,
      color: theme.colors.textAccent,
    },
    contentsSummary: {
      marginTop: theme.spacing.sm,
      ...theme.typography.caption,
      color: theme.colors.textSubtle,
    },
    contentsSearchWrap: {
      marginTop: theme.spacing.md,
      position: 'relative',
    },
    contentsSearchInput: {
      height: 44,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.inputBorder,
      backgroundColor: theme.colors.inputBackground,
      paddingHorizontal: 14,
      paddingRight: 42,
      fontSize: 15,
      color: theme.colors.text,
    },
    contentsClearButton: {
      position: 'absolute',
      top: 7,
      right: 8,
      width: 30,
      height: 30,
      borderRadius: theme.radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceMuted,
    },
    searchSuggestionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: theme.spacing.sm,
    },
    searchSuggestionPill: {
      maxWidth: '100%',
      marginRight: theme.spacing.sm,
      marginBottom: theme.spacing.xs,
      borderRadius: theme.radius.full,
      borderWidth: 1,
      borderColor: theme.colors.borderMuted,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    searchSuggestionText: {
      ...theme.typography.caption,
      color: theme.colors.textAccent,
    },
    contentsSegmentWrap: {
      marginTop: theme.spacing.md,
      marginHorizontal: -4,
      alignItems: 'flex-start',
    },
    contentsJumpRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: theme.spacing.md,
    },
    contentsJumpPill: {
      marginRight: theme.spacing.sm,
      marginBottom: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.radius.full,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    contentsJumpPillDisabled: {
      opacity: 0.45,
    },
    contentsJumpLabel: {
      ...theme.typography.caption,
      color: theme.colors.text,
    },
    contentsBucketRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: theme.spacing.xs,
    },
    contentsBucketPill: {
      marginRight: theme.spacing.sm,
      marginBottom: theme.spacing.sm,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.accentSoft,
    },
    contentsBucketLabel: {
      ...theme.typography.caption,
      color: theme.colors.textAccent,
    },
    contentsList: {
      paddingBottom: theme.spacing.lg,
    },
    searchResultList: {
      paddingBottom: theme.spacing.lg,
    },
    searchResultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.inputBackground,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.sm,
    },
    searchResultRowActive: {
      borderColor: theme.colors.borderAccent,
      backgroundColor: theme.colors.accentSoft,
    },
    searchResultLabel: {
      ...theme.typography.caption,
      color: theme.colors.textAccent,
      textTransform: 'capitalize',
    },
    searchResultSnippet: {
      marginTop: 4,
      ...theme.typography.body,
      color: theme.colors.text,
    },
    contentsRowContent: {
      flex: 1,
      marginRight: theme.spacing.md,
    },
    contentsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.inputBackground,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.sm,
    },
    contentsRowActive: {
      backgroundColor: theme.colors.accentSoft,
      borderColor: theme.colors.borderAccent,
    },
    contentsRowText: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
    },
    contentsRowTextActive: {
      color: theme.colors.textAccent,
      fontWeight: '700',
    },
    contentsRowMeta: {
      marginTop: 2,
      ...theme.typography.caption,
      color: theme.colors.textMuted,
    },
    contentsRowSnippet: {
      marginTop: 4,
      ...theme.typography.caption,
      color: theme.colors.text,
    },
    contentsStatusPill: {
      borderRadius: theme.radius.full,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 6,
      backgroundColor: theme.colors.accentSoft,
    },
    contentsStatusPillActive: {
      backgroundColor: theme.colors.accent,
    },
    contentsStatusLabel: {
      ...theme.typography.caption,
      color: theme.colors.textAccent,
      textTransform: 'capitalize',
    },
    contentsEmptyState: {
      marginTop: theme.spacing.lg,
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.inputBackground,
      padding: theme.spacing.lg,
      borderWidth: 1,
      borderColor: theme.colors.borderMuted,
    },
    contentsEmptyTitle: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
    },
    contentsEmptyText: {
      marginTop: 6,
      ...theme.typography.body,
      color: theme.colors.textMuted,
    },
  });
