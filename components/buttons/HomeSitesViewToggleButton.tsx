import React from 'react';
import { Text } from 'react-native';
import ToolbarButton from './ToolbarButton';
import { useWebPageStore } from '../../stores/useWebPageStore';

export default function HomeSitesViewToggleButton() {
  const homeSitesView = useWebPageStore((s) => s.homeSitesView);
  const toggleHomeSitesView = useWebPageStore((s) => s.toggleHomeSitesView);

  return (
    <ToolbarButton onPress={toggleHomeSitesView}>
      <Text style={{ fontSize: 24 }}>{homeSitesView === 'grid' ? '≣' : '▦'}</Text>
    </ToolbarButton>
  );
}
