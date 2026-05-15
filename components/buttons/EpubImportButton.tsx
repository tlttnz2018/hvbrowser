import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { usePageLoader } from '../../hooks/usePageLoader';
import { Theme, useTheme } from '../../theme';
import ToolbarButton from './ToolbarButton';

export default function EpubImportButton() {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { importEpub } = usePageLoader();

  return (
    <ToolbarButton accessibilityLabel="Import EPUB file" onPress={() => void importEpub()}>
      <Text style={styles.label}>EPUB</Text>
    </ToolbarButton>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    label: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.colors.textAccent,
      letterSpacing: 0.6,
    },
  });
