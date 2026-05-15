import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  BookmarkRecord,
  exportBookmarksPayload,
  importBookmarksFromJson,
  listBookmarks,
  removeBookmarkByUrl,
  saveBookmark,
  touchBookmarkByUrl,
} from '../db/bookmarks';
import {
  createEpubImportJob,
  deleteEpubImportJob,
  ensureOfflineDbReady,
  EpubImportJobRecord,
  getOfflineChapterByUrl,
  listEpubImportJobs,
  listOfflineChapters,
  listOfflineStories,
  OfflineChapterRecord,
  OfflineChapterStatus,
  OfflineStoryRecord,
  saveOfflineChapter,
} from '../db/offline';
import {
  sanitizeBookmarkUrl,
  truncateBookmarkTitle,
  urlsMatchForBookmark,
} from '../utils/bookmarks';

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

export interface PendingStoryResolution {
  action: PendingOfflineAction;
  selectedRoles: Array<'home page' | 'index page' | 'chapter page'>;
  suggestedStoryId: number | null;
  defaultStoryName: string;
}

export interface PendingBookmarkDraft {
  originalUrl?: string;
  title: string;
  url: string;
}

export type ReaderHistoryEntry =
  | { kind: 'remote-url'; url: string }
  | { kind: 'offline-chapter'; chapterId: number; url: string };

type ReaderContentSource = 'remote' | 'offline';
export type ReaderLoadingStage =
  | 'downloading'
  | 'extracting'
  | 'parsing'
  | 'converting'
  | 'rendering';

interface AppState {
  loading: boolean;
  loadingStage: ReaderLoadingStage | null;
  error: boolean;
  htmlOrig: string;
  htmlHV: string;
  currentUrl: string;
  webPageTitle: string;
  lastViewUrl: string;
  history: ReaderHistoryEntry[];
  bookmarksHydrated: boolean;
  bookmarks: Bookmark[];
  dictionary: Record<string, string>;
  pinyinDictionary: Record<string, string>;
  offlineLibraryHydrated: boolean;
  offlineStories: OfflineStoryRecord[];
  offlineChaptersByStory: Record<number, OfflineChapterRecord[]>;
  epubImportJobs: EpubImportJobRecord[];
  downloadQueue: number[];
  activeDownloadId: number | null;
  downloadQueueRunning: boolean;
  downloadQueueLastError: string | null;
  activeEpubImportJobId: number | null;
  epubImportQueueRunning: boolean;
  epubImportLastError: string | null;
  bookmarkEditorVisible: boolean;
  pendingBookmarkDraft: PendingBookmarkDraft | null;
  pageRolePickerVisible: boolean;
  chapterPickerVisible: boolean;
  pendingOfflineAction: PendingOfflineAction | null;
  storyPickerVisible: boolean;
  pendingStoryResolution: PendingStoryResolution | null;
  currentContentSource: ReaderContentSource;
  currentOfflineChapterId: number | null;
  pendingContentAnchor: string | null;

  isCurrentBookmarked: () => boolean;
  getCurrentBookmarkFromState: () => Bookmark | null;
  hasWebPage: () => boolean;
  getOfflineChapterByIdFromState: (id: number) => OfflineChapterRecord | null;
  getOfflineChapterByUrlFromState: (url: string) => OfflineChapterRecord | null;
  getOfflineStoryByIdFromState: (id: number) => OfflineStoryRecord | null;
  getCurrentOfflineStoryFromState: () => OfflineStoryRecord | null;
  getOfflineChaptersForStoryFromState: (storyId: number) => OfflineChapterRecord[];
  getCurrentReaderHistoryEntry: () => ReaderHistoryEntry | null;

