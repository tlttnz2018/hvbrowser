import React from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import ToolbarButton from './ToolbarButton';
import { useAppStore } from '../../stores/useAppStore';

export default function WebViewToggleButton() {
  const router = useRouter();
  const currentUrl = useAppStore((s) => s.currentUrl);
  const hasCurrentPage = !!currentUrl && currentUrl.indexOf('Bundle/Application') === -1;

  return (
    <ToolbarButton
      accessibilityLabel="Open current page"
      onPress={() => {
        if (hasCurrentPage) router.push('/web');
      }}
      style={{ opacity: hasCurrentPage ? 1 : 0.45 }}
    >
      <Text style={{ fontSize: 16, lineHeight: 16, fontWeight: '700', color: '#1c1c1e' }}>{'↗'}</Text>
    </ToolbarButton>
  );
}
