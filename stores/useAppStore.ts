import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  BookmarkRecord,
  listBookmarks,
  removeBookmarkByUrl,
  saveBookmark,
  touchBookmarkByUrl,
} from '../db/bookmarks';
import {
  OfflineChapterRecord,
  OfflineChapterStatus,
  OfflineStoryRecord,
  ensureOfflineDbReady,
  getOfflineChapterByUrl,
  listOfflineChapters,
  listOfflineStories,
  saveOfflineChapter,
} from '../db/offline';
import { truncateBookmarkTitle } from '../utils/bookmarks';

const OLD_LASTVIEW_KEY = 'HV_BROWSER_LASTVIEW_STORAGE_KEY';

export interface Bookmark extends BookmarkRecord {
  desc: string;
}

export interface OfflineChapterCandidate {
  url: string;
  name: string;
  order: number | null;
  existingChapterId: number | null;
  existingStatus: OfflineChapterStatus | null;
}

export interface PendingOfflineAction {
  currentUrl: string;
  pageTitle: string;
  storyId: number | null;
  inferredRole: 'home page' | 'index page' | 'chapter page' | 'unknown';
  initialRoles: Array<'home page' | 'index page' | 'chapter page'>;
  chapterCandidates: OfflineChapterCandidate[];
}

type ReaderContentSource = 'remote' | 'offline';

interface AppState {
  loading: boolean;
  error: boolean;
  htmlOrig: string;
  htmlHV: string;
  currentUrl: string;
  webPageTitle: string;
  lastViewUrl: string;
  history: string[];
  bookmarksHydrated: boolean;
  bookmarks: Bookmark[];
  dictionary: Record<string, string>;
  pinyinDictionary: Record<string, string>;
  offlineLibraryHydrated: boolean;
  offlineStories: OfflineStoryRecord[];
  offlineChaptersByStory: Record<number, OfflineChapterRecord[]>;
  downloadQueue: number[];
  activeDownloadId: number | null;
  downloadQueueRunning: boolean;
  downloadQueueLastError: string | null;
  pageRolePickerVisible: boolean;
  chapterPickerVisible: boolean;
  pendingOfflineAction: PendingOfflineAction | null;
  currentContentSource: ReaderContentSource;
  currentOfflineChapterId: number | null;

  isCurrentBookmarked: () => boolean;
  hasWebPage: () => boolean;
  getOfflineChapterByIdFromState: (id: number) => OfflineChapterRecord | null;
  getOfflineChapterByUrlFromState: (url: string) => OfflineChapterRecord | null;

  setLoading: (loading: boolean) => void;
  setError: (error: boolean) => void;
  setHtmlContent: (orig: string, hv: string) => void;
  setCurrentUrl: (url: string) => void;
  setWebPageTitle: (title: string) => void;
  setLastViewUrl: (url: string) => void;
  pushHistory: (url: string) => void;
  popHistory: () => string | undefined;
  initializeBookmarks: () => Promise<void>;
  initializeOfflineLibrary: () => Promise<void>;
  refreshOfflineLibrary: () => Promise<void>;
  toggleBookmark: () => Promise<void>;
  removeBookmark: (url: string) => Promise<void>;
  markBookmarkVisited: (url: string) => Promise<void>;
  setDictionary: (dict: Record<string, string>) => void;
  setPinyinDictionary: (dict: Record<string, string>) => void;
  enqueueOfflineChapter: (input: {
    storyId: number;
    chapterName: string;
    chapterUrl: string;
    chapterOrder?: number | null;
  }) => Promise<OfflineChapterRecord>;
  markQueueItemStarted: (id: number) => void;
  markQueueItemCompleted: (chapter: OfflineChapterRecord) => void;
  markQueueItemFailed: (id: number, error: string) => void;
  setDownloadQueueRunning: (running: boolean) => void;
  setDownloadQueueLastError: (error: string | null) => void;
  openOfflineChapterInReader: (chapterId: number) => void;
  setCurrentContentSource: (source: ReaderContentSource, offlineChapterId?: number | null) => void;
  openPageRolePicker: (action: PendingOfflineAction) => void;
  closePageRolePicker: () => void;
  openChapterPicker: (action: PendingOfflineAction) => void;
  closeChapterPicker: () => void;
}

function toStoreBookmark(bookmark: BookmarkRecord): Bookmark {
  return {
    ...bookmark,
    desc: bookmark.title,
  };
}

function groupOfflineChapters(chapters: OfflineChapterRecord[]) {
  return chapters.reduce<Record<number, OfflineChapterRecord[]>>((accumulator, chapter) => {
    const next = accumulator[chapter.storyId] ?? [];
    next.push(chapter);
    next.sort((left, right) => {
      const leftOrder = left.chapterOrder ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.chapterOrder ?? Number.MAX_SAFE_INTEGER;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return left.createdAt.localeCompare(right.createdAt) || left.chapterName.localeCompare(right.chapterName);
    });
    accumulator[chapter.storyId] = next;
    return accumulator;
  }, {});
}

