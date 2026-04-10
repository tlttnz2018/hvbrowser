import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { OfflineChapterRecord, OfflineStoryRecord } from '../db/offline';
import { Theme, absoluteFill, useTheme } from '../theme';

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

function statusColor(theme: Theme, status: OfflineChapterRecord['downloadStatus']) {
  if (status === 'downloaded') return theme.colors.accent;
  if (status === 'failed') return theme.colors.surfaceDanger;
  return theme.colors.surfaceAccentStrong;
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
  const [expandedStoryIds, setExpandedStoryIds] = useState<number[]>([]);

  const summaryLabel = useMemo(() => {
    if (activeDownloadId) {
      return `Downloading 1 item, ${queueCount} queued`;
    }

    if (queueCount > 0) {
      return `${queueCount} queued`;
    }

    return 'Queue idle';
  }, [activeDownloadId, queueCount]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Text style={styles.heroEyebrow}>Offline book</Text>
        <Text style={styles.heroTitle}>Saved stories and downloaded chapters live here.</Text>
        <Text style={styles.heroMeta}>{summaryLabel}</Text>
        {!!lastError && (
          <Text numberOfLines={2} style={styles.heroError}>
            Last failure: {lastError}
          </Text>
        )}
      </View>

      {stories.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No offline stories yet</Text>
          <Text style={styles.emptyText}>
            Use the download button from the reader to remember a home page, pick chapters from an index, or queue a chapter directly.
          </Text>
        </View>
      ) : (
        stories.map((story) => {
          const chapters = chaptersByStory[story.id] ?? [];
          const expanded = expandedStoryIds.includes(story.id);
          const downloadedCount = chapters.filter((chapter) => chapter.downloadStatus === 'downloaded').length;

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
              ]
            );
          };

          return (
            <SwipeToDeleteCard key={story.id} gap onDelete={confirmRemoveStory}>
              <View style={styles.storyCard}>
                <Pressable
                  onPress={() =>
                    setExpandedStoryIds((current) =>
                      current.includes(story.id) ? current.filter((id) => id !== story.id) : [...current, story.id]
                    )
                  }
                  style={styles.storyHeader}
                >
                  <View style={styles.storyHeaderText}>
                    <Text style={styles.storyTitle}>{story.name}</Text>
                    <Text style={styles.storyMeta}>
                      {downloadedCount}/{chapters.length} downloaded
                    </Text>
                  </View>
                  <Text style={styles.storyToggle}>{expanded ? '−' : '+'}</Text>
                </Pressable>
                {!!story.homePageUrl && (
                  <Text numberOfLines={1} style={styles.storyLink}>
                    Home: {story.homePageUrl}
                  </Text>
                )}
                {!!story.indexPageUrl && (
                  <Text numberOfLines={1} style={styles.storyLink}>
                    Index: {story.indexPageUrl}
                  </Text>
                )}
                {expanded &&
                  chapters.map((chapter) => {
                    const canOpen = chapter.downloadStatus === 'downloaded';

                    const confirmRemoveChapter = () => {
                      Alert.alert(
                        'Remove offline chapter?',
                        chapter.chapterName,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Remove',
                            style: 'destructive',
                            onPress: () => {
                              void onRemoveChapter(chapter.id);
                            },
                          },
                        ]
                      );
                    };

                    return (
                      <SwipeToDeleteCard key={chapter.id} gap onDelete={confirmRemoveChapter}>
                        <TouchableOpacity
                          activeOpacity={canOpen ? 0.75 : 1}
                          disabled={!canOpen}
                          onPress={() => onOpenChapter(chapter.id)}
                          style={[styles.chapterRow, !canOpen && styles.chapterRowDisabled]}
                        >
                          <View style={styles.chapterText}>
                            <Text style={styles.chapterTitle}>{chapter.chapterName}</Text>
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
                  })}
              </View>
            </SwipeToDeleteCard>
          );
        })
      )}
    </ScrollView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: {
      paddingBottom: 22,
    },
    heroCard: {
      borderRadius: theme.radius.xxl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.borderMuted,
      padding: theme.spacing.lg,
      ...theme.shadows.md,
    },
    heroEyebrow: {
      ...theme.typography.monoCaps,
      color: theme.colors.textAccent,
    },
    heroTitle: {
      marginTop: 6,
      ...theme.typography.title,
      color: theme.colors.text,
    },
    heroMeta: {
      marginTop: 4,
      ...theme.typography.bodyStrong,
      color: theme.colors.textMuted,
    },
    heroError: {
      marginTop: 8,
      ...theme.typography.caption,
      color: theme.colors.textDanger,
      backgroundColor: theme.colors.surfaceDanger,
      padding: theme.spacing.sm,
      borderRadius: theme.radius.md,
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
      marginTop: theme.spacing.lg,
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
    storyToggle: {
      fontSize: 24,
      lineHeight: 24,
      color: theme.colors.textAccent,
      marginLeft: theme.spacing.md,
    },
    storyLink: {
      marginTop: 6,
      ...theme.typography.caption,
      color: theme.colors.textSubtle,
    },
    chapterRow: {
      marginTop: theme.spacing.sm,
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
  });
