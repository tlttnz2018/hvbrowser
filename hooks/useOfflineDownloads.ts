import { Alert } from 'react-native';
import { parseDocument } from 'htmlparser2';
import { findAll, getAttributeValue, textContent } from 'domutils';
import type { Element } from 'domhandler';
import {
  attachHomePageToStory,
  attachIndexPageToStory,
  getOfflineStoryByChapterUrl,
  getOfflineStoryByHomePageUrl,
  getOfflineStoryByIndexPageUrl,
  OfflineStoryRecord,
  saveOfflineChapter,
  upsertOfflineStory,
} from '../db/offline';
import { useAppStore, type OfflineChapterCandidate, type PendingOfflineAction } from '../stores/useAppStore';
import { absolute } from '../utils/normalize-url';
import { ensureOfflineDownloadQueueRunning } from '../utils/offline-download-queue';
import { resolveOfflinePageRole } from '../utils/offline-page-role';

function cleanLabel(value: string, fallback: string) {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed || fallback;
}

function flattenChapterCandidates(action: PendingOfflineAction, selectedUrls: string[]) {
  return action.chapterCandidates.filter((candidate) => selectedUrls.includes(candidate.url));
}

function extractChapterCandidates(
  currentUrl: string,
  html: string,
  existingCandidates: ReturnType<typeof useAppStore.getState>['offlineChaptersByStory']
): OfflineChapterCandidate[] {
  const doc = parseDocument(html.replace(/^\ufeff/, ''), { decodeEntities: true });
  const chapterMap = new Map(
    Object.values(existingCandidates)
      .flat()
      .map((chapter) => [chapter.chapterUrl, chapter] as const)
  );
  const seen = new Set<string>();
  let order = 0;

  const anchors = findAll((node) => (node as Element).name === 'a', doc.children) as Element[];
  const candidates: OfflineChapterCandidate[] = [];

  for (const anchor of anchors) {
    const href = getAttributeValue(anchor, 'href');
    if (!href) {
      continue;
    }

    const url = absolute(currentUrl, href);
    if (!url || seen.has(url) || /^javascript:/i.test(url)) {
      continue;
    }

    const label = cleanLabel(textContent(anchor), url);
    if (label.length < 2) {
      continue;
    }

    seen.add(url);
    order += 1;
    const existing = chapterMap.get(url) ?? null;
    candidates.push({
      url,
      name: label,
      order,
      existingChapterId: existing?.id ?? null,
      existingStatus: existing?.downloadStatus ?? null,
    });
  }

  return candidates;
}

