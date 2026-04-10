import '../global.css';
import { Buffer } from 'buffer';
// Polyfill Buffer for iconv-lite on Hermes
if (typeof global !== 'undefined') {
  (global as typeof globalThis & { Buffer?: typeof Buffer }).Buffer =
    (global as typeof globalThis & { Buffer?: typeof Buffer }).Buffer || Buffer;
}

import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Slot, usePathname } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import SearchInput from '../components/SearchInput';
import BookmarkToggleButton from '../components/buttons/BookmarkToggleButton';
import HVToggleButton from '../components/buttons/HVToggleButton';
import MoreToggleButton from '../components/buttons/MoreToggleButton';
import HomeToggleButton from '../components/buttons/HomeToggleButton';
import HomeSitesViewToggleButton from '../components/buttons/HomeSitesViewToggleButton';
import WebTextToolbar from '../components/toolbars/WebTextToolbar';

import { useAppStore } from '../stores/useAppStore';
import { useWebPageStore } from '../stores/useWebPageStore';
import { usePageLoader } from '../hooks/usePageLoader';
import { useHistory } from '../hooks/useHistory';

export default function RootLayout() {
  const pathname = usePathname();
  const { loadPage } = usePageLoader();
  const { goBack } = useHistory();

  const currentUrl = useAppStore((s) => s.currentUrl);
  const history = useAppStore((s) => s.history);
  const setDictionary = useAppStore((s) => s.setDictionary);
  const moreMenu = useWebPageStore((s) => s.moreMenu);
  const loading = useAppStore((s) => s.loading);
  const setUrlInputFocus = useWebPageStore((s) => s.setUrlInputFocus);

  const isWebScreen = pathname === '/web';
  const isHomeScreen = pathname === '/';
  const showMoreMenu = moreMenu && isWebScreen && !loading;

  // Load dictionary on mount
  useEffect(() => {
    const dict = require('../data/DataHanVietUni.json') as Record<string, string>;
    setDictionary(dict);
  }, [setDictionary]);

  const safeCurrentUrl =
    currentUrl.indexOf('Bundle/Application') === -1 ? currentUrl : '';

  const backButtonEnabled = history.length >= 1;

  const reloadPage = () => {
    const url = useAppStore.getState().currentUrl;
    if (url) loadPage(url);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      <View style={styles.controlBar}>
        {isWebScreen && (
          <View style={styles.urlInput}>
            <SearchInput
              placeholder="Input chinese website url"
              url={safeCurrentUrl}
              onSubmit={loadPage}
              onFocus={setUrlInputFocus}
              backButtonEnabled={backButtonEnabled}
              onBack={goBack}
            />
          </View>
        )}
        <BookmarkToggleButton />
        <HVToggleButton />
        <MoreToggleButton />
        {isHomeScreen && <HomeSitesViewToggleButton />}
        <HomeToggleButton />
      </View>
      {showMoreMenu && <WebTextToolbar reloadPage={reloadPage} />}
      <View style={styles.content}>
        <Slot />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  controlBar: {
    height: 30,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  urlInput: {
    flex: 1,
    flexDirection: 'row',
  },
  content: {
    flex: 1,
  },
});
