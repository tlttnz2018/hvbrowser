import { Text } from 'react-native';
import React from 'react';
import appStore from '../../stores/AppStore';
import ToolbarButton from '../ToolbarButton';

export default function MoreToggleButton() {
  const { viewWebPage } = appStore;

  return viewWebPage && (
    <ToolbarButton onPress={() => appStore.toggleWebMore()}>
      <Text>{'...'}</Text>
    </ToolbarButton>
  );
}
