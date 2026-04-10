import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BookmarkRecord,
  listBookmarks,
  removeBookmarkByUrl,
  saveBookmark,
  touchBookmarkByUrl,
} from '../db/bookmarks';
import { truncateBookmarkTitle } from '../utils/bookmarks';

const OLD_LASTVIEW_KEY = 'HV_BROWSER_LASTVIEW_STORAGE_KEY';

export interface Bookmark extends BookmarkRecord {
  desc: string;
}

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

  // computed helpers
  isCurrentBookmarked: () => boolean;
  hasWebPage: () => boolean;

  // actions
  setLoading: (loading: boolean) => void;
  setError: (error: boolean) => void;
  setHtmlContent: (orig: string, hv: string) => void;
  setCurrentUrl: (url: string) => void;
  setWebPageTitle: (title: string) => void;
  setLastViewUrl: (url: string) => void;
  pushHistory: (url: string) => void;
  popHistory: () => string | undefined;
  initializeBookmarks: () => Promise<void>;
  toggleBookmark: () => Promise<void>;
  removeBookmark: (url: string) => Promise<void>;
  markBookmarkVisited: (url: string) => Promise<void>;
  setDictionary: (dict: Record<string, string>) => void;
  setPinyinDictionary: (dict: Record<string, string>) => void;
}

function toStoreBookmark(bookmark: BookmarkRecord): Bookmark {
  return {
    ...bookmark,
    desc: bookmark.title,
  };
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

      isCurrentBookmarked: () => {
        const { currentUrl, webPageTitle, bookmarks } = get();
        if (!currentUrl || !webPageTitle) return false;
        return bookmarks.findIndex((b) => b.url === currentUrl) !== -1;
      },

      hasWebPage: () => {
        const { currentUrl, webPageTitle } = get();
        return !!(currentUrl && webPageTitle);
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
