import { Buffer } from 'buffer';
// Polyfill Buffer for iconv-lite on Hermes
if (typeof global !== 'undefined') {
  (global as typeof globalThis & { Buffer?: typeof Buffer }).Buffer =
    (global as typeof globalThis & { Buffer?: typeof Buffer }).Buffer || Buffer;
}

import React, { useEffect, useRef } from 'react';
import { Alert, Animated, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Slot } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import SearchInput from '../components/SearchInput';
import BookmarkToggleButton from '../components/buttons/BookmarkToggleButton';
import HVToggleButton from '../components/buttons/HVToggleButton';
import LibraryToggleButton from '../components/buttons/LibraryToggleButton';
import LibraryView from '../components/LibraryView';
import BookmarkEditorModal from '../components/BookmarkEditorModal';
import OfflineChapterPicker from '../components/OfflineChapterPicker';
import OfflinePageRolePicker from '../components/OfflinePageRolePicker';
import WebTextToolbar from '../components/toolbars/WebTextToolbar';

import { useAppStore } from '../stores/useAppStore';
import { useWebPageStore } from '../stores/useWebPageStore';
import { useOfflineDownloads } from '../hooks/useOfflineDownloads';
import { usePageLoader } from '../hooks/usePageLoader';
import { useHistory } from '../hooks/useHistory';
import { ensureOfflineDownloadQueueRunning } from '../utils/offline-download-queue';
import { Theme, absoluteFill, useTheme } from '../theme';

export default function RootLayout() {
  const { loadPage, loadOfflineChapter } = usePageLoader();
  const { goBack } = useHistory();
  const { confirmPageRoles, dismissPageRolePicker, dismissChapterPicker, enqueueSelectedChapters } =
    useOfflineDownloads();
  const theme = useTheme();
  const styles = createStyles(theme);

  const currentUrl = useAppStore((s) => s.currentUrl);
  const currentContentSource = useAppStore((s) => s.currentContentSource);
  const currentOfflineChapterId = useAppStore((s) => s.currentOfflineChapterId);
  const history = useAppStore((s) => s.history);
  const initializeBookmarks = useAppStore((s) => s.initializeBookmarks);
  const initializeOfflineLibrary = useAppStore((s) => s.initializeOfflineLibrary);
  const setDictionary = useAppStore((s) => s.setDictionary);
  const setPinyinDictionary = useAppStore((s) => s.setPinyinDictionary);
  const loading = useAppStore((s) => s.loading);
  const bookmarkEditorVisible = useAppStore((s) => s.bookmarkEditorVisible);
  const pendingBookmarkDraft = useAppStore((s) => s.pendingBookmarkDraft);
  const closeBookmarkEditor = useAppStore((s) => s.closeBookmarkEditor);
  const savePendingBookmark = useAppStore((s) => s.savePendingBookmark);
  const removeBookmark = useAppStore((s) => s.removeBookmark);
  const pageRolePickerVisible = useAppStore((s) => s.pageRolePickerVisible);
  const chapterPickerVisible = useAppStore((s) => s.chapterPickerVisible);
  const pendingOfflineAction = useAppStore((s) => s.pendingOfflineAction);
  const downloadQueue = useAppStore((s) => s.downloadQueue);
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
    const pinyinDict = require('../data/PinyinData.json') as Record<string, string>;
    setDictionary(dict);
    setPinyinDictionary(pinyinDict);
  }, [setDictionary, setPinyinDictionary]);

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

  const safeCurrentUrl =
    currentUrl.indexOf('Bundle/Application') === -1 ? currentUrl : '';

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
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar style={theme.statusBar} />
      <View style={styles.controlBar}>
        <View style={styles.leadingActions}>
          {!urlInputFocus && <LibraryToggleButton />}
        </View>
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
        {libraryDrawerOpen && <Pressable style={styles.drawerBackdrop} onPress={() => setLibraryDrawerOpen(false)} />}
        <Animated.View
          pointerEvents={libraryDrawerOpen ? 'auto' : 'none'}
          style={[
            styles.drawer,
            { width: drawerWidth, transform: [{ translateX: drawerX }] },
          ]}
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
            Alert.alert(
              'Remove bookmark?',
              draft.title || url,
              [
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
              ]
            );
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
      </View>
    </SafeAreaView>
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
