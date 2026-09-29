import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Pressable, BackHandler } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { AlertButton, useAlertStore } from '../lib/alert';

// Draws the app's popups (lib/alert.ts): a cream card with the app's red
// buttons over a dimmed screen. A layer on top of the whole app (mounted
// last in app/_layout.tsx) rather than a separate Modal window: a Modal
// opened just as one of the app's sheets slides away can fail to appear on
// iPhone. No popup opens while one of those sheets is still up.

const RED = '#A61C14';
const CREAM = '#FAF6F0';
const INK = '#1C1917';

export default function AlertHost() {
  const current = useAlertStore((state) => state.queue[0] ?? null);
  const shift = useAlertStore((state) => state.shift);

  const scale = useSharedValue(0.92);
  const opacity = useSharedValue(0);
  useEffect(() => {
    if (!current) return;
    scale.value = 0.92;
    opacity.value = 0;
    scale.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
    opacity.value = withTiming(1, { duration: 160 });
  }, [current?.id, scale, opacity]);
  const cardStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));

  // Android's back button: Cancel if there is one, else close it only if
  // it's allowed to be dismissed -- and never falls through to the screen
  // behind while a popup is up.
  useEffect(() => {
    if (!current) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const cancel = current.buttons.find((b) => b.style === 'cancel');
      if (cancel) {
        shift();
        cancel.onPress?.();
      } else if (current.options?.cancelable) {
        shift();
        current.options?.onDismiss?.();
      }
      return true;
    });
    return () => sub.remove();
  }, [current, shift]);

  if (!current) return null;

  // Closes this popup first, then runs the button's action -- so an action
  // that opens another popup queues it behind nothing.
  const press = (button: AlertButton) => {
    shift();
    button.onPress?.();
  };
  const dismiss = () => {
    shift();
    current.options?.onDismiss?.();
  };

  // Two buttons sit side by side (Cancel on the left); one or three-plus
  // stack, with Cancel last.
  const sideBySide = current.buttons.length === 2;
  const ordered = sideBySide
    ? [...current.buttons].sort((a, b) => Number(b.style === 'cancel') - Number(a.style === 'cancel'))
    : [...current.buttons].sort((a, b) => Number(a.style === 'cancel') - Number(b.style === 'cancel'));

  return (
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={current.options?.cancelable ? dismiss : undefined} />
      <Animated.View style={[styles.card, cardStyle]}>
        <View style={styles.accent} />
        <Text style={styles.title}>{current.title}</Text>
        {!!current.message && <Text style={styles.message}>{current.message}</Text>}

        <View style={[styles.buttons, sideBySide ? styles.buttonsRow : styles.buttonsColumn]}>
          {ordered.map((button, i) => {
            const cancel = button.style === 'cancel';
            return (
              <TouchableOpacity
                key={`${button.text}-${i}`}
                onPress={() => press(button)}
                activeOpacity={0.85}
                style={[styles.button, sideBySide && { flex: 1 }, cancel ? styles.cancelButton : styles.primaryButton]}
              >
                <Text
                  style={[styles.buttonText, { color: cancel ? INK : CREAM }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {button.text ?? 'OK'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: 'rgba(12,6,4,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: CREAM,
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  // A thin brand-red strip across the top of every popup.
  accent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
    backgroundColor: RED,
  },
  title: {
    color: INK,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 20,
    textAlign: 'center',
  },
  message: {
    color: '#57534E',
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
  },
  buttons: {
    marginTop: 20,
    gap: 10,
  },
  buttonsRow: {
    flexDirection: 'row',
  },
  buttonsColumn: {
    flexDirection: 'column',
  },
  button: {
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: RED,
  },
  cancelButton: {
    backgroundColor: '#EFE6DA',
  },
  buttonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
});
