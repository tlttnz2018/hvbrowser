import { action, computed, observable } from 'mobx';

export class AppStore {
  // Screen switching
  @observable
  public isHome: boolean = true;

  @computed
  get isWeb() {
    return !this.isHome;
  }

  @action.bound
  toggleHome() {
    this.isHome = !this.isHome;
  }

  @action.bound
  showWeb() {
    this.isHome = false;
  }

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
}