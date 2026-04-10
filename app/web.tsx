import React, { useRef, useEffect, useCallback } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { useAppStore } from '../stores/useAppStore';
import { useWebPageStore } from '../stores/useWebPageStore';
import { usePageLoader } from '../hooks/usePageLoader';
import { extractBaseUrl } from '../utils/normalize-url';
import { stripPresentationHtml } from '../utils/webview-html';

export default function WebScreen() {
  const webViewRef = useRef<WebView>(null);
  const { loadPage } = usePageLoader();

  const loading = useAppStore((s) => s.loading);
  const htmlOrig = useAppStore((s) => s.htmlOrig);
  const htmlHV = useAppStore((s) => s.htmlHV);
  const currentUrl = useAppStore((s) => s.currentUrl);

  const isHV = useWebPageStore((s) => s.isHV);
  const fullSite = useWebPageStore((s) => s.fullSite);
  const fontSize = useWebPageStore((s) => s.fontSize);

  // Inject font size whenever it changes
  useEffect(() => {
    if (webViewRef.current && fullSite) {
      const script = `document.body.style.fontSize = "${fontSize}em"; true;`;
      webViewRef.current.injectJavaScript(script);
    }
  }, [fontSize, fullSite]);

  const initialScript = `(function() { document.body.style.fontSize = "${fontSize}em"; })();`;

  const handleNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      const { url, title, navigationType } = navState;

      if (!url) return;
      if (url === currentUrl) return;
      if (!title) return;
      if (
        url.indexOf('about') !== -1 ||
        url.match(/data:/) ||
        url.indexOf('postMessage') !== -1
      ) {
        return;
      }
      // Skip base-URL-only navigations that aren't user clicks
      try {
        const base = extractBaseUrl(url);
        if (url === base + '/' && navigationType !== 'click') return;
      } catch {
        // ignore URL parse errors
      }

      // Clear content to prevent flash of untranslated text
      useAppStore.getState().setHtmlContent('', '');
      loadPage(url);
    },
    [currentUrl, loadPage]
  );

  const activeHtml = isHV ? htmlHV : htmlOrig;
  const htmlSource = fullSite ? activeHtml : stripPresentationHtml(activeHtml, fontSize);
  const baseUrl = fullSite && currentUrl ? extractBaseUrl(currentUrl) : undefined;

  return (
    <View style={{ flex: 1 }}>
      {loading && (
        <ActivityIndicator
          animating={loading}
          color="rgba(0,0,0,0.2)"
          size="large"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      )}
      {!loading && (
        <WebView
          ref={webViewRef}
          source={{
            html: htmlSource,
            baseUrl,
          }}
          style={{ flex: 1 }}
          mixedContentMode="compatibility"
          injectedJavaScript={initialScript}
          onNavigationStateChange={handleNavigationStateChange}
        />
      )}
    </View>
  );
}
