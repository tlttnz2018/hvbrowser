import React, { useRef, useEffect, useCallback } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { useAppStore } from '../stores/useAppStore';
import { useWebPageStore } from '../stores/useWebPageStore';
import { usePageLoader } from '../hooks/usePageLoader';
import { extractBaseUrl } from '../utils/normalize-url';
import { Theme, absoluteFill, useTheme } from '../theme';
import {
  stripPresentationHtmlWithChineseTooltips,
  stripPresentationHtmlWithHvTooltips,
} from '../utils/webview-html';

export default function IndexScreen() {
  const webViewRef = useRef<WebView>(null);
  const { loadPage, loadOfflineChapter } = usePageLoader();
  const theme = useTheme();
  const styles = createStyles(theme);

  const loading = useAppStore((s) => s.loading);
  const htmlOrig = useAppStore((s) => s.htmlOrig);
  const htmlHV = useAppStore((s) => s.htmlHV);
  const currentUrl = useAppStore((s) => s.currentUrl);
  const currentContentSource = useAppStore((s) => s.currentContentSource);
  const getOfflineChapterByUrlFromState = useAppStore((s) => s.getOfflineChapterByUrlFromState);
  const dictionary = useAppStore((s) => s.dictionary);
  const pinyinDictionary = useAppStore((s) => s.pinyinDictionary);

  const isHV = useWebPageStore((s) => s.isHV);
  const fullSite = useWebPageStore((s) => s.fullSite);
  const fontSize = useWebPageStore((s) => s.fontSize);

  useEffect(() => {
    if (webViewRef.current && fullSite) {
      const script = `document.body.style.fontSize = "${fontSize}em"; true;`;
      webViewRef.current.injectJavaScript(script);
    }
  }, [fontSize, fullSite]);

  const initialScript = `(function() { document.body.style.fontSize = "${fontSize}em"; })();`;

  const handleShouldStartLoadWithRequest = useCallback(
    (request: ShouldStartLoadRequest) => {
      const { url, isTopFrame, navigationType } = request;

      if (
        !url ||
        url === currentUrl ||
        url.indexOf('about') !== -1 ||
        url.match(/data:/) ||
        url.indexOf('postMessage') !== -1
      ) {
        return true;
      }

      if (currentContentSource !== 'offline') {
        return true;
      }

      if (!isTopFrame) {
        return true;
      }

      if (navigationType && navigationType !== 'click') {
        return true;
      }

      const offlineChapter = getOfflineChapterByUrlFromState(url);
      if (offlineChapter) {
        loadOfflineChapter(offlineChapter.id);
      } else {
        loadPage(url);
      }

      return false;
    },
    [currentContentSource, currentUrl, getOfflineChapterByUrlFromState, loadOfflineChapter, loadPage]
  );

  const handleNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      const { url, title, navigationType } = navState;

      if (!url || url === currentUrl || !title) return;
      if (currentContentSource === 'offline') return;
      if (
        url.indexOf('about') !== -1 ||
        url.match(/data:/) ||
        url.indexOf('postMessage') !== -1
      ) {
        return;
      }

      try {
        const base = extractBaseUrl(url);
        if (url === base + '/' && navigationType !== 'click') return;
      } catch {
        // Ignore URL parse errors and let the loader handle them.
      }

      useAppStore.getState().setHtmlContent('', '');
      loadPage(url);
    },
    [currentContentSource, currentUrl, loadPage]
  );

  const activeHtml = isHV ? htmlHV : htmlOrig;
  const htmlSource = fullSite
    ? activeHtml
    : isHV
      ? stripPresentationHtmlWithHvTooltips(htmlOrig, fontSize, dictionary, pinyinDictionary, theme.reader)
      : stripPresentationHtmlWithChineseTooltips(htmlOrig, fontSize, dictionary, pinyinDictionary, theme.reader);
  const baseUrl = currentUrl ? extractBaseUrl(currentUrl) : undefined;

  return (
    <View style={styles.screen}>
      {loading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator animating={loading} color={theme.colors.accent} size="small" />
          </View>
        </View>
      )}
      {!loading && (
        <WebView
          key={`${currentContentSource}:${currentUrl}:${fullSite ? 'full' : 'reader'}:${isHV ? 'hv' : 'orig'}`}
          ref={webViewRef}
          source={{
            html: htmlSource,
            baseUrl,
          }}
          style={styles.webView}
          mixedContentMode="compatibility"
          injectedJavaScript={initialScript}
          onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
          onNavigationStateChange={handleNavigationStateChange}
        />
      )}
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    loadingOverlay: {
      ...absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.overlay,
      zIndex: 2,
    },
    loadingCard: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 22,
      paddingVertical: 18,
      borderRadius: theme.radius.xxl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.borderMuted,
    },
    webView: {
      flex: 1,
      backgroundColor: theme.reader.background,
    },
  });
