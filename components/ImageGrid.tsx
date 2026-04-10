import React, { memo, useMemo, useRef } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Image,
  ImageSourcePropType,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export interface SiteItem {
  uri?: ImageSourcePropType;
  url: string;
  desc: string;
  isBookmark?: boolean;
  kind?: 'recent' | 'source' | 'bookmark';
}

interface ImageGridProps {
  items?: SiteItem[];
  onPressImage: (url: string) => void;
  onRemoveBookmark: (url: string) => void;
  bookmarkStore: SiteItem[];
  lastViewUrl: string;
  headerComponent?: React.ReactElement;
}

function getBookmarkImage(url: string): ImageSourcePropType | undefined {
  const piaotiaMatch = url.match(/^https?:\/\/(?:www\.)?piaotia\.com\/bookinfo\/(\d+)\/(\d+)\.html$/i);
  if (piaotiaMatch) {
    const [, categoryId, bookId] = piaotiaMatch;
    return { uri: `https://www.piaotia.com/files/article/image/${categoryId}/${bookId}/${bookId}s.jpg` };
  }

  return undefined;
}

interface SwipeableBookmarkListItemProps {
  item: SiteItem;
  index: number;
  onPressImage: (url: string) => void;
  onRemoveBookmark: (url: string) => void;
  onLongPressRemove: (item: SiteItem) => void;
}

function SwipeableBookmarkListItem({
  item,
  index,
  onPressImage,
  onRemoveBookmark,
  onLongPressRemove,
}: SwipeableBookmarkListItemProps) {
  const translateX = useRef(new Animated.Value(0)).current;

  const resetPosition = () => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 0,
    }).start();
  };

  const removeWithAnimation = () => {
    Animated.timing(translateX, {
      toValue: -140,
      duration: 140,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onRemoveBookmark(item.url);
    });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          !!item.isBookmark && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && gestureState.dx < -8,
        onPanResponderMove: (_, gestureState) => {
          if (!item.isBookmark) return;
          translateX.setValue(Math.max(gestureState.dx, -140));
        },
        onPanResponderRelease: (_, gestureState) => {
          if (!item.isBookmark) return;
          if (gestureState.dx < -90) {
            removeWithAnimation();
          } else {
            resetPosition();
          }
        },
        onPanResponderTerminate: resetPosition,
      }),
    [item.isBookmark, onRemoveBookmark, item.url, translateX]
  );

  return (
    <View style={index > 0 ? styles.listItemGap : undefined}>
      <View style={[styles.listDeleteBackground, !item.isBookmark && styles.listDeleteBackgroundDisabled]}>
        <Text style={styles.listDeleteText}>Delete</Text>
      </View>
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...(item.isBookmark ? panResponder.panHandlers : {})}
      >
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => onPressImage(item.url)}
          onLongPress={() => onLongPressRemove(item)}
          style={styles.listItem}
        >
          <View style={styles.listThumb}>
            {!!item.uri ? (
              <Image source={item.uri} style={styles.listImage} resizeMode="contain" />
            ) : (
              <Text style={styles.listFallback}>↺</Text>
            )}
          </View>
          <View style={styles.listTextWrap}>
            {!!item.desc && <Text style={styles.listTitle}>{item.desc}</Text>}
            <Text numberOfLines={1} style={styles.listUrl}>
              {item.url}
            </Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

function ImageGrid({
  items,
  onPressImage,
  onRemoveBookmark,
  bookmarkStore,
  lastViewUrl,
  headerComponent,
}: ImageGridProps) {
  const data: SiteItem[] =
    items ||
    [
      { url: lastViewUrl, desc: 'Last Open URL', kind: 'recent' },
      ...bookmarkStore.map((bookmark) => ({
        ...bookmark,
        uri: bookmark.uri || getBookmarkImage(bookmark.url),
        isBookmark: true,
        kind: 'bookmark' as const,
      })),
    ];

  const getItemKey = (item: SiteItem, index: number) => `${item.url || item.desc || 'site'}-${index}`;

  const confirmRemoveBookmark = (item: SiteItem) => {
    if (!item.isBookmark) return;

    Alert.alert(
      'Remove bookmark?',
      item.desc || item.url,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => onRemoveBookmark(item.url) },
      ]
    );
  };

  const renderListItem = ({ item, index }: { item: SiteItem; index: number }) => (
    <SwipeableBookmarkListItem
      item={item}
      index={index}
      onPressImage={onPressImage}
      onRemoveBookmark={onRemoveBookmark}
      onLongPressRemove={confirmRemoveBookmark}
    />
  );

  return (
    <FlatList
      data={data}
      renderItem={renderListItem}
      keyExtractor={getItemKey}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={headerComponent}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 4,
    paddingBottom: 18,
  },
  listDeleteBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    backgroundColor: '#8c2f39',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 22,
  },
  listDeleteBackgroundDisabled: {
    backgroundColor: '#d9d0c4',
  },
  listDeleteText: {
    color: '#fff',
    fontSize: 12,
    letterSpacing: 0.4,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dccfbf',
    borderRadius: 18,
    padding: 12,
    backgroundColor: '#fffdf8',
    shadowColor: '#49311a',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  listItemGap: {
    marginTop: 12,
  },
  listThumb: {
    width: 62,
    height: 82,
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#f3ecdf',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#eadfce',
  },
  listImage: {
    width: '100%',
    height: '100%',
  },
  listFallback: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8a5a2b',
  },
  listTextWrap: {
    flex: 1,
  },
  listTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    color: '#211b17',
    marginBottom: 6,
  },
  listUrl: {
    fontSize: 12,
    color: '#7b6c61',
  },
});

export default memo(ImageGrid);
