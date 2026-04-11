import { Alert } from 'react-native';

import { getOfflineChapterById, updateOfflineChapterStatus } from '../db/offline';
import { useAppStore } from '../stores/useAppStore';
import { downloadOfflineChapterPayload, sleepRandomQueueRest } from './downloader';

let queueLoopPromise: Promise<void> | null = null;

export async function ensureOfflineDownloadQueueRunning() {
  if (queueLoopPromise) {
    return queueLoopPromise;
  }

  queueLoopPromise = runOfflineDownloadQueue().finally(() => {
    queueLoopPromise = null;
  });

  return queueLoopPromise;
}

async function runOfflineDownloadQueue() {
  const store = useAppStore.getState();
  if (store.activeDownloadId || store.downloadQueue.length === 0) {
    store.setDownloadQueueRunning(false);
    return;
  }

  store.setDownloadQueueRunning(true);

  while (true) {
    const { downloadQueue, dictionary } = useAppStore.getState();
    const nextId = downloadQueue[0];

    if (!nextId) {
      useAppStore.getState().setDownloadQueueRunning(false);
      return;
    }

    const chapter = await getOfflineChapterById(nextId);
    if (!chapter) {
      useAppStore.getState().markQueueItemFailed(nextId, 'Missing offline chapter record.');
      continue;
    }

    useAppStore.getState().markQueueItemStarted(nextId);
    await updateOfflineChapterStatus(nextId, 'downloading');

    try {
      const payload = await downloadOfflineChapterPayload(chapter.chapterUrl, dictionary);
      const updatedChapter = await updateOfflineChapterStatus(nextId, 'downloaded', null, {
        chapterName: payload.title || chapter.chapterName,
        originalHtml: payload.originalHtml,
        convertedHvHtml: payload.convertedHvHtml,
        downloadedAt: new Date().toISOString(),
      });

      if (updatedChapter) {
        useAppStore.getState().markQueueItemCompleted(updatedChapter);
      }

      await sleepRandomQueueRest();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Offline download failed.';
      await updateOfflineChapterStatus(nextId, 'failed', message);
      useAppStore.getState().markQueueItemFailed(nextId, message);
      Alert.alert('Download failed', message);
    }
  }
}
