import { FontAwesome6 } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { PendingBookmarkDraft } from '../stores/useAppStore';
import { absoluteFill, Theme, useTheme } from '../theme';
import { sanitizeBookmarkUrl } from '../utils/bookmarks';

interface BookmarkEditorModalProps {
  visible: boolean;
  draft: PendingBookmarkDraft | null;
  onClose: () => void;
  onSubmit: (draft: PendingBookmarkDraft) => void;
  onDelete?: (draft: PendingBookmarkDraft) => void;
}

export default function BookmarkEditorModal({
  visible,
  draft,
  onClose,
  onSubmit,
  onDelete,
}: BookmarkEditorModalProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (!visible || !draft) {
      return;
    }

    setTitle(draft.title);
    setUrl(draft.url);
  }, [draft, visible]);

  const sanitizedUrl = sanitizeBookmarkUrl(url);
  const canSubmit = !!title.trim() && !!sanitizedUrl.trim();
  const canDelete = !!draft?.originalUrl;

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.layer}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Bookmark</Text>
          <Text style={styles.title}>Review before saving</Text>
          <Text style={styles.subtitle}>
            Simplify the label now, or clean the URL before it gets stored.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Page title"
              placeholderTextColor={theme.colors.inputPlaceholder}
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <View style={styles.urlLabelRow}>
              <Text style={styles.label}>URL</Text>
              {sanitizedUrl !== url.trim() && (
                <Text style={styles.helperTag}>Tracking removed on save</Text>
              )}
            </View>
            <TextInput
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://example.com/page"
              placeholderTextColor={theme.colors.inputPlaceholder}
              style={[styles.input, styles.urlInput]}
            />
          </View>

          <View style={styles.footer}>
            <View style={styles.footerStart}>
              {canDelete ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Delete bookmark"
                  onPress={() => draft && onDelete?.(draft)}
                  style={styles.deleteButton}
                >
                  <FontAwesome6 name="trash-can" size={14} color={theme.colors.textDanger} />
                </Pressable>
              ) : (
                <Pressable onPress={onClose} style={styles.cancelButton}>
                  <Text style={styles.cancelLabel}>Cancel</Text>
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={() => onSubmit({ ...draft, title, url: sanitizedUrl || url })}
              disabled={!canSubmit}
              style={[styles.applyButton, !canSubmit && styles.applyButtonDisabled]}
            >
              <Text style={styles.applyLabel}>Save</Text>
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
      justifyContent: 'center',
      padding: theme.spacing.lg,
    },
    backdrop: {
      ...absoluteFill,
      backgroundColor: theme.colors.overlay,
    },
    card: {
      borderRadius: theme.radius.xxl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.borderMuted,
      padding: theme.spacing.lg,
      ...theme.shadows.lg,
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
    field: {
      marginTop: theme.spacing.md,
    },
    label: {
      ...theme.typography.caption,
      color: theme.colors.text,
      marginBottom: theme.spacing.xs,
    },
    urlLabelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: theme.spacing.xs,
    },
    helperTag: {
      ...theme.typography.caption,
      color: theme.colors.textAccent,
    },
    input: {
      minHeight: 44,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.inputBorder,
      backgroundColor: theme.colors.inputBackground,
      color: theme.colors.text,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      fontSize: 16,
    },
    urlInput: {
      minHeight: 72,
      textAlignVertical: 'top',
    },
    footer: {
      marginTop: theme.spacing.lg,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    footerStart: {
      minWidth: 44,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    cancelButton: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    cancelLabel: {
      ...theme.typography.bodyStrong,
      color: theme.colors.textAccent,
    },
    applyButton: {
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.accent,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
    },
    applyButtonDisabled: {
      opacity: 0.45,
    },
    deleteButton: {
      width: 40,
      height: 40,
      borderRadius: theme.radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceDanger,
      borderWidth: 1,
      borderColor: theme.colors.surfaceDanger,
    },
    applyLabel: {
      ...theme.typography.bodyStrong,
      color: theme.colors.accentContrast,
    },
  });
