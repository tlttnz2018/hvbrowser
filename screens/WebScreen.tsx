import React, { FunctionComponent } from 'react';
import styled from 'styled-components';
import { ActivityIndicator, WebView } from 'react-native';
import { extractBaseUrl } from '../utils/normalize-url';
import { inject, observer } from 'mobx-react';
import { webPageStore } from '../stores';
import { WebPageStore } from '../stores/WebPageStore';
import { observe } from 'mobx';

interface WebProps {
  loading: any;
  hv: any;
  htmlHV: string;
  htmlOrig: string;
  url: string;
  onNavigationStateChange: (navState: object) => void;
  webPageStore: WebPageStore;
}

const webView = React.createRef<WebView>();

observe(webPageStore, 'fontSize', () => {
  const script = `javascript:(function() {document.body.style.fontSize = "${webPageStore.fontSize}em";})()`; // eslint-disable-line quotes
  webView.current.injectJavaScript(script);
});

const WebWrapper = styled.View`
    flex: 6
    justify-content: center
`;

export const Web: FunctionComponent<WebProps> = inject('webPageStore')(observer((props) => {
  const { fullSite, fontSize } = props.webPageStore;
  const script = `javascript:(function() {document.body.style.fontSize = "${fontSize}em";})()`; // eslint-disable-line quotes

  return (
    <WebWrapper>
      {props.loading && (
        <ActivityIndicator animating={props.loading} color="rgba(0,0,0,0.2)" size="large" />
      )}

      {!props.loading && (
        <WebView
          ref={webView}
          source={{
            html: props.hv ? props.htmlHV : props.htmlOrig,
            baseUrl: fullSite ? extractBaseUrl(props.url) : undefined
          }}
          style={{ flex: 1 }}
          mixedContentMode="compatibility"
          useWebKit={true}
          injectedJavaScript={script}
          //window.onscroll=function(){(if((document.documentElement.scrollTop > 50) || (document.body.scrollTop > 50)) {window.postMessage(document.documentElement.scrollTop||document.body.scrollTop);};};
          onNavigationStateChange={props.onNavigationStateChange}
          // onMessage={this.onMessageReceive}
        />
      )}
    </WebWrapper>
  );
}));
