import React from 'react';
import { Text } from 'react-native';
import { usePathname } from 'expo-router';
import ToolbarButton from './ToolbarButton';
import { useWebPageStore } from '../../stores/useWebPageStore';

export default function HVToggleButton() {
  const pathname = usePathname();
  const isHV = useWebPageStore((s) => s.isHV);
  const urlInputFocus = useWebPageStore((s) => s.urlInputFocus);
  const toggleHV = useWebPageStore((s) => s.toggleHV);

  const isWebScreen = pathname === '/web';
  const viewWebPage = isWebScreen && !urlInputFocus;

  if (!viewWebPage) return null;

  return (
    <ToolbarButton onPress={toggleHV}>
      <Text>{isHV ? 'HV' : '汉'}</Text>
    </ToolbarButton>
  );
}
