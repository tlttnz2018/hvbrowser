import { Platform } from 'react-native';

const ANDROID_BOTTOM_SYSTEM_BAR_EXTRA = 24;

export function getBottomInsetWithSystemBarPadding(bottomInset: number) {
  return bottomInset + (Platform.OS === 'android' ? ANDROID_BOTTOM_SYSTEM_BAR_EXTRA : 0);
}
