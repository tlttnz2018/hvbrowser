import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { OfflineChapterCandidate } from '../stores/useAppStore';
import { Theme, absoluteFill, useTheme } from '../theme';

interface OfflineChapterPickerProps {
  visible: boolean;
  pageTitle: string;
  candidates: OfflineChapterCandidate[];
  onClose: () => void;
  onSubmit: (selectedUrls: string[]) => void;
}

function isSelectable(status: OfflineChapterCandidate['existingStatus']) {
  return !status || status === 'failed';
}

export default function OfflineChapterPicker({
  visible,
  pageTitle,
  candidates,
  onClose,
  onSubmit,
}: OfflineChapterPickerProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const selectableUrls = useMemo(
    () => candidates.filter((candidate) => isSelectable(candidate.existingStatus)).map((candidate) => candidate.url),
    [candidates]
  );
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) {
      setSelectedUrls([]);
    }
  }, [visible]);

  const selectedCount = selectedUrls.length;

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.layer}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.eyebrow}>Offline chapters</Text>
          <Text style={styles.title}>Choose chapters to queue</Text>
          <Text numberOfLines={2} style={styles.subtitle}>
            {pageTitle}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{selectedCount} selected</Text>
            <Text style={styles.metaText}>{candidates.length} found</Text>
          </View>
          <View style={styles.actionRow}>
            <Pressable onPress={() => setSelectedUrls(selectableUrls)} style={styles.secondaryAction}>
              <Text style={styles.secondaryActionLabel}>Select all</Text>
            </Pressable>
            <Pressable onPress={() => setSelectedUrls([])} style={styles.secondaryAction}>
              <Text style={styles.secondaryActionLabel}>Clear all</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.listContent}>
            {candidates.map((candidate) => {
              const selected = selectedUrls.includes(candidate.url);
              const disabled = !isSelectable(candidate.existingStatus);
              const statusLabel = candidate.existingStatus ? candidate.existingStatus : 'new';

              return (
                <Pressable
                  key={candidate.url}
                  disabled={disabled}
                  onPress={() =>
                    setSelectedUrls((current) =>
                      current.includes(candidate.url)
                        ? current.filter((url) => url !== candidate.url)
                        : [...current, candidate.url]
                    )
                  }
                  style={[styles.row, disabled && styles.rowDisabled]}
                >
                  <View style={[styles.checkbox, selected && styles.checkboxSelected, disabled && styles.checkboxDisabled]}>
                    <Text style={[styles.checkboxLabel, selected && styles.checkboxLabelSelected]}>
                      {selected ? '✓' : ''}
                    </Text>
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowTitle}>{candidate.name}</Text>
                    <Text numberOfLines={1} style={styles.rowUrl}>
                      {candidate.url}
                    </Text>
                  </View>
                  <View style={styles.statusPill}>
                    <Text style={styles.statusLabel}>{statusLabel}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.footer}>
            <Pressable onPress={onClose} style={styles.footerSecondary}>
              <Text style={styles.footerSecondaryLabel}>Close</Text>
            </Pressable>
            <Pressable
              disabled={selectedCount === 0}
              onPress={() => onSubmit(selectedUrls)}
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
      maxHeight: '82%',
      borderTopLeftRadius: theme.radius.xxl,
      borderTopRightRadius: theme.radius.xxl,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.lg,
      paddingBottom: theme.spacing.xl,
      borderTopWidth: 1,
      borderColor: theme.colors.borderMuted,
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
    metaRow: {
      marginTop: theme.spacing.md,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    metaText: {
      ...theme.typography.caption,
      color: theme.colors.textSubtle,
    },
    actionRow: {
      marginTop: theme.spacing.md,
      flexDirection: 'row',
    },
    secondaryAction: {
      marginRight: theme.spacing.sm,
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.surfaceMuted,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    secondaryActionLabel: {
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
      opacity: 0.5,
    },
    footerPrimaryLabel: {
      ...theme.typography.bodyStrong,
      color: theme.colors.accentContrast,
    },
  });
