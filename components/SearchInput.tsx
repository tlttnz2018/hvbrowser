import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { Theme, useTheme } from '../theme';

interface SearchInputProps {
  placeholder?: string;
  url: string;
  urlInputFocus: boolean;
  onSubmit: (text: string) => void;
  onFocus: (isFocus: boolean) => void;
  backButtonEnabled: boolean;
  onBack: () => void;
  fullSite: boolean;
  onToggleReaderMode: () => void;
}

export default function SearchInput({
  placeholder,
  url,
  urlInputFocus,
  onSubmit,
  onFocus,
  backButtonEnabled,
  onBack,
  fullSite,
  onToggleReaderMode,
}: SearchInputProps) {
  const [text, setText] = useState(url);
  const inputRef = useRef<TextInput>(null);
  const theme = useTheme();
  const styles = createStyles(theme);

  useEffect(() => {
    setText(url);
    onFocus(false);
    requestAnimationFrame(() => {
      Keyboard.dismiss();
      inputRef.current?.blur();
    });
    // Intentionally react only to URL changes so parent callback identity changes
    // don't retrigger this focus-reset loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    if (!urlInputFocus) {
      requestAnimationFrame(() => {
        Keyboard.dismiss();
        inputRef.current?.blur();
      });
    } else {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [urlInputFocus]);

  const handleSubmitEditing = () => {
    if (!text) return;
    onFocus(false);
    Keyboard.dismiss();
    inputRef.current?.blur();
    onSubmit(text);
  };

  const handleFocus = () => {
    onFocus(true);
  };

  const handleBlur = () => {
    onFocus(false);
  };

  return (
    <View style={styles.container}>
      {backButtonEnabled && (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={onBack}
          style={styles.navButton}
        >
          <Text style={styles.backLabel}>{'‹'}</Text>
        </TouchableOpacity>
      )}
      <TextInput
        ref={inputRef}
        autoCorrect={false}
        autoFocus={false}
        blurOnSubmit
        caretHidden={!urlInputFocus}
        contextMenuHidden={!urlInputFocus}
        editable={urlInputFocus}
        focusable={urlInputFocus}
        value={text}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.inputPlaceholder}
        underlineColorAndroid="transparent"
        showSoftInputOnFocus={urlInputFocus}
        style={[styles.textInput, !backButtonEnabled && styles.textInputCompact]}
        clearButtonMode="always"
        onChangeText={setText}
        onSubmitEditing={handleSubmitEditing}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
      {!urlInputFocus && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit URL"
          onPress={() => onFocus(true)}
          style={[styles.editOverlay, !backButtonEnabled && styles.editOverlayCompact]}
        />
      )}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={fullSite ? 'Switch to reader mode' : 'Switch to full site mode'}
        onPress={() => {
          onFocus(false);
          Keyboard.dismiss();
          inputRef.current?.blur();
          onToggleReaderMode();
        }}
        style={[styles.readerButton, !backButtonEnabled && styles.readerButtonCompact]}
      >
        <Text style={styles.readerLabel}>{fullSite ? '☷' : '◫'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      height: 40,
      flexDirection: 'row',
      alignItems: 'center',
    },
    textInput: {
      flex: 1,
      height: 40,
      color: theme.colors.text,
      backgroundColor: theme.colors.inputBackground,
      marginLeft: theme.spacing.xs,
      paddingHorizontal: theme.spacing.md,
      paddingLeft: 42,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.inputBorder,
      fontSize: 16,
    },
    textInputCompact: {
      marginLeft: 0,
    },
    editOverlay: {
      position: 'absolute',
      left: 48,
      right: 0,
      top: 0,
      bottom: 0,
      borderRadius: theme.radius.md,
    },
    editOverlayCompact: {
      left: 0,
    },
    navButton: {
      width: 40,
      height: 40,
      marginRight: 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.inputBackground,
      borderColor: theme.colors.inputBorder,
      borderWidth: 1,
      borderRadius: theme.radius.md,
    },
    backLabel: {
      fontSize: 24,
      lineHeight: 24,
      color: theme.colors.accent,
      marginTop: -2,
    },
    readerButton: {
      position: 'absolute',
      left: 54,
      top: 4,
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radius.sm,
      backgroundColor: theme.colors.surfaceMuted,
    },
    readerButtonCompact: {
      left: 6,
    },
    readerLabel: {
      fontSize: 18,
      lineHeight: 18,
      fontWeight: '700',
      color: theme.colors.textAccent,
    },
  });
