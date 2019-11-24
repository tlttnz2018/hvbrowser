import { AppStore } from './AppStore';
import { WebPageStore } from './WebPageStore';

export const appStore = new AppStore();
export const webPageStore = new WebPageStore(appStore);