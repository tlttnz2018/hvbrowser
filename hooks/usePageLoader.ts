import { useCallback } from 'react';

import {
  getOfflineChapterById,
  getOfflineChapterByUrl,
  markOfflineChapterOpened,
  updateOfflineChapterStatus,
} from '../db/offline';
import { useAppStore } from '../stores/useAppStore';
import { useWebPageStore } from '../stores/useWebPageStore';
import { cleanupHtml } from '../utils/cleanup';
import { convertHtmlPageToHV, downloadHtmlPage, extractHtmlTitle } from '../utils/downloader';
import { queueEpubImportFromPicker } from '../utils/epub-import-queue';
import { fixUrl } from '../utils/normalize-url';
import { importTxtFromPicker } from '../utils/txt-import';
import { injectBaseHref } from '../utils/webview-html';

interface LoadPageOptions {
  skipHistory?: boolean;
}

interface LoadOfflineChapterOptions extends LoadPageOptions {
  anchor?: string | null;
}

export function usePageLoader() {
  const {
    pushCurrentHistory,
    refreshOfflineLibrary,
    markOfflineChapterOpened: markOfflineChapterOpenedInState,
    setLoading,
    setLoadingStage,
    setError,
    setHtmlContent,
    setCurrentUrl,
    setPendingContentAnchor,
    setWebPageTitle,
    setLastViewUrl,
    markBookmarkVisited,
    setCurrentContentSource,
  } = useAppStore();
  const setFullSite = useWebPageStore((s) => s.setFullSite);
  const setFontSize = useWebPageStore((s) => s.setFontSize);
  const setIsHV = useWebPageStore((s) => s.setIsHV);
  const setUrlInputFocus = useWebPageStore((s) => s.setUrlInputFocus);

  const resolveOfflineChapterForUrl = useCallback(async (url: string) => {
    const chapterFromState = useAppStore.getState().getOfflineChapterByUrlFromState(url);
    if (chapterFromState) {
      return chapterFromState;
    }

    return await getOfflineChapterByUrl(url);
  }, []);

  const loadOfflineChapter = useCallback(
    async (chapterId: number, options?: LoadOfflineChapterOptions) => {
      const chapter = await getOfflineChapterById(chapterId);
      if (!chapter) {
        setError(true);
        return;
      }
      const currentState = useAppStore.getState();
      const openingLocalFileChapter =
        chapter.chapterUrl.startsWith('epub://') || chapter.chapterUrl.startsWith('txt://');
      const alreadyInLocalFileSession =
        currentState.currentContentSource === 'offline' &&
        (currentState.currentUrl.startsWith('epub://') ||
          currentState.currentUrl.startsWith('txt://'));

      if (!options?.skipHistory) {
        pushCurrentHistory();
      }

      if (openingLocalFileChapter && !alreadyInLocalFileSession) {
        setFullSite(false);
      }
      if (openingLocalFileChapter) {
        if (chapter.readerFontSize != null) {
          setFontSize(chapter.readerFontSize);
        }
        if (chapter.readerIsHv != null) {
          setIsHV(chapter.readerIsHv);
        }
      }

      setUrlInputFocus(false);
      setLoading(true);
      setLoadingStage(chapter.convertedHvHtml ? 'rendering' : 'converting');
      setError(false);
      setPendingContentAnchor(options?.anchor ?? null);
      setCurrentContentSource('offline', chapter.id);
      setHtmlContent('', '');
      setCurrentUrl(chapter.chapterUrl);

      try {
        const dictionary = useAppStore.getState().dictionary;
        const originalHtml = chapter.originalHtml;
        let convertedHtml = chapter.convertedHvHtml;

        if (!convertedHtml) {
          const cleanedOriginalHtml = (await cleanupHtml(originalHtml)) || originalHtml;
          convertedHtml = await convertHtmlPageToHV(cleanedOriginalHtml, dictionary);
          const updatedChapter = await updateOfflineChapterStatus(chapter.id, 'downloaded', null, {
            convertedHvHtml: convertedHtml,
            downloadedAt: chapter.downloadedAt ?? new Date().toISOString(),
          });

          if (updatedChapter) {
            await refreshOfflineLibrary();
          }
          setLoadingStage('rendering');
        }

        const htmlOrig = injectBaseHref(originalHtml, chapter.chapterUrl);
        const htmlHv = injectBaseHref(convertedHtml, chapter.chapterUrl);
        const openedChapter = await markOfflineChapterOpened(chapter.id);

        setWebPageTitle(chapter.chapterName);
        setLastViewUrl(chapter.chapterUrl);
        setHtmlContent('\ufeff' + htmlOrig, '\ufeff' + htmlHv);
        if (openedChapter) {
          markOfflineChapterOpenedInState(openedChapter);
        }
        setError(false);
      } catch (error) {
        console.error('Offline page load error:', error);
        setError(true);
        setLoading(false);
      }
    },
    [
      pushCurrentHistory,
      refreshOfflineLibrary,
      markOfflineChapterOpenedInState,
      setCurrentContentSource,
      setCurrentUrl,
      setError,
      setHtmlContent,
      setLastViewUrl,
      setLoading,
      setLoadingStage,
      setPendingContentAnchor,
      setUrlInputFocus,
      setFontSize,
      setFullSite,
      setIsHV,
      setWebPageTitle,
    ],
  );

  const loadPage = useCallback(
    async (rawUrl: string, options?: LoadPageOptions) => {
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
      const offlineChapter =
        url.startsWith('epub://') || url.startsWith('txt://')
          ? await resolveOfflineChapterForUrl(url)
          : null;

      if (offlineChapter) {
        await loadOfflineChapter(offlineChapter.id, {
          skipHistory: options?.skipHistory,
          anchor: url.includes('#') ? url.slice(url.indexOf('#')) : null,
        });
        return;
      }

      if (!options?.skipHistory) {
        pushCurrentHistory();
      }
      setUrlInputFocus(false);
      setPendingContentAnchor(null);
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
      pushCurrentHistory,
      setLoading,
      setLoadingStage,
      setError,
      setHtmlContent,
      setCurrentUrl,
      setPendingContentAnchor,
      setWebPageTitle,
      setLastViewUrl,
      markBookmarkVisited,
      setCurrentContentSource,
      setUrlInputFocus,
      loadOfflineChapter,
      resolveOfflineChapterForUrl,
    ],
  );

  const importEpub = useCallback(async () => {
    await queueEpubImportFromPicker();
  }, []);

  const importTxt = useCallback(async () => {
    const result = await importTxtFromPicker();
    if (result?.chapter) {
      await loadOfflineChapter(result.chapter.id);
    }
  }, [loadOfflineChapter]);

  return { importEpub, importTxt, loadPage, loadOfflineChapter };
}
