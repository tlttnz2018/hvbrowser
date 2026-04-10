import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
  return (
    <View accessibilityLabel={accessibilityLabel} style={[styles.container, compact && styles.containerCompact]}>
      {options.map((option) => {
        const selected = option.key === selectedKey;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="button"
            onPress={() => onChange(option.key)}
            style={[styles.segment, compact && styles.segmentCompact, selected && styles.segmentSelected]}
          >
            <Text style={[styles.label, compact && styles.labelCompact, selected && styles.labelSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 14,
    backgroundColor: '#ebe7e1',
    borderWidth: 1,
    borderColor: '#ddd4c9',
    marginHorizontal: 4,
  },
  containerCompact: {
    marginHorizontal: 2,
  },
  segment: {
    minWidth: 56,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentCompact: {
    minWidth: 36,
    height: 32,
    paddingHorizontal: 8,
  },
  segmentSelected: {
    backgroundColor: '#fffdf8',
    shadowColor: '#46311b',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b6259',
  },
  labelCompact: {
    fontSize: 12,
  },
  labelSelected: {
    color: '#1f1a17',
  },
});
