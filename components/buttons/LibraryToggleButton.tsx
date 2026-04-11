import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { useWebPageStore } from '../../stores/useWebPageStore';
import { Theme, useTheme } from '../../theme';
import ToolbarButton from './ToolbarButton';

export default function LibraryToggleButton() {
  const theme = useTheme();
  const styles = createStyles(theme);
  const libraryDrawerOpen = useWebPageStore((s) => s.libraryDrawerOpen);
  const setLibraryDrawerOpen = useWebPageStore((s) => s.setLibraryDrawerOpen);

  return (
    <ToolbarButton
      accessibilityLabel={libraryDrawerOpen ? 'Hide library' : 'Open library'}
      onPress={() => setLibraryDrawerOpen(!libraryDrawerOpen)}
      variant="primary"
    >
      <Text style={[styles.icon, libraryDrawerOpen && styles.iconOpen]}>☰</Text>
    </ToolbarButton>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    icon: {
      fontSize: 18,
      lineHeight: 18,
      fontWeight: '700',
      color: theme.colors.accentContrast,
    },
    iconOpen: {
      transform: [{ rotate: '90deg' }],
    },
  });
