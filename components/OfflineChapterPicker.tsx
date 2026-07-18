import { FontAwesome6 } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { OfflineChapterCandidate } from '../stores/useAppStore';
import { absoluteFill, Theme, useTheme } from '../theme';
import { getBottomInsetWithSystemBarPadding } from '../utils/safe-area';
import SegmentedControl from './buttons/SegmentedControl';

interface OfflineChapterPickerProps {
  visible: boolean;
  pageTitle: string;
  candidates: OfflineChapterCandidate[];
  onClose: () => void;
  onSubmit: (selectedUrls: string[]) => void;
}

type PickerFilterKey = 'all' | 'new' | 'queued' | 'downloaded' | 'failed' | 'selected';
const ESTIMATED_ROW_HEIGHT = 82;

const FILTER_OPTIONS: Array<{ key: PickerFilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'queued', label: 'Queued' },
  { key: 'downloaded', label: 'Saved' },
  { key: 'failed', label: 'Failed' },
  { key: 'selected', label: 'Picked' },
];

function isSelectable(status: OfflineChapterCandidate['existingStatus']) {
  return !status || status === 'failed';
}

function matchesFilter(
  candidate: OfflineChapterCandidate,
  filterKey: PickerFilterKey,
  selectedUrls: Set<string>,
) {
  if (filterKey === 'all') return true;
  if (filterKey === 'selected') return selectedUrls.has(candidate.url);
  if (filterKey === 'new') return !candidate.existingStatus;
  return candidate.existingStatus === filterKey;
}