function flattenOfflineChapters(chaptersByStory: Record<number, OfflineChapterRecord[]>) {
  return Object.values(chaptersByStory).flat();
}

function upsertOfflineChapterInState(
  chaptersByStory: Record<number, OfflineChapterRecord[]>,
  chapter: OfflineChapterRecord
) {
  const nextEntries = flattenOfflineChapters(chaptersByStory).filter((entry) => entry.id !== chapter.id);
  nextEntries.push(chapter);
  return groupOfflineChapters(nextEntries);
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      loading: false,
      error: false,
      htmlOrig: '',
      htmlHV: '',
      currentUrl: '',
      webPageTitle: '',
      lastViewUrl: '',
      history: [],
      bookmarksHydrated: false,
      bookmarks: [],
      dictionary: {},
      pinyinDictionary: {},
      offlineLibraryHydrated: false,
      offlineStories: [],
      offlineChaptersByStory: {},
      downloadQueue: [],
      activeDownloadId: null,
      downloadQueueRunning: false,
      downloadQueueLastError: null,
      pageRolePickerVisible: false,
      chapterPickerVisible: false,
      pendingOfflineAction: null,
      currentContentSource: 'remote',
      currentOfflineChapterId: null,

      isCurrentBookmarked: () => {
        const { currentUrl, webPageTitle, bookmarks } = get();
        if (!currentUrl || !webPageTitle) return false;
        return bookmarks.findIndex((bookmark) => bookmark.url === currentUrl) !== -1;
      },

      hasWebPage: () => {
        const { currentUrl, webPageTitle } = get();
        return !!(currentUrl && webPageTitle);
      },

      getOfflineChapterByIdFromState: (id) => {
        const chapters = flattenOfflineChapters(get().offlineChaptersByStory);
        return chapters.find((chapter) => chapter.id === id) ?? null;
      },

      getOfflineChapterByUrlFromState: (url) => {
        const chapters = flattenOfflineChapters(get().offlineChaptersByStory);
        return chapters.find((chapter) => chapter.chapterUrl === url) ?? null;
      },

      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),
      setHtmlContent: (htmlOrig, htmlHV) => set({ htmlOrig, htmlHV }),
      setCurrentUrl: (currentUrl) => set({ currentUrl }),
      setWebPageTitle: (webPageTitle) => set({ webPageTitle }),
      setLastViewUrl: (lastViewUrl) => set({ lastViewUrl }),

      pushHistory: (url) =>
        set((state) => {
          if (state.currentUrl === url) return state;
          const history = [...state.history, url];
          if (history.length > 50) history.shift();
          return { history };
        }),

      popHistory: () => {
        const history = [...get().history];
        const url = history.pop();
        set({ history });
        return url;
      },

      initializeBookmarks: async () => {
        const bookmarks = await listBookmarks();
        set({
          bookmarks: bookmarks.map(toStoreBookmark),
          bookmarksHydrated: true,
        });
      },

      initializeOfflineLibrary: async () => {
        await ensureOfflineDbReady();
        await get().refreshOfflineLibrary();
        set({ offlineLibraryHydrated: true });
      },

      refreshOfflineLibrary: async () => {
        const [stories, chapters] = await Promise.all([listOfflineStories(), listOfflineChapters()]);
        const activeDownload = chapters.find((chapter) => chapter.downloadStatus === 'downloading') ?? null;
        const queuedIds = chapters
          .filter((chapter) => chapter.downloadStatus === 'queued')
          .sort((left, right) => {
            const leftOrder = left.chapterOrder ?? Number.MAX_SAFE_INTEGER;
            const rightOrder = right.chapterOrder ?? Number.MAX_SAFE_INTEGER;
            return leftOrder - rightOrder || left.createdAt.localeCompare(right.createdAt);
          })
          .map((chapter) => chapter.id);

        set({
          offlineStories: stories,
          offlineChaptersByStory: groupOfflineChapters(chapters),
          activeDownloadId: activeDownload?.id ?? null,
          downloadQueue: queuedIds,
        });
      },

      toggleBookmark: async () => {
        const { currentUrl, webPageTitle, isCurrentBookmarked } = get();
        if (!currentUrl || !webPageTitle) return;

        if (isCurrentBookmarked()) {
          await removeBookmarkByUrl(currentUrl);
        } else {
          await saveBookmark({
            url: currentUrl,
            title: truncateBookmarkTitle(webPageTitle),
          });
        }

        const nextBookmarks = await listBookmarks();
        set({ bookmarks: nextBookmarks.map(toStoreBookmark) });
      },

      removeBookmark: async (url) => {
        await removeBookmarkByUrl(url);
        const bookmarks = await listBookmarks();
        set({ bookmarks: bookmarks.map(toStoreBookmark) });
      },

      markBookmarkVisited: async (url) => {
        await touchBookmarkByUrl(url);

        const { bookmarks } = get();
        if (!bookmarks.some((bookmark) => bookmark.url === url)) {
          return;
        }

        const nextBookmarks = await listBookmarks();
        set({ bookmarks: nextBookmarks.map(toStoreBookmark) });
      },

      setDictionary: (dictionary) => set({ dictionary }),
      setPinyinDictionary: (pinyinDictionary) => set({ pinyinDictionary }),

      enqueueOfflineChapter: async ({ storyId, chapterName, chapterUrl, chapterOrder }) => {
        const existingFromState = get().getOfflineChapterByUrlFromState(chapterUrl);
        const existing = existingFromState ?? (await getOfflineChapterByUrl(chapterUrl));

        if (existing && ['queued', 'downloading', 'downloaded'].includes(existing.downloadStatus)) {
          return existing;
        }

        const chapter = await saveOfflineChapter({
          storyId,
          chapterName,
          chapterUrl,
          chapterOrder,
          originalHtml: existing?.originalHtml ?? '',
          convertedHvHtml: existing?.convertedHvHtml ?? '',
          downloadStatus: 'queued',
          downloadError: null,
          downloadedAt: existing?.downloadedAt ?? null,
        });

        set((state) => ({
          offlineChaptersByStory: upsertOfflineChapterInState(state.offlineChaptersByStory, chapter),
          downloadQueue: state.downloadQueue.includes(chapter.id)
            ? state.downloadQueue
            : [...state.downloadQueue, chapter.id],
          downloadQueueLastError: null,
        }));

        return chapter;
      },

      markQueueItemStarted: (id) =>
        set((state) => {
          const chapter = state.getOfflineChapterByIdFromState(id);
          if (!chapter) {
            return {
              activeDownloadId: id,
              downloadQueue: state.downloadQueue.filter((queueId) => queueId !== id),
              downloadQueueRunning: true,
            };
          }

          return {
            activeDownloadId: id,
            downloadQueue: state.downloadQueue.filter((queueId) => queueId !== id),
            downloadQueueRunning: true,
            offlineChaptersByStory: upsertOfflineChapterInState(state.offlineChaptersByStory, {
              ...chapter,
              downloadStatus: 'downloading',
              downloadError: null,
            }),
          };
        }),

      markQueueItemCompleted: (chapter) =>
        set((state) => ({
          activeDownloadId: null,
          offlineChaptersByStory: upsertOfflineChapterInState(state.offlineChaptersByStory, chapter),
        })),

      markQueueItemFailed: (id, error) =>
        set((state) => {
          const chapter = state.getOfflineChapterByIdFromState(id);

          return {
            activeDownloadId: null,
            downloadQueue: state.downloadQueue.filter((queueId) => queueId !== id),
            downloadQueueLastError: error,
            offlineChaptersByStory: chapter
              ? upsertOfflineChapterInState(state.offlineChaptersByStory, {
                  ...chapter,
                  downloadStatus: 'failed',
                  downloadError: error,
                })
              : state.offlineChaptersByStory,
          };
        }),

      setDownloadQueueRunning: (downloadQueueRunning) => set({ downloadQueueRunning }),
      setDownloadQueueLastError: (downloadQueueLastError) => set({ downloadQueueLastError }),

      openOfflineChapterInReader: (chapterId) =>
        set({
          currentContentSource: 'offline',
          currentOfflineChapterId: chapterId,
        }),

      setCurrentContentSource: (currentContentSource, currentOfflineChapterId = null) =>
        set({
          currentContentSource,
          currentOfflineChapterId: currentContentSource === 'offline' ? currentOfflineChapterId : null,
        }),

      openPageRolePicker: (pendingOfflineAction) =>
        set({
          pendingOfflineAction,
          pageRolePickerVisible: true,
          chapterPickerVisible: false,
        }),

      closePageRolePicker: () =>
        set({
          pageRolePickerVisible: false,
        }),

      openChapterPicker: (pendingOfflineAction) =>
        set({
          pendingOfflineAction,
          chapterPickerVisible: true,
          pageRolePickerVisible: false,
        }),

      closeChapterPicker: () =>
        set({
          chapterPickerVisible: false,
        }),
    }),
    {
      name: 'hv-browser-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        lastViewUrl: state.lastViewUrl,
      }),
      onRehydrateStorage: () => async (state) => {
        try {
          const oldLastUrl = await AsyncStorage.getItem(OLD_LASTVIEW_KEY);
          if (oldLastUrl && state && !state.lastViewUrl) {
            state.lastViewUrl = oldLastUrl;
            await AsyncStorage.removeItem(OLD_LASTVIEW_KEY);
          }
        } catch {
          // migration failed silently
        }
      },
    }
  )
);
