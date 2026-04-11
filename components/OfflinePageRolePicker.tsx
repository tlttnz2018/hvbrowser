import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { absoluteFill, Theme, useTheme } from '../theme';

interface OfflinePageRolePickerProps {
  visible: boolean;
  pageTitle: string;
  initialRoles: Array<'home page' | 'index page' | 'chapter page'>;
  onClose: () => void;
  onSubmit: (roles: Array<'home page' | 'index page' | 'chapter page'>) => void;
}

const OPTIONS: Array<{
  role: 'home page' | 'index page' | 'chapter page';
  label: string;
  description: string;
}> = [
  {
    role: 'home page',
    label: 'Home page',
    description: 'Remember this as the story landing page for later chapter downloads.',
  },
  {
    role: 'index page',
    label: 'Index page',
    description: 'Pick one or more chapter links from this page and add them to the queue.',
  },
  {
    role: 'chapter page',
    label: 'Chapter page',
    description: 'Queue the current page directly for offline reading.',
  },
];

export default function OfflinePageRolePicker({
  visible,
  pageTitle,
  initialRoles,
  onClose,
  onSubmit,
}: OfflinePageRolePickerProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [selectedRoles, setSelectedRoles] = useState<
    Array<'home page' | 'index page' | 'chapter page'>
  >([]);

  useEffect(() => {
    if (visible) {
      setSelectedRoles(initialRoles);
    }
  }, [initialRoles, visible]);

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.layer}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Offline download</Text>
          <Text style={styles.title}>What kind of page is this?</Text>
          <Text numberOfLines={2} style={styles.subtitle}>
            {pageTitle}
          </Text>
          <Text style={styles.helperText}>
            Home page and index page can both be checked for the same URL. Long-pressing `DL` opens
            this editor anytime.
          </Text>
          {OPTIONS.map((option) => (
            <Pressable
              key={option.role}
              onPress={() =>
                setSelectedRoles((current) =>
                  current.includes(option.role)
                    ? current.filter((role) => role !== option.role)
                    : [...current, option.role],
                )
              }
              style={styles.option}
            >
              <View style={styles.optionRow}>
                <View
                  style={[
                    styles.checkbox,
                    selectedRoles.includes(option.role) && styles.checkboxSelected,
                  ]}
                >
                  <Text style={styles.checkboxLabel}>
                    {selectedRoles.includes(option.role) ? '✓' : ''}
                  </Text>
                </View>
                <View style={styles.optionText}>
                  <Text style={styles.optionLabel}>{option.label}</Text>
                  <Text style={styles.optionDescription}>{option.description}</Text>
                </View>
              </View>
            </Pressable>
          ))}
          <View style={styles.footer}>
            <Pressable onPress={onClose} style={styles.cancelButton}>
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => onSubmit(selectedRoles)}
              disabled={selectedRoles.length === 0}
              style={[styles.applyButton, selectedRoles.length === 0 && styles.applyButtonDisabled]}
            >
              <Text style={styles.applyLabel}>Apply</Text>
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
    helperText: {
      marginTop: theme.spacing.sm,
      ...theme.typography.caption,
      color: theme.colors.textSubtle,
    },
    option: {
      marginTop: theme.spacing.md,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.inputBackground,
      padding: theme.spacing.md,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: theme.spacing.md,
      marginTop: 2,
    },
    checkboxSelected: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accent,
    },
    checkboxLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.accentContrast,
    },
    optionText: {
      flex: 1,
    },
    optionLabel: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
    },
    optionDescription: {
      marginTop: 4,
      ...theme.typography.body,
      color: theme.colors.textMuted,
    },
    footer: {
      marginTop: theme.spacing.md,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
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
    applyLabel: {
      ...theme.typography.bodyStrong,
      color: theme.colors.accentContrast,
    },
  });
