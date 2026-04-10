import React, { useMemo, useRef, useState } from 'react';
import { FontAwesome6 } from '@expo/vector-icons';
import {
  findNodeHandle,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
  useWindowDimensions,
} from 'react-native';
import ImageGrid, { SiteItem } from './ImageGrid';
import { useAppStore } from '../stores/useAppStore';
import { usePageLoader } from '../hooks/usePageLoader';

type FilterKey = 'all' | 'recent' | 'source' | 'bookmark';
type SortKey = 'recent' | 'title' | 'domain';
type SortDirection = 'asc' | 'desc';

const BUILT_IN_SOURCES: SiteItem[] = [
  { uri: require('../assets/17k.png'), url: 'http://h5.17k.com/', desc: '17k', kind: 'source' },
  { uri: require('../assets/jiujiu.png'), url: 'http://m.jjxsw.com/', desc: 'Txt99', kind: 'source' },
  { uri: require('../assets/80txt.png'), url: 'http://m.80txt.com/', desc: '80txt', kind: 'source' },
  { uri: require('../assets/tangiang.png'), url: 'http://wap.jjwxc.net/', desc: 'Tấn Giang', kind: 'source' },
  { uri: require('../assets/kanunu8.png'), url: 'http://www.kanunu8.com/', desc: 'Nỗ nỗ', kind: 'source' },
];

const FILTER_OPTIONS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'recent', label: 'Recent' },
  { key: 'source', label: 'Sources' },
  { key: 'bookmark', label: 'Saved' },
];

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'recent', label: 'Recent' },
  { key: 'title', label: 'Title' },
  { key: 'domain', label: 'Domain' },
];

function getBookmarkImage(url: string): SiteItem['uri'] | undefined {
  const piaotiaMatch = url.match(/^https?:\/\/(?:www\.)?piaotia\.com\/bookinfo\/(\d+)\/(\d+)\.html$/i);
  if (piaotiaMatch) {
    const [, categoryId, bookId] = piaotiaMatch;
    return { uri: `https://www.piaotia.com/files/article/image/${categoryId}/${bookId}/${bookId}s.jpg` };
  }

  return undefined;
}

function getDomainLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

interface LibraryViewProps {
  onDismiss?: () => void;
}

function MenuButton({
  icon,
  accessibilityLabel,
  open,
  onPress,
}: {
  icon: React.ReactNode;
  accessibilityLabel: string;
  open: boolean;
  onPress: () => void;
  }) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[styles.menuButton, open && styles.menuButtonOpen]}
    >
      {typeof icon === 'string' ? <Text style={styles.menuButtonIcon}>{icon}</Text> : icon}
    </Pressable>
  );
}

