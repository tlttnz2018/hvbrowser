import React from 'react';
import { usePathname } from 'expo-router';
import SegmentedControl from './SegmentedControl';
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
    <SegmentedControl
      accessibilityLabel="Choose reading language mode"
      compact
      onChange={(key) => {
        if ((key === 'hv') !== isHV) toggleHV();
      }}
      options={[
        { key: 'zh', label: '汉' },
        { key: 'hv', label: 'HV' },
      ]}
      selectedKey={isHV ? 'hv' : 'zh'}
    />
  );
}
