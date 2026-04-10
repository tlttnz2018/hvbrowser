import React from 'react';
import { View, Text } from 'react-native';
import ImageGrid from '../components/ImageGrid';
import { useAppStore } from '../stores/useAppStore';
import { usePageLoader } from '../hooks/usePageLoader';

export default function HomeScreen() {
  const { loadPage } = usePageLoader();
  const bookmarks = useAppStore((s) => s.bookmarks);
  const lastViewUrl = useAppStore((s) => s.lastViewUrl);

  return (
    <View className="flex-1 justify-center">
      <Text className="m-[10px]">
        Please click on 🏠 button for switching between Home and Browse mode or click on any icon
        below to go to the site.
      </Text>
      <ImageGrid
        onPressImage={loadPage}
        bookmarkStore={bookmarks}
        lastViewUrl={lastViewUrl}
      />
    </View>
  );
}
