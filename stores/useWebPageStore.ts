import { create } from 'zustand';

export type ThemeModePreference = 'system' | 'light' | 'dark';

const FONT_SIZE_STEP = 0.1;

function clampFontSize(fontSize: number) {
  if (!Number.isFinite(fontSize)) return 1;
  return Math.max(1, Math.min(4, Number(fontSize.toFixed(2))));
}

export interface ReaderSearchResult {
  id: string;
  label: string;
  matchType: 'chinese' | 'han-viet';
  snippet: string;
  chapterId?: number;
  chapterName?: string;
  occurrenceIndex?: number;
}

export type ReaderSearchScope = 'reader' | 'chapters';

interface WebPageState {
  urlInputFocus: boolean;
  moreMenu: boolean;
  fullSite: boolean;
  fontSize: number;
  isHV: boolean;
  libraryDrawerOpen: boolean;
  themeMode: ThemeModePreference;
  readerSearchRequest: { id: number; query: string } | null;
  readerSearchJumpRequest: {
    id: number;
    resultId: string;
    query: string;
    resultIndex: number | null;
  } | null;
  readerSearchAutoJumpRequest: {
    id: number;
    chapterId: number;
    query: string;
    occurrenceIndex: number;
    immediate?: boolean;
  } | null;
  readerSearchResults: ReaderSearchResult[];
  readerSearchBusy: boolean;
  readerSearchQuery: string;
  readerSearchActiveResultIndex: number | null;
  readerSearchScope: ReaderSearchScope;

  // actions
  setUrlInputFocus: (focus: boolean) => void;
  setMoreMenu: (open: boolean) => void;
  toggleMoreMenu: () => void;
  toggleCss: () => void;
  setFullSite: (fullSite: boolean) => void;
  setFontSize: (fontSize: number) => void;
  setIsHV: (isHV: boolean) => void;
  increaseFont: () => void;
  decreaseFont: () => void;
  resetFont: () => void;
  toggleHV: () => void;
  setLibraryDrawerOpen: (open: boolean) => void;
  setThemeMode: (mode: ThemeModePreference) => void;
  requestReaderSearch: (query: string) => void;
  setReaderSearchResults: (id: number, query: string, results: ReaderSearchResult[]) => void;
  setReaderChapterSearchResults: (
    query: string,
    results: ReaderSearchResult[],
    activeIndex: number | null,
  ) => void;
  setReaderSearchAutoResults: (
    query: string,
    results: ReaderSearchResult[],
    activeIndex: number | null,
  ) => void;
  setReaderSearchActiveResultIndex: (index: number | null) => void;
  requestReaderSearchJump: (resultId: string) => void;
  jumpReaderSearchResult: (direction: 1 | -1) => void;
  requestReaderSearchAutoJump: (input: {
    chapterId: number;
    query: string;
    occurrenceIndex: number;
    immediate?: boolean;
  }) => void;
  clearReaderSearchAutoJump: (id: number) => void;
  clearReaderSearch: () => void;
}

