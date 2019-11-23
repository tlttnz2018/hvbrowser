import { action, computed, observable } from 'mobx';

class AppStore {
  @observable
  public isHome: boolean = true;

  @computed
  get isWeb() {
    return !this.isHome;
  }

  @computed
  get viewWebPage() {
    return this.isWeb && !this.urlInputFocus;
  }

  @computed
  get showMoreMenu() {
    return this.moreMenu && this.viewWebPage;
  }

  @observable
  public fontSize: number = 1;

  @action
  increaseFont() {
    if (this.fontSize === 4) {
      return;
    }

    this.fontSize += 0.25;
  };

  @action
  decreaseFont() {
    if (this.fontSize === 1) {
      return;
    }

    this.fontSize -= 0.25;
  };

  @action
  resetFont() {
    this.fontSize = 1;
  };

  @observable
  public loading: boolean = false;

  @observable
  public error: boolean = false;

  @observable
  public htmlOrig: string = '';

  @observable
  public htmlHV: string = '';

  @observable
  public isHV: boolean = true;

  @observable
  public currentUrl: string = '';

  @observable
  public hideSearch: boolean = false;

  @observable
  public backButtonEnabled: boolean = false;

  @observable
  public dictionary: object = {};

  @observable
  public history: [] = [];

  @observable
  public bookmarkStore: [] = [];

  @observable
  public lastViewUrl: string = '';

  // TODO: Can be computed
  @observable
  public webPageTitle: string = '';

  @observable
  public urlInputFocus: boolean = false;

  @observable
  public moreMenu: boolean = true;

  @observable
  public fullSite: boolean = true;

  toggleHome() {
    this.isHome = !this.isHome;
  }

  showWeb() {
    this.isHome = false;
  }

  toggleWebMore() {
    this.moreMenu = !this.moreMenu;
  }

  toggleCss() {
    this.fullSite = !this.fullSite
  }
}

const appStore = new AppStore();
export default appStore;
