import React, { useMemo, useRef, useState } from 'react';
import { FontAwesome6 } from '@expo/vector-icons';
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
import type { OfflineChapterRecord, OfflineStoryRecord } from '../db/offline';
import { Theme, absoluteFill, useTheme } from '../theme';

type OfflineViewMode = 'grouped' | 'chapters';
type OfflineFilterKey = 'all' | 'downloading' | 'queued' | 'downloaded' | 'failed';
type OverlayKind = 'filter' | 'jump' | 'mode' | null;
type StoryOverlayKind = 'filter' | null;

interface OfflineLibraryListProps {
  stories: OfflineStoryRecord[];
  chaptersByStory: Record<number, OfflineChapterRecord[]>;
  activeDownloadId: number | null;
  queueCount: number;
  lastError: string | null;
  onOpenChapter: (chapterId: number) => void;
  onRemoveChapter: (chapterId: number) => Promise<void>;
  onRemoveStory: (storyId: number) => Promise<void>;
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
};

type OfflineRow = StoryRow | ChapterRow;

const FILTER_OPTIONS: Array<{ key: OfflineFilterKey; label: string }> = [
  { key: 'all', label: 'All statuses' },
  { key: 'downloading', label: 'Downloading' },
  { key: 'queued', label: 'Queued' },
  { key: 'downloaded', label: 'Downloaded' },
  { key: 'failed', label: 'Failed' },
];

const MODE_OPTIONS: Array<{ key: OfflineViewMode; label: string; description: string }> = [
  { key: 'grouped', label: 'Stories', description: 'Show stories only, then open a dedicated chapter browser.' },
  { key: 'chapters', label: 'All chapters', description: 'Browse one flat virtualized chapter list across stories.' },
];

function statusColor(theme: Theme, status: OfflineChapterRecord['downloadStatus']) {
  if (status === 'downloaded') return theme.colors.accent;
  if (status === 'failed') return theme.colors.surfaceDanger;
  return theme.colors.surfaceAccentStrong;
}

function matchesChapterFilter(chapter: OfflineChapterRecord, filterKey: OfflineFilterKey) {
  return filterKey === 'all' || chapter.downloadStatus === filterKey;
}

