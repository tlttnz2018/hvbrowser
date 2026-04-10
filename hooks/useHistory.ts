import { useCallback } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { usePageLoader } from './usePageLoader';

export function useHistory() {
  const popHistory = useAppStore((s) => s.popHistory);
  const { loadPage } = usePageLoader();

  const goBack = useCallback(() => {
    const currentUrl = useAppStore.getState().currentUrl;
    let oldUrl = popHistory();
    if (oldUrl === currentUrl) {
      oldUrl = popHistory();
    }
    if (oldUrl) {
      loadPage(oldUrl);
    }
  }, [popHistory, loadPage]);

  return { goBack };
}
