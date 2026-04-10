import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TITLE_LENGTH = 150;
const OLD_BOOKMARK_KEY = 'HV_BROWSER_BOOKMARK_STORAGE_KEY';
const OLD_LASTVIEW_KEY = 'HV_BROWSER_LASTVIEW_STORAGE_KEY';

interface Bookmark {
  url: string;
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
  bookmarks: Bookmark[];
  dictionary: Record<string, string>;

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
  toggleBookmark: () => void;
  removeBookmark: (url: string) => void;
  setDictionary: (dict: Record<string, string>) => void;
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
      bookmarks: [],
      dictionary: {},

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

      toggleBookmark: () => {
        const { currentUrl, webPageTitle, bookmarks, isCurrentBookmarked } = get();
        if (!currentUrl || !webPageTitle) return;

        if (isCurrentBookmarked()) {
          set({ bookmarks: bookmarks.filter((b) => b.url !== currentUrl) });
        } else {
          const desc = webPageTitle.slice(0, TITLE_LENGTH) + '...';
          set({ bookmarks: [...bookmarks, { url: currentUrl, desc }] });
        }
      },

      removeBookmark: (url) =>
        set((state) => ({ bookmarks: state.bookmarks.filter((bookmark) => bookmark.url !== url) })),

      setDictionary: (dictionary) => set({ dictionary }),
    }),
    {
      name: 'hv-browser-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        bookmarks: state.bookmarks,
        lastViewUrl: state.lastViewUrl,
      }),
      onRehydrateStorage: () => async (state) => {
        // One-time migration from old MobX AsyncStorage keys
        try {
          const oldBookmarks = await AsyncStorage.getItem(OLD_BOOKMARK_KEY);
          const oldLastUrl = await AsyncStorage.getItem(OLD_LASTVIEW_KEY);
          if (oldBookmarks && state && state.bookmarks.length === 0) {
            state.bookmarks = JSON.parse(oldBookmarks);
            await AsyncStorage.removeItem(OLD_BOOKMARK_KEY);
          }
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
