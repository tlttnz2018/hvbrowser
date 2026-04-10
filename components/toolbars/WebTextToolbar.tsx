import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import ToolbarButton from '../buttons/ToolbarButton';
import { useOfflineDownloads } from '../../hooks/useOfflineDownloads';
import { useAppStore } from '../../stores/useAppStore';
import { useWebPageStore } from '../../stores/useWebPageStore';
import { Theme, useTheme } from '../../theme';

interface WebTextToolbarProps {
  reloadPage: () => void;
}

export default function WebTextToolbar({ reloadPage }: WebTextToolbarProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { startDownloadFromCurrentPage } = useOfflineDownloads();
  const { moreMenu, toggleMoreMenu, decreaseFont, resetFont, increaseFont, setThemeMode } = useWebPageStore();
  const currentUrl = useAppStore((state) => state.currentUrl);
  const activeDownloadId = useAppStore((state) => state.activeDownloadId);
  const downloadQueue = useAppStore((state) => state.downloadQueue);
  const currentChapter = useAppStore((state) => state.getOfflineChapterByUrlFromState(currentUrl));
  const nextThemeMode = theme.mode === 'dark' ? 'light' : 'dark';
  const downloadLabel = currentChapter?.downloadStatus === 'downloaded'
    ? 'saved'
    : currentChapter?.downloadStatus === 'downloading'
      ? 'busy'
      : currentChapter?.downloadStatus === 'queued'
        ? 'queued'
        : activeDownloadId
          ? `${downloadQueue.length + 1}`
          : 'DL';

  return (
    <View style={styles.container}>
      {moreMenu && (
        <>
          <ToolbarButton
            accessibilityLabel="Download page for offline reading. Long press to edit page roles."
            onPress={() => startDownloadFromCurrentPage(false)}
            onLongPress={() => startDownloadFromCurrentPage(true)}
            delayLongPress={250}
            style={styles.fab}
          >
            <Text style={styles.label}>{downloadLabel}</Text>
          </ToolbarButton>
          <ToolbarButton
            accessibilityLabel={`Switch to ${nextThemeMode} mode`}
            onPress={() => setThemeMode(nextThemeMode)}
            style={styles.fab}
          >
            <FontAwesome6
              name="circle-half-stroke"
              size={16}
              color={theme.colors.text}
            />
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
  });
