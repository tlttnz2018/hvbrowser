import React from 'react';
import SegmentedControl from './SegmentedControl';
import { useWebPageStore } from '../../stores/useWebPageStore';

export default function HVToggleButton() {
  const isHV = useWebPageStore((s) => s.isHV);
  const urlInputFocus = useWebPageStore((s) => s.urlInputFocus);
  const setUrlInputFocus = useWebPageStore((s) => s.setUrlInputFocus);
  const toggleHV = useWebPageStore((s) => s.toggleHV);
  const viewWebPage = !urlInputFocus;

  if (!viewWebPage) return null;

  return (
    <SegmentedControl
      accessibilityLabel="Choose reading language mode"
      compact
      onChange={(key) => {
        setUrlInputFocus(false);
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