  setLoading: (loading: boolean) => void;
  setLoadingStage: (stage: ReaderLoadingStage | null) => void;
  setError: (error: boolean) => void;
  setHtmlContent: (orig: string, hv: string) => void;
  setCurrentUrl: (url: string) => void;
  setWebPageTitle: (title: string) => void;
  setLastViewUrl: (url: string) => void;
  setPendingContentAnchor: (anchor: string | null) => void;
  pushCurrentHistory: () => void;
  popHistory: () => ReaderHistoryEntry | undefined;
  initializeBookmarks: () => Promise<void>;
  initializeOfflineLibrary: () => Promise<void>;
  openBookmarkEditor: () => void;
  openBookmarkEditorForBookmark: (bookmark: { title: string; url: string }) => void;
  closeBookmarkEditor: () => void;
  savePendingBookmark: (draft: PendingBookmarkDraft) => Promise<void>;
  refreshOfflineLibrary: () => Promise<void>;
  toggleBookmark: () => Promise<void>;
  removeBookmark: (url: string) => Promise<void>;
  markBookmarkVisited: (url: string) => Promise<void>;
  importBookmarksBackup: (raw: string) => Promise<number>;
  exportBookmarksBackup: () => Promise<string>;
  setDictionary: (dict: Record<string, string>) => void;
  setPinyinDictionary: (dict: Record<string, string>) => void;
  enqueueOfflineChapter: (input: {
    storyId: number;
    chapterName: string;
    chapterUrl: string;
    chapterOrder?: number | null;
  }) => Promise<OfflineChapterRecord>;
  enqueueEpubImportJob: (input: {
    fileName: string;
    pickedFileUri: string;
  }) => Promise<EpubImportJobRecord>;
  removeEpubImportJob: (id: number) => Promise<void>;
  markQueueItemStarted: (id: number) => void;
  markQueueItemCompleted: (chapter: OfflineChapterRecord) => void;
  markQueueItemFailed: (id: number, error: string) => void;
  setDownloadQueueRunning: (running: boolean) => void;
  setDownloadQueueLastError: (error: string | null) => void;
  markEpubImportJobStarted: (id: number) => void;
  markEpubImportJobProgress: (job: EpubImportJobRecord) => void;
  markEpubImportJobCompleted: (job: EpubImportJobRecord) => void;
  markEpubImportJobFailed: (id: number, error: string) => void;
  setEpubImportQueueRunning: (running: boolean) => void;
  setEpubImportLastError: (error: string | null) => void;
  openOfflineChapterInReader: (chapterId: number) => void;
  setCurrentContentSource: (source: ReaderContentSource, offlineChapterId?: number | null) => void;
  openPageRolePicker: (action: PendingOfflineAction) => void;
  closePageRolePicker: () => void;
  openChapterPicker: (action: PendingOfflineAction) => void;
  closeChapterPicker: () => void;
  openStoryPicker: (resolution: PendingStoryResolution) => void;
  closeStoryPicker: () => void;
}

function toStoreBookmark(bookmark: BookmarkRecord): Bookmark {
  return {
    ...bookmark,
    desc: bookmark.title,
  };
}

