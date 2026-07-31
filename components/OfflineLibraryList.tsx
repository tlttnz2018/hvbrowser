import { FontAwesome6 } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  buildOfflineChapterSearchSignature,
  type EpubImportJobRecord,
  getOfflineChapterById,
  getOfflineChapterSearchCache,
  listOfflineChapterSearchSuggestions,
  type OfflineChapterRecord,
  type OfflineChapterSearchSuggestion,
  type OfflineStoryRecord,
  saveOfflineChapterSearchCache,
} from '../db/offline';
import { useAppStore } from '../stores/useAppStore';
import { type ReaderSearchResult, useWebPageStore } from '../stores/useWebPageStore';
import { absoluteFill, Theme, useTheme } from '../theme';
import {
  findOfflineChapterTextMatches,
  flattenOfflineChapterTextMatchesByChapter,
  groupOfflineChapterSearchCacheMatches,
  type OfflineChapterTextMatch,
  type OfflineChapterTextMatchesByChapter,
} from '../utils/offline-chapter-search';
import { getBottomInsetWithSystemBarPadding } from '../utils/safe-area';

type OfflineViewMode = 'grouped' | 'chapters';
type OfflineFilterKey = 'all' | 'downloading' | 'queued' | 'downloaded' | 'failed';
type OverlayKind = 'filter' | 'jump' | 'mode' | null;
type StoryOverlayKind = 'filter' | null;

interface OfflineLibraryListProps {
  headerComponent?: React.ReactNode;
  stickyHeaderComponent?: React.ReactNode;
  stories: OfflineStoryRecord[];
  chaptersByStory: Record<number, OfflineChapterRecord[]>;
  importJobs: EpubImportJobRecord[];
  activeDownloadId: number | null;
  queueCount: number;
  lastError: string | null;
  onRetryImportJob: (jobId: number) => Promise<void>;
  onRemoveImportJob: (jobId: number) => Promise<void>;
  onOpenChapter: (chapterId: number) => void;
  onRemoveChapter: (chapterId: number) => Promise<void>;
  onRemoveStory: (storyId: number) => Promise<void>;
  onMaintainDatabase: () => void;
}

interface SwipeToDeleteCardProps {
  disabled?: boolean;
  gap?: boolean;
  onDelete: () => void;
  children: React.ReactNode;
}

type StoryRow = {
  id: string;
  kind: 'story';
  story: OfflineStoryRecord;
  chapterCount: number;
  downloadedCount: number;
  failedCount: number;
  queuedCount: number;
};

type ChapterRow = {
  id: string;
  kind: 'chapter';
  chapter: OfflineChapterRecord;
  storyName: string;
  textMatch: OfflineChapterTextMatch | null;
};

type StickyRow = {
  id: 'sticky-header';
  kind: 'sticky-header';
};

type StoryListRow = StickyRow | StoryRow;
type ChapterListRow = StickyRow | ChapterRow;

const FILTER_OPTIONS: Array<{ key: OfflineFilterKey; label: string }> = [
  { key: 'all', label: 'All statuses' },
  { key: 'downloading', label: 'Downloading' },
  { key: 'queued', label: 'Queued' },
  { key: 'downloaded', label: 'Downloaded' },
  { key: 'failed', label: 'Failed' },
];

const MODE_OPTIONS: Array<{ key: OfflineViewMode; label: string; description: string }> = [
  {
    key: 'grouped',
    label: 'Stories',
    description: 'Show stories only, then open a dedicated chapter browser.',
  },
  {
    key: 'chapters',
    label: 'All chapters',
    description: 'Browse one flat virtualized chapter list across stories.',
  },
];
const CHAPTER_SEARCH_BATCH_SIZE = 12;
const EMPTY_CHAPTERS: OfflineChapterRecord[] = [];

function statusColor(theme: Theme, status: OfflineChapterRecord['downloadStatus']) {
  if (status === 'downloaded') return theme.colors.accent;
  if (status === 'failed') return theme.colors.surfaceDanger;
  return theme.colors.surfaceAccentStrong;
}

function matchesChapterFilter(chapter: OfflineChapterRecord, filterKey: OfflineFilterKey) {
  return filterKey === 'all' || chapter.downloadStatus === filterKey;
}

function toReaderSearchMatchType(matchType: OfflineChapterTextMatch['matchType']) {
  return matchType === 'Chinese' ? 'chinese' : 'han-viet';
}

function buildChapterSearchResults(rows: ChapterRow[]): ReaderSearchResult[] {
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

function buildChapterRows(
  chapter: OfflineChapterRecord,
  storyName: string,
  rawQuery: string,
  textMatches: OfflineChapterTextMatch[],
): ChapterRow[] {
  const query = rawQuery.trim();

  if (!query) {
    return [
      {
        id: `chapter-${chapter.id}`,
        kind: 'chapter',
        chapter,
        storyName,
        textMatch: null,
      },
    ];
  }

  const metadataMatch = `${storyName} ${chapter.chapterName} ${chapter.chapterUrl}`
    .toLowerCase()
    .includes(query.toLowerCase());

  if (textMatches.length > 0) {
    return textMatches.map((textMatch) => ({
      id: `chapter-${chapter.id}-match-${textMatch.occurrenceIndex}`,
      kind: 'chapter',
      chapter,
      storyName,
      textMatch,
    }));
  }

  if (!metadataMatch) {
    return [];
  }

  return [
    {
      id: `chapter-${chapter.id}`,
      kind: 'chapter',
      chapter,
      storyName,
      textMatch: null,
    },
  ];
}

function SwipeToDeleteCard({
  disabled = false,
  gap = false,
  onDelete,
  children,
}: SwipeToDeleteCardProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const translateX = useRef(new Animated.Value(0)).current;

  const resetPosition = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 0,
    }).start();
  }, [translateX]);

  const removeWithAnimation = useCallback(() => {
    Animated.timing(translateX, {
      toValue: -132,
      duration: 140,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        onDelete();
      } else {
        resetPosition();
      }
    });
  }, [onDelete, resetPosition, translateX]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          !disabled &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) &&
          gestureState.dx < -8,
        onPanResponderMove: (_, gestureState) => {
          if (disabled) return;
          translateX.setValue(Math.max(gestureState.dx, -132));
        },
        onPanResponderRelease: (_, gestureState) => {
          if (disabled) return;
          if (gestureState.dx < -88) {
            removeWithAnimation();
          } else {
            resetPosition();
          }
        },
        onPanResponderTerminate: resetPosition,
      }),
    [disabled, removeWithAnimation, resetPosition, translateX],
  );

  return (
    <View style={gap ? styles.swipeGap : undefined}>
      <View style={[styles.deleteBackground, disabled && styles.deleteBackgroundDisabled]}>
        <Text style={styles.deleteLabel}>Delete</Text>
      </View>
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...(disabled ? {} : panResponder.panHandlers)}
      >
        {children}
      </Animated.View>
    </View>
  );
}

