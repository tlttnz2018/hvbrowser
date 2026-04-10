import React, { useState, useEffect } from 'react';
import { StyleSheet, TextInput, Text, View, TouchableOpacity } from 'react-native';

interface SearchInputProps {
  placeholder?: string;
  url: string;
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
  onSubmit,
  onFocus,
  backButtonEnabled,
  onBack,
  fullSite,
  onToggleReaderMode,
}: SearchInputProps) {
  const [text, setText] = useState(url);

  useEffect(() => {
    setText(url);
  }, [url]);

  const handleSubmitEditing = () => {
    if (!text) return;
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
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={onBack}
        style={backButtonEnabled ? styles.navButton : styles.disabledButton}
      >
        <Text style={styles.backLabel}>{'‹'}</Text>
      </TouchableOpacity>
      <TextInput
        autoCorrect={false}
        value={text}
        placeholder={placeholder}
        placeholderTextColor="#8e8e93"
        underlineColorAndroid="transparent"
        style={styles.textInput}
        clearButtonMode="always"
        onChangeText={setText}
        onSubmitEditing={handleSubmitEditing}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={fullSite ? 'Switch to reader mode' : 'Switch to full site mode'}
        onPress={onToggleReaderMode}
        style={styles.readerButton}
      >
        <Text style={styles.readerLabel}>{fullSite ? '☷' : '◫'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    height: 40,
    color: '#111827',
    backgroundColor: '#f2f2f7',
    marginLeft: 6,
    paddingHorizontal: 12,
    paddingLeft: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d1d6',
    fontSize: 16,
  },
  navButton: {
    width: 40,
    height: 40,
    marginRight: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2f2f7',
    borderColor: '#d1d1d6',
    borderWidth: 1,
    borderRadius: 12,
  },
  disabledButton: {
    width: 40,
    height: 40,
    marginRight: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2f2f7',
    borderColor: '#e5e5ea',
    borderWidth: 1,
    borderRadius: 12,
    opacity: 0.45,
  },
  backLabel: {
    fontSize: 24,
    lineHeight: 24,
    color: '#007aff',
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
    borderRadius: 10,
    backgroundColor: '#e9e6df',
  },
  readerLabel: {
    fontSize: 18,
    lineHeight: 18,
    fontWeight: '700',
    color: '#6a4522',
  },
});