function normalizeOfflineChapterLookupUrl(url: string) {
  return url.replace(/#.*$/, '');
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

      return (
        left.createdAt.localeCompare(right.createdAt) ||
        left.chapterName.localeCompare(right.chapterName)
      );
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
  chapter: OfflineChapterRecord,
) {
  const nextEntries = flattenOfflineChapters(chaptersByStory).filter(
    (entry) => entry.id !== chapter.id,
  );
  nextEntries.push(chapter);
  return groupOfflineChapters(nextEntries);
}

function upsertEpubImportJobInState(
  jobs: EpubImportJobRecord[],
  job: EpubImportJobRecord,
): EpubImportJobRecord[] {
  const nextJobs = jobs.filter((entry) => entry.id !== job.id);
  nextJobs.unshift(job);
  nextJobs.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return nextJobs;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      loading: false,
      loadingStage: null,
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
      epubImportJobs: [],
      downloadQueue: [],
      activeDownloadId: null,
      downloadQueueRunning: false,
      downloadQueueLastError: null,
      activeEpubImportJobId: null,
      epubImportQueueRunning: false,
      epubImportLastError: null,
      bookmarkEditorVisible: false,
      pendingBookmarkDraft: null,
      pageRolePickerVisible: false,
      chapterPickerVisible: false,
      pendingOfflineAction: null,
      storyPickerVisible: false,
      pendingStoryResolution: null,
      currentContentSource: 'remote',
      currentOfflineChapterId: null,
      pendingContentAnchor: null,

      getCurrentBookmarkFromState: () => {
        const { currentUrl, bookmarks } = get();
        if (!currentUrl) return null;
        return bookmarks.find((bookmark) => urlsMatchForBookmark(bookmark.url, currentUrl)) ?? null;
      },

      isCurrentBookmarked: () => {
        return !!get().getCurrentBookmarkFromState();
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
        const normalizedUrl = normalizeOfflineChapterLookupUrl(url);
        const chapters = flattenOfflineChapters(get().offlineChaptersByStory);
        return chapters.find((chapter) => chapter.chapterUrl === normalizedUrl) ?? null;
      },

      getOfflineStoryByIdFromState: (id) => {
        return get().offlineStories.find((story) => story.id === id) ?? null;
      },

      getCurrentOfflineStoryFromState: () => {
        const chapterId = get().currentOfflineChapterId;
        if (!chapterId) {
          return null;
        }

        const chapter = get().getOfflineChapterByIdFromState(chapterId);
        if (!chapter) {
          return null;
        }

        return get().getOfflineStoryByIdFromState(chapter.storyId);
      },

      getOfflineChaptersForStoryFromState: (storyId) => {
        return get().offlineChaptersByStory[storyId] ?? [];
      },

      getCurrentReaderHistoryEntry: () => {
        const { currentContentSource, currentOfflineChapterId, currentUrl } = get();
        if (currentContentSource === 'offline' && currentOfflineChapterId) {
          return {
            kind: 'offline-chapter',
            chapterId: currentOfflineChapterId,
            url: currentUrl,
          };
        }
        if (currentUrl) {
          return {
            kind: 'remote-url',
            url: currentUrl,
          };
        }
        return null;
      },

      setLoading: (loading) => set({ loading, loadingStage: loading ? get().loadingStage : null }),
      setLoadingStage: (loadingStage) => set({ loadingStage }),
      setError: (error) => set({ error }),
      setHtmlContent: (htmlOrig, htmlHV) => set({ htmlOrig, htmlHV }),
      setCurrentUrl: (currentUrl) => set({ currentUrl }),
      setWebPageTitle: (webPageTitle) => set({ webPageTitle }),
      setLastViewUrl: (lastViewUrl) => set({ lastViewUrl }),
      setPendingContentAnchor: (pendingContentAnchor) => set({ pendingContentAnchor }),

      pushCurrentHistory: () =>
        set((state) => {
          const currentEntry = get().getCurrentReaderHistoryEntry();
          if (!currentEntry) {
            return state;
          }

          const lastEntry = state.history[state.history.length - 1];
          if (
            lastEntry &&
            lastEntry.kind === currentEntry.kind &&
            lastEntry.url === currentEntry.url &&
            (lastEntry.kind !== 'offline-chapter' ||
              currentEntry.kind !== 'offline-chapter' ||
              lastEntry.chapterId === currentEntry.chapterId)
          ) {
            return state;
          }

          const history = [...state.history, currentEntry];
          if (history.length > 50) history.shift();
          return { history };
        }),

      popHistory: () => {
        const history = [...get().history];
        const entry = history.pop();
        set({ history });
        return entry;
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

      openBookmarkEditor: () => {
        const { currentUrl, webPageTitle, getCurrentBookmarkFromState } = get();
        if (!currentUrl || !webPageTitle) return;

        const existingBookmark = getCurrentBookmarkFromState();
        const sanitizedUrl = sanitizeBookmarkUrl(existingBookmark?.url || currentUrl);
        const fallbackTitle = truncateBookmarkTitle(webPageTitle) || sanitizedUrl || currentUrl;

        set({
          bookmarkEditorVisible: true,
          pendingBookmarkDraft: {
            originalUrl: existingBookmark?.url,
            title: existingBookmark?.title || fallbackTitle,
            url: sanitizedUrl || currentUrl,
          },
        });
      },

      openBookmarkEditorForBookmark: (bookmark) => {
        const sanitizedUrl = sanitizeBookmarkUrl(bookmark.url);

        set({
          bookmarkEditorVisible: true,
          pendingBookmarkDraft: {
            originalUrl: bookmark.url,
            title: truncateBookmarkTitle(bookmark.title) || sanitizedUrl || bookmark.url,
            url: sanitizedUrl || bookmark.url,
          },
        });
      },

      closeBookmarkEditor: () =>
        set({
          bookmarkEditorVisible: false,
          pendingBookmarkDraft: null,
        }),

      savePendingBookmark: async (draft) => {
        const nextDraft = {
          title: truncateBookmarkTitle(draft.title),
          url: sanitizeBookmarkUrl(draft.url),
        };

        if (!nextDraft.title || !nextDraft.url) {
          return;
        }

        const originalUrl = sanitizeBookmarkUrl(draft.originalUrl || '');
        if (originalUrl && originalUrl !== nextDraft.url) {
          await removeBookmarkByUrl(originalUrl);
        }

        await saveBookmark(nextDraft);

        const nextBookmarks = await listBookmarks();
        set({
          bookmarks: nextBookmarks.map(toStoreBookmark),
          bookmarkEditorVisible: false,
          pendingBookmarkDraft: null,
        });
      },

      refreshOfflineLibrary: async () => {
        const [stories, chapters, jobs] = await Promise.all([
          listOfflineStories(),
          listOfflineChapters(),
          listEpubImportJobs(),
        ]);
        const activeDownload =
          chapters.find((chapter) => chapter.downloadStatus === 'downloading') ?? null;
        const queuedIds = chapters
          .filter((chapter) => chapter.downloadStatus === 'queued')
          .sort((left, right) => {
            const leftOrder = left.chapterOrder ?? Number.MAX_SAFE_INTEGER;
            const rightOrder = right.chapterOrder ?? Number.MAX_SAFE_INTEGER;
            return leftOrder - rightOrder || left.createdAt.localeCompare(right.createdAt);
          })
          .map((chapter) => chapter.id);
        const activeImportJob =
          jobs.find((job) => ['extracting', 'parsing', 'importing'].includes(job.status)) ?? null;

        set({
          offlineStories: stories,
          offlineChaptersByStory: groupOfflineChapters(chapters),
          epubImportJobs: jobs,
          activeDownloadId: activeDownload?.id ?? null,
          activeEpubImportJobId: activeImportJob?.id ?? null,
          downloadQueue: queuedIds,
        });
      },

      toggleBookmark: async () => {
        const { currentUrl, webPageTitle, getCurrentBookmarkFromState, openBookmarkEditor } = get();
        if (!currentUrl || !webPageTitle) return;

        const currentBookmark = getCurrentBookmarkFromState();

        if (!currentBookmark) {
          openBookmarkEditor();
          return;
        }

        await removeBookmarkByUrl(currentBookmark.url);

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

      importBookmarksBackup: async (raw) => {
        const importedCount = await importBookmarksFromJson(raw);
        const nextBookmarks = await listBookmarks();
        set({ bookmarks: nextBookmarks.map(toStoreBookmark) });
        return importedCount;
      },

      exportBookmarksBackup: async () => {
        const payload = await exportBookmarksPayload();
        return JSON.stringify(payload, null, 2);
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
          offlineChaptersByStory: upsertOfflineChapterInState(
            state.offlineChaptersByStory,
            chapter,
          ),
          downloadQueue: state.downloadQueue.includes(chapter.id)
            ? state.downloadQueue
            : [...state.downloadQueue, chapter.id],
          downloadQueueLastError: null,
        }));

        return chapter;
      },

      enqueueEpubImportJob: async ({ fileName, pickedFileUri }) => {
        const job = await createEpubImportJob({
          fileName,
          pickedFileUri,
        });
        set((state) => ({
          epubImportJobs: upsertEpubImportJobInState(state.epubImportJobs, job),
          epubImportLastError: null,
        }));
        return job;
      },

      removeEpubImportJob: async (id) => {
        await deleteEpubImportJob(id);
        set((state) => ({
          epubImportJobs: state.epubImportJobs.filter((job) => job.id !== id),
          activeEpubImportJobId:
            state.activeEpubImportJobId === id ? null : state.activeEpubImportJobId,
        }));
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
          offlineChaptersByStory: upsertOfflineChapterInState(
            state.offlineChaptersByStory,
            chapter,
          ),
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

      markEpubImportJobStarted: (id) =>
        set((state) => ({
          activeEpubImportJobId: id,
          epubImportQueueRunning: true,
          epubImportJobs: state.epubImportJobs.map((job) =>
            job.id === id && job.status === 'queued' ? { ...job, status: 'extracting' } : job,
          ),
        })),

      markEpubImportJobProgress: (job) =>
        set((state) => ({
          activeEpubImportJobId: job.id,
          epubImportQueueRunning: true,
          epubImportJobs: upsertEpubImportJobInState(state.epubImportJobs, job),
        })),

      markEpubImportJobCompleted: (job) =>
        set((state) => ({
          activeEpubImportJobId: null,
          epubImportJobs: upsertEpubImportJobInState(state.epubImportJobs, job),
        })),

      markEpubImportJobFailed: (id, error) =>
        set((state) => ({
          activeEpubImportJobId: null,
          epubImportLastError: error,
          epubImportJobs: state.epubImportJobs.map((job) =>
            job.id === id
              ? {
                  ...job,
                  status: 'failed',
                  errorMessage: error,
                }
              : job,
          ),
        })),

      setEpubImportQueueRunning: (epubImportQueueRunning) => set({ epubImportQueueRunning }),
      setEpubImportLastError: (epubImportLastError) => set({ epubImportLastError }),

      openOfflineChapterInReader: (chapterId) =>
        set({
          currentContentSource: 'offline',
          currentOfflineChapterId: chapterId,
        }),

      setCurrentContentSource: (currentContentSource, currentOfflineChapterId = null) =>
        set({
          currentContentSource,
          currentOfflineChapterId:
            currentContentSource === 'offline' ? currentOfflineChapterId : null,
        }),

      openPageRolePicker: (pendingOfflineAction) =>
        set({
          pendingOfflineAction,
          pageRolePickerVisible: true,
          chapterPickerVisible: false,
          storyPickerVisible: false,
          pendingStoryResolution: null,
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
          storyPickerVisible: false,
          pendingStoryResolution: null,
        }),

      closeChapterPicker: () =>
        set({
          chapterPickerVisible: false,
        }),

      openStoryPicker: (pendingStoryResolution) =>
        set({
          pendingStoryResolution,
          storyPickerVisible: true,
          pageRolePickerVisible: false,
          chapterPickerVisible: false,
        }),

      closeStoryPicker: () =>
        set({
          storyPickerVisible: false,
          pendingStoryResolution: null,
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
    },
  ),
);
