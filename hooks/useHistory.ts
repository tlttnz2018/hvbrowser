import { useCallback } from 'react';

import { useAppStore } from '../stores/useAppStore';
import { usePageLoader } from './usePageLoader';

export function useHistory() {
  const popHistory = useAppStore((s) => s.popHistory);
  const { loadOfflineChapter, loadPage } = usePageLoader();

  const goBack = useCallback(() => {
    const currentEntry = useAppStore.getState().getCurrentReaderHistoryEntry();
    let previousEntry = popHistory();
    if (
      previousEntry &&
      currentEntry &&
      previousEntry.kind === currentEntry.kind &&
      previousEntry.url === currentEntry.url &&
      (previousEntry.kind !== 'offline-chapter' ||
        currentEntry.kind !== 'offline-chapter' ||
        previousEntry.chapterId === currentEntry.chapterId)
    ) {
      previousEntry = popHistory();
    }
    if (!previousEntry) {
      return;
    }

    if (previousEntry.kind === 'offline-chapter') {
      loadOfflineChapter(previousEntry.chapterId, { skipHistory: true });
      return;
    }

    loadPage(previousEntry.url, { skipHistory: true });
  }, [loadOfflineChapter, loadPage, popHistory]);

  return { goBack };
}
