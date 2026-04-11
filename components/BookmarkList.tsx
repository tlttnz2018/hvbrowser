import React, { useMemo, useRef } from 'react';
import {
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
import { Theme, useTheme } from '../theme';

export interface SiteItem {
  uri?: ImageSourcePropType;
  url: string;
  desc: string;
  createdAt?: string;
  lastAccessedAt?: string;
  isBookmark?: boolean;
  kind?: 'recent' | 'source' | 'bookmark';
}

interface BookmarkListProps {
  items?: SiteItem[];
  onPressImage: (url: string) => void;
  onRemoveBookmark: (url: string) => void;
  onEditBookmark: (item: SiteItem) => void;
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
  onLongPressEdit: (item: SiteItem) => void;
}

function SwipeableBookmarkListItem({
  item,
  index,
  onPressImage,
  onRemoveBookmark,
  onLongPressEdit,
}: SwipeableBookmarkListItemProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
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
    [item.isBookmark, item.url, onRemoveBookmark, translateX]
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
          onLongPress={() => item.isBookmark && onLongPressEdit(item)}
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

function BookmarkList({
  items,
  onPressImage,
  onRemoveBookmark,
  onEditBookmark,
  bookmarkStore,
  lastViewUrl,
  headerComponent,
}: BookmarkListProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
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

  const renderListItem = ({ item, index }: { item: SiteItem; index: number }) => (
    <SwipeableBookmarkListItem
      item={item}
      index={index}
      onPressImage={onPressImage}
      onRemoveBookmark={onRemoveBookmark}
      onLongPressEdit={onEditBookmark}
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

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  listContent: {
    paddingHorizontal: theme.spacing.xxs,
    paddingBottom: 18,
  },
  listDeleteBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceDanger,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 22,
  },
  listDeleteBackgroundDisabled: {
    backgroundColor: theme.colors.disabled,
  },
  listDeleteText: {
    color: theme.colors.textDanger,
    fontSize: 12,
    letterSpacing: 0.4,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    padding: 12,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.md,
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
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceMuted,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.borderMuted,
  },
  listImage: {
    width: '100%',
    height: '100%',
  },
  listFallback: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textAccent,
  },
  listTextWrap: {
    flex: 1,
  },
  listTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 6,
  },
  listUrl: {
    fontSize: 12,
    color: theme.colors.textSubtle,
  },
});

export default BookmarkList;
