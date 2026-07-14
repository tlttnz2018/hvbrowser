import React, { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView, WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';

import { usePageLoader } from '../hooks/usePageLoader';
import { useAppStore } from '../stores/useAppStore';
import { useWebPageStore } from '../stores/useWebPageStore';
import { absoluteFill, Theme, useTheme } from '../theme';
import { extractBaseUrl } from '../utils/normalize-url';
import {
  normalizeEpubFullSiteHtml,
  stripPresentationHtmlWithChineseTooltips,
  stripPresentationHtmlWithHvTooltips,
} from '../utils/webview-html';

function buildFullSiteFontScript(fontSize: number): string {
  const fullSiteScale = 1 + (fontSize - 1) * 0.5;

  return `
    (function() {
      var scale = ${JSON.stringify(fullSiteScale)};
      var root = document.body || document.documentElement;
      if (!root) {
        return true;
      }

      var nodes = [root].concat(Array.prototype.slice.call(root.querySelectorAll('*')));
      for (var index = 0; index < nodes.length; index += 1) {
        var node = nodes[index];
        if (!node || !node.style) {
          continue;
        }

        var computed = window.getComputedStyle(node);
        if (!computed) {
          continue;
        }

        var baseFontSize = node.getAttribute('data-hvbrowser-base-font-size');
        if (!baseFontSize) {
          var currentFontSize = parseFloat(computed.fontSize || '');
          if (Number.isFinite(currentFontSize) && currentFontSize > 0) {
            baseFontSize = String(currentFontSize);
            node.setAttribute('data-hvbrowser-base-font-size', baseFontSize);
          }
        }

        var fontSizePx = parseFloat(baseFontSize || '');
        if (Number.isFinite(fontSizePx) && fontSizePx > 0) {
          node.style.setProperty('font-size', (fontSizePx * scale) + 'px', 'important');
        }

        var computedLineHeight = computed.lineHeight || '';
        if (computedLineHeight.slice(-2) !== 'px') {
          if (scale === 1) {
            node.style.removeProperty('line-height');
          }
          continue;
        }

        var baseLineHeight = node.getAttribute('data-hvbrowser-base-line-height');
        if (!baseLineHeight) {
          var currentLineHeight = parseFloat(computedLineHeight);
          if (Number.isFinite(currentLineHeight) && currentLineHeight > 0) {
            baseLineHeight = String(currentLineHeight);
            node.setAttribute('data-hvbrowser-base-line-height', baseLineHeight);
          }
        }

        var lineHeightPx = parseFloat(baseLineHeight || '');
        if (Number.isFinite(lineHeightPx) && lineHeightPx > 0) {
          node.style.setProperty('line-height', (lineHeightPx * scale) + 'px', 'important');
        }
      }

      return true;
    })();
  `;
}

export default function IndexScreen() {
  const webViewRef = useRef<WebView>(null);
  const readerScrollPositionsRef = useRef<Record<string, number>>({});
  const pendingReaderRestoreUrlRef = useRef<string | null>(null);
  const currentOfflineChapterScrollRatioRef = useRef<number | null>(null);
  const savedReaderScrollPositionsRef = useRef<Record<number, { ratio: number; savedAt: number }>>(
    {},
  );
  const { loadPage, loadOfflineChapter } = usePageLoader();
  const theme = useTheme();
  const styles = createStyles(theme);

  const loading = useAppStore((s) => s.loading);
  const loadingStage = useAppStore((s) => s.loadingStage);
  const htmlOrig = useAppStore((s) => s.htmlOrig);
  const htmlHV = useAppStore((s) => s.htmlHV);
  const currentUrl = useAppStore((s) => s.currentUrl);
  const currentContentSource = useAppStore((s) => s.currentContentSource);
  const currentOfflineChapterId = useAppStore((s) => s.currentOfflineChapterId);
  const pendingContentAnchor = useAppStore((s) => s.pendingContentAnchor);
  const getOfflineChapterByUrlFromState = useAppStore((s) => s.getOfflineChapterByUrlFromState);
  const currentOfflineChapter = useAppStore((s) =>
    s.currentOfflineChapterId ? s.getOfflineChapterByIdFromState(s.currentOfflineChapterId) : null,
  );
  const currentOfflineStory = useAppStore((s) => s.getCurrentOfflineStoryFromState());
  const dictionary = useAppStore((s) => s.dictionary);
  const pinyinDictionary = useAppStore((s) => s.pinyinDictionary);
  const setLoading = useAppStore((s) => s.setLoading);
  const setLoadingStage = useAppStore((s) => s.setLoadingStage);
  const setPendingContentAnchor = useAppStore((s) => s.setPendingContentAnchor);
  const updateOfflineChapterReaderScrollRatio = useAppStore(
    (s) => s.updateOfflineChapterReaderScrollRatio,
  );

  const isHV = useWebPageStore((s) => s.isHV);
  const fullSite = useWebPageStore((s) => s.fullSite);
  const fontSize = useWebPageStore((s) => s.fontSize);
  const setMoreMenu = useWebPageStore((s) => s.setMoreMenu);

  useEffect(() => {
    currentOfflineChapterScrollRatioRef.current = currentOfflineChapter?.readerScrollRatio ?? null;
  }, [currentOfflineChapter?.readerScrollRatio]);

  useEffect(() => {
    if (fullSite || !currentUrl) {
      pendingReaderRestoreUrlRef.current = null;
      return;
    }

    if (pendingContentAnchor) {
      pendingReaderRestoreUrlRef.current = null;
      return;
    }

    const scrollRatio =
      readerScrollPositionsRef.current[currentUrl] ??
      currentOfflineChapterScrollRatioRef.current ??
      null;
    if (scrollRatio != null && Number.isFinite(scrollRatio)) {
      readerScrollPositionsRef.current[currentUrl] = scrollRatio;
    }
    pendingReaderRestoreUrlRef.current =
      scrollRatio != null && Number.isFinite(scrollRatio) ? currentUrl : null;
  }, [
    currentUrl,
    currentContentSource,
    fontSize,
    fullSite,
    isHV,
    pendingContentAnchor,
    theme.mode,
  ]);

  const persistTxtReaderScrollRatio = useCallback(
    (chapterId: number, ratio: number) => {
      const safeRatio = Math.max(0, Math.min(1, ratio));
      const previous = savedReaderScrollPositionsRef.current[chapterId];
      const now = Date.now();

      if (
        previous &&
        now - previous.savedAt < 1000 &&
        Math.abs(previous.ratio - safeRatio) < 0.005
      ) {
        return;
      }

      savedReaderScrollPositionsRef.current[chapterId] = {
        ratio: safeRatio,
        savedAt: now,
      };

      updateOfflineChapterReaderScrollRatio(chapterId, safeRatio).catch((error) => {
        console.error('TXT reader scroll save error:', error);
      });
    },
    [updateOfflineChapterReaderScrollRatio],
  );

  useEffect(() => {
    if (webViewRef.current && fullSite) {
      const script = buildFullSiteFontScript(fontSize);
      webViewRef.current.injectJavaScript(script);
    }
  }, [fontSize, fullSite]);

  const initialScript = `
    (function() {
      ${buildFullSiteFontScript(fontSize)}
      if (window.__HVBROWSER_LINK_BRIDGE__) { return true; }
      window.__HVBROWSER_LINK_BRIDGE__ = true;
      var postScrollPosition = function() {
        if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) {
          return;
        }
        var doc = document.documentElement;
        var body = document.body;
        var scrollTop = window.scrollY || (doc && doc.scrollTop) || (body && body.scrollTop) || 0;
        var scrollHeight = Math.max(
          doc ? doc.scrollHeight : 0,
          body ? body.scrollHeight : 0,
          doc ? doc.offsetHeight : 0,
          body ? body.offsetHeight : 0
        );
        var maxScroll = Math.max(0, scrollHeight - window.innerHeight);
        var ratio = maxScroll > 0 ? scrollTop / maxScroll : 0;
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'scroll-position', ratio: ratio }));
      };
      var scheduledScrollPost = null;
      var scheduleScrollPositionPost = function() {
        if (scheduledScrollPost !== null) {
          window.clearTimeout(scheduledScrollPost);
        }
        scheduledScrollPost = window.setTimeout(function() {
          scheduledScrollPost = null;
          postScrollPosition();
        }, 80);
      };
      window.addEventListener('scroll', scheduleScrollPositionPost, { passive: true });
      window.addEventListener('load', postScrollPosition);
      document.addEventListener('click', function() {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'page-press' }));
        }
      }, true);
      document.addEventListener('click', function(event) {
        var target = event.target;
        var link = target && target.closest ? target.closest('a[href]') : null;
        if (!link) { return; }
        var rawHref = link.getAttribute('href') || '';
        if (rawHref.charAt(0) === '#') { return; }
        var href = link.href || rawHref;
        if (!href || href.indexOf('javascript:') === 0) { return; }
        try {
          var nextUrl = new URL(href, window.location.href);
          var currentUrl = new URL(window.location.href);
          if (
            nextUrl.origin === currentUrl.origin &&
            nextUrl.pathname === currentUrl.pathname &&
            nextUrl.search === currentUrl.search &&
            nextUrl.hash &&
            nextUrl.hash !== currentUrl.hash
          ) {
            return;
          }
        } catch (error) {}
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'link-press', url: href }));
          event.preventDefault();
        }
      }, true);
      return true;
    })();
  `;

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const payload = JSON.parse(event.nativeEvent.data) as {
          type?: string;
          url?: string;
          ratio?: number;
        };
        if (payload.type === 'page-press') {
          setMoreMenu(false);
          return;
        }

        if (payload.type === 'scroll-position') {
          if (
            !fullSite &&
            currentUrl &&
            typeof payload.ratio === 'number' &&
            Number.isFinite(payload.ratio)
          ) {
            if (pendingReaderRestoreUrlRef.current === currentUrl) {
              return;
            }
            const scrollRatio = Math.max(0, Math.min(1, payload.ratio));
            readerScrollPositionsRef.current[currentUrl] = scrollRatio;
            if (currentOfflineStory?.sourceType === 'txt' && currentOfflineChapterId) {
              persistTxtReaderScrollRatio(currentOfflineChapterId, scrollRatio);
            }
          }
          return;
        }

        if (payload.type === 'restore-complete') {
          if (currentUrl && pendingReaderRestoreUrlRef.current === currentUrl) {
            pendingReaderRestoreUrlRef.current = null;
          }
          return;
        }

        if (payload.type !== 'link-press' || !payload.url || payload.url === currentUrl) {
          return;
        }

        const offlineChapter = getOfflineChapterByUrlFromState(payload.url);

        if (offlineChapter) {
          loadOfflineChapter(offlineChapter.id, {
            anchor: payload.url.includes('#') ? payload.url.slice(payload.url.indexOf('#')) : null,
          });
        } else {
          loadPage(payload.url);
        }
      } catch {
        // Ignore non-JSON messages from the page.
      }
    },
    [
      currentUrl,
      fullSite,
      currentOfflineChapterId,
      currentOfflineStory?.sourceType,
      getOfflineChapterByUrlFromState,
      loadOfflineChapter,
      loadPage,
      persistTxtReaderScrollRatio,
      setMoreMenu,
    ],
  );

  const handleNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      const { url, title, navigationType } = navState;

      if (!url || url === currentUrl || !title) return;
      if (currentContentSource === 'offline') return;
      if (
        currentUrl &&
        url.replace(/#.*$/, '') === currentUrl.replace(/#.*$/, '') &&
        /#/.test(url)
      ) {
        return;
      }
      if (url.indexOf('about') !== -1 || url.match(/data:/) || url.indexOf('postMessage') !== -1) {
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
    [currentContentSource, currentUrl, loadPage],
  );

  const activeHtml = isHV ? htmlHV : htmlOrig;
  const hasHtml = !!activeHtml;
  const isCurrentEpub = currentOfflineStory?.sourceType === 'epub';
  const htmlSource = fullSite
    ? isCurrentEpub
      ? normalizeEpubFullSiteHtml(activeHtml, theme.reader)
      : activeHtml
    : isHV
      ? stripPresentationHtmlWithHvTooltips(
          htmlOrig,
          fontSize,
          dictionary,
          pinyinDictionary,
          theme.reader,
        )
      : stripPresentationHtmlWithChineseTooltips(
          htmlOrig,
          fontSize,
          dictionary,
          pinyinDictionary,
          theme.reader,
        );
  const baseUrl =
    currentUrl && /^(https?:|file:)/i.test(currentUrl) ? extractBaseUrl(currentUrl) : undefined;
  const restoreReaderScrollPosition = useCallback(() => {
    if (!webViewRef.current || fullSite || !currentUrl) {
      return;
    }

    const scrollRatio = readerScrollPositionsRef.current[currentUrl];
    if (scrollRatio == null || !Number.isFinite(scrollRatio)) {
      return;
    }

    const restoreScript = `
      (function() {
        var ratio = ${JSON.stringify(scrollRatio)};
        var maxScroll = Math.max(
          0,
          (document.documentElement ? document.documentElement.scrollHeight : 0) - window.innerHeight,
          (document.body ? document.body.scrollHeight : 0) - window.innerHeight
        );
        window.scrollTo(0, Math.max(0, maxScroll * ratio));
        window.setTimeout(function() {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'restore-complete' }));
          }
        }, 80);
        return true;
      })();
    `;

    webViewRef.current.injectJavaScript(restoreScript);
  }, [currentUrl, fullSite]);

  const restorePendingAnchor = useCallback(() => {
    if (!webViewRef.current || !pendingContentAnchor) {
      return;
    }

    const anchorValue = pendingContentAnchor.replace(/^#/, '');
    const anchorScript = `
      (function() {
        var targetId = ${JSON.stringify(anchorValue)};
        var anchor = document.getElementById(targetId) || document.getElementsByName(targetId)[0];
        if (anchor && typeof anchor.scrollIntoView === 'function') {
          anchor.scrollIntoView({ block: 'start' });
        }
        return true;
      })();
    `;

    webViewRef.current.injectJavaScript(anchorScript);
    setPendingContentAnchor(null);
  }, [pendingContentAnchor, setPendingContentAnchor]);

  const loadingLabel =
    loadingStage === 'downloading'
      ? 'Downloading page'
      : loadingStage === 'converting'
        ? 'Converting to Han-Viet'
        : 'Preparing page';

  const handleLoadStart = useCallback(() => {
    if (!loading) {
      return;
    }

    setLoadingStage('rendering');
  }, [loading, setLoadingStage]);

  const handleLoadEnd = useCallback(() => {
    if (pendingContentAnchor) {
      restorePendingAnchor();
    } else {
      restoreReaderScrollPosition();
    }
    setLoading(false);
  }, [pendingContentAnchor, restorePendingAnchor, restoreReaderScrollPosition, setLoading]);

  return (
    <View style={styles.screen}>
      {hasHtml && (
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
          onLoadStart={handleLoadStart}
          onLoadEnd={handleLoadEnd}
          onMessage={handleMessage}
          onNavigationStateChange={handleNavigationStateChange}
        />
      )}
      {loading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator animating={loading} color={theme.colors.accent} size="small" />
            <Text style={styles.loadingTitle}>{loadingLabel}</Text>
            <Text style={styles.loadingSubtitle}>
              Please wait while the reader finishes loading.
            </Text>
          </View>
        </View>
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
      minWidth: 220,
      gap: theme.spacing.xs,
      ...theme.shadows.md,
    },
    loadingTitle: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
      textAlign: 'center',
      marginTop: theme.spacing.xs,
    },
    loadingSubtitle: {
      ...theme.typography.caption,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
    webView: {
      flex: 1,
      backgroundColor: theme.reader.background,
    },
  });
