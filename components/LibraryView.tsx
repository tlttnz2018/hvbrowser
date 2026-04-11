import React, { useMemo, useRef, useState } from 'react';
import { FontAwesome6 } from '@expo/vector-icons';
import { Directory, File } from 'expo-file-system';
import {
  Alert,
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
import BookmarkList , { SiteItem } from './BookmarkList';
import SegmentedControl from './buttons/SegmentedControl';
import OfflineLibraryList from './OfflineLibraryList';
import { deleteOfflineChapter, deleteOfflineStory } from '../db/offline';
import { useAppStore } from '../stores/useAppStore';
import { usePageLoader } from '../hooks/usePageLoader';
import { Theme, absoluteFill, useTheme } from '../theme';
import { getBookmarkFavicon, getBookmarkImage } from '../utils/bookmarks';

type FilterKey = 'all' | 'recent' | 'source' | 'bookmark';
type SortKey = 'recent' | 'title' | 'domain';
type SortDirection = 'asc' | 'desc';
type LibraryTabKey = 'library' | 'offline';

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

function getDomainLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function getItemTitle(item: SiteItem): string {
  return typeof item.desc === 'string' ? item.desc : '';
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
  const theme = useTheme();
  const styles = createStyles(theme);

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
  const theme = useTheme();
  const styles = createStyles(theme);
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
  const { loadPage, loadOfflineChapter } = usePageLoader();
  const theme = useTheme();
  const styles = createStyles(theme);
  const bookmarks = useAppStore((s) => s.bookmarks);
  const lastViewUrl = useAppStore((s) => s.lastViewUrl);
  const removeBookmark = useAppStore((s) => s.removeBookmark);
  const openBookmarkEditorForBookmark = useAppStore((s) => s.openBookmarkEditorForBookmark);
  const importBookmarksBackup = useAppStore((s) => s.importBookmarksBackup);
  const exportBookmarksBackup = useAppStore((s) => s.exportBookmarksBackup);
  const refreshOfflineLibrary = useAppStore((s) => s.refreshOfflineLibrary);
  const offlineStories = useAppStore((s) => s.offlineStories);
  const offlineChaptersByStory = useAppStore((s) => s.offlineChaptersByStory);
  const activeDownloadId = useAppStore((s) => s.activeDownloadId);
  const downloadQueue = useAppStore((s) => s.downloadQueue);
  const downloadQueueLastError = useAppStore((s) => s.downloadQueueLastError);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKey, setFilterKey] = useState<FilterKey>('all');
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [libraryTab, setLibraryTab] = useState<LibraryTabKey>('library');
  const [openMenu, setOpenMenu] = useState<'filter' | 'sort' | null>(null);
  const [bookmarkTransferBusy, setBookmarkTransferBusy] = useState<'import' | 'export' | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null
  );
  const filterButtonRef = useRef<View>(null);
  const sortButtonRef = useRef<View>(null);

  const libraryItems = useMemo<SiteItem[]>(() => {
    const recentItem = lastViewUrl ? [{ url: lastViewUrl, desc: 'Last Open URL', kind: 'recent' as const }] : [];
    const bookmarkItems = bookmarks.map((bookmark) => {
      const bookmarkImage = bookmark.image || getBookmarkImage(bookmark.url);
      const bookmarkFavicon = bookmark.favicon || getBookmarkFavicon(bookmark.url);

      return {
        url: bookmark.url,
        desc: bookmark.title,
        uri: bookmarkImage ? { uri: bookmarkImage } : bookmarkFavicon ? { uri: bookmarkFavicon } : undefined,
        isBookmark: true,
        kind: 'bookmark' as const,
        createdAt: bookmark.createdAt,
        lastAccessedAt: bookmark.lastAccessedAt,
      };
    });

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
        `${getItemTitle(item)} ${item.url} ${getDomainLabel(item.url)}`.toLowerCase().includes(query)
      );
    }

    const sorted = [...next];
    if (sortKey === 'title') {
      sorted.sort((a, b) => getItemTitle(a).localeCompare(getItemTitle(b)));
    } else if (sortKey === 'domain') {
      sorted.sort((a, b) => getDomainLabel(a.url).localeCompare(getDomainLabel(b.url)));
    } else {
      const recentWeight = (item: SiteItem) => {
        if (item.kind === 'recent') return Number.MAX_SAFE_INTEGER;
        if (item.lastAccessedAt) return Date.parse(item.lastAccessedAt);
        if (item.createdAt) return Date.parse(item.createdAt);
        return 0;
      };

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

  const handleImportBookmarks = async () => {
    if (bookmarkTransferBusy) return;

    try {
      setBookmarkTransferBusy('import');
      const pickedFile = await File.pickFileAsync(undefined, 'application/json');
      const file = Array.isArray(pickedFile) ? pickedFile[0] : pickedFile;

      if (!file) {
        return;
      }

      const importedCount = await importBookmarksBackup(await file.text());
      Alert.alert(
        importedCount > 0 ? 'Bookmarks imported' : 'No bookmarks imported',
        importedCount > 0
          ? `${importedCount} saved bookmark${importedCount === 1 ? '' : 's'} added or updated from the JSON file.`
          : 'The selected file did not contain any valid bookmarks to import.'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to import bookmarks from that file.';
      if (!/cancel/i.test(message)) {
        Alert.alert('Import failed', message);
      }
    } finally {
      setBookmarkTransferBusy(null);
    }
  };

  const handleExportBookmarks = async () => {
    if (bookmarkTransferBusy) return;

    try {
      setBookmarkTransferBusy('export');
      const destinationDirectory = await Directory.pickDirectoryAsync();
      const exportFile = new File(
        destinationDirectory.uri,
        `hvbrowser-bookmarks-${new Date().toISOString().slice(0, 10)}.json`
      );

      exportFile.create({ overwrite: true, intermediates: true });
      exportFile.write(await exportBookmarksBackup());

      Alert.alert('Bookmarks exported', 'Saved a JSON backup into the folder you selected on this device.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to export bookmarks to device storage.';
      if (!/cancel/i.test(message)) {
        Alert.alert('Export failed', message);
      }
    } finally {
      setBookmarkTransferBusy(null);
    }
  };

  const header = (
    <Pressable style={styles.headerWrap} onPress={() => setOpenMenu(null)}>
      <View style={styles.topRow}>
        <Text style={styles.eyebrow}>Reader Library</Text>
        <Text style={styles.title}>Open a source or jump back into a saved page.</Text>
      </View>

      <View style={styles.heroCard}>
        <Text style={styles.subtitle}>
          {libraryTab === 'library'
            ? 'Your latest page, built-in sources, and bookmarks all live here in one simple list.'
            : 'Downloaded stories, queue status, and saved chapter links are grouped here for offline reading.'}
        </Text>
        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>
              {libraryTab === 'library' ? `${filteredItems.length} items` : `${offlineStories.length} stories`}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.tabRow}>
        <SegmentedControl
          accessibilityLabel="Library tabs"
          onChange={(key) => setLibraryTab(key as LibraryTabKey)}
          options={[
            { key: 'library', label: 'Sources' },
            { key: 'offline', label: 'Offline book' },
          ]}
          selectedKey={libraryTab}
        />
      </View>

      {libraryTab === 'library' && (
        <>
      <View style={styles.toolbarRow}>
        <View style={styles.searchWrap}>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search title, URL, or source"
            placeholderTextColor={theme.colors.inputPlaceholder}
            style={styles.searchInput}
          />
          {!!searchQuery && (
            <Pressable
              accessibilityLabel="Clear search"
              onPress={() => setSearchQuery('')}
              style={styles.clearButton}
            >
              <FontAwesome6 name="xmark" size={12} color={theme.colors.textAccent} />
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
                    color={openMenu === 'filter' ? theme.colors.borderAccent : theme.colors.textAccent}
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
                    color={openMenu === 'sort' ? theme.colors.borderAccent : theme.colors.textAccent}
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
                      color={theme.colors.borderAccent}
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
        <View style={styles.sectionHeaderTopRow}>
          <Text style={styles.sectionTitle}>Sources</Text>
          <View style={styles.transferActions}>
            <Pressable
              accessibilityLabel="Import bookmarks from JSON"
              disabled={bookmarkTransferBusy !== null}
              onPress={handleImportBookmarks}
              style={[styles.transferButton, bookmarkTransferBusy !== null && styles.transferButtonDisabled]}
            >
              <FontAwesome6 name="file-import" size={12} color={theme.colors.textAccent} />
              <Text style={styles.transferButtonText}>
                {bookmarkTransferBusy === 'import' ? 'Importing' : 'Import'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Export bookmarks to JSON"
              disabled={bookmarkTransferBusy !== null}
              onPress={handleExportBookmarks}
              style={[styles.transferButton, bookmarkTransferBusy !== null && styles.transferButtonDisabled]}
            >
              <FontAwesome6 name="file-export" size={12} color={theme.colors.textAccent} />
              <Text style={styles.transferButtonText}>
                {bookmarkTransferBusy === 'export' ? 'Exporting' : 'Export'}
              </Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.sectionCaption}>
          Tap to open. Long-press a bookmark to edit it, swipe left to remove it, or move saved bookmarks in and out as JSON.
        </Text>
      </View>
        </>
      )}
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      {libraryTab === 'library' ? (
        <BookmarkList
          items={filteredItems}
          onPressImage={(url: string) => {
            onDismiss?.();
            loadPage(url);
          }}
          onRemoveBookmark={removeBookmark}
          onEditBookmark={(item: SiteItem) => {
            if (!item.isBookmark) return;
            openBookmarkEditorForBookmark({ title: item.desc, url: item.url });
          }}
          bookmarkStore={bookmarks}
          lastViewUrl={lastViewUrl}
          headerComponent={header}
        />
      ) : (
        <View style={styles.offlinePane}>
          {header}
          <OfflineLibraryList
            stories={offlineStories}
            chaptersByStory={offlineChaptersByStory}
            activeDownloadId={activeDownloadId}
            queueCount={downloadQueue.length}
            lastError={downloadQueueLastError}
            onRemoveChapter={async (chapterId) => {
              await deleteOfflineChapter(chapterId);
              await refreshOfflineLibrary();
            }}
            onRemoveStory={async (storyId) => {
              await deleteOfflineStory(storyId);
              await refreshOfflineLibrary();
            }}
            onOpenChapter={(chapterId) => {
              onDismiss?.();
              loadOfflineChapter(chapterId);
            }}
          />
        </View>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 14,
  },
  offlinePane: {
    flex: 1,
  },
  headerWrap: {
    zIndex: 2,
  },
  topRow: {
    marginBottom: 10,
  },
  heroCard: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    borderRadius: theme.radius.xxl,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderMuted,
    ...theme.shadows.md,
  },
  eyebrow: {
    ...theme.typography.caption,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: theme.colors.textAccent,
    marginBottom: 4,
  },
  title: {
    ...theme.typography.headline,
    color: theme.colors.text,
  },
  subtitle: {
    marginTop: 2,
    ...theme.typography.body,
    color: theme.colors.textMuted,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
  },
  metaPill: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentSoft,
    marginTop: 8,
  },
  metaLabel: {
    ...theme.typography.caption,
    color: theme.colors.textAccent,
  },
  toolbarRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  tabRow: {
    marginTop: 14,
    alignItems: 'flex-start',
  },
  searchWrap: {
    flex: 1,
    position: 'relative',
  },
  searchInput: {
    height: 44,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    backgroundColor: theme.colors.inputBackground,
    paddingHorizontal: 14,
    paddingRight: 42,
    fontSize: 15,
    color: theme.colors.text,
  },
  clearButton: {
    position: 'absolute',
    top: 7,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceMuted,
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
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButtonOpen: {
    borderColor: theme.colors.borderAccent,
    backgroundColor: theme.colors.surfaceAccent,
  },
  menuButtonIcon: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textAccent,
  },
  modalLayer: {
    ...absoluteFill,
  },
  popupMenuPositioner: {
    position: 'absolute',
  },
  popupMenu: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderMuted,
    ...theme.shadows.lg,
    overflow: 'hidden',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
  },
  popupTitle: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    ...theme.typography.monoCaps,
    color: theme.colors.textAccent,
    backgroundColor: theme.colors.surfaceMuted,
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
    borderTopColor: theme.colors.borderMuted,
  },
  popupItemText: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.textMuted,
  },
  popupItemTextActive: {
    fontWeight: '700',
    color: theme.colors.textAccent,
  },
  sectionHeader: {
    marginTop: 18,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    ...theme.typography.title,
    color: theme.colors.text,
  },
  sectionCaption: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.textSubtle,
  },
  transferActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  transferButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderMuted,
  },
  transferButtonDisabled: {
    opacity: 0.55,
  },
  transferButtonText: {
    ...theme.typography.caption,
    color: theme.colors.textAccent,
  },
});
