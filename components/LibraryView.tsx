import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import ImageGrid, { SiteItem } from './ImageGrid';
import LibraryLayoutToggle from './buttons/LibraryLayoutToggle';
import { useAppStore } from '../stores/useAppStore';
import { useWebPageStore } from '../stores/useWebPageStore';
import { usePageLoader } from '../hooks/usePageLoader';

type FilterKey = 'all' | 'recent' | 'source' | 'bookmark';
type SortKey = 'recent' | 'title' | 'domain';

const BUILT_IN_SOURCES: SiteItem[] = [
  { uri: require('../assets/17k.png'), url: 'http://h5.17k.com/', desc: '17k', kind: 'source' },
  { uri: require('../assets/jiujiu.png'), url: 'http://m.jjxsw.com/', desc: 'Txt99', kind: 'source' },
  { uri: require('../assets/80txt.png'), url: 'http://m.80txt.com/', desc: '80txt', kind: 'source' },
  { uri: require('../assets/tangiang.png'), url: 'http://wap.jjwxc.net/', desc: 'Tấn Giang', kind: 'source' },
  { uri: require('../assets/kanunu8.png'), url: 'http://www.kanunu8.com/', desc: 'Nỗ nỗ', kind: 'source' },
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

export default function LibraryView({ onDismiss }: LibraryViewProps) {
  const { loadPage } = usePageLoader();
  const bookmarks = useAppStore((s) => s.bookmarks);
  const lastViewUrl = useAppStore((s) => s.lastViewUrl);
  const removeBookmark = useAppStore((s) => s.removeBookmark);
  const libraryLayout = useWebPageStore((s) => s.libraryLayout);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKey, setFilterKey] = useState<FilterKey>('all');
  const [sortKey, setSortKey] = useState<SortKey>('recent');

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
    }

    return sorted;
  }, [filterKey, libraryItems, searchQuery, sortKey]);

  const header = (
    <View>
      <View style={styles.topRow}>
        <View style={styles.topCopy}>
          <Text style={styles.eyebrow}>Reader Library</Text>
          <Text style={styles.title}>Find the right source faster.</Text>
        </View>
        <LibraryLayoutToggle />
      </View>

      <View style={styles.heroCard}>
        <Text style={styles.subtitle}>
          Search across recent pages, built-in sources, and saved bookmarks, then switch between
          grid and list layouts.
        </Text>
        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>{libraryLayout === 'grid' ? 'Grid layout' : 'List layout'}</Text>
          </View>
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>{filteredItems.length} visible items</Text>
          </View>
        </View>
      </View>

      <View style={styles.controlsCard}>
        <View style={styles.controlsTopRow}>
          <Text style={styles.controlsTitle}>Search</Text>
          <View style={styles.controlsBadge}>
            <Text style={styles.controlsBadgeText}>Filter</Text>
          </View>
          <View style={styles.controlsBadge}>
            <Text style={styles.controlsBadgeText}>Sort</Text>
          </View>
        </View>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search title, URL, or source"
          placeholderTextColor="#8b8178"
          style={styles.searchInput}
        />

        <View style={styles.group}>
          <Text style={styles.groupLabel}>Filter</Text>
          <View style={styles.chipRow}>
            {[
              ['all', 'All'],
              ['recent', 'Recent'],
              ['source', 'Sources'],
              ['bookmark', 'Saved'],
            ].map(([key, label]) => (
              <Pressable
                key={key}
                onPress={() => setFilterKey(key as FilterKey)}
                style={[styles.chip, filterKey === key && styles.chipActive]}
              >
                <Text style={[styles.chipText, filterKey === key && styles.chipTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.group}>
          <Text style={styles.groupLabel}>Sort</Text>
          <View style={styles.chipRow}>
            {[
              ['recent', 'Recent'],
              ['title', 'Title'],
              ['domain', 'Domain'],
            ].map(([key, label]) => (
              <Pressable
                key={key}
                onPress={() => setSortKey(key as SortKey)}
                style={[styles.chip, sortKey === key && styles.chipActive]}
              >
                <Text style={[styles.chipText, sortKey === key && styles.chipTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Sources</Text>
        <Text style={styles.sectionCaption}>
          Tap to open. Long-press or swipe bookmarked items to remove them.
        </Text>
      </View>
    </View>
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
        viewMode={libraryLayout}
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
  topRow: {
    marginBottom: 10,
  },
  topCopy: {
    flex: 1,
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
    marginRight: 8,
    marginTop: 8,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6a4522',
  },
  controlsCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#fffaf2',
    borderWidth: 1,
    borderColor: '#e7dccd',
  },
  controlsTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  controlsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2a211c',
    marginRight: 10,
  },
  controlsBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#efe6da',
    marginRight: 8,
  },
  controlsBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7a4f28',
  },
  searchInput: {
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d8cdbc',
    backgroundColor: '#fffdf8',
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#221d19',
    marginBottom: 2,
  },
  group: {
    marginTop: 12,
  },
  groupLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#8a5a2b',
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#efe6da',
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2d3c2',
  },
  chipActive: {
    backgroundColor: '#7a4f28',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5f5247',
  },
  chipTextActive: {
    color: '#fffdf8',
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
