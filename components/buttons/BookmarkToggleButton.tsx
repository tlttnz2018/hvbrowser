import React from 'react';
import { StyleSheet, Text } from 'react-native';
import ToolbarButton from './ToolbarButton';
import { useAppStore } from '../../stores/useAppStore';
import { useWebPageStore } from '../../stores/useWebPageStore';
import { Theme, useTheme } from '../../theme';

export default function BookmarkToggleButton() {
  const theme = useTheme();
  const styles = createStyles(theme);
  const urlInputFocus = useWebPageStore((s) => s.urlInputFocus);
  const isCurrentBookmarked = useAppStore((s) => s.isCurrentBookmarked);
  const toggleBookmark = useAppStore((s) => s.toggleBookmark);
  const viewWebPage = !urlInputFocus;

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

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  button: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 0,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.borderMuted,
  },
  buttonSaved: {
    backgroundColor: theme.colors.surfaceAccent,
    borderColor: theme.colors.borderAccent,
  },
  icon: {
    fontSize: 18,
    opacity: 0.5,
  },
  iconSaved: {
    opacity: 1,
  },
});
