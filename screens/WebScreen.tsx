import React, { FunctionComponent } from 'react';
import styled from 'styled-components';
import { ActivityIndicator, WebView } from 'react-native';
import { extractBaseUrl } from '../utils/normalize-url';
import appStore from '../AppStore';
import { observer } from 'mobx-react';
import { observe } from 'mobx';

interface WebProps {
  loading: any;
  hv: any;
  htmlHV: string;
  htmlOrig: string;
  url: string;
  onNavigationStateChange: (navState: object) => void;
}

const WebWrapper = styled.View`
    flex: 6
    justify-content: center
`;

export const webView = React.createRef<WebView>();

observe(appStore, 'fontSize', () => {
  const script = `javascript:(function() {document.body.style.fontSize = "${appStore.fontSize}em";})()`; // eslint-disable-line quotes
  webView.current.injectJavaScript(script);
});

export const Web: FunctionComponent<WebProps> = observer((props) => {
  const { fullSite, fontSize } = appStore;
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
});
