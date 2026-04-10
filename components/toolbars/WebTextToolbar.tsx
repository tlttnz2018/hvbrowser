import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import ToolbarButton from '../buttons/ToolbarButton';
import { useWebPageStore } from '../../stores/useWebPageStore';

interface WebTextToolbarProps {
  reloadPage: () => void;
}

export default function WebTextToolbar({ reloadPage }: WebTextToolbarProps) {
  const { moreMenu, toggleMoreMenu, decreaseFont, resetFont, increaseFont } = useWebPageStore();

  return (
    <View style={styles.container}>
      {moreMenu && (
        <>
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

const styles = StyleSheet.create({
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
    color: '#1c1c1e',
  },
  iconLabel: {
    fontSize: 20,
    lineHeight: 20,
    fontWeight: '700',
    color: '#1c1c1e',
  },
  fab: {
    minWidth: 48,
    height: 40,
    marginHorizontal: 0,
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: '#fffdf8',
    borderColor: '#ddd4c9',
    shadowColor: '#46311b',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  burgerFab: {
    minWidth: 48,
    width: 48,
    height: 48,
    marginHorizontal: 0,
    marginTop: 10,
    borderRadius: 24,
    backgroundColor: '#7a4f28',
    borderColor: '#7a4f28',
    shadowColor: '#46311b',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  burgerLabel: {
    fontSize: 22,
    lineHeight: 22,
    fontWeight: '700',
    color: '#fffdf8',
    marginTop: -1,
  },
  burgerLabelOpen: {
    transform: [{ rotate: '90deg' }],
  },
});
