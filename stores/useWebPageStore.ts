import { create } from 'zustand';

interface WebPageState {
  urlInputFocus: boolean;
  moreMenu: boolean;
  fullSite: boolean;
  fontSize: number;
  isHV: boolean;
  homeSitesView: 'grid' | 'list';

  // actions
  setUrlInputFocus: (focus: boolean) => void;
  toggleMoreMenu: () => void;
  toggleCss: () => void;
  increaseFont: () => void;
  decreaseFont: () => void;
  resetFont: () => void;
  toggleHV: () => void;
  toggleHomeSitesView: () => void;
}

export const useWebPageStore = create<WebPageState>()((set, get) => ({
  urlInputFocus: false,
  moreMenu: true,
  fullSite: true,
  fontSize: 1,
  isHV: true,
  homeSitesView: 'grid',

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

  toggleHomeSitesView: () =>
    set((state) => ({ homeSitesView: state.homeSitesView === 'grid' ? 'list' : 'grid' })),
}));
