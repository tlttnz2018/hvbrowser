import React from 'react';
import SegmentedControl from './SegmentedControl';
import { useWebPageStore } from '../../stores/useWebPageStore';

export default function LibraryLayoutToggle() {
  const libraryLayout = useWebPageStore((s) => s.libraryLayout);
  const toggleLibraryLayout = useWebPageStore((s) => s.toggleLibraryLayout);

  return (
    <SegmentedControl
      accessibilityLabel="Choose library layout"
      compact
      onChange={(key) => {
        if (key !== libraryLayout) toggleLibraryLayout();
      }}
      options={[
        { key: 'grid', label: '▥' },
        { key: 'list', label: '≣' },
      ]}
      selectedKey={libraryLayout}
    />
  );
}
