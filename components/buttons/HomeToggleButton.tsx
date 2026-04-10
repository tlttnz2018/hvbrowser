import React from 'react';
import { Text } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import ToolbarButton from './ToolbarButton';

export default function HomeToggleButton() {
  const router = useRouter();
  const pathname = usePathname();

  const handlePress = () => {
    if (pathname === '/web') {
      router.push('/');
    } else {
      router.push('/web');
    }
  };

  return (
    <ToolbarButton onPress={handlePress}>
      <Text>{'🏠'}</Text>
    </ToolbarButton>
  );
}
