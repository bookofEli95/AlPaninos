import { useCallback } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect } from 'expo-router';

// Hidden screens (see (main)/_layout.tsx's href: null entries) are
// registered as siblings in the same Tabs navigator as the visible tabs,
// not in a real per-tab stack -- so the Android hardware back button and
// system back gesture fall through to the tab navigator's default, which
// jumps to the first registered tab (Profile) instead of wherever this
// screen was actually pushed from. This intercepts it on Android while the
// screen is focused and sends the user to the same destination the
// on-screen Back button already uses.
export function useBackHandler(onBack: () => void) {
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        onBack();
        return true;
      });
      return () => subscription.remove();
    }, [onBack])
  );
}
