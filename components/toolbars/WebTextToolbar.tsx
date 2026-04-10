import React from 'react';
import { View, Text } from 'react-native';
import ToolbarButton from '../buttons/ToolbarButton';
import { useWebPageStore } from '../../stores/useWebPageStore';

interface WebTextToolbarProps {
  reloadPage: () => void;
}

export default function WebTextToolbar({ reloadPage }: WebTextToolbarProps) {
  const { fullSite, toggleCss, decreaseFont, resetFont, increaseFont } = useWebPageStore();

  return (
    <View className="h-[30px] mt-[3px] flex-row justify-end">
      <ToolbarButton onPress={toggleCss}>
        <Text>{fullSite ? '1' : '½'}</Text>
      </ToolbarButton>
      <ToolbarButton onPress={reloadPage}>
        <Text>{'↻'}</Text>
      </ToolbarButton>
      <ToolbarButton onPress={decreaseFont}>
        <Text>{'a⁻'}</Text>
      </ToolbarButton>
      <ToolbarButton onPress={resetFont}>
        <Text>{'1:1'}</Text>
      </ToolbarButton>
      <ToolbarButton onPress={increaseFont}>
        <Text>{'A⁺'}</Text>
      </ToolbarButton>
    </View>
  );
}