function PopupMenu<T extends string>({
  title,
  options,
  selectedKey,
  onSelect,
  anchor,
  onClose,
  renderAccessory,
}: {
  title: string;
  options: Array<{ key: T; label: string }>;
  selectedKey: T;
  onSelect: (key: T) => void;
  anchor: { x: number; y: number; width: number; height: number } | null;
  onClose: () => void;
  renderAccessory?: (key: T, selected: boolean) => React.ReactNode;
}) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const menuWidth = title === 'Sort' ? 138 : 126;
  const menuHeight = 52 + options.length * 49;
  const left = anchor
    ? Math.min(Math.max(anchor.x + anchor.width - menuWidth, 12), windowWidth - menuWidth - 12)
    : windowWidth - menuWidth - 20;
  const showAbove = anchor ? anchor.y + anchor.height + menuHeight + 12 > windowHeight : false;
  const top = anchor
    ? Math.max(12, showAbove ? anchor.y - menuHeight - 8 : anchor.y + anchor.height + 8)
    : 120;

  return (
    <Modal animationType="fade" transparent visible onRequestClose={onClose}>
      <View style={styles.modalLayer}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View pointerEvents="box-none" style={styles.modalLayer}>
          <View style={[styles.popupMenuPositioner, { left, top, width: menuWidth }]}>
            <Pressable style={styles.popupMenu} onPress={() => {}}>
              <Text style={styles.popupTitle}>{title}</Text>
              {options.map((option, index) => (
                <Pressable
                  key={option.key}
                  onPress={() => onSelect(option.key)}
                  style={[styles.popupItem, index > 0 && styles.popupItemBorder]}
                >
                  <View style={styles.popupItemRow}>
                    <Text style={[styles.popupItemText, option.key === selectedKey && styles.popupItemTextActive]}>
                      {option.label}
                    </Text>
                    {renderAccessory?.(option.key, option.key === selectedKey)}
                  </View>
                </Pressable>
              ))}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function LibraryView({ onDismiss }: LibraryViewProps) {
  const { loadPage } = usePageLoader();
  const bookmarks = useAppStore((s) => s.bookmarks);
  const lastViewUrl = useAppStore((s) => s.lastViewUrl);
  const removeBookmark = useAppStore((s) => s.removeBookmark);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKey, setFilterKey] = useState<FilterKey>('all');
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [openMenu, setOpenMenu] = useState<'filter' | 'sort' | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null
  );
  const filterButtonRef = useRef<View>(null);
  const sortButtonRef = useRef<View>(null);

  const libraryItems = useMemo<SiteItem[]>(() => {
    const recentItem = lastViewUrl ? [{ url: lastViewUrl, desc: 'Last Open URL', kind: 'recent' as const }] : [];
    const bookmarkItems = bookmarks.map((bookmark) => ({
      ...bookmark,
      uri: getBookmarkImage(bookmark.url),
      isBookmark: true,
      kind: 'bookmark' as const,
    }));

    return [...recentItem, ...BUILT_IN_SOURCES, ...bookmarkItems];
  }, [bookmarks, lastViewUrl]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let next = libraryItems;

    if (filterKey !== 'all') {
      next = next.filter((item) => item.kind === filterKey);
    }

    if (query) {
      next = next.filter((item) =>
        `${item.desc} ${item.url} ${getDomainLabel(item.url)}`.toLowerCase().includes(query)
      );
    }

    const sorted = [...next];
    if (sortKey === 'title') {
      sorted.sort((a, b) => a.desc.localeCompare(b.desc));
    } else if (sortKey === 'domain') {
      sorted.sort((a, b) => getDomainLabel(a.url).localeCompare(getDomainLabel(b.url)));
    } else {
      const recentWeight = (item: SiteItem) => (item.kind === 'recent' ? 0 : item.kind === 'source' ? 1 : 2);
      sorted.sort((a, b) => recentWeight(a) - recentWeight(b));
    }

    if (sortDirection === 'desc') {
      sorted.reverse();
    }

    return sorted;
  }, [filterKey, libraryItems, searchQuery, sortDirection, sortKey]);

  const closeMenu = () => {
    setOpenMenu(null);
    setMenuAnchor(null);
  };

  const openAnchoredMenu = (menu: 'filter' | 'sort', ref: React.RefObject<View | null>) => {
    const node = findNodeHandle(ref.current);
    if (!node) {
      setOpenMenu(menu);
      setMenuAnchor(null);
      return;
    }

    UIManager.measureInWindow(node, (x, y, width, height) => {
      setMenuAnchor({ x, y, width, height });
      setOpenMenu(menu);
    });
  };

  const header = (
    <Pressable style={styles.headerWrap} onPress={() => setOpenMenu(null)}>
      <View style={styles.topRow}>
        <Text style={styles.eyebrow}>Reader Library</Text>
        <Text style={styles.title}>Open a source or jump back into a saved page.</Text>
      </View>

      <View style={styles.heroCard}>
        <Text style={styles.subtitle}>
          Your latest page, built-in sources, and bookmarks all live here in one simple list.
        </Text>
        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>{filteredItems.length} items</Text>
          </View>
        </View>
      </View>

      <View style={styles.toolbarRow}>
        <View style={styles.searchWrap}>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search title, URL, or source"
            placeholderTextColor="#8b8178"
            style={styles.searchInput}
          />
          {!!searchQuery && (
            <Pressable
              accessibilityLabel="Clear search"
              onPress={() => setSearchQuery('')}
              style={styles.clearButton}
            >
              <FontAwesome6 name="xmark" size={12} color="#7a4f28" />
            </Pressable>
          )}
        </View>
        <View style={styles.menuGroup}>
          <View style={styles.menuAnchor}>
            <View ref={filterButtonRef} collapsable={false}>
              <MenuButton
                icon={
                  <FontAwesome6
                    name={filterKey === 'all' ? 'filter' : 'filter-circle-xmark'}
                    size={15}
                    color={openMenu === 'filter' ? '#8a5a2b' : '#7a4f28'}
                  />
                }
                accessibilityLabel={`Filter: ${FILTER_OPTIONS.find((option) => option.key === filterKey)?.label || 'All'}`}
                open={openMenu === 'filter'}
                onPress={() =>
                  openMenu === 'filter' ? closeMenu() : openAnchoredMenu('filter', filterButtonRef)
                }
              />
            </View>
            {openMenu === 'filter' && (
              <PopupMenu
                title="Filter"
                options={FILTER_OPTIONS}
                selectedKey={filterKey}
                anchor={menuAnchor}
                onClose={closeMenu}
                onSelect={(key) => {
                  if (key !== filterKey) setFilterKey(key);
                  closeMenu();
                }}
              />
            )}
          </View>
          <View style={styles.menuAnchor}>
            <View ref={sortButtonRef} collapsable={false}>
              <MenuButton
                icon={
                  <FontAwesome6
                    name={sortDirection === 'asc' ? 'arrow-up-short-wide' : 'arrow-down-short-wide'}
                    size={15}
                    color={openMenu === 'sort' ? '#8a5a2b' : '#7a4f28'}
                  />
                }
                accessibilityLabel={`Sort: ${SORT_OPTIONS.find((option) => option.key === sortKey)?.label || 'Title'} ${sortDirection === 'asc' ? 'ascending' : 'descending'}`}
                open={openMenu === 'sort'}
                onPress={() => (openMenu === 'sort' ? closeMenu() : openAnchoredMenu('sort', sortButtonRef))}
              />
            </View>
            {openMenu === 'sort' && (
              <PopupMenu
                title="Sort"
                options={SORT_OPTIONS}
                selectedKey={sortKey}
                anchor={menuAnchor}
                onClose={closeMenu}
                renderAccessory={(key, selected) =>
                  selected ? (
                    <FontAwesome6
                      name={sortDirection === 'asc' ? 'arrow-up' : 'arrow-down'}
                      size={11}
                      color="#8a5a2b"
                    />
                  ) : null
                }
                onSelect={(key) => {
                  if (key === sortKey) {
                    setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
                  } else {
                    setSortKey(key);
                    setSortDirection('asc');
                  }
                  closeMenu();
                }}
              />
            )}
          </View>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Sources</Text>
        <Text style={styles.sectionCaption}>
          Tap to open. Long-press or swipe bookmarked items to remove them.
        </Text>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      <ImageGrid
        items={filteredItems}
        onPressImage={(url) => {
          onDismiss?.();
          loadPage(url);
        }}
        onRemoveBookmark={removeBookmark}
        bookmarkStore={bookmarks}
        lastViewUrl={lastViewUrl}
        headerComponent={header}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f6f3ee',
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  headerWrap: {
    zIndex: 2,
  },
  topRow: {
    marginBottom: 10,
  },
  heroCard: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 20,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#e3d8c9',
    shadowColor: '#46311b',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#8a5a2b',
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    color: '#1f1a17',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 14,
    lineHeight: 20,
    color: '#5c5147',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
  },
  metaPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f1e6d6',
    marginTop: 8,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6a4522',
  },
  toolbarRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  searchWrap: {
    flex: 1,
    position: 'relative',
  },
  searchInput: {
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d8cdbc',
    backgroundColor: '#fffdf8',
    paddingHorizontal: 14,
    paddingRight: 42,
    fontSize: 15,
    color: '#221d19',
  },
  clearButton: {
    position: 'absolute',
    top: 7,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2e9dc',
  },
  menuGroup: {
    flexDirection: 'row',
    marginLeft: 8,
  },
  menuAnchor: {
    position: 'relative',
    marginLeft: 6,
  },
  menuButton: {
    width: 42,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#dccfbf',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButtonOpen: {
    borderColor: '#8a5a2b',
    backgroundColor: '#fff7eb',
  },
  menuButtonIcon: {
    fontSize: 16,
    fontWeight: '600',
    color: '#5f3f1f',
  },
  modalLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  popupMenuPositioner: {
    position: 'absolute',
  },
  popupMenu: {
    borderRadius: 14,
    backgroundColor: '#fffaf2',
    borderWidth: 1,
    borderColor: '#e2d3c2',
    shadowColor: '#46311b',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    overflow: 'hidden',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(32, 27, 24, 0.12)',
  },
  popupTitle: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#7a4f28',
    backgroundColor: '#f3e8d7',
  },
  popupItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  popupItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  popupItemBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eadfce',
  },
  popupItemText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#5c5147',
  },
  popupItemTextActive: {
    fontWeight: '700',
    color: '#7a4f28',
  },
  sectionHeader: {
    marginTop: 18,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#201b18',
  },
  sectionCaption: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: '#75685d',
  },
});
