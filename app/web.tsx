import React, { useRef, useEffect, useCallback } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { useAppStore } from '../stores/useAppStore';
import { useWebPageStore } from '../stores/useWebPageStore';
import { usePageLoader } from '../hooks/usePageLoader';
import { extractBaseUrl } from '../utils/normalize-url';
import {
  stripPresentationHtml,
  stripPresentationHtmlWithChineseTooltips,
  stripPresentationHtmlWithHvTooltips,
} from '../utils/webview-html';

export default function WebScreen() {
  const webViewRef = useRef<WebView>(null);
  const { loadPage } = usePageLoader();

  const loading = useAppStore((s) => s.loading);
  const htmlOrig = useAppStore((s) => s.htmlOrig);
  const htmlHV = useAppStore((s) => s.htmlHV);
  const currentUrl = useAppStore((s) => s.currentUrl);
  const dictionary = useAppStore((s) => s.dictionary);
  const pinyinDictionary = useAppStore((s) => s.pinyinDictionary);

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
  const htmlSource = fullSite
    ? activeHtml
    : isHV
      ? stripPresentationHtmlWithHvTooltips(htmlOrig, fontSize, dictionary, pinyinDictionary)
      : stripPresentationHtmlWithChineseTooltips(htmlOrig, fontSize, dictionary, pinyinDictionary);
  const baseUrl = fullSite && currentUrl ? extractBaseUrl(currentUrl) : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: '#f6f3ee' }}>
      {loading && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(246,243,238,0.84)',
            zIndex: 2,
          }}
        >
          <View
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 22,
              paddingVertical: 18,
              borderRadius: 20,
              backgroundColor: '#fffdf8',
              borderWidth: 1,
              borderColor: '#e3d8c9',
            }}
          >
            <ActivityIndicator animating={loading} color="#8a5a2b" size="small" />
          </View>
        </View>
      )}
      {!loading && (
        <WebView
          ref={webViewRef}
          source={{
            html: htmlSource,
            baseUrl,
          }}
          style={{ flex: 1, backgroundColor: '#fffdf8' }}
          mixedContentMode="compatibility"
          injectedJavaScript={initialScript}
          onNavigationStateChange={handleNavigationStateChange}
        />
      )}
    </View>
  );
}