export default function OfflineChapterPicker({
  visible,
  pageTitle,
  candidates,
  onClose,
  onSubmit,
}: OfflineChapterPickerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = getBottomInsetWithSystemBarPadding(insets.bottom);
  const sheetBottomPadding = bottomInset + theme.spacing.lg;
  const styles = createStyles(theme);
  const listRef = useRef<FlatList<OfflineChapterCandidate>>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKey, setFilterKey] = useState<PickerFilterKey>('all');
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!visible) {
      setSearchQuery('');
      setFilterKey('all');
      setSelectedUrls(new Set());
    }
  }, [visible]);

  const filteredCandidates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return candidates.filter((candidate) => {
      if (!matchesFilter(candidate, filterKey, selectedUrls)) {
        return false;
      }

      if (!query) {
        return true;
      }

      return `${candidate.name} ${candidate.url}`.toLowerCase().includes(query);
    });
  }, [candidates, filterKey, searchQuery, selectedUrls]);

  const visibleSelectableUrls = useMemo(
    () =>
      filteredCandidates
        .filter((candidate) => isSelectable(candidate.existingStatus))
        .map((candidate) => candidate.url),
    [filteredCandidates],
  );

  const selectedCount = selectedUrls.size;
  const summaryLabel = `${selectedCount} selected • ${filteredCandidates.length} visible • ${candidates.length} total`;

  const jumpTargets = useMemo(() => {
    const firstNewIndex = filteredCandidates.findIndex((candidate) => !candidate.existingStatus);
    const firstSelectedIndex = filteredCandidates.findIndex((candidate) =>
      selectedUrls.has(candidate.url),
    );

    return {
      firstNewIndex,
      firstSelectedIndex,
    };
  }, [filteredCandidates, selectedUrls]);

  const bucketActions = useMemo(() => {
    if (filteredCandidates.length <= 1000) {
      return [];
    }

    const buckets = new Map<number, { label: string; index: number }>();

    filteredCandidates.forEach((candidate, index) => {
      const order = candidate.order ?? index + 1;
      const bucketStart = Math.floor((Math.max(order, 1) - 1) / 1000) * 1000 + 1;
      if (!buckets.has(bucketStart)) {
        const bucketEnd = bucketStart + 999;
        buckets.set(bucketStart, { label: `${bucketStart}-${bucketEnd}`, index });
      }
    });

    return Array.from(buckets.values()).slice(0, 8);
  }, [filteredCandidates]);

  const scrollToIndex = (index: number, measuredLength = ESTIMATED_ROW_HEIGHT) => {
    if (index < 0 || index >= filteredCandidates.length) {
      return;
    }

    listRef.current?.scrollToOffset({
      offset: Math.max(0, index * measuredLength),
      animated: true,
    });
  };

  const toggleSelectedUrl = (url: string) => {
    setSelectedUrls((current) => {
      const next = new Set(current);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
      }
      return next;
    });
  };

  const addVisibleToSelection = () => {
    setSelectedUrls((current) => {
      const next = new Set(current);
      visibleSelectableUrls.forEach((url) => next.add(url));
      return next;
    });
  };

  const clearVisibleFromSelection = () => {
    setSelectedUrls((current) => {
      const next = new Set(current);
      visibleSelectableUrls.forEach((url) => next.delete(url));
      return next;
    });
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.layer}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: sheetBottomPadding }]}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>Offline chapters</Text>
            <Text style={styles.title}>Choose chapters to queue</Text>
            <Text numberOfLines={2} style={styles.subtitle}>
              {pageTitle}
            </Text>
            <Text style={styles.summary}>{summaryLabel}</Text>
            <View style={styles.searchWrap}>
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search chapter title or URL"
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
            <View style={styles.segmentWrap}>
              <SegmentedControl
                accessibilityLabel="Offline chapter filters"
                compact
                onChange={(key) => setFilterKey(key as PickerFilterKey)}
                options={FILTER_OPTIONS}
                selectedKey={filterKey}
              />
            </View>
            <View style={styles.actionRow}>
              <Pressable onPress={addVisibleToSelection} style={styles.secondaryAction}>
                <Text style={styles.secondaryActionLabel}>Select shown</Text>
              </Pressable>
              <Pressable onPress={clearVisibleFromSelection} style={styles.secondaryAction}>
                <Text style={styles.secondaryActionLabel}>Clear shown</Text>
              </Pressable>
            </View>
            <View style={styles.jumpRow}>
              <Pressable onPress={() => scrollToIndex(0)} style={styles.jumpPill}>
                <Text style={styles.jumpLabel}>Top</Text>
              </Pressable>
              <Pressable
                disabled={jumpTargets.firstNewIndex < 0}
                onPress={() => scrollToIndex(jumpTargets.firstNewIndex)}
                style={[styles.jumpPill, jumpTargets.firstNewIndex < 0 && styles.jumpPillDisabled]}
              >
                <Text style={styles.jumpLabel}>First new</Text>
              </Pressable>
              <Pressable
                disabled={jumpTargets.firstSelectedIndex < 0}
                onPress={() => scrollToIndex(jumpTargets.firstSelectedIndex)}
                style={[
                  styles.jumpPill,
                  jumpTargets.firstSelectedIndex < 0 && styles.jumpPillDisabled,
                ]}
              >
                <Text style={styles.jumpLabel}>Selection</Text>
              </Pressable>
            </View>
            {!!bucketActions.length && (
              <View style={styles.bucketRow}>
                {bucketActions.map((bucket) => (
                  <Pressable
                    key={bucket.label}
                    onPress={() => scrollToIndex(bucket.index)}
                    style={styles.bucketPill}
                  >
                    <Text style={styles.bucketLabel}>{bucket.label}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <FlatList
            ref={listRef}
            data={filteredCandidates}
            keyExtractor={(item) => item.url}
            contentContainerStyle={styles.listContent}
            getItemLayout={(_, index) => ({
              length: ESTIMATED_ROW_HEIGHT,
              offset: ESTIMATED_ROW_HEIGHT * index,
              index,
            })}
            initialNumToRender={30}
            maxToRenderPerBatch={40}
            removeClippedSubviews
            windowSize={12}
            onScrollToIndexFailed={({ index, averageItemLength }) => {
              requestAnimationFrame(() =>
                scrollToIndex(
                  Math.min(index, filteredCandidates.length - 1),
                  averageItemLength || ESTIMATED_ROW_HEIGHT,
                ),
              );
            }}
            renderItem={({ item }) => {
              const selected = selectedUrls.has(item.url);
              const disabled = !isSelectable(item.existingStatus);
              const statusLabel = item.existingStatus ? item.existingStatus : 'new';

              return (
                <Pressable
                  disabled={disabled}
                  onPress={() => toggleSelectedUrl(item.url)}
                  style={[styles.row, disabled && styles.rowDisabled]}
                >
                  <View
                    style={[
                      styles.checkbox,
                      selected && styles.checkboxSelected,
                      disabled && styles.checkboxDisabled,
                    ]}
                  >
                    <Text style={[styles.checkboxLabel, selected && styles.checkboxLabelSelected]}>
                      {selected ? '✓' : ''}
                    </Text>
                  </View>
                  <View style={styles.rowContent}>
                    <Text numberOfLines={1} style={styles.rowTitle}>
                      {item.name}
                    </Text>
                    <Text numberOfLines={1} style={styles.rowUrl}>
                      {item.url}
                    </Text>
                  </View>
                  <View style={styles.statusPill}>
                    <Text style={styles.statusLabel}>{statusLabel}</Text>
                  </View>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No chapters match this view</Text>
                <Text style={styles.emptyText}>
                  Try a different filter, clear the search, or switch back to All.
                </Text>
              </View>
            }
          />

          <View style={styles.footer}>
            <Pressable onPress={onClose} style={styles.footerSecondary}>
              <Text style={styles.footerSecondaryLabel}>Close</Text>
            </Pressable>
            <Pressable
              disabled={selectedCount === 0}
              onPress={() => onSubmit(Array.from(selectedUrls))}
              style={[styles.footerPrimary, selectedCount === 0 && styles.footerPrimaryDisabled]}
            >
              <Text style={styles.footerPrimaryLabel}>Queue selected</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    layer: {
      ...absoluteFill,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...absoluteFill,
      backgroundColor: theme.colors.overlay,
    },
    sheet: {
      maxHeight: '90%',
      borderTopLeftRadius: theme.radius.xxl,
      borderTopRightRadius: theme.radius.xxl,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.lg,
      paddingBottom: theme.spacing.xl,
      borderTopWidth: 1,
      borderColor: theme.colors.borderMuted,
    },
    header: {
      flexShrink: 0,
    },
    eyebrow: {
      ...theme.typography.monoCaps,
      color: theme.colors.textAccent,
    },
    title: {
      marginTop: 6,
      ...theme.typography.title,
      color: theme.colors.text,
    },
    subtitle: {
      marginTop: 4,
      ...theme.typography.body,
      color: theme.colors.textMuted,
    },
    summary: {
      marginTop: theme.spacing.md,
      ...theme.typography.caption,
      color: theme.colors.textSubtle,
    },
    searchWrap: {
      marginTop: theme.spacing.md,
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
    segmentWrap: {
      marginTop: theme.spacing.md,
      marginHorizontal: -4,
      alignItems: 'flex-start',
    },
    actionRow: {
      marginTop: theme.spacing.md,
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    secondaryAction: {
      marginRight: theme.spacing.sm,
      marginBottom: theme.spacing.sm,
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.surfaceMuted,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    secondaryActionLabel: {
      ...theme.typography.caption,
      color: theme.colors.textAccent,
    },
    jumpRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: theme.spacing.xs,
    },
    jumpPill: {
      marginRight: theme.spacing.sm,
      marginBottom: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.radius.full,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    jumpPillDisabled: {
      opacity: 0.45,
    },
    jumpLabel: {
      ...theme.typography.caption,
      color: theme.colors.text,
    },
    bucketRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: theme.spacing.xs,
    },
    bucketPill: {
      marginRight: theme.spacing.sm,
      marginBottom: theme.spacing.sm,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.accentSoft,
    },
    bucketLabel: {
      ...theme.typography.caption,
      color: theme.colors.textAccent,
    },
    listContent: {
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.inputBackground,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.sm,
    },
    rowDisabled: {
      opacity: 0.6,
    },
    checkbox: {
      width: 26,
      height: 26,
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: theme.spacing.md,
      backgroundColor: theme.colors.surface,
    },
    checkboxSelected: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
    },
    checkboxDisabled: {
      backgroundColor: theme.colors.disabled,
      borderColor: theme.colors.disabledBorder,
    },
    checkboxLabel: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.accentContrast,
    },
    checkboxLabelSelected: {
      color: theme.colors.accentContrast,
    },
    rowContent: {
      flex: 1,
      marginRight: theme.spacing.md,
    },
    rowTitle: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
    },
    rowUrl: {
      marginTop: 2,
      ...theme.typography.caption,
      color: theme.colors.textMuted,
    },
    statusPill: {
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.surfaceMuted,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 6,
    },
    statusLabel: {
      ...theme.typography.caption,
      color: theme.colors.textAccent,
      textTransform: 'capitalize',
    },
    emptyState: {
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.inputBackground,
      borderWidth: 1,
      borderColor: theme.colors.borderMuted,
      padding: theme.spacing.lg,
      marginBottom: theme.spacing.md,
    },
    emptyTitle: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
    },
    emptyText: {
      marginTop: theme.spacing.xs,
      ...theme.typography.body,
      color: theme.colors.textMuted,
    },
    footer: {
      marginTop: theme.spacing.md,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    footerSecondary: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.md,
    },
    footerSecondaryLabel: {
      ...theme.typography.bodyStrong,
      color: theme.colors.textAccent,
    },
    footerPrimary: {
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.accent,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
    },
    footerPrimaryDisabled: {
      opacity: 0.45,
    },
    footerPrimaryLabel: {
      ...theme.typography.bodyStrong,
      color: theme.colors.accentContrast,
    },
  });
