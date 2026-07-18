import { Buffer } from 'buffer';
// Polyfill Buffer for iconv-lite on Hermes
if (typeof global !== 'undefined') {
  (global as typeof globalThis & { Buffer?: typeof Buffer }).Buffer =
    (global as typeof globalThis & { Buffer?: typeof Buffer }).Buffer || Buffer;
}

import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import {
  Alert,
  Animated,
  AppState,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import BookmarkEditorModal from '../components/BookmarkEditorModal';
import BookmarkToggleButton from '../components/buttons/BookmarkToggleButton';
import HVToggleButton from '../components/buttons/HVToggleButton';
import LibraryToggleButton from '../components/buttons/LibraryToggleButton';
import LibraryView from '../components/LibraryView';
import OfflineChapterPicker from '../components/OfflineChapterPicker';
import OfflinePageRolePicker from '../components/OfflinePageRolePicker';
import OfflineStoryPicker from '../components/OfflineStoryPicker';
import SearchInput from '../components/SearchInput';
import WebTextToolbar from '../components/toolbars/WebTextToolbar';
import { useHistory } from '../hooks/useHistory';
import { useOfflineDownloads } from '../hooks/useOfflineDownloads';
import { usePageLoader } from '../hooks/usePageLoader';
import { useAppStore } from '../stores/useAppStore';
import { useWebPageStore } from '../stores/useWebPageStore';
import { absoluteFill, Theme, useTheme } from '../theme';
import { initializeDefinitionWordIndex } from '../utils/definition-dictionary';
import { ensureEpubImportQueueRunning } from '../utils/epub-import-queue';
import { ensureOfflineDownloadQueueRunning } from '../utils/offline-download-queue';

export default function RootLayout() {
  const { loadPage, loadOfflineChapter } = usePageLoader();
  const { goBack } = useHistory();
  const {
    confirmPageRoles,
    confirmStoryResolution,
    dismissPageRolePicker,
    dismissChapterPicker,
    dismissStoryPicker,
    enqueueSelectedChapters,
  } = useOfflineDownloads();
  const theme = useTheme();
  const styles = createStyles(theme);

  const currentUrl = useAppStore((s) => s.currentUrl);
  const currentContentSource = useAppStore((s) => s.currentContentSource);
  const currentOfflineChapterId = useAppStore((s) => s.currentOfflineChapterId);
  const history = useAppStore((s) => s.history);
  const initializeBookmarks = useAppStore((s) => s.initializeBookmarks);
  const initializeOfflineLibrary = useAppStore((s) => s.initializeOfflineLibrary);
  const setDictionary = useAppStore((s) => s.setDictionary);
  const loading = useAppStore((s) => s.loading);
  const bookmarkEditorVisible = useAppStore((s) => s.bookmarkEditorVisible);
  const pendingBookmarkDraft = useAppStore((s) => s.pendingBookmarkDraft);
  const closeBookmarkEditor = useAppStore((s) => s.closeBookmarkEditor);
  const savePendingBookmark = useAppStore((s) => s.savePendingBookmark);
  const removeBookmark = useAppStore((s) => s.removeBookmark);
  const pageRolePickerVisible = useAppStore((s) => s.pageRolePickerVisible);
  const chapterPickerVisible = useAppStore((s) => s.chapterPickerVisible);
  const pendingOfflineAction = useAppStore((s) => s.pendingOfflineAction);
  const storyPickerVisible = useAppStore((s) => s.storyPickerVisible);
  const pendingStoryResolution = useAppStore((s) => s.pendingStoryResolution);
  const offlineStories = useAppStore((s) => s.offlineStories);
  const downloadQueue = useAppStore((s) => s.downloadQueue);
  const epubImportJobs = useAppStore((s) => s.epubImportJobs);
  const {
    fullSite,
    libraryDrawerOpen,
    setLibraryDrawerOpen,
    toggleCss,
    setUrlInputFocus,
    urlInputFocus,
  } = useWebPageStore();
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(width * 0.88, 420);
  const drawerX = useRef(new Animated.Value(-drawerWidth)).current;

  // Load dictionary on mount
  useEffect(() => {
    const dict = require('../data/DataHanVietUni.json') as Record<string, string>;
    setDictionary(dict);
    initializeDefinitionWordIndex().catch((error) => {
      console.error('Definition word index initialization error:', error);
    });
  }, [setDictionary]);

  useEffect(() => {
    initializeBookmarks().catch((error) => {
      console.error('Bookmark initialization error:', error);
    });
    initializeOfflineLibrary().catch((error) => {
      console.error('Offline initialization error:', error);
    });
  }, [initializeBookmarks, initializeOfflineLibrary]);

  useEffect(() => {
    if (downloadQueue.length > 0) {
      ensureOfflineDownloadQueueRunning().catch((error) => {
        console.error('Offline queue error:', error);
      });
    }
  }, [downloadQueue.length]);

  useEffect(() => {
    if (
      epubImportJobs.some((job) =>
        ['queued', 'extracting', 'parsing', 'importing', 'paused'].includes(job.status),
      )
    ) {
      ensureEpubImportQueueRunning().catch((error) => {
        console.error('EPUB import queue error:', error);
      });
    }
  }, [epubImportJobs]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        ensureEpubImportQueueRunning().catch((error) => {
          console.error('EPUB import resume error:', error);
        });
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const safeCurrentUrl = currentUrl.indexOf('Bundle/Application') === -1 ? currentUrl : '';

  const backButtonEnabled = history.length >= 1;

  const reloadPage = () => {
    const url = useAppStore.getState().currentUrl;
    if (!url) return;
    if (currentContentSource === 'offline' && currentOfflineChapterId) {
      loadOfflineChapter(currentOfflineChapterId);
      return;
    }

    loadPage(url);
  };

  useEffect(() => {
    Animated.spring(drawerX, {
      toValue: libraryDrawerOpen ? 0 : -drawerWidth,
      useNativeDriver: true,
      bounciness: 0,
      speed: 18,
    }).start();
  }, [drawerWidth, drawerX, libraryDrawerOpen]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <StatusBar style={theme.statusBar} />
        <View style={styles.controlBar}>
          <View style={styles.leadingActions}>{!urlInputFocus && <LibraryToggleButton />}</View>
          <View style={styles.urlInput}>
            <SearchInput
              placeholder="Input chinese website url"
              url={safeCurrentUrl}
              urlInputFocus={urlInputFocus}
              onSubmit={loadPage}
              onFocus={(isFocus) => {
                setUrlInputFocus(isFocus);
                if (isFocus) setLibraryDrawerOpen(false);
              }}
              backButtonEnabled={!urlInputFocus && backButtonEnabled}
              onBack={goBack}
              fullSite={fullSite}
              onToggleReaderMode={toggleCss}
            />
          </View>
          <View style={styles.trailingActions}>
            <HVToggleButton />
            <BookmarkToggleButton />
          </View>
        </View>
        <View style={styles.content}>
          <Slot />
          {!loading && <WebTextToolbar reloadPage={reloadPage} />}
          {libraryDrawerOpen && (
            <Pressable style={styles.drawerBackdrop} onPress={() => setLibraryDrawerOpen(false)} />
          )}
          <Animated.View
            pointerEvents={libraryDrawerOpen ? 'auto' : 'none'}
            style={[styles.drawer, { width: drawerWidth, transform: [{ translateX: drawerX }] }]}
          >
            <LibraryView onDismiss={() => setLibraryDrawerOpen(false)} />
          </Animated.View>
          <BookmarkEditorModal
            visible={bookmarkEditorVisible}
            draft={pendingBookmarkDraft}
            onClose={closeBookmarkEditor}
            onSubmit={savePendingBookmark}
            onDelete={(draft) => {
              const url = draft.originalUrl || draft.url;
              Alert.alert('Remove bookmark?', draft.title || url, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Remove',
                  style: 'destructive',
                  onPress: () => {
                    closeBookmarkEditor();
                    removeBookmark(url).catch((error) => {
                      console.error('Bookmark removal error:', error);
                    });
                  },
                },
              ]);
            }}
          />
          <OfflinePageRolePicker
            visible={pageRolePickerVisible}
            pageTitle={pendingOfflineAction?.pageTitle ?? 'Current page'}
            initialRoles={pendingOfflineAction?.initialRoles ?? []}
            onClose={dismissPageRolePicker}
            onSubmit={confirmPageRoles}
          />
          <OfflineChapterPicker
            visible={chapterPickerVisible}
            pageTitle={pendingOfflineAction?.pageTitle ?? 'Current page'}
            candidates={pendingOfflineAction?.chapterCandidates ?? []}
            onClose={dismissChapterPicker}
            onSubmit={enqueueSelectedChapters}
          />
          <OfflineStoryPicker
            visible={storyPickerVisible}
            pageTitle={pendingStoryResolution?.action.pageTitle ?? 'Current page'}
            stories={offlineStories}
            suggestedStoryId={pendingStoryResolution?.suggestedStoryId ?? null}
            defaultStoryName={pendingStoryResolution?.defaultStoryName ?? 'Untitled story'}
            onClose={dismissStoryPicker}
            onSubmit={confirmStoryResolution}
          />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.backgroundElevated,
    },
    controlBar: {
      minHeight: 56,
      paddingHorizontal: 6,
      paddingVertical: 8,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      backgroundColor: theme.colors.backgroundElevated,
      borderBottomColor: theme.colors.borderMuted,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    leadingActions: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: 4,
    },
    urlInput: {
      flex: 1,
      flexDirection: 'row',
      marginRight: 2,
    },
    trailingActions: {
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: 2,
    },
    content: {
      flex: 1,
      backgroundColor: theme.colors.backgroundCanvas,
    },
    drawerBackdrop: {
      ...absoluteFill,
      backgroundColor: theme.colors.overlay,
      zIndex: 29,
    },
    drawer: {
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      backgroundColor: theme.colors.background,
      zIndex: 30,
      ...theme.shadows.drawer,
    },
  });