export const useWebPageStore = create<WebPageState>()((set, get) => ({
  urlInputFocus: false,
  moreMenu: false,
  fullSite: true,
  fontSize: 1,
  isHV: true,
  libraryDrawerOpen: true,
  themeMode: 'system',
  readerSearchRequest: null,
  readerSearchJumpRequest: null,
  readerSearchAutoJumpRequest: null,
  readerSearchResults: [],
  readerSearchBusy: false,
  readerSearchQuery: '',
  readerSearchActiveResultIndex: null,
  readerSearchScope: 'reader',

  setUrlInputFocus: (urlInputFocus) => set({ urlInputFocus }),

  setMoreMenu: (moreMenu) => set({ moreMenu }),

  toggleMoreMenu: () => set((state) => ({ moreMenu: !state.moreMenu })),

  toggleCss: () => set((state) => ({ fullSite: !state.fullSite })),

  setFullSite: (fullSite) => set({ fullSite }),

  setFontSize: (fontSize) => set({ fontSize: clampFontSize(fontSize) }),

  setIsHV: (isHV) => set({ isHV }),

  increaseFont: () => {
    const { fontSize } = get();
    if (fontSize < 4) set({ fontSize: clampFontSize(fontSize + FONT_SIZE_STEP) });
  },

  decreaseFont: () => {
    const { fontSize } = get();
    if (fontSize > 1) set({ fontSize: clampFontSize(fontSize - FONT_SIZE_STEP) });
  },

  resetFont: () => set({ fontSize: 1 }),

  toggleHV: () => set((state) => ({ isHV: !state.isHV })),

  setLibraryDrawerOpen: (libraryDrawerOpen) => set({ libraryDrawerOpen }),

  setThemeMode: (themeMode) => set({ themeMode }),

  requestReaderSearch: (query) =>
    set({
      readerSearchRequest: { id: Date.now(), query },
      readerSearchBusy: !!query.trim(),
      readerSearchQuery: query,
      readerSearchResults: query.trim() ? get().readerSearchResults : [],
      readerSearchScope: 'reader',
    }),

  setReaderSearchResults: (id, query, results) => {
    const { readerSearchRequest: request, readerSearchScope } = get();
    if (!request || request.id !== id) {
      return;
    }

    if (readerSearchScope === 'chapters') {
      return;
    }

    set({
      readerSearchBusy: false,
      readerSearchQuery: query,
      readerSearchResults: results,
      readerSearchActiveResultIndex: null,
      readerSearchScope: 'reader',
    });
  },

  setReaderChapterSearchResults: (query, results, activeIndex) =>
    set({
      readerSearchRequest: null,
      readerSearchJumpRequest: null,
      readerSearchBusy: false,
      readerSearchQuery: query,
      readerSearchResults: results,
      readerSearchActiveResultIndex:
        activeIndex == null || results.length === 0
          ? null
          : Math.max(0, Math.min(results.length - 1, activeIndex)),
      readerSearchScope: 'chapters',
    }),

  setReaderSearchAutoResults: (query, results, activeIndex) => {
    if (get().readerSearchScope === 'chapters') {
      return;
    }

    set({
      readerSearchBusy: false,
      readerSearchQuery: query,
      readerSearchResults: results,
      readerSearchActiveResultIndex:
        activeIndex == null || results.length === 0
          ? null
          : Math.max(0, Math.min(results.length - 1, activeIndex)),
      readerSearchScope: 'reader',
    });
  },

  setReaderSearchActiveResultIndex: (index) =>
    set((state) => ({
      readerSearchActiveResultIndex:
        index == null || state.readerSearchResults.length === 0
          ? null
          : Math.max(0, Math.min(state.readerSearchResults.length - 1, index)),
    })),

  requestReaderSearchJump: (resultId) => {
    const activeIndex = get().readerSearchResults.findIndex((result) => result.id === resultId);
    set({
      readerSearchJumpRequest: {
        id: Date.now(),
        resultId,
        query: get().readerSearchQuery,
        resultIndex: activeIndex >= 0 ? activeIndex : null,
      },
      readerSearchActiveResultIndex:
        activeIndex >= 0 ? activeIndex : get().readerSearchActiveResultIndex,
    });
  },

  jumpReaderSearchResult: (direction) => {
    const { readerSearchResults, readerSearchActiveResultIndex } = get();
    if (readerSearchResults.length === 0) {
      return;
    }

    const nextIndex =
      readerSearchActiveResultIndex == null
        ? direction > 0
          ? 0
          : readerSearchResults.length - 1
        : (readerSearchActiveResultIndex + direction + readerSearchResults.length) %
          readerSearchResults.length;

    set({
      readerSearchJumpRequest: {
        id: Date.now(),
        resultId: readerSearchResults[nextIndex].id,
        query: get().readerSearchQuery,
        resultIndex: nextIndex,
      },
      readerSearchActiveResultIndex: nextIndex,
    });
  },

  requestReaderSearchAutoJump: ({ chapterId, query, occurrenceIndex, immediate }) =>
    set({
      readerSearchAutoJumpRequest: {
        id: Date.now(),
        chapterId,
        query,
        occurrenceIndex,
        immediate,
      },
    }),

  clearReaderSearchAutoJump: (id) => {
    if (get().readerSearchAutoJumpRequest?.id === id) {
      set({ readerSearchAutoJumpRequest: null });
    }
  },

  clearReaderSearch: () =>
    set({
      readerSearchRequest: null,
      readerSearchJumpRequest: null,
      readerSearchAutoJumpRequest: null,
      readerSearchResults: [],
      readerSearchBusy: false,
      readerSearchQuery: '',
      readerSearchActiveResultIndex: null,
      readerSearchScope: 'reader',
    }),
}));
