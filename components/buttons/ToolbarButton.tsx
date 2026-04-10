import React from 'react';
import { StyleSheet, TouchableOpacity, TouchableOpacityProps } from 'react-native';

interface ToolbarButtonProps extends TouchableOpacityProps {
  variant?: 'secondary' | 'primary' | 'quiet';
}

export default function ToolbarButton({ children, variant = 'secondary', style, ...props }: ToolbarButtonProps) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.7}
      style={[
        styles.button,
        variant === 'primary' && styles.primaryButton,
        variant === 'quiet' && styles.quietButton,
        style,
      ]}
      {...props}
    >
      {children}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 40,
    height: 40,
    paddingHorizontal: 10,
    marginHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2f2f7',
    borderColor: '#d1d1d6',
    borderWidth: 1,
    borderRadius: 12,
  },
  primaryButton: {
    backgroundColor: '#7a4f28',
    borderColor: '#7a4f28',
  },
  quietButton: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    paddingHorizontal: 6,
    minWidth: 0,
  },
});
