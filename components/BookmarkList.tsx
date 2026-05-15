import React, { useCallback, useMemo, useRef } from 'react';
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
  scrollHeaderComponent?: React.ReactElement | null;
  stickyHeaderComponent?: React.ReactNode;
}

type BookmarkListRow =
  | { key: 'sticky-header'; kind: 'sticky-header' }
  | { key: string; kind: 'item'; item: SiteItem; index: number };

function getBookmarkImage(url: string): ImageSourcePropType | undefined {
  const piaotiaMatch = url.match(
    /^https?:\/\/(?:www\.)?piaotia\.com\/bookinfo\/(\d+)\/(\d+)\.html$/i,
  );
  if (piaotiaMatch) {
    const [, categoryId, bookId] = piaotiaMatch;
    return {
      uri: `https://www.piaotia.com/files/article/image/${categoryId}/${bookId}/${bookId}s.jpg`,
    };
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
  const DELETE_SWIPE_DISTANCE = 72;
  const DELETE_SWIPE_VELOCITY = -0.35;
  const MAX_SWIPE_OFFSET = 140;

  const resetPosition = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 0,
      speed: 18,
    }).start();
  }, [translateX]);

  const removeWithAnimation = useCallback(() => {
    Animated.timing(translateX, {
      toValue: -MAX_SWIPE_OFFSET,
      duration: 120,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onRemoveBookmark(item.url);
    });
  }, [MAX_SWIPE_OFFSET, item.url, onRemoveBookmark, translateX]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          !!item.isBookmark &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) &&
          gestureState.dx < -4,
        onPanResponderGrant: () => {
          translateX.stopAnimation();
        },
        onPanResponderMove: (_, gestureState) => {
          if (!item.isBookmark) return;
          translateX.setValue(Math.max(gestureState.dx, -MAX_SWIPE_OFFSET));
        },
        onPanResponderRelease: (_, gestureState) => {
          if (!item.isBookmark) return;
          if (gestureState.dx < -DELETE_SWIPE_DISTANCE || gestureState.vx < DELETE_SWIPE_VELOCITY) {
            removeWithAnimation();
          } else {
            resetPosition();
          }
        },
        onPanResponderTerminate: resetPosition,
      }),
    [
      DELETE_SWIPE_DISTANCE,
      DELETE_SWIPE_VELOCITY,
      MAX_SWIPE_OFFSET,
      item.isBookmark,
      removeWithAnimation,
      resetPosition,
      translateX,
    ],
  );

  return (
    <View style={index > 0 ? styles.listItemGap : undefined}>
      <View
        style={[
          styles.listDeleteBackground,
          !item.isBookmark && styles.listDeleteBackgroundDisabled,
        ]}
      >
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
  scrollHeaderComponent,
  stickyHeaderComponent,
}: BookmarkListProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const data = useMemo<SiteItem[]>(
    () =>
      items || [
        { url: lastViewUrl, desc: 'Last Open URL', kind: 'recent' },
        ...bookmarkStore.map((bookmark) => ({
          ...bookmark,
          uri: bookmark.uri || getBookmarkImage(bookmark.url),
          isBookmark: true,
          kind: 'bookmark' as const,
        })),
      ],
    [bookmarkStore, items, lastViewUrl],
  );

  const rows = useMemo<BookmarkListRow[]>(
    () => [
      { key: 'sticky-header', kind: 'sticky-header' },
      ...data.map((item, index) => ({
        key: `${item.url || item.desc || 'site'}-${index}`,
        kind: 'item' as const,
        item,
        index,
      })),
    ],
    [data],
  );

  const renderListItem = ({ item }: { item: BookmarkListRow }) => {
    if (item.kind === 'sticky-header') {
      return <View style={styles.stickyHeader}>{stickyHeaderComponent}</View>;
    }

    return (
      <SwipeableBookmarkListItem
        item={item.item}
        index={item.index}
        onPressImage={onPressImage}
        onRemoveBookmark={onRemoveBookmark}
        onLongPressEdit={onEditBookmark}
      />
    );
  };

  return (
    <FlatList
      data={rows}
      renderItem={renderListItem}
      keyExtractor={(item) => item.key}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={scrollHeaderComponent}
      stickyHeaderIndices={[1]}
    />
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    listContent: {
      paddingHorizontal: theme.spacing.xxs,
      paddingBottom: 18,
    },
    stickyHeader: {
      paddingBottom: theme.spacing.sm,
      backgroundColor: theme.colors.background,
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
