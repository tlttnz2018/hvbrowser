import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { OfflineStoryRecord } from '../db/offline';
import { Theme, absoluteFill, useTheme } from '../theme';

interface OfflineStoryPickerProps {
  visible: boolean;
  pageTitle: string;
  stories: OfflineStoryRecord[];
  suggestedStoryId: number | null;
  defaultStoryName: string;
  onClose: () => void;
  onSubmit: (selection: { storyId?: number | null; name?: string }) => void;
}

type StoryChoice =
  | { kind: 'new'; key: 'new'; label: string }
  | { kind: 'existing'; key: string; story: OfflineStoryRecord };

export default function OfflineStoryPicker({
  visible,
  pageTitle,
  stories,
  suggestedStoryId,
  defaultStoryName,
  onClose,
  onSubmit,
}: OfflineStoryPickerProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [selectedKey, setSelectedKey] = useState<string>('new');
  const [newStoryName, setNewStoryName] = useState(defaultStoryName);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const hasSuggestedStory = suggestedStoryId ? stories.some((story) => story.id === suggestedStoryId) : false;
    setSelectedKey(hasSuggestedStory ? `story-${suggestedStoryId}` : 'new');
    setNewStoryName(defaultStoryName);
  }, [defaultStoryName, stories, suggestedStoryId, visible]);

  const choices = useMemo<StoryChoice[]>(() => {
    const orderedStories = [...stories].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return [{ kind: 'new', key: 'new', label: newStoryName }, ...orderedStories.map((story) => ({
      kind: 'existing' as const,
      key: `story-${story.id}`,
      story,
    }))];
  }, [newStoryName, stories]);

  const selectedChoice = choices.find((choice) => choice.key === selectedKey) ?? choices[0];
  const canSubmit =
    selectedChoice?.kind === 'existing' ? true : !!newStoryName.trim();

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.layer}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Offline story</Text>
          <Text style={styles.title}>Choose a story before saving</Text>
          <Text numberOfLines={2} style={styles.subtitle}>
            {pageTitle}
          </Text>

          <ScrollView style={styles.storyList} contentContainerStyle={styles.storyListContent}>
            <Pressable
              onPress={() => setSelectedKey('new')}
              style={[styles.storyRow, selectedKey === 'new' && styles.storyRowSelected]}
            >
              <View style={[styles.radio, selectedKey === 'new' && styles.radioSelected]} />
              <View style={styles.storyText}>
                <Text style={styles.storyName}>Create new story</Text>
                <Text style={styles.storyMeta}>Edit the line below, then continue to create it.</Text>
                <TextInput
                  value={newStoryName}
                  onChangeText={(value) => {
                    setSelectedKey('new');
                    setNewStoryName(value);
                  }}
                  placeholder="Story title"
                  placeholderTextColor={theme.colors.inputPlaceholder}
                  style={styles.input}
                />
              </View>
            </Pressable>

            {choices
              .filter((choice) => choice.kind === 'existing')
              .map((choice) => {
                const selected = choice.key === selectedKey;
                return (
                  <Pressable
                    key={choice.key}
                    onPress={() => setSelectedKey(choice.key)}
                    style={[styles.storyRow, selected && styles.storyRowSelected]}
                  >
                    <View style={[styles.radio, selected && styles.radioSelected]} />
                    <View style={styles.storyText}>
                      <Text style={styles.storyName}>{choice.story.name}</Text>
                      <Text numberOfLines={1} style={styles.storyMeta}>
                        {choice.story.indexPageUrl || choice.story.homePageUrl || 'No saved page URL yet'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable onPress={onClose} style={styles.cancelButton}>
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                selectedChoice?.kind === 'existing'
                  ? onSubmit({ storyId: selectedChoice.story.id })
                  : onSubmit({ name: newStoryName })
              }
              disabled={!canSubmit}
              style={[styles.applyButton, !canSubmit && styles.applyButtonDisabled]}
            >
              <Text style={styles.applyLabel}>Continue</Text>
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
      maxHeight: '82%',
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
    storyList: {
      marginTop: theme.spacing.md,
      maxHeight: 340,
    },
    storyListContent: {
      paddingBottom: theme.spacing.xs,
    },
    storyRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.inputBackground,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.sm,
    },
    storyRowSelected: {
      borderColor: theme.colors.borderAccent,
      backgroundColor: theme.colors.accentSoft,
    },
    radio: {
      width: 18,
      height: 18,
      borderRadius: theme.radius.full,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surface,
      marginRight: theme.spacing.md,
      marginTop: 4,
    },
    radioSelected: {
      borderWidth: 5,
      borderColor: theme.colors.accent,
    },
    storyText: {
      flex: 1,
    },
    storyName: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
    },
    storyMeta: {
      marginTop: 4,
      ...theme.typography.caption,
      color: theme.colors.textMuted,
    },
    input: {
      minHeight: 44,
      marginTop: theme.spacing.sm,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.inputBorder,
      backgroundColor: theme.colors.surface,
      color: theme.colors.text,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      fontSize: 16,
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
