import { useCallback } from 'react';
import { InteractionManager } from 'react-native';

import {
  getOfflineChapterById,
  getOfflineChapterByUrl,
  markOfflineChapterOpened,
  updateOfflineChapterStatus,
} from '../db/offline';
import { useAppStore } from '../stores/useAppStore';
import { useWebPageStore } from '../stores/useWebPageStore';
import { cleanupHtml } from '../utils/cleanup';
import {
  getDebugCount,
  getDebugDuration,
  getDebugLength,
  logReaderDebug,
} from '../utils/debug-log';
import { downloadHtmlPage, extractHtmlTitle } from '../utils/downloader';
import { queueEpubImportFromPicker } from '../utils/epub-import-queue';
import { convertHtmlPageToHVInBackground } from '../utils/han-viet-worklet';
import { fixUrl } from '../utils/normalize-url';
import {
  getOfflineChapterPreload,
  preloadOfflineChapterConversion,
  waitForOfflineChapterPreload,
} from '../utils/offline-chapter-preload';
import { importTxtFromPicker } from '../utils/txt-import';
import { injectBaseHref } from '../utils/webview-html';

interface LoadPageOptions {
  skipHistory?: boolean;
}

interface LoadOfflineChapterOptions extends LoadPageOptions {
  anchor?: string | null;
}

