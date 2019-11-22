import React, {FunctionComponent} from 'react';
import styled from 'styled-components';
import {ActivityIndicator, WebView} from 'react-native';
import {extractBaseUrl} from '../utils/normalize-url';

interface WebProps {
  loading: any;
  hv: any;
  htmlHV: string;
  htmlOrig: string;
  fullSite: string;
  url: string;
  fontSize: number;
  onNavigationStateChange: (navState: object) => void;
  forwardRef: any;
}

const WebWrapper = styled.View`
    flex: 6
    justify-content: center
`;

export const Web: FunctionComponent<WebProps> = (props) => {
  const {forwardRef} = props;
  return (
      <WebWrapper>
        {props.loading && (
            <ActivityIndicator animating={props.loading} color="rgba(0,0,0,0.2)" size="large"/>
        )}
        {!props.loading && (
            <WebView
                ref={forwardRef}
                source={{
                  html: props.hv ? props.htmlHV : props.htmlOrig,
                  baseUrl: props.fullSite ? extractBaseUrl(props.url) : undefined
                }}
                style={{flex: 1}}
                mixedContentMode="always"
                useWebKit={true}
                injectedJavaScript={
                  'javascript:(function() {document.body.style.fontSize = "' +
                  props.fontSize +
                  'em";})()'
                } //window.onscroll=function(){(if((document.documentElement.scrollTop > 50) || (document.body.scrollTop > 50)) {window.postMessage(document.documentElement.scrollTop||document.body.scrollTop);};};
                onNavigationStateChange={props.onNavigationStateChange}
                // onMessage={this.onMessageReceive}
            />
        )}
      </WebWrapper>
  );
};
