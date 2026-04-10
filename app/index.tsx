import React from 'react';
import { View, Text } from 'react-native';
import ImageGrid from '../components/ImageGrid';
import { useAppStore } from '../stores/useAppStore';
import { useWebPageStore } from '../stores/useWebPageStore';
import { usePageLoader } from '../hooks/usePageLoader';

export default function HomeScreen() {
  const { loadPage } = usePageLoader();
  const bookmarks = useAppStore((s) => s.bookmarks);
  const lastViewUrl = useAppStore((s) => s.lastViewUrl);
  const removeBookmark = useAppStore((s) => s.removeBookmark);
  const homeSitesView = useWebPageStore((s) => s.homeSitesView);

  return (
    <View className="flex-1">
      <Text className="m-[10px]">
        Please click on 🏠 button for switching between Home and Browse mode. Use the button next
        to it to switch between grid and list views for the site shortcuts below.
      </Text>
      <ImageGrid
        onPressImage={loadPage}
        onRemoveBookmark={removeBookmark}
        bookmarkStore={bookmarks}
        lastViewUrl={lastViewUrl}
        viewMode={homeSitesView}
      />
    </View>
  );
}
