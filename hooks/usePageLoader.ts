import { useCallback } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { useWebPageStore } from '../stores/useWebPageStore';
import { downloadHtmlPage, convertHtmlPageToHV } from '../utils/downloader';
import { cleanupHtml } from '../utils/cleanup';
import { fixUrl } from '../utils/normalize-url';
import { injectBaseHref } from '../utils/webview-html';

export function usePageLoader() {
  const {
    setLoading,
    setError,
    setHtmlContent,
    setCurrentUrl,
    setWebPageTitle,
    setLastViewUrl,
    pushHistory,
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
      setCurrentUrl(url);
      setLoading(true);
      setError(false);

      try {
        const dictionary = useAppStore.getState().dictionary;
        const htmlContent = await downloadHtmlPage(url);
        const htmlClean = await cleanupHtml(htmlContent);
        const htmlOrig = injectBaseHref(htmlContent, url);
        const htmlConvert = await convertHtmlPageToHV(htmlClean || '', dictionary);
        const htmlHv = injectBaseHref(htmlConvert, url);

        const titleMatch = htmlConvert.match(/<title>([^<]+)<\/title>/);
        if (titleMatch) setWebPageTitle(titleMatch[1]);
        setLastViewUrl(url);
        setHtmlContent('\ufeff' + htmlOrig, '\ufeff' + htmlHv);
        setError(false);
      } catch (e) {
        console.error('Page load error:', e);
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [
      setLoading,
      setError,
      setHtmlContent,
      setCurrentUrl,
      setWebPageTitle,
      setLastViewUrl,
      pushHistory,
      setUrlInputFocus,
    ]
  );

  return { loadPage };
}
