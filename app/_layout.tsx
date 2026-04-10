import '../global.css';
import { Buffer } from 'buffer';
// Polyfill Buffer for iconv-lite on Hermes
if (typeof global !== 'undefined') {
  (global as typeof globalThis & { Buffer?: typeof Buffer }).Buffer =
    (global as typeof globalThis & { Buffer?: typeof Buffer }).Buffer || Buffer;
}

import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Slot } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import SearchInput from '../components/SearchInput';
import BookmarkToggleButton from '../components/buttons/BookmarkToggleButton';
import HVToggleButton from '../components/buttons/HVToggleButton';
import LibraryToggleButton from '../components/buttons/LibraryToggleButton';
import LibraryView from '../components/LibraryView';
import WebTextToolbar from '../components/toolbars/WebTextToolbar';

import { useAppStore } from '../stores/useAppStore';
import { useWebPageStore } from '../stores/useWebPageStore';
import { usePageLoader } from '../hooks/usePageLoader';
import { useHistory } from '../hooks/useHistory';

export default function RootLayout() {
  const { loadPage } = usePageLoader();
  const { goBack } = useHistory();

  const currentUrl = useAppStore((s) => s.currentUrl);
  const history = useAppStore((s) => s.history);
  const setDictionary = useAppStore((s) => s.setDictionary);
  const setPinyinDictionary = useAppStore((s) => s.setPinyinDictionary);
  const loading = useAppStore((s) => s.loading);
  const { fullSite, libraryDrawerOpen, setLibraryDrawerOpen, toggleCss, setUrlInputFocus } = useWebPageStore();
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

  const safeCurrentUrl =
    currentUrl.indexOf('Bundle/Application') === -1 ? currentUrl : '';

  const backButtonEnabled = history.length >= 1;

  const reloadPage = () => {
    const url = useAppStore.getState().currentUrl;
    if (url) loadPage(url);
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
      <StatusBar style="dark" />
      <View style={styles.controlBar}>
        <View style={styles.leadingActions}>
          <LibraryToggleButton />
        </View>
        <View style={styles.urlInput}>
          <SearchInput
            placeholder="Input chinese website url"
            url={safeCurrentUrl}
            onSubmit={loadPage}
            onFocus={setUrlInputFocus}
            backButtonEnabled={backButtonEnabled}
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9f9fb',
  },
  controlBar: {
    minHeight: 56,
    paddingHorizontal: 6,
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: '#f9f9fb',
    borderBottomColor: '#e5e5ea',
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
    backgroundColor: '#fff',
  },
  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(21, 18, 15, 0.28)',
    zIndex: 29,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: '#f6f3ee',
    zIndex: 30,
    shadowColor: '#1e1611',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 8, height: 0 },
    elevation: 10,
  },
});
