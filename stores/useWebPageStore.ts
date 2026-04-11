import { create } from 'zustand';

export type ThemeModePreference = 'system' | 'light' | 'dark';

const FONT_SIZE_STEP = 0.1;

interface WebPageState {
  urlInputFocus: boolean;
  moreMenu: boolean;
  fullSite: boolean;
  fontSize: number;
  isHV: boolean;
  libraryDrawerOpen: boolean;
  themeMode: ThemeModePreference;

  // actions
  setUrlInputFocus: (focus: boolean) => void;
  setMoreMenu: (open: boolean) => void;
  toggleMoreMenu: () => void;
  toggleCss: () => void;
  increaseFont: () => void;
  decreaseFont: () => void;
  resetFont: () => void;
  toggleHV: () => void;
  setLibraryDrawerOpen: (open: boolean) => void;
  setThemeMode: (mode: ThemeModePreference) => void;
}

export const useWebPageStore = create<WebPageState>()((set, get) => ({
  urlInputFocus: false,
  moreMenu: false,
  fullSite: true,
  fontSize: 1,
  isHV: true,
  libraryDrawerOpen: true,
  themeMode: 'system',

  setUrlInputFocus: (urlInputFocus) => set({ urlInputFocus }),

  setMoreMenu: (moreMenu) => set({ moreMenu }),

  toggleMoreMenu: () => set((state) => ({ moreMenu: !state.moreMenu })),

  toggleCss: () => set((state) => ({ fullSite: !state.fullSite })),

  increaseFont: () => {
    const { fontSize } = get();
    if (fontSize < 4) set({ fontSize: Math.min(4, Number((fontSize + FONT_SIZE_STEP).toFixed(2))) });
  },

  decreaseFont: () => {
    const { fontSize } = get();
    if (fontSize > 1) set({ fontSize: Math.max(1, Number((fontSize - FONT_SIZE_STEP).toFixed(2))) });
  },

  resetFont: () => set({ fontSize: 1 }),

  toggleHV: () => set((state) => ({ isHV: !state.isHV })),

  setLibraryDrawerOpen: (libraryDrawerOpen) => set({ libraryDrawerOpen }),

  setThemeMode: (themeMode) => set({ themeMode }),
}));
