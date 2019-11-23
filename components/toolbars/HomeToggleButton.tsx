import { Text } from 'react-native';
import React from 'react';
import appStore from '../../AppStore';
import ToolbarButton from '../ToolbarButton';

export default function HomeToggleButton() {
  return (
    <ToolbarButton onPress={() => appStore.toggleHome()}>
      <Text>{'🏠'}</Text>
    </ToolbarButton>
  );
}
