import React from 'react';
import { Text } from 'react-native';
import ToolbarButton from './ToolbarButton';
import { useWebPageStore } from '../../stores/useWebPageStore';

export default function LibraryToggleButton() {
  const libraryDrawerOpen = useWebPageStore((s) => s.libraryDrawerOpen);
  const setLibraryDrawerOpen = useWebPageStore((s) => s.setLibraryDrawerOpen);

  return (
    <ToolbarButton
      accessibilityLabel={libraryDrawerOpen ? 'Hide library' : 'Open library'}
      onPress={() => setLibraryDrawerOpen(!libraryDrawerOpen)}
      variant="primary"
    >
      <Text style={{ fontSize: 18, lineHeight: 18, fontWeight: '700', color: '#fffdf8' }}>
        {libraryDrawerOpen ? '×' : '☰'}
      </Text>
    </ToolbarButton>
  );
}