const OFFLINE_CHAPTER_PRELOAD_WAIT_MS = 2500;

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
      const loadStartedAt = Date.now();
      logReaderDebug('loadOfflineChapter.start', {
        chapterId,
        skipHistory: !!options?.skipHistory,
        anchor: options?.anchor ?? null,
      });
      const previousState = useAppStore.getState();

      if (!options?.skipHistory) {
        pushCurrentHistory();
      }

      setUrlInputFocus(false);
      setLoading(true);
      setLoadingStage('converting');
      setError(false);
      setPendingContentAnchor(options?.anchor ?? null);
      setCurrentContentSource('offline', chapterId);
      setHtmlContent('', '');

      const chapter = await getOfflineChapterById(chapterId);
      if (!chapter) {
        logReaderDebug('loadOfflineChapter.missing', {
          chapterId,
          durationMs: getDebugDuration(loadStartedAt),
        });
        setCurrentContentSource(
          previousState.currentContentSource,
          previousState.currentOfflineChapterId,
        );
        setError(true);
        setLoading(false);
        return;
      }
      const currentState = useAppStore.getState();
      const openingLocalFileChapter =
        chapter.chapterUrl.startsWith('epub://') || chapter.chapterUrl.startsWith('txt://');
      const alreadyInLocalFileSession =
        currentState.currentContentSource === 'offline' &&
        (currentState.currentUrl.startsWith('epub://') ||
          currentState.currentUrl.startsWith('txt://'));

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

      setLoadingStage(chapter.convertedHvHtml ? 'rendering' : 'converting');
      setCurrentUrl(chapter.chapterUrl);
      logReaderDebug('loadOfflineChapter.record', {
        chapterId,
        url: chapter.chapterUrl,
        originalLength: getDebugLength(chapter.originalHtml),
        convertedLength: getDebugLength(chapter.convertedHvHtml),
        hasConverted: !!chapter.convertedHvHtml,
      });

      try {
        const dictionary = useAppStore.getState().dictionary;
        logReaderDebug('loadOfflineChapter.dictionary', {
          chapterId,
          dictionarySize: getDebugCount(dictionary),
        });
        const originalHtml = chapter.originalHtml;
        let convertedHtml = chapter.convertedHvHtml;
        let hasConvertedHtml = !!convertedHtml;
        let htmlOrig: string | null = null;
        let htmlHv: string | null = null;

        const readyPreload =
          getOfflineChapterPreload(chapter.id, chapter.chapterUrl) ??
          (!convertedHtml
            ? await waitForOfflineChapterPreload(chapter.id, OFFLINE_CHAPTER_PRELOAD_WAIT_MS)
            : null);
        if (readyPreload?.chapterUrl === chapter.chapterUrl) {
          hasConvertedHtml = true;
          htmlOrig = readyPreload.htmlOrig;
          htmlHv = readyPreload.htmlHv;
          setLoadingStage('rendering');
          logReaderDebug('loadOfflineChapter.preload.hit', {
            chapterId,
            waitedForMissingConversion: !chapter.convertedHvHtml,
            htmlOrigLength: getDebugLength(htmlOrig),
            htmlHvLength: getDebugLength(htmlHv),
            durationMs: getDebugDuration(loadStartedAt),
          });
        }

        if (!hasConvertedHtml) {
          const cleanupStartedAt = Date.now();
          const cleanedOriginalHtml = (await cleanupHtml(originalHtml)) || originalHtml;
          logReaderDebug('loadOfflineChapter.cleanup.done', {
            chapterId,
            originalLength: getDebugLength(originalHtml),
            cleanedLength: getDebugLength(cleanedOriginalHtml),
            durationMs: getDebugDuration(cleanupStartedAt),
          });
          convertedHtml = await convertHtmlPageToHVInBackground(cleanedOriginalHtml, dictionary);
          hasConvertedHtml = true;
          logReaderDebug('loadOfflineChapter.convert.done', {
            chapterId,
            convertedLength: getDebugLength(convertedHtml),
            durationMs: getDebugDuration(loadStartedAt),
          });
          const updatedChapter = await updateOfflineChapterStatus(chapter.id, 'downloaded', null, {
            convertedHvHtml: convertedHtml,
            downloadedAt: chapter.downloadedAt ?? new Date().toISOString(),
          });

          if (updatedChapter) {
            await refreshOfflineLibrary();
          }
          setLoadingStage('rendering');
        }

        htmlOrig ??= injectBaseHref(originalHtml, chapter.chapterUrl);
        htmlHv ??= injectBaseHref(convertedHtml, chapter.chapterUrl);
        const openedChapter = await markOfflineChapterOpened(chapter.id);
        logReaderDebug('loadOfflineChapter.setHtmlContent', {
          chapterId,
          htmlOrigLength: getDebugLength(htmlOrig),
          htmlHvLength: getDebugLength(htmlHv),
          durationMs: getDebugDuration(loadStartedAt),
        });

        setWebPageTitle(chapter.chapterName);
        setLastViewUrl(chapter.chapterUrl);
        setHtmlContent('\ufeff' + htmlOrig, '\ufeff' + htmlHv);
        if (openedChapter) {
          markOfflineChapterOpenedInState(openedChapter);
        }
        const chapters = useAppStore
          .getState()
          .getOfflineChaptersForStoryFromState(chapter.storyId);
        const activeIndex = chapters.findIndex((entry) => entry.id === chapter.id);
        const nextChapter =
          activeIndex >= 0 && activeIndex < chapters.length - 1 ? chapters[activeIndex + 1] : null;
        if (nextChapter?.downloadStatus === 'downloaded') {
          logReaderDebug('loadOfflineChapter.preload-next.schedule', {
            chapterId,
            nextChapterId: nextChapter.id,
            nextChapterUrl: nextChapter.chapterUrl,
          });
          InteractionManager.runAfterInteractions(() => {
            void preloadOfflineChapterConversion(nextChapter.id, dictionary, 'after-open-next');
          });
        }
        setError(false);
      } catch (error) {
        logReaderDebug('loadOfflineChapter.error', {
          chapterId,
          durationMs: getDebugDuration(loadStartedAt),
          error: error instanceof Error ? error.message : String(error),
        });
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
      const loadStartedAt = Date.now();
      logReaderDebug('loadPage.start', { rawUrl, skipHistory: !!options?.skipHistory });
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
      logReaderDebug('loadPage.url.fixed', { rawUrl, currentUrl, url });
      const offlineChapter =
        url.startsWith('epub://') || url.startsWith('txt://')
          ? await resolveOfflineChapterForUrl(url)
          : null;

      if (offlineChapter) {
        logReaderDebug('loadPage.delegate-offline', {
          url,
          chapterId: offlineChapter.id,
          durationMs: getDebugDuration(loadStartedAt),
        });
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
        logReaderDebug('loadPage.dictionary', {
          url,
          dictionarySize: getDebugCount(dictionary),
        });
        const htmlContent = await downloadHtmlPage(url);
        logReaderDebug('loadPage.download.done', {
          url,
          htmlLength: getDebugLength(htmlContent),
          durationMs: getDebugDuration(loadStartedAt),
        });
        setLoadingStage('converting');
        const cleanupStartedAt = Date.now();
        const htmlClean = await cleanupHtml(htmlContent);
        logReaderDebug('loadPage.cleanup.done', {
          url,
          originalLength: getDebugLength(htmlContent),
          cleanedLength: getDebugLength(htmlClean),
          durationMs: getDebugDuration(cleanupStartedAt),
        });
        const htmlOrig = injectBaseHref(htmlContent, url);
        const htmlConvert = await convertHtmlPageToHVInBackground(htmlClean || '', dictionary);
        logReaderDebug('loadPage.convert.done', {
          url,
          convertedLength: getDebugLength(htmlConvert),
          durationMs: getDebugDuration(loadStartedAt),
        });
        const htmlHv = injectBaseHref(htmlConvert, url);

        const title = extractHtmlTitle(htmlConvert) || extractHtmlTitle(htmlContent) || url;
        logReaderDebug('loadPage.setHtmlContent', {
          url,
          title,
          htmlOrigLength: getDebugLength(htmlOrig),
          htmlHvLength: getDebugLength(htmlHv),
          durationMs: getDebugDuration(loadStartedAt),
        });
        setWebPageTitle(title);
        setLastViewUrl(url);
        await markBookmarkVisited(url);
        setHtmlContent('\ufeff' + htmlOrig, '\ufeff' + htmlHv);
        setLoadingStage('rendering');
        setError(false);
      } catch (e) {
        logReaderDebug('loadPage.error', {
          rawUrl,
          durationMs: getDebugDuration(loadStartedAt),
          error: e instanceof Error ? e.message : String(e),
        });
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
