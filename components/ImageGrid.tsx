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
import Grid from './Grid';

interface SiteItem {
  uri?: ImageSourcePropType;
  url: string;
  desc: string;
  isBookmark?: boolean;
}

interface ImageGridProps {
  onPressImage: (url: string) => void;
  onRemoveBookmark: (url: string) => void;
  bookmarkStore: SiteItem[];
  lastViewUrl: string;
  viewMode?: 'grid' | 'list';
}

const SITES: SiteItem[] = [
  { uri: require('../assets/17k.png'), url: 'http://h5.17k.com/', desc: '17k' },
  { uri: require('../assets/jiujiu.png'), url: 'http://m.jjxsw.com/', desc: 'Txt99' },
  { uri: require('../assets/80txt.png'), url: 'http://m.80txt.com/', desc: '80txt' },
  { uri: require('../assets/tangiang.png'), url: 'http://wap.jjwxc.net/', desc: 'Tấn Giang' },
  { uri: require('../assets/kanunu8.png'), url: 'http://www.kanunu8.com/', desc: 'Nỗ nỗ' },
];

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

function ImageGrid({ onPressImage, onRemoveBookmark, bookmarkStore, lastViewUrl, viewMode = 'grid' }: ImageGridProps) {
  const data: SiteItem[] = [
    { url: lastViewUrl, desc: 'Last Open URL' },
    ...SITES,
    ...bookmarkStore.map((bookmark) => ({
      ...bookmark,
      uri: bookmark.uri || getBookmarkImage(bookmark.url),
      isBookmark: true,
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

  const renderItem = ({
    item,
    size,
    marginTop,
    marginLeft,
  }: {
    item: SiteItem;
    size: number;
    marginTop: number;
    marginLeft: number;
  }) => {
    const style = {
      width: size,
      height: size,
      marginLeft,
      marginTop,
      borderWidth: 1,
      borderColor: '#666',
      borderRadius: 5,
      padding: 5,
    };

    return (
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() => onPressImage(item.url)}
        onLongPress={() => confirmRemoveBookmark(item)}
        style={style}
      >
        {!!item.uri && <Image source={item.uri} style={styles.image} />}
        {!!item.desc && <Text>{item.desc}</Text>}
      </TouchableOpacity>
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

  if (viewMode === 'list') {
    return (
      <FlatList
        data={data}
        renderItem={renderListItem}
        keyExtractor={getItemKey}
        contentContainerStyle={styles.listContent}
      />
    );
  }

  return (
    <Grid
      data={data}
      renderItem={renderItem}
      keyExtractor={getItemKey}
    />
  );
}

const styles = StyleSheet.create({
  image: { flex: 1 },
  listContent: {
    paddingHorizontal: 10,
    paddingBottom: 12,
  },
  listDeleteBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 8,
    backgroundColor: '#d92d20',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 18,
  },
  listDeleteBackgroundDisabled: {
    backgroundColor: '#ddd',
  },
  listDeleteText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#666',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#fff',
  },
  listItemGap: {
    marginTop: 8,
  },
  listThumb: {
    width: 52,
    height: 52,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listImage: {
    width: '100%',
    height: '100%',
  },
  listFallback: {
    fontSize: 18,
    color: '#666',
  },
  listTextWrap: {
    flex: 1,
  },
  listTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    marginBottom: 2,
  },
  listUrl: {
    fontSize: 12,
    color: '#666',
  },
});

export default memo(ImageGrid);
