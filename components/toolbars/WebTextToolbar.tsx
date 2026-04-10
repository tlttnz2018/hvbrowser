import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import ToolbarButton from '../buttons/ToolbarButton';
import { useWebPageStore } from '../../stores/useWebPageStore';
import { Theme, useTheme } from '../../theme';

interface WebTextToolbarProps {
  reloadPage: () => void;
}

export default function WebTextToolbar({ reloadPage }: WebTextToolbarProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { moreMenu, toggleMoreMenu, decreaseFont, resetFont, increaseFont, setThemeMode } = useWebPageStore();
  const nextThemeMode = theme.mode === 'dark' ? 'light' : 'dark';

  return (
    <View style={styles.container}>
      {moreMenu && (
        <>
          <ToolbarButton
            accessibilityLabel={`Switch to ${nextThemeMode} mode`}
            onPress={() => setThemeMode(nextThemeMode)}
            style={styles.fab}
          >
            <FontAwesome6
              name="circle-half-stroke"
              size={16}
              color={theme.colors.text}
            />
          </ToolbarButton>
          <ToolbarButton accessibilityLabel="Reload page" onPress={reloadPage} style={styles.fab}>
            <Text style={styles.iconLabel}>{'↻'}</Text>
          </ToolbarButton>
          <ToolbarButton onPress={decreaseFont} style={styles.fab}>
            <Text style={styles.label}>{'A-'}</Text>
          </ToolbarButton>
          <ToolbarButton onPress={resetFont} style={styles.fab}>
            <Text style={styles.label}>{'A'}</Text>
          </ToolbarButton>
          <ToolbarButton onPress={increaseFont} style={styles.fab}>
            <Text style={styles.label}>{'A+'}</Text>
          </ToolbarButton>
        </>
      )}
      <ToolbarButton
        accessibilityLabel={moreMenu ? 'Collapse reader menu' : 'Expand reader menu'}
        onPress={toggleMoreMenu}
        style={styles.burgerFab}
      >
        <Text style={[styles.burgerLabel, moreMenu && styles.burgerLabelOpen]}>≡</Text>
      </ToolbarButton>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      position: 'absolute',
      right: 14,
      bottom: 18,
      alignItems: 'flex-end',
      zIndex: 20,
    },
    label: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.text,
    },
    iconLabel: {
      fontSize: 20,
      lineHeight: 20,
      fontWeight: '700',
      color: theme.colors.text,
    },
    fab: {
      minWidth: 48,
      height: 40,
      marginHorizontal: 0,
      marginTop: 8,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      ...theme.shadows.md,
    },
    burgerFab: {
      minWidth: 48,
      width: 48,
      height: 48,
      marginHorizontal: 0,
      marginTop: 10,
      borderRadius: 24,
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
      ...theme.shadows.md,
    },
    burgerLabel: {
      fontSize: 22,
      lineHeight: 22,
      fontWeight: '700',
      color: theme.colors.accentContrast,
      marginTop: -1,
    },
    burgerLabelOpen: {
      transform: [{ rotate: '90deg' }],
    },
  });