function SheetOption({
  label,
  description,
  selected = false,
  onPress,
}: {
  label: string;
  description?: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <Pressable
      onPress={onPress}
      style={[styles.sheetOption, selected && styles.sheetOptionSelected]}
    >
      <Text style={[styles.sheetOptionTitle, selected && styles.sheetOptionTitleSelected]}>
        {label}
      </Text>
      {!!description && <Text style={styles.sheetOptionDescription}>{description}</Text>}
    </Pressable>
  );
}

function CompactSheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = getBottomInsetWithSystemBarPadding(insets.bottom);
  const sheetBottomPadding = bottomInset + theme.spacing.lg;
  const styles = createStyles(theme);

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.layer}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: sheetBottomPadding }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} style={styles.sheetClose}>
              <Text style={styles.sheetCloseLabel}>Close</Text>
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

export default function OfflineLibraryList({
  headerComponent,
  stickyHeaderComponent,
  stories,
  chaptersByStory,
  importJobs,
  activeDownloadId,
  queueCount,
  lastError,
  onRetryImportJob,
  onRemoveImportJob,
  onOpenChapter,
  onRemoveChapter,
  onRemoveStory,
  onMaintainDatabase,
}: OfflineLibraryListProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = getBottomInsetWithSystemBarPadding(insets.bottom);
  const styles = createStyles(theme);
  const listContentStyle = [styles.content, { paddingBottom: bottomInset + theme.spacing.xl }];
  const dictionary = useAppStore((state) => state.dictionary);
  const currentOfflineChapterId = useAppStore((state) => state.currentOfflineChapterId);
  const requestReaderSearchAutoJump = useWebPageStore((state) => state.requestReaderSearchAutoJump);
  const setReaderChapterSearchResults = useWebPageStore(
    (state) => state.setReaderChapterSearchResults,
  );
  const listRef = useRef<FlatList<ChapterListRow>>(null);
  const storyListRef = useRef<FlatList<StoryListRow>>(null);
  const storyChapterListRef = useRef<FlatList<ChapterRow>>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<OfflineViewMode>('grouped');
  const [filterKey, setFilterKey] = useState<OfflineFilterKey>('all');
  const [overlayKind, setOverlayKind] = useState<OverlayKind>(null);
  const [storyOverlayKind, setStoryOverlayKind] = useState<StoryOverlayKind>(null);
  const [activeStoryId, setActiveStoryId] = useState<number | null>(null);
  const [storySearchQuery, setStorySearchQuery] = useState('');
  const [storySearchFocused, setStorySearchFocused] = useState(false);
  const [storySearchSuggestions, setStorySearchSuggestions] = useState<
    OfflineChapterSearchSuggestion[]
  >([]);
  const [storyLastOnly, setStoryLastOnly] = useState(false);
  const [chapterTextMatches, setChapterTextMatches] = useState<OfflineChapterTextMatchesByChapter>(
    {},
  );
  const [storyChapterTextMatches, setStoryChapterTextMatches] =
    useState<OfflineChapterTextMatchesByChapter>({});
  const importJobsVisible = importJobs.filter(
    (job) =>
      job.status !== 'completed' || !!job.errorMessage || job.importedChapters < job.totalChapters,
  );

  const summaryLabel = useMemo(() => {
    if (activeDownloadId) {
      return `${queueCount} queued`;
    }

    if (queueCount > 0) {
      return `${queueCount} queued`;
    }

    return 'Queue idle';
  }, [activeDownloadId, queueCount]);

  const rawSearchQuery = searchQuery.trim();
  const normalizedQuery = rawSearchQuery.toLowerCase();
  const activeStory = stories.find((story) => story.id === activeStoryId) ?? null;
  const rawStorySearchQuery = storySearchQuery.trim();
  const activeStoryAllChapters = activeStory
    ? (chaptersByStory[activeStory.id] ?? EMPTY_CHAPTERS)
    : EMPTY_CHAPTERS;
  const activeStorySearchSignature = useMemo(
    () => buildOfflineChapterSearchSignature(activeStoryAllChapters),
    [activeStoryAllChapters],
  );
  const refreshStorySearchSuggestions = useCallback(async () => {
    if (!activeStory) {
      setStorySearchSuggestions([]);
      return;
    }

    const suggestions = await listOfflineChapterSearchSuggestions(activeStory.id);
    setStorySearchSuggestions(suggestions);
  }, [activeStory]);
  const activeStoryLastOpenedChapterId = useMemo(() => {
    if (!activeStory) {
      return null;
    }

    const storyChapters = chaptersByStory[activeStory.id] ?? [];
    return storyChapters.reduce<number | null>((latestId, chapter) => {
      if (!chapter.lastOpenedAt) {
        return latestId;
      }

      if (latestId == null) {
        return chapter.id;
      }

      const latestChapter = storyChapters.find((entry) => entry.id === latestId);
      if (!latestChapter?.lastOpenedAt) {
        return chapter.id;
      }

      return latestChapter.lastOpenedAt.localeCompare(chapter.lastOpenedAt) >= 0
        ? latestId
        : chapter.id;
    }, null);
  }, [activeStory, chaptersByStory]);

  const storyRows = useMemo<StoryRow[]>(() => {
    return stories
      .map((story) => {
        const chapters = chaptersByStory[story.id] ?? [];
        const chapterCount = chapters.length;
        const downloadedCount = chapters.filter(
          (chapter) => chapter.downloadStatus === 'downloaded',
        ).length;
        const failedCount = chapters.filter(
          (chapter) => chapter.downloadStatus === 'failed',
        ).length;
        const queuedCount = chapters.filter(
          (chapter) =>
            chapter.downloadStatus === 'queued' || chapter.downloadStatus === 'downloading',
        ).length;

        return {
          id: `story-${story.id}`,
          kind: 'story' as const,
          story,
          chapterCount,
          downloadedCount,
          failedCount,
          queuedCount,
        };
      })
      .filter((row) => {
        if (!normalizedQuery) {
          return true;
        }

        return (
          row.story.name.toLowerCase().includes(normalizedQuery) ||
          (chaptersByStory[row.story.id] ?? []).some((chapter) =>
            `${chapter.chapterName} ${chapter.chapterUrl}`.toLowerCase().includes(normalizedQuery),
          )
        );
      });
  }, [chaptersByStory, normalizedQuery, stories]);

  const chapterRows = useMemo<ChapterRow[]>(() => {
    const rows: ChapterRow[] = [];

    stories.forEach((story) => {
      (chaptersByStory[story.id] ?? []).forEach((chapter) => {
        if (!matchesChapterFilter(chapter, filterKey)) {
          return;
        }

        const chapterRowsForChapter = buildChapterRows(
          chapter,
          story.name,
          rawSearchQuery,
          chapterTextMatches[chapter.id] ?? [],
        );
        rows.push(...chapterRowsForChapter);
      });
    });

    return rows;
  }, [chapterTextMatches, chaptersByStory, filterKey, rawSearchQuery, stories]);

  const activeStoryChapterRows = useMemo<ChapterRow[]>(() => {
    if (!activeStory) {
      return [];
    }

    return (chaptersByStory[activeStory.id] ?? [])
      .filter((chapter) =>
        storyLastOnly
          ? chapter.id === activeStoryLastOpenedChapterId
          : matchesChapterFilter(chapter, filterKey),
      )
      .reduce<ChapterRow[]>((rows, chapter) => {
        const chapterRowsForChapter = buildChapterRows(
          chapter,
          activeStory.name,
          rawStorySearchQuery,
          storyChapterTextMatches[chapter.id] ?? [],
        );
        rows.push(...chapterRowsForChapter);
        return rows;
      }, []);
  }, [
    activeStory,
    chaptersByStory,
    filterKey,
    rawStorySearchQuery,
    storyChapterTextMatches,
    storyLastOnly,
    activeStoryLastOpenedChapterId,
  ]);

  useEffect(() => {
    if (viewMode !== 'chapters' || !rawSearchQuery) {
      setChapterTextMatches({});
      return;
    }

    let cancelled = false;
    setChapterTextMatches({});

    const chaptersToSearch = stories.flatMap((story) =>
      (chaptersByStory[story.id] ?? []).filter((chapter) =>
        matchesChapterFilter(chapter, filterKey),
      ),
    );

    void (async () => {
      let pendingMatches: OfflineChapterTextMatchesByChapter = {};

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

        const textMatches = findOfflineChapterTextMatches(fullChapter, rawSearchQuery, dictionary);
        if (textMatches.length === 0) {
          continue;
        }

        pendingMatches[chapter.id] = textMatches;
        if (Object.keys(pendingMatches).length >= CHAPTER_SEARCH_BATCH_SIZE) {
          const nextMatches = pendingMatches;
          pendingMatches = {};
          setChapterTextMatches((currentMatches) => ({ ...currentMatches, ...nextMatches }));
        }
      }

      if (!cancelled && Object.keys(pendingMatches).length > 0) {
        setChapterTextMatches((currentMatches) => ({ ...currentMatches, ...pendingMatches }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chaptersByStory, dictionary, filterKey, rawSearchQuery, stories, viewMode]);

  useEffect(() => {
    if (activeStory) {
      void refreshStorySearchSuggestions();
    } else {
      setStorySearchSuggestions([]);
    }
  }, [activeStory, refreshStorySearchSuggestions]);

  useEffect(() => {
    if (!activeStory || !rawStorySearchQuery) {
      setStoryChapterTextMatches({});
      return;
    }

    let cancelled = false;
    setStoryChapterTextMatches({});

    const storyChapters = chaptersByStory[activeStory.id] ?? [];
    const chaptersToSearch = storyChapters.filter((chapter) =>
      storyLastOnly
        ? chapter.id === activeStoryLastOpenedChapterId
        : matchesChapterFilter(chapter, filterKey),
    );

    void (async () => {
      const cachedSearch = await getOfflineChapterSearchCache(
        activeStory.id,
        rawStorySearchQuery,
        activeStorySearchSignature,
      );
      if (cancelled) {
        return;
      }

      if (cachedSearch) {
        setStoryChapterTextMatches(groupOfflineChapterSearchCacheMatches(cachedSearch.matches));
        await refreshStorySearchSuggestions();
        return;
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

        const textMatches = findOfflineChapterTextMatches(
          fullChapter,
          rawStorySearchQuery,
          dictionary,
        );
        if (textMatches.length === 0) {
          continue;
        }

        pendingMatches[chapter.id] = textMatches;
        collectedMatches[chapter.id] = textMatches;
        if (Object.keys(pendingMatches).length >= CHAPTER_SEARCH_BATCH_SIZE) {
          const nextMatches = pendingMatches;
          pendingMatches = {};
          setStoryChapterTextMatches((currentMatches) => ({
            ...currentMatches,
            ...nextMatches,
          }));
        }
      }

      if (!cancelled && Object.keys(pendingMatches).length > 0) {
        setStoryChapterTextMatches((currentMatches) => ({
          ...currentMatches,
          ...pendingMatches,
        }));
      }

      if (!cancelled && !storyLastOnly && filterKey === 'all') {
        await saveOfflineChapterSearchCache({
          storyId: activeStory.id,
          rawQuery: rawStorySearchQuery,
          matches: flattenOfflineChapterTextMatchesByChapter(collectedMatches),
          chapterSignature: activeStorySearchSignature,
        });
        if (!cancelled) {
          await refreshStorySearchSuggestions();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeStory,
    activeStoryLastOpenedChapterId,
    activeStorySearchSignature,
    chaptersByStory,
    dictionary,
    filterKey,
    refreshStorySearchSuggestions,
    rawStorySearchQuery,
    storyLastOnly,
  ]);

  const jumpTargets = useMemo(() => {
    const rows = chapterRows;
    const activeIndex = rows.findIndex((row) => row.chapter.id === activeDownloadId);
    const failedIndex = rows.findIndex((row) => row.chapter.downloadStatus === 'failed');

    return { activeIndex, failedIndex };
  }, [activeDownloadId, chapterRows]);

  const activeStoryJumpTargets = useMemo(() => {
    const activeIndex = activeStoryChapterRows.findIndex(
      (row) => row.chapter.id === activeDownloadId,
    );
    const failedIndex = activeStoryChapterRows.findIndex(
      (row) => row.chapter.downloadStatus === 'failed',
    );
    const lastOpenedIndex = activeStoryChapterRows.reduce((bestIndex, row, index, rows) => {
      const currentLastOpenedAt = row.chapter.lastOpenedAt;
      if (!currentLastOpenedAt) {
        return bestIndex;
      }

      if (bestIndex < 0) {
        return index;
      }

      const bestLastOpenedAt = rows[bestIndex]?.chapter.lastOpenedAt;
      if (!bestLastOpenedAt) {
        return index;
      }

      return bestLastOpenedAt.localeCompare(currentLastOpenedAt) >= 0 ? bestIndex : index;
    }, -1);

    return { activeIndex, failedIndex, lastOpenedIndex };
  }, [activeDownloadId, activeStoryChapterRows]);

  const scrollToMainChapterIndex = (index: number) => {
    if (viewMode === 'grouped') {
      if (chapterRows.length === 0 || index < 0 || index >= chapterRows.length) return;
      const targetStoryId = chapterRows[index]?.chapter.storyId;
      if (targetStoryId) {
        setActiveStoryId(targetStoryId);
        setStorySearchQuery('');
      }
      return;
    }

    if (index < 0 || index >= chapterRows.length) return;
    listRef.current?.scrollToIndex({ index: index + 1, animated: true, viewPosition: 0.1 });
  };

  const scrollToActiveStoryIndex = (index: number) => {
    if (index < 0 || index >= activeStoryChapterRows.length) return;
    storyChapterListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.1 });
  };

  const openStoryBrowser = (storyId: number) => {
    setActiveStoryId(storyId);
    setStorySearchQuery('');
    setStoryLastOnly(false);
  };

  const closeStoryBrowser = () => {
    setActiveStoryId(null);
    setStorySearchQuery('');
    setStorySearchFocused(false);
    setStorySearchSuggestions([]);
    setStoryOverlayKind(null);
    setStoryLastOnly(false);
  };

  const scrollHeader = (
    <View style={styles.scrollHeader}>
      {headerComponent}
      {importJobsVisible.length > 0 && (
        <View style={styles.importJobList}>
          {importJobsVisible.map((job) => (
            <View key={job.id} style={styles.importJobCard}>
              <View style={styles.importJobTopRow}>
                <Text numberOfLines={1} style={styles.importJobTitle}>
                  {job.fileName}
                </Text>
                <Text style={styles.importJobStatus}>{job.status}</Text>
              </View>
              <Text style={styles.importJobMeta}>
                {job.totalChapters > 0
                  ? `${job.importedChapters}/${job.totalChapters} chapters imported`
                  : 'Preparing EPUB import'}
              </Text>
              {!!job.errorMessage && <Text style={styles.importJobError}>{job.errorMessage}</Text>}
              <View style={styles.importJobActions}>
                {job.status === 'failed' && (
                  <>
                    <Pressable
                      onPress={() => {
                        void onRetryImportJob(job.id);
                      }}
                      style={styles.importJobAction}
                    >
                      <Text style={styles.importJobActionLabel}>Retry</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        void onRemoveImportJob(job.id);
                      }}
                      style={styles.importJobAction}
                    >
                      <Text style={styles.importJobActionLabel}>Remove</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
      <Text style={styles.compactMeta}>
        {viewMode === 'grouped'
          ? `${storyRows.length} stories`
          : rawSearchQuery
            ? `${chapterRows.length} results`
            : `${chapterRows.length} chapters`}{' '}
        • {summaryLabel}
        {activeDownloadId ? ' • 1 active' : ''}
        {!!lastError ? ' • last run failed' : ''}
      </Text>
    </View>
  );

  const stickyControls = (
    <View style={styles.stickyControls}>
      {stickyHeaderComponent}
      <View style={styles.stickyControlsBody}>
        <View style={styles.searchWrap}>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={
              viewMode === 'grouped' ? 'Search stories or chapters' : 'Search chapters or full text'
            }
            placeholderTextColor={theme.colors.inputPlaceholder}
            style={styles.searchInput}
          />
          {!!searchQuery && (
            <Pressable
              accessibilityLabel="Clear search"
              onPress={() => setSearchQuery('')}
              style={styles.clearButton}
            >
              <FontAwesome6 name="xmark" size={12} color={theme.colors.textAccent} />
            </Pressable>
          )}
        </View>
        <View style={styles.toolbarButtonRow}>
          <Pressable onPress={() => setOverlayKind('mode')} style={styles.toolbarButton}>
            <Text style={styles.toolbarButtonLabel}>
              {viewMode === 'grouped' ? 'Stories' : 'All'}
            </Text>
          </Pressable>
          <Pressable onPress={() => setOverlayKind('filter')} style={styles.toolbarButton}>
            <Text style={styles.toolbarButtonLabel}>
              {filterKey === 'all' ? 'Filter' : 'Status'}
            </Text>
          </Pressable>
          <Pressable onPress={() => setOverlayKind('jump')} style={styles.toolbarButton}>
            <Text style={styles.toolbarButtonLabel}>Jump</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Clean up offline database"
            onPress={onMaintainDatabase}
            style={styles.toolbarButton}
          >
            <Text style={styles.toolbarButtonLabel}>DB</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  const storyListRows = useMemo<StoryListRow[]>(
    () => [{ id: 'sticky-header', kind: 'sticky-header' }, ...storyRows],
    [storyRows],
  );

  const chapterListRows = useMemo<ChapterListRow[]>(
    () => [{ id: 'sticky-header', kind: 'sticky-header' }, ...chapterRows],
    [chapterRows],
  );

  const renderStoryListRow = ({ item }: { item: StoryListRow }) => {
    if (item.kind === 'sticky-header') {
      return stickyControls;
    }

    return renderStoryRow({ item });
  };

  const renderChapterListRow = ({ item }: { item: ChapterListRow }) => {
    if (item.kind === 'sticky-header') {
      return stickyControls;
    }

    return renderChapterCard(item);
  };

  const renderStoryRow = ({ item }: { item: StoryRow }) => {
    const { story, chapterCount, downloadedCount, failedCount, queuedCount } = item;

    const confirmRemoveStory = () => {
      Alert.alert(
        'Remove offline book?',
        `${story.name}\nThis will delete all saved offline chapters for this story.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              void onRemoveStory(story.id);
            },
          },
        ],
      );
    };

    return (
      <SwipeToDeleteCard gap onDelete={confirmRemoveStory}>
        <Pressable onPress={() => openStoryBrowser(story.id)} style={styles.storyCard}>
          <View style={styles.storyHeader}>
            <View style={styles.storyHeaderText}>
              <Text numberOfLines={1} style={styles.storyTitle}>
                {story.name}
              </Text>
              <Text style={styles.storyMeta}>
                {chapterCount} chapters • {downloadedCount} saved
              </Text>
            </View>
            <Text style={styles.storyChevron}>›</Text>
          </View>
          <View style={styles.storyBadgeRow}>
            {queuedCount > 0 && (
              <View style={styles.storyBadge}>
                <Text style={styles.storyBadgeLabel}>{queuedCount} queued</Text>
              </View>
            )}
            {failedCount > 0 && (
              <View style={[styles.storyBadge, styles.storyBadgeDanger]}>
                <Text style={[styles.storyBadgeLabel, styles.storyBadgeDangerLabel]}>
                  {failedCount} failed
                </Text>
              </View>
            )}
          </View>
        </Pressable>
      </SwipeToDeleteCard>
    );
  };

  const renderChapterCard = (row: ChapterRow) => {
    const { chapter, storyName, textMatch } = row;
    const canOpen = chapter.downloadStatus === 'downloaded';

    const confirmRemoveChapter = () => {
      Alert.alert('Remove offline chapter?', chapter.chapterName, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void onRemoveChapter(chapter.id);
          },
        },
      ]);
    };

    return (
      <SwipeToDeleteCard gap onDelete={confirmRemoveChapter}>
        <TouchableOpacity
          activeOpacity={canOpen ? 0.75 : 1}
          disabled={!canOpen}
          onPress={() => {
            const query = activeStory ? storySearchQuery : searchQuery;
            if (textMatch) {
              const searchRows = activeStory ? activeStoryChapterRows : chapterRows;
              const chapterSearchResults = buildChapterSearchResults(searchRows);
              const activeSearchResultIndex = chapterSearchResults.findIndex(
                (result) =>
                  result.chapterId === chapter.id &&
                  result.occurrenceIndex === textMatch.occurrenceIndex,
              );
              setReaderChapterSearchResults(
                query,
                chapterSearchResults,
                activeSearchResultIndex >= 0 ? activeSearchResultIndex : null,
              );
              requestReaderSearchAutoJump({
                chapterId: chapter.id,
                query,
                occurrenceIndex: textMatch.occurrenceIndex,
                immediate: chapter.id === currentOfflineChapterId,
              });
            }
            closeStoryBrowser();
            if (chapter.id !== currentOfflineChapterId) {
              onOpenChapter(chapter.id);
            }
          }}
          style={[styles.chapterRow, !canOpen && styles.chapterRowDisabled]}
        >
          <View style={styles.chapterText}>
            <Text numberOfLines={1} style={styles.chapterTitle}>
              {chapter.chapterName}
            </Text>
            <Text numberOfLines={1} style={styles.chapterMeta}>
              {storyName}
            </Text>
            <Text numberOfLines={1} style={styles.chapterUrl}>
              {textMatch ? `${textMatch.matchType} text match` : chapter.chapterUrl}
            </Text>
            {!!textMatch && (
              <Text numberOfLines={2} style={styles.chapterSnippet}>
                {textMatch.snippet}
              </Text>
            )}
            {!!chapter.downloadError && (
              <Text numberOfLines={2} style={styles.chapterError}>
                {chapter.downloadError}
              </Text>
            )}
          </View>
          <View
            style={[
              styles.statusPill,
              { backgroundColor: statusColor(theme, chapter.downloadStatus) },
              chapter.id === activeDownloadId && styles.statusPillActive,
            ]}
          >
            <Text style={styles.statusText}>{chapter.downloadStatus}</Text>
          </View>
        </TouchableOpacity>
      </SwipeToDeleteCard>
    );
  };

  return (
    <View style={styles.container}>
      {viewMode === 'grouped' ? (
        <FlatList
          ref={storyListRef}
          data={storyListRows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={listContentStyle}
          ListHeaderComponent={scrollHeader}
          stickyHeaderIndices={[1]}
          initialNumToRender={18}
          maxToRenderPerBatch={24}
          removeClippedSubviews
          windowSize={10}
          renderItem={renderStoryListRow}
          ListFooterComponent={
            storyRows.length === 0 ? (
              stories.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>No offline stories yet</Text>
                  <Text style={styles.emptyText}>
                    Use the download button from the reader to save chapters, then open each story
                    in a focused chapter browser.
                  </Text>
                </View>
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>No stories match this search</Text>
                  <Text style={styles.emptyText}>
                    Try a shorter search, or switch to the all-chapters view.
                  </Text>
                </View>
              )
            ) : null
          }
        />
      ) : (
        <FlatList
          ref={listRef}
          data={chapterListRows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={listContentStyle}
          ListHeaderComponent={scrollHeader}
          stickyHeaderIndices={[1]}
          initialNumToRender={20}
          maxToRenderPerBatch={28}
          removeClippedSubviews
          windowSize={12}
          onScrollToIndexFailed={({ index }) => {
            requestAnimationFrame(() =>
              scrollToMainChapterIndex(Math.min(index - 1, chapterRows.length - 1)),
            );
          }}
          renderItem={renderChapterListRow}
          ListFooterComponent={
            chapterRows.length === 0 ? (
              stories.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>No offline stories yet</Text>
                  <Text style={styles.emptyText}>
                    Save some chapters first, then they will appear here.
                  </Text>
                </View>
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>No chapters match this view</Text>
                  <Text style={styles.emptyText}>
                    Try another status filter or clear the search query.
                  </Text>
                </View>
              )
            ) : null
          }
        />
      )}

      <CompactSheet
        visible={overlayKind === 'mode'}
        title="View mode"
        onClose={() => setOverlayKind(null)}
      >
        {MODE_OPTIONS.map((option) => (
          <SheetOption
            key={option.key}
            label={option.label}
            description={option.description}
            selected={viewMode === option.key}
            onPress={() => {
              setViewMode(option.key);
              setOverlayKind(null);
            }}
          />
        ))}
      </CompactSheet>

      <CompactSheet
        visible={overlayKind === 'filter'}
        title="Status filter"
        onClose={() => setOverlayKind(null)}
      >
        {FILTER_OPTIONS.map((option) => (
          <SheetOption
            key={option.key}
            label={option.label}
            selected={filterKey === option.key}
            onPress={() => {
              setFilterKey(option.key);
              setOverlayKind(null);
            }}
          />
        ))}
      </CompactSheet>

      <CompactSheet
        visible={overlayKind === 'jump'}
        title="Jump to"
        onClose={() => setOverlayKind(null)}
      >
        <SheetOption
          label="Top"
          description="Go back to the start of the current list."
          onPress={() => {
            if (viewMode === 'grouped') {
              storyListRef.current?.scrollToOffset({ offset: 0, animated: true });
            } else {
              listRef.current?.scrollToOffset({ offset: 0, animated: true });
            }
            setOverlayKind(null);
          }}
        />
        <SheetOption
          label="Active download"
          description={
            viewMode === 'grouped'
              ? 'Open the story that contains the active download.'
              : 'Jump to the active chapter row in the current list.'
          }
          selected={false}
          onPress={() => {
            scrollToMainChapterIndex(jumpTargets.activeIndex);
            setOverlayKind(null);
          }}
        />
        <SheetOption
          label="First failed"
          description={
            viewMode === 'grouped'
              ? 'Open the story that contains the first failed chapter in the current results.'
              : 'Jump to the first failed chapter row in the current list.'
          }
          selected={false}
          onPress={() => {
            scrollToMainChapterIndex(jumpTargets.failedIndex);
            setOverlayKind(null);
          }}
        />
      </CompactSheet>

      <Modal animationType="slide" visible={!!activeStory} onRequestClose={closeStoryBrowser}>
        <SafeAreaView
          style={[styles.storyBrowserScreen, { paddingTop: insets.top + theme.spacing.lg }]}
          edges={['left', 'right', 'bottom']}
        >
          <View style={styles.storyBrowserTopBar}>
            <Pressable onPress={closeStoryBrowser} style={styles.storyBrowserBack}>
              <Text style={styles.storyBrowserBackLabel}>Back</Text>
            </Pressable>
            <View style={styles.storyBrowserTitleWrap}>
              <Text numberOfLines={1} style={styles.storyBrowserTitle}>
                {activeStory?.name ?? ''}
              </Text>
              <Text style={styles.storyBrowserMeta}>
                {rawStorySearchQuery
                  ? `${activeStoryChapterRows.length} results`
                  : `${activeStoryChapterRows.length} chapters`}{' '}
                •{' '}
                {storyLastOnly
                  ? 'last opened only'
                  : filterKey === 'all'
                    ? 'all statuses'
                    : filterKey}
              </Text>
            </View>
            <Pressable
              onPress={() => setStoryOverlayKind('filter')}
              style={styles.storyBrowserFilter}
            >
              <Text style={styles.storyBrowserFilterLabel}>Filter</Text>
            </Pressable>
          </View>

          <View style={styles.searchWrap}>
            <TextInput
              value={storySearchQuery}
              onChangeText={(value) => {
                setStorySearchQuery(value);
                if (storyLastOnly) {
                  setStoryLastOnly(false);
                }
              }}
              onBlur={() => {
                setTimeout(() => setStorySearchFocused(false), 120);
              }}
              onFocus={() => {
                setStorySearchFocused(true);
                void refreshStorySearchSuggestions();
              }}
              placeholder="Search chapters or full text"
              placeholderTextColor={theme.colors.inputPlaceholder}
              style={styles.storySearchInput}
            />
            {!!storySearchQuery && (
              <Pressable
                accessibilityLabel="Clear search"
                onPress={() => setStorySearchQuery('')}
                style={styles.clearButton}
              >
                <FontAwesome6 name="xmark" size={12} color={theme.colors.textAccent} />
              </Pressable>
            )}
          </View>
          {storySearchFocused && !storySearchQuery.trim() && storySearchSuggestions.length > 0 && (
            <View style={styles.searchSuggestionRow}>
              {storySearchSuggestions.map((suggestion, index) => (
                <Pressable
                  key={suggestion.id}
                  onPressIn={() => {
                    setStorySearchQuery(suggestion.query);
                    setStorySearchFocused(false);
                    if (storyLastOnly) {
                      setStoryLastOnly(false);
                    }
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

          <View style={styles.storyBrowserActions}>
            <Pressable
              onPress={() => {
                setStoryLastOnly(false);
                scrollToActiveStoryIndex(0);
              }}
              style={styles.storyBrowserAction}
            >
              <Text style={styles.storyBrowserActionLabel}>Top</Text>
            </Pressable>
            <Pressable
              disabled={activeStoryLastOpenedChapterId == null}
              onPress={() => {
                setStoryLastOnly(true);
                setStorySearchQuery('');
              }}
              style={[
                styles.storyBrowserAction,
                activeStoryLastOpenedChapterId == null && styles.storyBrowserActionDisabled,
                storyLastOnly && styles.storyBrowserActionActive,
              ]}
            >
              <Text style={styles.storyBrowserActionLabel}>Last</Text>
            </Pressable>
            <Pressable
              disabled={activeStoryJumpTargets.activeIndex < 0}
              onPress={() => {
                setStoryLastOnly(false);
                scrollToActiveStoryIndex(activeStoryJumpTargets.activeIndex);
              }}
              style={[
                styles.storyBrowserAction,
                activeStoryJumpTargets.activeIndex < 0 && styles.storyBrowserActionDisabled,
              ]}
            >
              <Text style={styles.storyBrowserActionLabel}>Active</Text>
            </Pressable>
            <Pressable
              disabled={activeStoryJumpTargets.failedIndex < 0}
              onPress={() => {
                setStoryLastOnly(false);
                scrollToActiveStoryIndex(activeStoryJumpTargets.failedIndex);
              }}
              style={[
                styles.storyBrowserAction,
                activeStoryJumpTargets.failedIndex < 0 && styles.storyBrowserActionDisabled,
              ]}
            >
              <Text style={styles.storyBrowserActionLabel}>Failed</Text>
            </Pressable>
          </View>

          <FlatList
            ref={storyChapterListRef}
            data={activeStoryChapterRows}
            keyExtractor={(item) => item.id}
            contentContainerStyle={listContentStyle}
            initialNumToRender={24}
            maxToRenderPerBatch={30}
            removeClippedSubviews
            windowSize={12}
            onScrollToIndexFailed={({ index }) => {
              requestAnimationFrame(() =>
                scrollToActiveStoryIndex(Math.min(index, activeStoryChapterRows.length - 1)),
              );
            }}
            renderItem={({ item }) => renderChapterCard(item)}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No chapters match this story view</Text>
                <Text style={styles.emptyText}>
                  Try another filter or clear the in-story search.
                </Text>
              </View>
            }
          />

          <CompactSheet
            visible={storyOverlayKind === 'filter'}
            title="Status filter"
            onClose={() => setStoryOverlayKind(null)}
          >
            {FILTER_OPTIONS.map((option) => (
              <SheetOption
                key={option.key}
                label={option.label}
                selected={filterKey === option.key}
                onPress={() => {
                  setFilterKey(option.key);
                  setStoryLastOnly(false);
                  setStoryOverlayKind(null);
                }}
              />
            ))}
          </CompactSheet>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      paddingBottom: 22,
    },
    scrollHeader: {
      paddingBottom: theme.spacing.sm,
    },
    stickyControls: {
      paddingBottom: theme.spacing.sm,
      backgroundColor: theme.colors.background,
      zIndex: 1,
    },
    stickyControlsBody: {
      marginTop: theme.spacing.sm,
    },
    topBar: {
      paddingBottom: theme.spacing.sm,
    },
    importJobList: {
      marginBottom: theme.spacing.sm,
      gap: theme.spacing.sm,
    },
    importJobCard: {
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.borderMuted,
      padding: theme.spacing.md,
    },
    importJobTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
    },
    importJobTitle: {
      flex: 1,
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
    },
    importJobStatus: {
      ...theme.typography.caption,
      textTransform: 'uppercase',
      color: theme.colors.textAccent,
    },
    importJobMeta: {
      marginTop: theme.spacing.xs,
      ...theme.typography.caption,
      color: theme.colors.textMuted,
    },
    importJobError: {
      marginTop: theme.spacing.xs,
      ...theme.typography.caption,
      color: theme.colors.surfaceDanger,
    },
    importJobActions: {
      flexDirection: 'row',
      marginTop: theme.spacing.sm,
      gap: theme.spacing.sm,
    },
    importJobAction: {
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.inputBackground,
      borderWidth: 1,
      borderColor: theme.colors.inputBorder,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.xs,
    },
    importJobActionLabel: {
      ...theme.typography.caption,
      color: theme.colors.textAccent,
    },
    searchWrap: {
      position: 'relative',
    },
    searchInput: {
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
    clearButton: {
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
      marginBottom: theme.spacing.xs,
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
    toolbarButtonRow: {
      flexDirection: 'row',
      marginTop: theme.spacing.sm,
    },
    toolbarButton: {
      marginRight: theme.spacing.sm,
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    toolbarButtonLabel: {
      ...theme.typography.caption,
      color: theme.colors.textAccent,
    },
    compactMeta: {
      marginTop: theme.spacing.xs,
      ...theme.typography.caption,
      color: theme.colors.textSubtle,
    },
    emptyCard: {
      marginTop: theme.spacing.lg,
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.inputBackground,
      padding: theme.spacing.lg,
      borderWidth: 1,
      borderColor: theme.colors.borderMuted,
    },
    emptyTitle: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
    },
    emptyText: {
      marginTop: 6,
      ...theme.typography.body,
      color: theme.colors.textMuted,
    },
    swipeGap: {
      marginTop: theme.spacing.md,
    },
    deleteBackground: {
      ...absoluteFill,
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.surfaceDanger,
      alignItems: 'flex-end',
      justifyContent: 'center',
      paddingRight: 22,
    },
    deleteBackgroundDisabled: {
      backgroundColor: theme.colors.disabled,
    },
    deleteLabel: {
      color: theme.colors.textDanger,
      fontSize: 12,
      letterSpacing: 0.4,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    storyCard: {
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.borderMuted,
      padding: theme.spacing.md,
    },
    storyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    storyHeaderText: {
      flex: 1,
    },
    storyTitle: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
    },
    storyMeta: {
      marginTop: 2,
      ...theme.typography.caption,
      color: theme.colors.textMuted,
    },
    storyChevron: {
      fontSize: 22,
      lineHeight: 22,
      color: theme.colors.textAccent,
      marginLeft: theme.spacing.md,
    },
    storyBadgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: theme.spacing.sm,
    },
    storyBadge: {
      marginRight: theme.spacing.sm,
      marginBottom: theme.spacing.xs,
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.accentSoft,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    storyBadgeDanger: {
      backgroundColor: theme.colors.surfaceDanger,
    },
    storyBadgeLabel: {
      ...theme.typography.caption,
      color: theme.colors.textAccent,
    },
    storyBadgeDangerLabel: {
      color: theme.colors.textDanger,
    },
    chapterRow: {
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.inputBackground,
      padding: theme.spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
    },
    chapterRowDisabled: {
      opacity: 0.76,
    },
    chapterText: {
      flex: 1,
      marginRight: theme.spacing.md,
    },
    chapterTitle: {
      ...theme.typography.body,
      color: theme.colors.text,
    },
    chapterMeta: {
      marginTop: 2,
      ...theme.typography.caption,
      color: theme.colors.textAccent,
    },
    chapterUrl: {
      marginTop: 2,
      ...theme.typography.caption,
      color: theme.colors.textMuted,
    },
    chapterSnippet: {
      marginTop: 4,
      ...theme.typography.caption,
      color: theme.colors.text,
    },
    chapterError: {
      marginTop: 4,
      ...theme.typography.caption,
      color: theme.colors.textDanger,
    },
    statusPill: {
      borderRadius: theme.radius.full,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 6,
    },
    statusPillActive: {
      borderWidth: 1,
      borderColor: theme.colors.accentContrast,
    },
    statusText: {
      ...theme.typography.caption,
      color: theme.colors.accentContrast,
      textTransform: 'capitalize',
    },
    layer: {
      ...absoluteFill,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...absoluteFill,
      backgroundColor: theme.colors.overlay,
    },
    sheet: {
      borderTopLeftRadius: theme.radius.xxl,
      borderTopRightRadius: theme.radius.xxl,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.lg,
      paddingBottom: theme.spacing.xl,
      borderTopWidth: 1,
      borderColor: theme.colors.borderMuted,
    },
    sheetHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: theme.spacing.sm,
    },
    sheetTitle: {
      ...theme.typography.title,
      color: theme.colors.text,
    },
    sheetClose: {
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
    },
    sheetCloseLabel: {
      ...theme.typography.bodyStrong,
      color: theme.colors.textAccent,
    },
    sheetOption: {
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.borderMuted,
      backgroundColor: theme.colors.inputBackground,
      padding: theme.spacing.md,
      marginTop: theme.spacing.sm,
    },
    sheetOptionSelected: {
      borderColor: theme.colors.borderAccent,
      backgroundColor: theme.colors.accentSoft,
    },
    sheetOptionTitle: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
    },
    sheetOptionTitleSelected: {
      color: theme.colors.textAccent,
    },
    sheetOptionDescription: {
      marginTop: theme.spacing.xs,
      ...theme.typography.caption,
      color: theme.colors.textMuted,
    },
    storyBrowserScreen: {
      flex: 1,
      backgroundColor: theme.colors.background,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.lg,
    },
    storyBrowserTopBar: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: theme.spacing.md,
    },
    storyBrowserBack: {
      paddingVertical: theme.spacing.sm,
      paddingRight: theme.spacing.md,
    },
    storyBrowserBackLabel: {
      ...theme.typography.bodyStrong,
      color: theme.colors.textAccent,
    },
    storyBrowserTitleWrap: {
      flex: 1,
    },
    storyBrowserTitle: {
      ...theme.typography.title,
      color: theme.colors.text,
    },
    storyBrowserMeta: {
      marginTop: 2,
      ...theme.typography.caption,
      color: theme.colors.textMuted,
    },
    storyBrowserFilter: {
      marginLeft: theme.spacing.md,
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    storyBrowserFilterLabel: {
      ...theme.typography.caption,
      color: theme.colors.textAccent,
    },
    storySearchInput: {
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
    storyBrowserActions: {
      flexDirection: 'row',
      marginTop: theme.spacing.sm,
      marginBottom: theme.spacing.xs,
    },
    storyBrowserAction: {
      marginRight: theme.spacing.sm,
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    storyBrowserActionActive: {
      backgroundColor: theme.colors.accentSoft,
      borderColor: theme.colors.borderAccent,
    },
    storyBrowserActionDisabled: {
      opacity: 0.45,
    },
    storyBrowserActionLabel: {
      ...theme.typography.caption,
      color: theme.colors.textAccent,
    },
  });
