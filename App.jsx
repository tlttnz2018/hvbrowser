import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, AsyncStorage } from 'react-native';
import { MessageBar, showMessage } from 'react-native-messages';

import SearchInput from './components/SearchInput';
import { downloadHtmlPage, convertHtmlPageToHV } from './utils/downloader';
import { cleanupHtml, updateRelativeUrl } from './utils/cleanup';
import { fixUrl, extractBaseUrl } from './utils/normalize-url';
import { Home } from './screens/HomeScreen';
import { Web } from './screens/WebScreen';
import { observer } from 'mobx-react';
import appStore from './stores/AppStore';
import HomeToggleButton from './components/toolbars/HomeToggleButton';
import MoreToggleButton from './components/toolbars/MoreToggleButton';
import WebToolbar from './components/toolbars/WebToolbar';

const TITLE_LENGTH = 150;
const BOOKMARK_STORAGE_KEY = 'HV_BROWSER_BOOKMARK_STORAGE_KEY';
const LASTVIEW_STORAGE_KEY = 'HV_BROWSER_LASTVIEW_STORAGE_KEY';

@observer
export default class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: false,
      error: false,
      htmlOrig: '',
      htmlHV: '',
      isHV: true,
      currentUrl: '',
      hideSearch: false,
      backButtonEnabled: false,
      dictionary: {},
      history: [],
      bookmarkStore: [],
      lastViewUrl: '',
      webPageTitle: ''
    };
  }

  async componentDidMount() {
    let bookmarkStore = [];
    let lastViewUrl = '';

    try {
      bookmarkStore = await AsyncStorage.getItem(BOOKMARK_STORAGE_KEY);
      lastViewUrl = await AsyncStorage.getItem(LASTVIEW_STORAGE_KEY);

      // console.log("Load bookmarks: " + bookmarkStore);
      // console.log("Last url: " + lastViewUrl);
    } catch (e) {
      console.log('Failed to load bookmarks');
    }
    this.setState({
      // dictionary: require('./data/DataHanVietUniSimp.json'),
      dictionary: require('./data/DataHanVietUni.json'),
      bookmarkStore: !!bookmarkStore ? JSON.parse(bookmarkStore) : [],
      lastViewUrl: !!lastViewUrl ? JSON.parse(lastViewUrl) : ''
    });
  }

  updateHistory = urlNew => {
    const { history, currentUrl } = this.state;
    // console.log("Before update: " + history + " with current url: " + currentUrl + " with urlNew: " + urlNew);

    if (currentUrl === urlNew) {
      return history; // No change
    }

    const historiesItem = [...history, urlNew];
    if (historiesItem.length > 50) {
      historiesItem.shift();
    }

    // console.log("After updating history: " + historiesItem);
    return historiesItem;
  };

  handleUpdateUrl = async url => {
    const { currentUrl } = this.state;

    if (!url) {
      return;
    }

    if (
      !url ||
      url.indexOf('about') !== -1 ||
      url.indexOf('Bundle/Application') !== -1 ||
      url.indexOf('postMessage') !== -1
    ) {
      return;
    }

    url = fixUrl(currentUrl, url);

    // console.log(`CurrentUrl: ${currentUrl} and url after fixing: ${url}`);

    // Update history
    var historiesItem = this.updateHistory(url); // It can be a problem when user not enter the full but go back with full

    appStore.urlInputFocus = false;
    this.setState(
      {
        loading: true,
        currentUrl: url,
        backButtonEnabled: !!this.history && this.history.length >= 1,
        history: historiesItem
      },
      async () => {
        try {
          const htmlContent = await downloadHtmlPage(url);
          const htmlClean = await cleanupHtml(htmlContent);
          const htmlNormalize = await updateRelativeUrl(htmlClean, url);
          const htmlConvert = await convertHtmlPageToHV(htmlNormalize, this.state.dictionary);
          const webPageTitle = htmlConvert.match(/<title>([^<]+)<\/title>/)[1];

          // console.log('Text: ', htmlConvert);
          this.setState(
            {
              loading: false,
              error: false,
              htmlOrig: '\ufeff' + htmlNormalize,
              htmlHV: '\ufeff' + htmlConvert,
              webPageTitle,
              lastViewUrl: url
            },
            async () => {
              try {
                let lastViewUrl = JSON.stringify(url);
                AsyncStorage.setItem(LASTVIEW_STORAGE_KEY, lastViewUrl);
              } catch (e) {
                console.log('Failed to save last url ', url);
              }
            }
          );
        } catch (e) {
          this.setState({
            loading: false,
            error: true
          });
        }
      }
    );
  };

  /**
   * Preventing return to home page when switching between HV/Han or 1 and 1/2
   * @param navState
   * @return {Promise<void>}
   */
  onFollowLink = async navState => {
    // console.log(" Change link? " + JSON.stringify(navState));
    const { currentUrl } = this.state;
    const { title, jsEvaluationValue, url, navigationType } = navState;

    if (!url) {
      return;
    }

    if (url === currentUrl) {
      // No change
      return;
    }

    if (jsEvaluationValue !== undefined) {
      //JS
      return;
    }

    if (!title) {
      // Kind of not html page
      return;
    }

    if (
      !url ||
      url.indexOf('about') !== -1 ||
      url.match(/data:/) ||
      (url === extractBaseUrl(url) + '/' && navigationType !== 'click') ||
      url.indexOf('postMessage') !== -1
    ) {
      // console.log("Skip");
      return;
    }

    this.setState({
      // Prevent webview to show chinese text before converting.
      htmlOrig: '',
      htmlHV: ''
    });

    await this.handleUpdateUrl(url);
  };

  goBack = () => {
    var { history, currentUrl } = this.state;
    var oldUrl;

    if (!!history && history.length >= 1) {
      oldUrl = history.pop();
      if (oldUrl === currentUrl) {
        // store current, need to skip back one more time
        oldUrl = history.pop();
      }
    }

    if (!!oldUrl) {
      this.setState({
        history
      });
      this.handleUpdateUrl(oldUrl);
    }
  };

  // onMessageReceive = (event) => {
  // console.log("Message: " + JSON.stringify(event.nativeEvent));
  // if(event.nativeEvent.data > 60) {
  // this.setState({hideSearch: true});
  // } else {
  // this.setState({hideSearch: false});
  // }
  // }

  handlePressImage = url => {
    appStore.showWeb();
    this.handleUpdateUrl(url);
  };

  toggleBookmark = () => {
    var newStore = [];
    var { currentUrl, webPageTitle, bookmarkStore } = this.state;
    if (!currentUrl || !webPageTitle) {
      return;
    }
    // console.log("Toggle bookmark: " + webPageTitle.slice(0,TITLE_LENGTH) + "..." + " with url: " + currentUrl);
    var bookIdx = bookmarkStore.findIndex(bookmark => bookmark.url === currentUrl);
    if (bookIdx != -1) {
      // Already bookmark, remove it.
      bookmarkStore.splice(bookIdx, 1);
      newStore = bookmarkStore;
      showMessage('Bookmark removed!');
    } else {
      const desc = webPageTitle.slice(0, TITLE_LENGTH) + '...';
      // Store book
      const newBookmark = { url: currentUrl, desc };
      newStore = [...bookmarkStore, newBookmark];
      showMessage('Bookmarked!');
    }

    this.setState(
      {
        bookmarkStore: newStore
      },
      async () => {
        try {
          let bookmarkStoreJson = JSON.stringify(newStore);
          // console.log("Bookmark before storing: " + bookmarkStoreJson);
          AsyncStorage.setItem(BOOKMARK_STORAGE_KEY, bookmarkStoreJson);
        } catch (e) {
          console.log('Failed to save comment', text, 'for', selectedItemId);
        }
      }
    );
  };

  toggleHV = () => {
    const { isHV } = this.state;
    this.setState({
      isHV: !isHV
    });
  };

  reloadPage = () => {
    const { currentUrl } = this.state;
    this.handleUpdateUrl(currentUrl);
  };

  render() {
    const {
      isHV,
      htmlOrig,
      htmlHV,
      currentUrl,
      backButtonEnabled,
      loading,
      bookmarkStore,
      lastViewUrl
    } = this.state;

    const { isHome, isWeb, urlInputFocus, showMoreMenu } = appStore;
    return (
      <View style={styles.container}>
        <View style={styles.controlBar}>
          {!isHome && (
            <View style={styles.urlInput}>
              <SearchInput
                placeholder="Input chinese website url"
                url={currentUrl.indexOf('Bundle/Application') === -1 ? currentUrl : ''}
                onSubmit={this.handleUpdateUrl}
                onFocus={(isFocus) => appStore.urlInputFocus = isFocus}
                backButtonEnabled={backButtonEnabled}
                style={styles.inputSearch}
                onBack={this.goBack}
              />
              {!urlInputFocus && (
                <TouchableOpacity onPress={this.toggleBookmark} style={styles.navButton}>
                  <Text>
                    {bookmarkStore.findIndex(bookmark => bookmark.url === currentUrl) != -1
                      ? '📑'
                      : '🔖'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {!isHome && !urlInputFocus && (
            <TouchableOpacity onPress={this.toggleHV} style={styles.navButton}>
              <Text>{isHV ? 'HV' : '汉'}</Text>
            </TouchableOpacity>
          )}
          <MoreToggleButton/>
          <HomeToggleButton/>
        </View>
        {showMoreMenu && !loading && (
          <WebToolbar reloadPage={this.reloadPage}/>
        )}
        {isWeb && (
          <Web
            loading={loading}
            hv={isHV}
            htmlHV={htmlHV}
            htmlOrig={htmlOrig}
            url={currentUrl}
            onNavigationStateChange={this.onFollowLink}
          />
        )}
        {isHome && (
          <Home
            onPressImage={this.handlePressImage}
            bookmarkStore={bookmarkStore}
            lastViewUrl={lastViewUrl}
          />
        )}
        <MessageBar style={styles.messageBar} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    backgroundColor: '#fff',
    position: 'absolute',
    top: 30,
    left: 0,
    right: 0,
    bottom: 0
  },
  controlBar: {
    height: 30,
    flexDirection: 'row',
    justifyContent: 'flex-end'
  },
  viewBar: {
    height: 30,
    marginTop: 3,
    flexDirection: 'row',
    justifyContent: 'flex-end'
  },
  urlInput: {
    flex: 1,
    flexDirection: 'row'
  },
  inputSearch: {
    flex: 1
  },
  navButton: {
    width: 30,
    padding: 3,
    marginRight: 3,
    marginLeft: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderColor: '#666',
    borderWidth: 1,
    borderRadius: 3
  }
});
