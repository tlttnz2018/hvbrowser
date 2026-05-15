import { FontAwesome6 } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { OfflineChapterRecord } from '../../db/offline';
import { useOfflineDownloads } from '../../hooks/useOfflineDownloads';
import { usePageLoader } from '../../hooks/usePageLoader';
import { useAppStore } from '../../stores/useAppStore';
import { useWebPageStore } from '../../stores/useWebPageStore';
import { Theme, useTheme } from '../../theme';
import ToolbarButton from '../buttons/ToolbarButton';

interface WebTextToolbarProps {
  reloadPage: () => void;
}

const EMPTY_CHAPTERS: OfflineChapterRecord[] = [];

export default function WebTextToolbar({ reloadPage }: WebTextToolbarProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { startDownloadFromCurrentPage } = useOfflineDownloads();
  const { loadOfflineChapter } = usePageLoader();
  const [contentsVisible, setContentsVisible] = useState(false);
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
              <Text numberOfLines={1} style={styles.contentsTitle}>
                {currentStory?.name ?? 'Contents'}
              </Text>
              <Pressable onPress={() => setContentsVisible(false)} style={styles.contentsClose}>
                <Text style={styles.contentsCloseLabel}>Close</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.contentsList}>
              {currentStoryChapters.map((chapter) => {
                const active = chapter.id === currentOfflineChapterId;
                return (
                  <Pressable
                    key={chapter.id}
                    onPress={() => {
                      setContentsVisible(false);
                      loadOfflineChapter(chapter.id);
                    }}
                    style={[styles.contentsRow, active && styles.contentsRowActive]}
                  >
                    <Text style={[styles.contentsRowText, active && styles.contentsRowTextActive]}>
                      {chapter.chapterName}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
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
      maxHeight: '68%',
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: theme.radius.xxl,
      borderTopRightRadius: theme.radius.xxl,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.lg,
      paddingBottom: theme.spacing.xl,
    },
    contentsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: theme.spacing.md,
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
    contentsList: {
      paddingBottom: theme.spacing.lg,
    },
    contentsRow: {
      paddingVertical: theme.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.borderMuted,
    },
    contentsRowActive: {
      backgroundColor: theme.colors.accentSoft,
      borderRadius: theme.radius.md,
      paddingHorizontal: theme.spacing.md,
    },
    contentsRowText: {
      ...theme.typography.body,
      color: theme.colors.text,
    },
    contentsRowTextActive: {
      color: theme.colors.textAccent,
      fontWeight: '700',
    },
  });
