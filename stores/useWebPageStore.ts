import { create } from 'zustand';

interface WebPageState {
  urlInputFocus: boolean;
  moreMenu: boolean;
  fullSite: boolean;
  fontSize: number;
  isHV: boolean;
  libraryLayout: 'grid' | 'list';
  libraryDrawerOpen: boolean;

  // actions
  setUrlInputFocus: (focus: boolean) => void;
  toggleMoreMenu: () => void;
  toggleCss: () => void;
  increaseFont: () => void;
  decreaseFont: () => void;
  resetFont: () => void;
  toggleHV: () => void;
  toggleLibraryLayout: () => void;
  setLibraryDrawerOpen: (open: boolean) => void;
}

export const useWebPageStore = create<WebPageState>()((set, get) => ({
  urlInputFocus: false,
  moreMenu: false,
  fullSite: true,
  fontSize: 1,
  isHV: true,
  libraryLayout: 'grid',
  libraryDrawerOpen: true,

  setUrlInputFocus: (urlInputFocus) => set({ urlInputFocus }),

  toggleMoreMenu: () => set((state) => ({ moreMenu: !state.moreMenu })),

  toggleCss: () => set((state) => ({ fullSite: !state.fullSite })),

  increaseFont: () => {
    const { fontSize } = get();
    if (fontSize < 4) set({ fontSize: fontSize + 0.25 });
  },

  decreaseFont: () => {
    const { fontSize } = get();
    if (fontSize > 1) set({ fontSize: fontSize - 0.25 });
  },

  resetFont: () => set({ fontSize: 1 }),

  toggleHV: () => set((state) => ({ isHV: !state.isHV })),

  toggleLibraryLayout: () =>
    set((state) => ({ libraryLayout: state.libraryLayout === 'grid' ? 'list' : 'grid' })),

  setLibraryDrawerOpen: (libraryDrawerOpen) => set({ libraryDrawerOpen }),
}));