export function useOfflineDownloads() {
  const openPageRolePicker = useAppStore((state) => state.openPageRolePicker);
  const openChapterPicker = useAppStore((state) => state.openChapterPicker);
  const closePageRolePicker = useAppStore((state) => state.closePageRolePicker);
  const closeChapterPicker = useAppStore((state) => state.closeChapterPicker);
  const enqueueOfflineChapter = useAppStore((state) => state.enqueueOfflineChapter);
  const refreshOfflineLibrary = useAppStore((state) => state.refreshOfflineLibrary);

  async function ensureStory(
    action: PendingOfflineAction,
    selectedRoles: Array<'home page' | 'index page' | 'chapter page'>
  ) {
    const state = useAppStore.getState();
    const existingStory =
      state.offlineStories.find((story) => story.id === action.storyId) ||
      (await getOfflineStoryByHomePageUrl(action.currentUrl)) ||
      (await getOfflineStoryByIndexPageUrl(action.currentUrl)) ||
      (await getOfflineStoryByChapterUrl(action.currentUrl));

    const fallbackName = cleanLabel(action.pageTitle, 'Untitled story');

    if (!existingStory) {
      return upsertOfflineStory({
        name: fallbackName,
        homePageUrl: selectedRoles.includes('home page') ? action.currentUrl : null,
        indexPageUrl: selectedRoles.includes('index page') ? action.currentUrl : null,
      });
    }

    let nextStory = existingStory;

    if (selectedRoles.includes('home page') && nextStory.homePageUrl !== action.currentUrl) {
      nextStory = (await attachHomePageToStory(existingStory.id, action.currentUrl)) ?? nextStory;
    }

    if (selectedRoles.includes('index page') && nextStory.indexPageUrl !== action.currentUrl) {
      nextStory = (await attachIndexPageToStory(existingStory.id, action.currentUrl)) ?? nextStory;
    }

    return nextStory;
  }

  async function queueCurrentChapter(
    story: OfflineStoryRecord,
    action: PendingOfflineAction,
    options?: { silent?: boolean }
  ) {
    const state = useAppStore.getState();
    const chapterTitle = cleanLabel(action.pageTitle, action.currentUrl);
    const currentHtmlOrig = state.htmlOrig.replace(/^\ufeff/, '');
    const currentHtmlHv = state.htmlHV.replace(/^\ufeff/, '');

    if (state.currentUrl === action.currentUrl && currentHtmlOrig && currentHtmlHv) {
      const chapter = await saveOfflineChapter({
        storyId: story.id,
        chapterName: chapterTitle,
        chapterUrl: action.currentUrl,
        originalHtml: currentHtmlOrig,
        convertedHvHtml: currentHtmlHv,
        downloadStatus: 'downloaded',
        downloadError: null,
        downloadedAt: new Date().toISOString(),
      });

      await refreshOfflineLibrary();

      if (!options?.silent) {
        Alert.alert(
          'Saved offline',
          chapter.downloadStatus === 'downloaded'
            ? 'This chapter was saved from the page already open in the reader.'
            : 'This chapter was saved for offline reading.'
        );
      }
      return;
    }

    const chapter = await enqueueOfflineChapter({
      storyId: story.id,
      chapterName: chapterTitle,
      chapterUrl: action.currentUrl,
    });
    await refreshOfflineLibrary();

    if (chapter.downloadStatus === 'downloaded') {
      if (!options?.silent) {
        Alert.alert('Already downloaded', 'This chapter is already saved for offline reading.');
      }
      return;
    }

    await ensureOfflineDownloadQueueRunning();
    if (!options?.silent) {
      Alert.alert('Added to queue', 'This chapter will download one item at a time.');
    }
  }

  async function beginIndexFlow(action: PendingOfflineAction, story: OfflineStoryRecord) {
    const candidates = extractChapterCandidates(
      action.currentUrl,
      useAppStore.getState().htmlOrig,
      useAppStore.getState().offlineChaptersByStory
    );

    await refreshOfflineLibrary();
    openChapterPicker({
      ...action,
      storyId: story.id,
      inferredRole: 'index page',
      chapterCandidates: candidates,
    });
  }

  async function applyPageRoles(
    action: PendingOfflineAction,
    selectedRoles: Array<'home page' | 'index page' | 'chapter page'>
  ) {
    if (selectedRoles.length === 0) {
      return;
    }

    const story = await ensureStory(action, selectedRoles);
    await refreshOfflineLibrary();

    const includesIndex = selectedRoles.includes('index page');
    const includesChapter = selectedRoles.includes('chapter page');
    const includesHome = selectedRoles.includes('home page');

    if (includesChapter) {
      await queueCurrentChapter(story, action, { silent: includesIndex || includesHome });
    }

    if (includesIndex) {
      await beginIndexFlow(action, story);
      return;
    }

    closePageRolePicker();

    if (includesChapter) {
      if (includesHome) {
        Alert.alert('Page roles saved', 'This page was remembered and the current chapter was added to the queue.');
      }
      return;
    }

    if (includesHome) {
      Alert.alert('Page roles saved', 'This URL is now remembered as a home page for the story.');
    }
  }

  async function startDownloadFromCurrentPage(forceRolePicker = false) {
    const state = useAppStore.getState();
    if (!state.currentUrl) {
      return;
    }

    const chapters = Object.values(state.offlineChaptersByStory).flat();
    const resolved = resolveOfflinePageRole(state.currentUrl, state.offlineStories, chapters);
    const initialRoles: Array<'home page' | 'index page' | 'chapter page'> = [];

    if (chapters.some((chapter) => chapter.chapterUrl === state.currentUrl)) {
      initialRoles.push('chapter page');
    }
    if (state.offlineStories.some((story) => story.indexPageUrl === state.currentUrl)) {
      initialRoles.push('index page');
    }
    if (state.offlineStories.some((story) => story.homePageUrl === state.currentUrl)) {
      initialRoles.push('home page');
    }
    if (initialRoles.length === 0 && resolved.role !== 'unknown') {
      initialRoles.push(resolved.role);
    }

    const pendingAction: PendingOfflineAction = {
      currentUrl: state.currentUrl,
      pageTitle: state.webPageTitle || state.currentUrl,
      storyId: resolved.story?.id ?? null,
      inferredRole: resolved.role,
      initialRoles,
      chapterCandidates: [],
    };

    if (forceRolePicker) {
      openPageRolePicker(pendingAction);
      return;
    }

    if (resolved.role === 'home page' && resolved.story) {
      await applyPageRoles(pendingAction, ['home page']);
      return;
    }

    if (resolved.role === 'index page' && resolved.story) {
      await applyPageRoles(pendingAction, ['index page']);
      return;
    }

    if (resolved.role === 'chapter page' && resolved.story) {
      await applyPageRoles(pendingAction, ['chapter page']);
      return;
    }

    openPageRolePicker(pendingAction);
  }

  async function confirmPageRoles(selectedRoles: Array<'home page' | 'index page' | 'chapter page'>) {
    const action = useAppStore.getState().pendingOfflineAction;
    if (!action) {
      return;
    }

    await applyPageRoles(action, selectedRoles);
  }

  async function enqueueSelectedChapters(selectedUrls: string[]) {
    const action = useAppStore.getState().pendingOfflineAction;
    if (!action?.storyId) {
      return;
    }

    const selected = flattenChapterCandidates(action, selectedUrls);
    let addedCount = 0;

    for (const candidate of selected) {
      await enqueueOfflineChapter({
        storyId: action.storyId,
        chapterName: candidate.name,
        chapterUrl: candidate.url,
        chapterOrder: candidate.order,
      });

      if (!candidate.existingStatus || candidate.existingStatus === 'failed') {
        addedCount += 1;
      }
    }

    closeChapterPicker();
    await refreshOfflineLibrary();

    if (selected.length > 0) {
      await ensureOfflineDownloadQueueRunning();
    }

    Alert.alert(
      addedCount > 0 ? 'Chapters queued' : 'Nothing new queued',
      addedCount > 0 ? `${addedCount} chapter(s) added to the offline queue.` : 'Selected chapters were already saved or queued.'
    );
  }

  function dismissPageRolePicker() {
    closePageRolePicker();
  }

  function dismissChapterPicker() {
    closeChapterPicker();
  }

  return {
    startDownloadFromCurrentPage,
    confirmPageRoles,
    enqueueSelectedChapters,
    dismissPageRolePicker,
    dismissChapterPicker,
  };
}
