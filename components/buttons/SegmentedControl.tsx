import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Theme, useTheme } from '../../theme';

interface SegmentOption {
  key: string;
  label: string;
}

interface SegmentedControlProps {
  accessibilityLabel: string;
  compact?: boolean;
  onChange: (key: string) => void;
  options: SegmentOption[];
  selectedKey: string;
}

export default function SegmentedControl({
  accessibilityLabel,
  compact = false,
  onChange,
  options,
  selectedKey,
}: SegmentedControlProps) {
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[styles.container, compact && styles.containerCompact]}
    >
      {options.map((option) => {
        const selected = option.key === selectedKey;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="button"
            onPress={() => onChange(option.key)}
            style={[
              styles.segment,
              compact && styles.segmentCompact,
              selected && styles.segmentSelected,
            ]}
          >
            <Text
              style={[
                styles.label,
                compact && styles.labelCompact,
                selected && styles.labelSelected,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      padding: 3,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginHorizontal: 4,
    },
    containerCompact: {
      marginHorizontal: 2,
    },
    segment: {
      minWidth: 56,
      height: 34,
      paddingHorizontal: 12,
      borderRadius: theme.radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentCompact: {
      minWidth: 36,
      height: 32,
      paddingHorizontal: 8,
    },
    segmentSelected: {
      backgroundColor: theme.colors.surface,
      ...theme.shadows.sm,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textMuted,
    },
    labelCompact: {
      fontSize: 12,
    },
    labelSelected: {
      color: theme.colors.text,
    },
  });
