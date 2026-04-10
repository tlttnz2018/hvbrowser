import React from 'react';
import { StyleSheet, TouchableOpacity, TouchableOpacityProps } from 'react-native';
import { Theme, useTheme } from '../../theme';

interface ToolbarButtonProps extends TouchableOpacityProps {
  variant?: 'secondary' | 'primary' | 'quiet';
}

export default function ToolbarButton({ children, variant = 'secondary', style, ...props }: ToolbarButtonProps) {
  const theme = useTheme();
  const styles = createStyles(theme);

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

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  button: {
    minWidth: 40,
    height: 40,
    paddingHorizontal: 10,
    marginHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.inputBackground,
    borderColor: theme.colors.inputBorder,
    borderWidth: 1,
    borderRadius: theme.radius.md,
  },
  primaryButton: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  quietButton: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    paddingHorizontal: 6,
    minWidth: 0,
  },
});
