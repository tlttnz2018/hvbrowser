import React, { useState, useEffect } from 'react';
import { StyleSheet, TextInput, Text, View, TouchableOpacity } from 'react-native';

interface SearchInputProps {
  placeholder?: string;
  url: string;
  onSubmit: (text: string) => void;
  onFocus: (isFocus: boolean) => void;
  backButtonEnabled: boolean;
  onBack: () => void;
}

const BGWASH = 'rgba(255,255,255,0.8)';
const DISABLED_WASH = 'rgba(255,255,255,0.25)';

export default function SearchInput({
  placeholder,
  url,
  onSubmit,
  onFocus,
  backButtonEnabled,
  onBack,
}: SearchInputProps) {
  const [text, setText] = useState(url);
  const [backButtonHide, setBackButtonHide] = useState(false);

  useEffect(() => {
    setText(url);
  }, [url]);

  const handleSubmitEditing = () => {
    if (!text) return;
    onSubmit(text);
  };

  const handleFocus = () => {
    onFocus(true);
    setBackButtonHide(true);
  };

  const handleBlur = () => {
    onFocus(false);
    setBackButtonHide(false);
  };

  return (
    <View style={styles.container}>
      <TextInput
        autoCorrect={false}
        value={text}
        placeholder={placeholder}
        placeholderTextColor="white"
        underlineColorAndroid="transparent"
        style={styles.textInput}
        clearButtonMode="always"
        onChangeText={setText}
        onSubmitEditing={handleSubmitEditing}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
      {!backButtonHide && (
        <TouchableOpacity
          onPress={onBack}
          style={backButtonEnabled ? styles.navButton : styles.disabledButton}
        >
          <Text>{'⇦'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: 30,
    flexDirection: 'row',
  },
  textInput: {
    flex: 1,
    color: 'white',
    backgroundColor: '#666',
    marginHorizontal: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  navButton: {
    width: 30,
    padding: 3,
    marginRight: 3,
    marginLeft: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BGWASH,
    borderColor: '#666',
    borderWidth: 1,
    borderRadius: 3,
  },
  disabledButton: {
    width: 30,
    padding: 3,
    marginRight: 3,
    marginLeft: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DISABLED_WASH,
    borderColor: '#000',
    borderWidth: 1,
    borderRadius: 3,
  },
});
