import { FontAwesome6 } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { OfflineChapterRecord } from '../../db/offline';
import { useOfflineDownloads } from '../../hooks/useOfflineDownloads';
import { usePageLoader } from '../../hooks/usePageLoader';
import { useAppStore } from '../../stores/useAppStore';
import { useWebPageStore } from '../../stores/useWebPageStore';
import { Theme, useTheme } from '../../theme';
import SegmentedControl from '../buttons/SegmentedControl';
import ToolbarButton from '../buttons/ToolbarButton';

interface WebTextToolbarProps {
  reloadPage: () => void;
}

const EMPTY_CHAPTERS: OfflineChapterRecord[] = [];
const ESTIMATED_CONTENT_ROW_HEIGHT = 78;

type ContentsFilterKey = 'all' | 'current';

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

export default function WebTextToolbar({ reloadPage }: WebTextToolbarProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { startDownloadFromCurrentPage } = useOfflineDownloads();
  const { loadOfflineChapter } = usePageLoader();
  const contentsListRef = useRef<FlatList<OfflineChapterRecord>>(null);
  const [contentsVisible, setContentsVisible] = useState(false);
  const [contentsSearchQuery, setContentsSearchQuery] = useState('');
  const [contentsFilterKey, setContentsFilterKey] = useState<ContentsFilterKey>('all');
  const { moreMenu, toggleMoreMenu, decreaseFont, resetFont, increaseFont, setThemeMode } =
    useWebPageStore();
  const currentUrl = useAppStore((state) => state.currentUrl);
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
  const filteredStoryChapters = useMemo(() => {
    const query = contentsSearchQuery.trim().toLowerCase();

    return currentStoryChapters.filter((chapter) => {
      if (!matchesContentsFilter(chapter, contentsFilterKey, currentOfflineChapterId)) {
        return false;
      }

      if (!query) {
        return true;
      }

      return `${chapter.chapterName} ${chapter.chapterUrl}`.toLowerCase().includes(query);
    });
  }, [contentsFilterKey, contentsSearchQuery, currentOfflineChapterId, currentStoryChapters]);
  const contentsSummaryLabel = `${filteredStoryChapters.length} visible • ${currentStoryChapters.length} total`;
  const contentsJumpTargets = useMemo(() => {
    const currentIndex = filteredStoryChapters.findIndex(
      (chapter) => chapter.id === currentOfflineChapterId,
    );

    return {
      currentIndex,
    };
  }, [currentOfflineChapterId, filteredStoryChapters]);
  const contentsBucketActions = useMemo(() => {
    if (filteredStoryChapters.length <= 1000) {
      return [];
    }

    const buckets = new Map<number, { label: string; index: number }>();

    filteredStoryChapters.forEach((chapter, index) => {
      const order = chapter.chapterOrder ?? index + 1;
      const bucketStart = Math.floor((Math.max(order, 1) - 1) / 1000) * 1000 + 1;
      if (!buckets.has(bucketStart)) {
        const bucketEnd = bucketStart + 999;
        buckets.set(bucketStart, { label: `${bucketStart}-${bucketEnd}`, index });
      }
    });

    return Array.from(buckets.values()).slice(0, 8);
  }, [filteredStoryChapters]);

  useEffect(() => {
    if (!contentsVisible) {
      setContentsSearchQuery('');
      setContentsFilterKey('all');
    }
  }, [contentsVisible]);

  const scrollContentsToIndex = (index: number, measuredLength = ESTIMATED_CONTENT_ROW_HEIGHT) => {
    if (index < 0 || index >= filteredStoryChapters.length) {
      return;
    }

    contentsListRef.current?.scrollToOffset({
      offset: Math.max(0, index * measuredLength),
      animated: true,
    });
  };

  return (
    <>
      <View style={styles.container}>
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
          <View style={styles.contentsSheet}>
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
                  placeholder="Search chapter title or URL"
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
              data={filteredStoryChapters}
              keyExtractor={(item) => `${item.id}`}
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
                    Math.min(index, filteredStoryChapters.length - 1),
                    averageItemLength || ESTIMATED_CONTENT_ROW_HEIGHT,
                  ),
                );
              }}
              renderItem={({ item }) => {
                const active = item.id === currentOfflineChapterId;
                return (
                  <Pressable
                    onPress={() => {
                      setContentsVisible(false);
                      loadOfflineChapter(item.id);
                    }}
                    style={[styles.contentsRow, active && styles.contentsRowActive]}
                  >
                    <View style={styles.contentsRowContent}>
                      <Text
                        style={[styles.contentsRowText, active && styles.contentsRowTextActive]}
                      >
                        {item.chapterName}
                      </Text>
                      <Text numberOfLines={1} style={styles.contentsRowMeta}>
                        {active
                          ? 'Current chapter'
                          : item.chapterOrder != null
                            ? `Chapter ${item.chapterOrder}`
                            : item.chapterUrl}
                      </Text>
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
    </>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      position: 'absolute',
      right: 14,
      bottom: 34,
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
