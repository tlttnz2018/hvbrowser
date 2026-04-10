import React from 'react';
import { Text } from 'react-native';
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

  const bookmarkIcon = isCurrentBookmarked() ? '📑' : '🔖';

  return (
    <ToolbarButton onPress={toggleBookmark}>
      <Text>{bookmarkIcon}</Text>
    </ToolbarButton>
  );
}
