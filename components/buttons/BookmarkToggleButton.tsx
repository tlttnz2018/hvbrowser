import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { usePathname } from 'expo-router';
import ToolbarButton from './ToolbarButton';
import { useAppStore } from '../../stores/useAppStore';
import { useWebPageStore } from '../../stores/useWebPageStore';

export default function BookmarkToggleButton() {
  const pathname = usePathname();
  const urlInputFocus = useWebPageStore((s) => s.urlInputFocus);
  const isCurrentBookmarked = useAppStore((s) => s.isCurrentBookmarked);
  const toggleBookmark = useAppStore((s) => s.toggleBookmark);

  const isWebScreen = pathname === '/web';
  const viewWebPage = isWebScreen && !urlInputFocus;

  if (!viewWebPage) return null;

  const saved = isCurrentBookmarked();

  return (
    <ToolbarButton
      accessibilityLabel={saved ? 'Remove bookmark' : 'Save bookmark'}
      onPress={toggleBookmark}
      variant="quiet"
      style={[styles.button, saved && styles.buttonSaved]}
    >
      <Text style={[styles.icon, saved && styles.iconSaved]}>{saved ? '🔖' : '🔖'}</Text>
    </ToolbarButton>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 0,
    borderRadius: 18,
    backgroundColor: '#f1f3f5',
    borderWidth: 1,
    borderColor: '#d7dce2',
  },
  buttonSaved: {
    backgroundColor: '#fff4d6',
    borderColor: '#f0c36a',
  },
  icon: {
    fontSize: 18,
    opacity: 0.5,
  },
  iconSaved: {
    opacity: 1,
  },
});