function SwipeToDeleteCard({ disabled = false, gap = false, onDelete, children }: SwipeToDeleteCardProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const translateX = useRef(new Animated.Value(0)).current;

  const resetPosition = () => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 0,
    }).start();
  };

  const removeWithAnimation = () => {
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
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          !disabled && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && gestureState.dx < -8,
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
    [disabled, translateX]
  );

  return (
    <View style={gap ? styles.swipeGap : undefined}>
      <View style={[styles.deleteBackground, disabled && styles.deleteBackgroundDisabled]}>
        <Text style={styles.deleteLabel}>Delete</Text>
      </View>
      <Animated.View style={{ transform: [{ translateX }] }} {...(disabled ? {} : panResponder.panHandlers)}>
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
    <Pressable onPress={onPress} style={[styles.sheetOption, selected && styles.sheetOptionSelected]}>
      <Text style={[styles.sheetOptionTitle, selected && styles.sheetOptionTitleSelected]}>{label}</Text>
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
  const styles = createStyles(theme);

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.layer}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
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
  stories,
  chaptersByStory,
  activeDownloadId,
  queueCount,
  lastError,
  onOpenChapter,
  onRemoveChapter,
  onRemoveStory,
}: OfflineLibraryListProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const listRef = useRef<FlatList<ChapterRow>>(null);
  const storyListRef = useRef<FlatList<StoryRow>>(null);
  const storyChapterListRef = useRef<FlatList<ChapterRow>>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<OfflineViewMode>('grouped');
  const [filterKey, setFilterKey] = useState<OfflineFilterKey>('all');
  const [overlayKind, setOverlayKind] = useState<OverlayKind>(null);
  const [storyOverlayKind, setStoryOverlayKind] = useState<StoryOverlayKind>(null);
  const [activeStoryId, setActiveStoryId] = useState<number | null>(null);
  const [storySearchQuery, setStorySearchQuery] = useState('');

  const summaryLabel = useMemo(() => {
    if (activeDownloadId) {
      return `${queueCount} queued`;
    }

    if (queueCount > 0) {
      return `${queueCount} queued`;
    }

    return 'Queue idle';
  }, [activeDownloadId, queueCount]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const activeStory = stories.find((story) => story.id === activeStoryId) ?? null;
  const storyNormalizedQuery = storySearchQuery.trim().toLowerCase();

  const storyRows = useMemo<StoryRow[]>(() => {
    return stories
      .map((story) => {
        const chapters = chaptersByStory[story.id] ?? [];
        const chapterCount = chapters.length;
        const downloadedCount = chapters.filter((chapter) => chapter.downloadStatus === 'downloaded').length;
        const failedCount = chapters.filter((chapter) => chapter.downloadStatus === 'failed').length;
        const queuedCount = chapters.filter((chapter) =>
          chapter.downloadStatus === 'queued' || chapter.downloadStatus === 'downloading'
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
            `${chapter.chapterName} ${chapter.chapterUrl}`.toLowerCase().includes(normalizedQuery)
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

        if (
          normalizedQuery &&
          !`${story.name} ${chapter.chapterName} ${chapter.chapterUrl}`.toLowerCase().includes(normalizedQuery)
        ) {
          return;
        }

        rows.push({
          id: `chapter-${chapter.id}`,
          kind: 'chapter',
          chapter,
          storyName: story.name,
        });
      });
    });

    return rows;
  }, [chaptersByStory, filterKey, normalizedQuery, stories]);

  const activeStoryChapterRows = useMemo<ChapterRow[]>(() => {
    if (!activeStory) {
      return [];
    }

    return (chaptersByStory[activeStory.id] ?? [])
      .filter((chapter) => matchesChapterFilter(chapter, filterKey))
      .filter((chapter) => {
        if (!storyNormalizedQuery) {
          return true;
        }

        return `${chapter.chapterName} ${chapter.chapterUrl}`.toLowerCase().includes(storyNormalizedQuery);
      })
      .map((chapter) => ({
        id: `chapter-${chapter.id}`,
        kind: 'chapter',
        chapter,
        storyName: activeStory.name,
      }));
  }, [activeStory, chaptersByStory, filterKey, storyNormalizedQuery]);

  const jumpTargets = useMemo(() => {
    const rows = chapterRows;
    const activeIndex = rows.findIndex((row) => row.chapter.id === activeDownloadId);
    const failedIndex = rows.findIndex((row) => row.chapter.downloadStatus === 'failed');

    return { activeIndex, failedIndex };
  }, [activeDownloadId, chapterRows]);

  const activeStoryJumpTargets = useMemo(() => {
    const activeIndex = activeStoryChapterRows.findIndex((row) => row.chapter.id === activeDownloadId);
    const failedIndex = activeStoryChapterRows.findIndex((row) => row.chapter.downloadStatus === 'failed');
    return { activeIndex, failedIndex };
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
    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.1 });
  };

  const scrollToActiveStoryIndex = (index: number) => {
    if (index < 0 || index >= activeStoryChapterRows.length) return;
    storyChapterListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.1 });
  };

  const openStoryBrowser = (storyId: number) => {
    setActiveStoryId(storyId);
    setStorySearchQuery('');
  };

  const closeStoryBrowser = () => {
    setActiveStoryId(null);
    setStorySearchQuery('');
    setStoryOverlayKind(null);
  };

  const renderStoryRow = ({ item }: { item: StoryRow }) => {
    const { story, chapterCount, downloadedCount, failedCount, queuedCount } = item;

    const confirmRemoveStory = () => {
      Alert.alert('Remove offline book?', `${story.name}\nThis will delete all saved offline chapters for this story.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void onRemoveStory(story.id);
          },
        },
      ]);
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
                <Text style={[styles.storyBadgeLabel, styles.storyBadgeDangerLabel]}>{failedCount} failed</Text>
              </View>
            )}
          </View>
        </Pressable>
      </SwipeToDeleteCard>
    );
  };

  const renderChapterCard = (row: ChapterRow) => {
    const { chapter, storyName } = row;
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
          onPress={() => onOpenChapter(chapter.id)}
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
              {chapter.chapterUrl}
            </Text>
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
      <View style={styles.topBar}>
        <View style={styles.searchWrap}>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={viewMode === 'grouped' ? 'Search stories or chapters' : 'Search all chapters'}
            placeholderTextColor={theme.colors.inputPlaceholder}
            style={styles.searchInput}
          />
          {!!searchQuery && (
            <Pressable accessibilityLabel="Clear search" onPress={() => setSearchQuery('')} style={styles.clearButton}>
              <FontAwesome6 name="xmark" size={12} color={theme.colors.textAccent} />
            </Pressable>
          )}
        </View>
        <View style={styles.toolbarButtonRow}>
          <Pressable onPress={() => setOverlayKind('mode')} style={styles.toolbarButton}>
            <Text style={styles.toolbarButtonLabel}>{viewMode === 'grouped' ? 'Stories' : 'All'}</Text>
          </Pressable>
          <Pressable onPress={() => setOverlayKind('filter')} style={styles.toolbarButton}>
            <Text style={styles.toolbarButtonLabel}>{filterKey === 'all' ? 'Filter' : 'Status'}</Text>
          </Pressable>
          <Pressable onPress={() => setOverlayKind('jump')} style={styles.toolbarButton}>
            <Text style={styles.toolbarButtonLabel}>Jump</Text>
          </Pressable>
        </View>
        <Text style={styles.compactMeta}>
          {viewMode === 'grouped' ? `${storyRows.length} stories` : `${chapterRows.length} chapters`} • {summaryLabel}
          {activeDownloadId ? ' • 1 active' : ''}
          {!!lastError ? ' • last run failed' : ''}
        </Text>
      </View>

      {viewMode === 'grouped' ? (
        <FlatList
          ref={storyListRef}
          data={storyRows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          initialNumToRender={18}
          maxToRenderPerBatch={24}
          removeClippedSubviews
          windowSize={10}
          renderItem={renderStoryRow}
          ListEmptyComponent={
            stories.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No offline stories yet</Text>
                <Text style={styles.emptyText}>
                  Use the download button from the reader to save chapters, then open each story in a focused chapter browser.
                </Text>
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No stories match this search</Text>
                <Text style={styles.emptyText}>Try a shorter search, or switch to the all-chapters view.</Text>
              </View>
            )
          }
        />
      ) : (
        <FlatList
          ref={listRef}
          data={chapterRows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          initialNumToRender={20}
          maxToRenderPerBatch={28}
          removeClippedSubviews
          windowSize={12}
          onScrollToIndexFailed={({ index }) => {
            requestAnimationFrame(() => scrollToMainChapterIndex(Math.min(index, chapterRows.length - 1)));
          }}
          renderItem={({ item }) => renderChapterCard(item)}
          ListEmptyComponent={
            stories.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No offline stories yet</Text>
                <Text style={styles.emptyText}>Save some chapters first, then they will appear here.</Text>
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No chapters match this view</Text>
                <Text style={styles.emptyText}>Try another status filter or clear the search query.</Text>
              </View>
            )
          }
        />
      )}

      <CompactSheet visible={overlayKind === 'mode'} title="View mode" onClose={() => setOverlayKind(null)}>
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

      <CompactSheet visible={overlayKind === 'filter'} title="Status filter" onClose={() => setOverlayKind(null)}>
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

      <CompactSheet visible={overlayKind === 'jump'} title="Jump to" onClose={() => setOverlayKind(null)}>
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
        <View style={styles.storyBrowserScreen}>
          <View style={styles.storyBrowserTopBar}>
            <Pressable onPress={closeStoryBrowser} style={styles.storyBrowserBack}>
              <Text style={styles.storyBrowserBackLabel}>Back</Text>
            </Pressable>
            <View style={styles.storyBrowserTitleWrap}>
              <Text numberOfLines={1} style={styles.storyBrowserTitle}>
                {activeStory?.name ?? ''}
              </Text>
              <Text style={styles.storyBrowserMeta}>
                {activeStoryChapterRows.length} chapters • {filterKey === 'all' ? 'all statuses' : filterKey}
              </Text>
            </View>
            <Pressable onPress={() => setStoryOverlayKind('filter')} style={styles.storyBrowserFilter}>
              <Text style={styles.storyBrowserFilterLabel}>Filter</Text>
            </Pressable>
          </View>

          <View style={styles.searchWrap}>
            <TextInput
              value={storySearchQuery}
              onChangeText={setStorySearchQuery}
              placeholder="Search this story's chapters"
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

          <View style={styles.storyBrowserActions}>
            <Pressable onPress={() => scrollToActiveStoryIndex(0)} style={styles.storyBrowserAction}>
              <Text style={styles.storyBrowserActionLabel}>Top</Text>
            </Pressable>
            <Pressable
              disabled={activeStoryJumpTargets.activeIndex < 0}
              onPress={() => scrollToActiveStoryIndex(activeStoryJumpTargets.activeIndex)}
              style={[styles.storyBrowserAction, activeStoryJumpTargets.activeIndex < 0 && styles.storyBrowserActionDisabled]}
            >
              <Text style={styles.storyBrowserActionLabel}>Active</Text>
            </Pressable>
            <Pressable
              disabled={activeStoryJumpTargets.failedIndex < 0}
              onPress={() => scrollToActiveStoryIndex(activeStoryJumpTargets.failedIndex)}
              style={[styles.storyBrowserAction, activeStoryJumpTargets.failedIndex < 0 && styles.storyBrowserActionDisabled]}
            >
              <Text style={styles.storyBrowserActionLabel}>Failed</Text>
            </Pressable>
          </View>

          <FlatList
            ref={storyChapterListRef}
            data={activeStoryChapterRows}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.content}
            initialNumToRender={24}
            maxToRenderPerBatch={30}
            removeClippedSubviews
            windowSize={12}
            onScrollToIndexFailed={({ index }) => {
              requestAnimationFrame(() => scrollToActiveStoryIndex(Math.min(index, activeStoryChapterRows.length - 1)));
            }}
            renderItem={({ item }) => renderChapterCard(item)}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No chapters match this story view</Text>
                <Text style={styles.emptyText}>Try another filter or clear the in-story search.</Text>
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
                  setStoryOverlayKind(null);
                }}
              />
            ))}
          </CompactSheet>
        </View>
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
    topBar: {
      paddingBottom: theme.spacing.sm,
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
    storyBrowserActionDisabled: {
      opacity: 0.45,
    },
    storyBrowserActionLabel: {
      ...theme.typography.caption,
      color: theme.colors.textAccent,
    },
  });
