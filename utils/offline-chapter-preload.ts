import { getOfflineChapterById, updateOfflineChapterStatus } from '../db/offline';
import { cleanupHtml } from './cleanup';
import { getDebugDuration, getDebugLength, logReaderDebug } from './debug-log';
import { convertHtmlPageToHVInBackground } from './han-viet-worklet';
import { injectBaseHref } from './webview-html';

const MAX_OFFLINE_CHAPTER_PRELOADS = 1;
const MAX_OFFLINE_CHAPTER_PRELOAD_BYTES = 6 * 1024 * 1024;

export interface OfflineChapterPreloadResult {
  chapterId: number;
  chapterUrl: string;
  htmlOrig: string;
  htmlHv: string;
}

const offlineChapterPreloadCache = new Map<number, OfflineChapterPreloadResult>();
const offlineChapterPreloadPromises = new Map<
  number,
  Promise<OfflineChapterPreloadResult | null>
>();

function getPreloadSizeBytes(preload: OfflineChapterPreloadResult) {
  return (preload.htmlOrig.length + preload.htmlHv.length) * 2;
}

function getOfflineChapterPreloadCacheSizeBytes() {
  let total = 0;
  offlineChapterPreloadCache.forEach((preload) => {
    total += getPreloadSizeBytes(preload);
  });
  return total;
}

function pruneOfflineChapterPreloadCache() {
  while (
    offlineChapterPreloadCache.size > MAX_OFFLINE_CHAPTER_PRELOADS ||
    getOfflineChapterPreloadCacheSizeBytes() > MAX_OFFLINE_CHAPTER_PRELOAD_BYTES
  ) {
    const oldestKey = offlineChapterPreloadCache.keys().next().value;
    if (oldestKey == null) {
      return;
    }
    offlineChapterPreloadCache.delete(oldestKey);
  }
}

export function getOfflineChapterPreload(
  chapterId: number,
  chapterUrl?: string | null,
): OfflineChapterPreloadResult | null {
  const cached = offlineChapterPreloadCache.get(chapterId);
  if (!cached) {
    return null;
  }
  if (chapterUrl && cached.chapterUrl !== chapterUrl) {
    offlineChapterPreloadCache.delete(chapterId);
    return null;
  }
  return cached;
}

export async function waitForOfflineChapterPreload(
  chapterId: number,
  timeoutMs: number,
): Promise<OfflineChapterPreloadResult | null> {
  const cached = getOfflineChapterPreload(chapterId);
  if (cached) {
    return cached;
  }

  const pending = offlineChapterPreloadPromises.get(chapterId);
  if (!pending) {
    return null;
  }

  return await Promise.race([
    pending,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

export function preloadOfflineChapterConversion(
  chapterId: number,
  dictionary: Record<string, string>,
  reason = 'next-chapter',
): Promise<OfflineChapterPreloadResult | null> {
  const cached = getOfflineChapterPreload(chapterId);
  if (cached) {
    logReaderDebug('offline.preload.cache-hit', {
      chapterId,
      reason,
      htmlOrigLength: getDebugLength(cached.htmlOrig),
      htmlHvLength: getDebugLength(cached.htmlHv),
    });
    return Promise.resolve(cached);
  }

  const existing = offlineChapterPreloadPromises.get(chapterId);
  if (existing) {
    logReaderDebug('offline.preload.join-inflight', { chapterId, reason });
    return existing;
  }

  const promise = (async () => {
    const startedAt = Date.now();
    logReaderDebug('offline.preload.start', { chapterId, reason });

    try {
      const chapter = await getOfflineChapterById(chapterId);
      if (!chapter || !chapter.originalHtml) {
        logReaderDebug('offline.preload.skip-missing', {
          chapterId,
          reason,
          hasChapter: !!chapter,
          durationMs: getDebugDuration(startedAt),
        });
        return null;
      }

      let convertedHvHtml = chapter.convertedHvHtml;
      if (!convertedHvHtml) {
        const cleanupStartedAt = Date.now();
        const cleanedOriginalHtml =
          (await cleanupHtml(chapter.originalHtml)) || chapter.originalHtml;
        logReaderDebug('offline.preload.cleanup.done', {
          chapterId,
          reason,
          originalLength: getDebugLength(chapter.originalHtml),
          cleanedLength: getDebugLength(cleanedOriginalHtml),
          durationMs: getDebugDuration(cleanupStartedAt),
        });
        convertedHvHtml = await convertHtmlPageToHVInBackground(cleanedOriginalHtml, dictionary);
        logReaderDebug('offline.preload.convert.done', {
          chapterId,
          reason,
          convertedLength: getDebugLength(convertedHvHtml),
          durationMs: getDebugDuration(startedAt),
        });
        await updateOfflineChapterStatus(chapter.id, 'downloaded', null, {
          convertedHvHtml,
          downloadedAt: chapter.downloadedAt ?? new Date().toISOString(),
        });
      }

      const result: OfflineChapterPreloadResult = {
        chapterId: chapter.id,
        chapterUrl: chapter.chapterUrl,
        htmlOrig: injectBaseHref(chapter.originalHtml, chapter.chapterUrl),
        htmlHv: injectBaseHref(convertedHvHtml, chapter.chapterUrl),
      };

      offlineChapterPreloadCache.set(chapter.id, result);
      pruneOfflineChapterPreloadCache();
      const wasCached = offlineChapterPreloadCache.has(chapter.id);
      logReaderDebug('offline.preload.ready', {
        chapterId,
        reason,
        htmlOrigLength: getDebugLength(result.htmlOrig),
        htmlHvLength: getDebugLength(result.htmlHv),
        cached: wasCached,
        durationMs: getDebugDuration(startedAt),
      });
      return result;
    } catch (error) {
      logReaderDebug('offline.preload.error', {
        chapterId,
        reason,
        durationMs: getDebugDuration(startedAt),
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    } finally {
      offlineChapterPreloadPromises.delete(chapterId);
    }
  })();

  offlineChapterPreloadPromises.set(chapterId, promise);
  return promise;
}
