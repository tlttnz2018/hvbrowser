import { useCallback } from 'react';

import { getOfflineChapterById } from '../db/offline';
import { useAppStore } from '../stores/useAppStore';
import { useWebPageStore } from '../stores/useWebPageStore';
import { cleanupHtml } from '../utils/cleanup';
import { convertHtmlPageToHV, downloadHtmlPage, extractHtmlTitle } from '../utils/downloader';
import { fixUrl } from '../utils/normalize-url';
import { injectBaseHref } from '../utils/webview-html';

export function usePageLoader() {
  const {
    setLoading,
    setLoadingStage,
    setError,
    setHtmlContent,
    setCurrentUrl,
    setWebPageTitle,
    setLastViewUrl,
    pushHistory,
    markBookmarkVisited,
    setCurrentContentSource,
  } = useAppStore();
  const setUrlInputFocus = useWebPageStore((s) => s.setUrlInputFocus);

  const loadPage = useCallback(
    async (rawUrl: string) => {
      if (!rawUrl) return;
      if (
        rawUrl.indexOf('about') !== -1 ||
        rawUrl.indexOf('Bundle/Application') !== -1 ||
        rawUrl.indexOf('postMessage') !== -1
      ) {
        return;
      }

      const currentUrl = useAppStore.getState().currentUrl;
      const url = fixUrl(currentUrl, rawUrl);

      pushHistory(url);
      setUrlInputFocus(false);
      setCurrentContentSource('remote');
      setHtmlContent('', '');
      setCurrentUrl(url);
      setLoading(true);
      setLoadingStage('downloading');
      setError(false);

      try {
        const dictionary = useAppStore.getState().dictionary;
        const htmlContent = await downloadHtmlPage(url);
        setLoadingStage('converting');
        const htmlClean = await cleanupHtml(htmlContent);
        const htmlOrig = injectBaseHref(htmlContent, url);
        const htmlConvert = await convertHtmlPageToHV(htmlClean || '', dictionary);
        const htmlHv = injectBaseHref(htmlConvert, url);

        const title = extractHtmlTitle(htmlConvert) || extractHtmlTitle(htmlContent) || url;
        setWebPageTitle(title);
        setLastViewUrl(url);
        await markBookmarkVisited(url);
        setHtmlContent('\ufeff' + htmlOrig, '\ufeff' + htmlHv);
        setLoadingStage('rendering');
        setError(false);
      } catch (e) {
        console.error('Page load error:', e);
        setError(true);
        setLoading(false);
      } finally {
        if (useAppStore.getState().error) {
          setLoading(false);
        }
      }
    },
    [
      setLoading,
      setLoadingStage,
      setError,
      setHtmlContent,
      setCurrentUrl,
      setWebPageTitle,
      setLastViewUrl,
      pushHistory,
      markBookmarkVisited,
      setCurrentContentSource,
      setUrlInputFocus,
    ],
  );

  const loadOfflineChapter = useCallback(
    async (chapterId: number) => {
      const chapter = await getOfflineChapterById(chapterId);
      if (!chapter) {
        setError(true);
        return;
      }

      setUrlInputFocus(false);
      setLoading(true);
      setLoadingStage('rendering');
      setError(false);
      setCurrentContentSource('offline', chapter.id);
      setHtmlContent('', '');
      setCurrentUrl(chapter.chapterUrl);

      try {
        const htmlOrig = injectBaseHref(chapter.originalHtml, chapter.chapterUrl);
        const htmlHv = injectBaseHref(chapter.convertedHvHtml, chapter.chapterUrl);

        setWebPageTitle(chapter.chapterName);
        setLastViewUrl(chapter.chapterUrl);
        setHtmlContent('\ufeff' + htmlOrig, '\ufeff' + htmlHv);
        setError(false);
      } catch (error) {
        console.error('Offline page load error:', error);
        setError(true);
        setLoading(false);
      }
    },
    [
      setCurrentContentSource,
      setCurrentUrl,
      setError,
      setHtmlContent,
      setLastViewUrl,
      setLoading,
      setLoadingStage,
      setUrlInputFocus,
      setWebPageTitle,
    ],
  );

  return { loadPage, loadOfflineChapter };
}
