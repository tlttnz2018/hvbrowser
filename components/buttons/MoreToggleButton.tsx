import React from 'react';
import { Text } from 'react-native';
import { usePathname } from 'expo-router';
import ToolbarButton from './ToolbarButton';
import { useWebPageStore } from '../../stores/useWebPageStore';

export default function MoreToggleButton() {
  const pathname = usePathname();
  const urlInputFocus = useWebPageStore((s) => s.urlInputFocus);
  const toggleMoreMenu = useWebPageStore((s) => s.toggleMoreMenu);

  const isWebScreen = pathname === '/web';
  const viewWebPage = isWebScreen && !urlInputFocus;

  if (!viewWebPage) return null;

  return (
    <ToolbarButton onPress={toggleMoreMenu}>
      <Text>{'...'}</Text>
    </ToolbarButton>
  );
}
