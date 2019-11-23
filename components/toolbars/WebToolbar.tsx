import { Text } from 'react-native';
import React from 'react';
import styled from 'styled-components';
import appStore from '../../stores/AppStore';
import ToolbarButton from '../ToolbarButton';
import { observer } from 'mobx-react';

const ViewBar = styled.View`
  height: 30px
  margin-top: 3px
  flex-direction: row
  justify-content: flex-end
`;

const WebToolbar = observer((props) => {
  return (
    <ViewBar>
      <ToolbarButton onPress={() => appStore.toggleCss()}>
        <Text>{appStore.fullSite ? '1' : '½'}</Text>
      </ToolbarButton>
      <ToolbarButton onPress={props.reloadPage}>
        <Text>{'↻'}</Text>
      </ToolbarButton>
      <ToolbarButton onPress={() => appStore.decreaseFont()}>
        <Text>{'a⁻'}</Text>
      </ToolbarButton>
      <ToolbarButton onPress={() => appStore.resetFont()}>
        <Text>{'1:1'}</Text>
      </ToolbarButton>
      <ToolbarButton onPress={() => appStore.increaseFont()}>
        <Text>{'A⁺'}</Text>
      </ToolbarButton>
    </ViewBar>
  );
});
export default WebToolbar;