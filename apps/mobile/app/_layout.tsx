import "../global.css";
import { useEffect, useState, useRef } from "react";
import { View, StyleSheet, Dimensions, LogBox, AppState, Platform } from "react-native";
import { Stack, useRouter, useSegments, SplashScreen } from "expo-router";
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { useFonts } from "expo-font";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from "@expo-google-fonts/inter";
import {
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
  withDelay,
  withRepeat,
  Easing,
  runOnJS,
  SharedValue,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import { registerForPushNotificationsAsync, savePushToken } from "../lib/pushNotifications";
import AlertHost from "../components/AlertHost";

SplashScreen.preventAutoHideAsync().catch(() => {});
// Data counts as fresh for 30 seconds: popping out of the app briefly (to
// copy an email code, say) and straight back doesn't reload everything on
// screen, but a real break does (see the focus hookup below). Screens that
// must be current (orders, deals, profile) reload themselves when opened,
// whatever this says; a query can set its own staleTime.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
    },
  },
});

// Coming back to the app counts as "focus" for React Query (on a phone it
// doesn't know otherwise): anything on screen that's out of date reloads,
// so the menu, store hours and orders are fresh after the app's been in
// the background.
AppState.addEventListener('change', (state) => {
  if (Platform.OS !== 'web') focusManager.setFocused(state === 'active');
});

LogBox.ignoreLogs([
  'Cannot connect to Expo CLI',
  "Can't perform a React state update on a component that hasn't mounted yet",
]);
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// The launch animation's colours: the red is the logo image's own
// background, so the logo sits seamlessly on the curtains.
const LAUNCH_RED = '#AE1807';
const LAUNCH_GOLD = '#FFC72C';
const LOGO_SIZE = 220;
const BEAMS_SIZE = Math.max(SCREEN_WIDTH, SCREEN_HEIGHT) * 1.5;
const SPARK_COUNT = 16;

// One of the gold sparks that fly off the logo when it slams down -- all of
// them ride one shared progress clock (0 -> 1).
function LaunchSpark({ index, progress }: { index: number; progress: SharedValue<number> }) {
  const angle = ((index * (360 / SPARK_COUNT) + (index % 2) * 11) * Math.PI) / 180;
  const startRadius = LOGO_SIZE * 0.4;
  const travel = 70 + (index % 3) * 30;
  const size = index % 3 === 0 ? 10 : 6;
  const color = index % 3 === 1 ? '#FFFFFF' : LAUNCH_GOLD;
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const r = startRadius + travel * p;
    return {
      opacity: p <= 0 ? 0 : p < 0.1 ? p * 10 : 1 - p,
      transform: [
        { translateX: Math.cos(angle) * r },
        { translateY: Math.sin(angle) * r },
        { rotate: '45deg' },
        { scale: 1 - p * 0.5 },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          backgroundColor: color,
          borderRadius: 1.5,
          shadowColor: LAUNCH_GOLD,
          shadowOpacity: 1,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 0 },
        },
        style,
      ]}
    />
  );
}

export default function Layout() {
  const { session, isInitialized, setSession, setInitialized } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();
  const [splashComplete, setSplashComplete] = useState(false);
  const navigationAttempted = useRef(false);

  // Screens only mount once fonts are ready (see the Stack below) -- text
  // measured before a custom font loads keeps the fallback font's width, so
  // single-line labels (the tab bar) came out cut off ("Me…" for "Menu").
  // A font load error still lets the app in, just with the system font,
  // rather than leaving it stuck on the splash screen forever.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const fontsReady = fontsLoaded || !!fontError;

  // The launch animation (about 1.4s, once the app is ready to show):
  //   * the logo is flung in -- a full spin while it zooms down from 3.2x --
  //     and slams onto the red stage;
  //   * impact: a thud, the screen shakes, a cream then a gold shockwave
  //     ring blast out, gold sparks fly, and gold spotlight beams flare on
  //     and keep turning;
  //   * a shine sweeps across the logo;
  //   * exit: the logo rushes towards you and fades while the red curtains
  //     split open (gold-edged) onto the app.
  const logoScale = useSharedValue(3.2);
  const logoRotate = useSharedValue(-360);
  const logoOpacity = useSharedValue(0);
  const ringScale = useSharedValue(0.6);
  const ringOpacity = useSharedValue(0);
  const ring2Scale = useSharedValue(0.6);
  const ring2Opacity = useSharedValue(0);
  const sparkProgress = useSharedValue(0);
  const beamsOpacity = useSharedValue(0);
  const beamsRotation = useSharedValue(0);
  const shineSweep = useSharedValue(0);
  const shakeX = useSharedValue(0);
  const shakeY = useSharedValue(0);
  const curtainTop = useSharedValue(0);
  const curtainBottom = useSharedValue(0);
  const launchStarted = useRef(false);

  useEffect(() => {
    let isMounted = true;

    // Reading the saved sign-in can fail for a moment (e.g. the phone's
    // secure storage is briefly unavailable) -- that isn't the same as being
    // signed out, so it tries again before giving up and showing sign-in.
    const loadSession = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const { data } = await supabase.auth.getSession();
          return data.session;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
        }
      }
      return null;
    };
    loadSession().then((currentSession) => {
      if (isMounted) {
        setSession(currentSession);
        setInitialized(true);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (isMounted) setSession(currentSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Refreshes the push token for phones that already allowed notifications.
  // Never asks at launch -- the order screen's "Turn On" card does that,
  // once there's an order to be notified about (OrderPushPrompt).
  useEffect(() => {
    if (!session?.user?.id) return;
    (async () => {
      const token = await registerForPushNotificationsAsync();
      if (token) await savePushToken(token);
    })();
  }, [session?.user?.id]);

  useEffect(() => {
    const rootSegment = segments[0];
    const inAuthGroup = rootSegment === '(auth)';
    const inMainGroup = rootSegment === '(main)';

    if (!isInitialized || (!inAuthGroup && !inMainGroup)) return;

    if (!session && !inAuthGroup) {
      navigationAttempted.current = true;
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      navigationAttempted.current = true;
      // Everyone starts on Home -- a guest, and a member signing in (a
      // member opening the app already signed in starts there too, as the
      // app's first screen). Only a member who hasn't had their welcome
      // spin yet goes to the wheel first.
      const isAnonymous = session.user?.is_anonymous ?? false;
      if (isAnonymous) {
        router.replace('/(main)');
      } else {
        (async () => {
          let showWheel = false;
          try {
            const { data } = await (supabase as any)
              .from('profiles')
              .select('has_spun_wheel')
              .eq('id', session.user.id)
              .single();
            showWheel = !!data && !data.has_spun_wheel;
          } catch {}

          router.replace(showWheel ? '/(main)/spin-wheel' : '/(main)');
        })();
      }
    }
  }, [session, isInitialized, segments]);

  const launchThud = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  };

  // Plays once, as soon as the first screen is ready behind the curtains.
  useEffect(() => {
    const rootSegment = segments[0];
    const isRouteReady = rootSegment === '(auth)' || rootSegment === '(main)';

    if (!isInitialized || !isRouteReady || !fontsReady || launchStarted.current) return;
    launchStarted.current = true;

    SplashScreen.hideAsync().catch(() => {});

    const fling = { duration: 450, easing: Easing.bezier(0.12, 1, 0.2, 1) };
    const openCurtains = { duration: 480, easing: Easing.bezier(0.6, 0, 0.2, 1) };
    const halfHeight = SCREEN_HEIGHT / 2 + 50;

    beamsRotation.value = withRepeat(withTiming(360, { duration: 12000, easing: Easing.linear }), -1, false);
    logoOpacity.value = withTiming(1, { duration: 80 });
    logoRotate.value = withTiming(0, fling);
    logoScale.value = withTiming(0.9, fling, (finished) => {
      if (!finished) return;
      runOnJS(launchThud)();
      logoScale.value = withSpring(1, { damping: 11, stiffness: 170 });
      shakeX.value = withSequence(
        withTiming(10, { duration: 35 }),
        withTiming(-8, { duration: 40 }),
        withTiming(6, { duration: 40 }),
        withTiming(-3, { duration: 40 }),
        withTiming(0, { duration: 40 })
      );
      shakeY.value = withSequence(
        withTiming(-6, { duration: 35 }),
        withTiming(5, { duration: 40 }),
        withTiming(-2, { duration: 40 }),
        withTiming(0, { duration: 45 })
      );
      ringScale.value = withTiming(3.2, { duration: 440, easing: Easing.out(Easing.cubic) });
      ringOpacity.value = withSequence(
        withTiming(0.95, { duration: 20 }),
        withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) })
      );
      ring2Scale.value = withDelay(80, withTiming(4, { duration: 500, easing: Easing.out(Easing.cubic) }));
      ring2Opacity.value = withDelay(
        80,
        withSequence(withTiming(0.9, { duration: 30 }), withTiming(0, { duration: 470, easing: Easing.out(Easing.cubic) }))
      );
      sparkProgress.value = withTiming(1, { duration: 650, easing: Easing.out(Easing.quad) });
      beamsOpacity.value = withSequence(withTiming(1, { duration: 80 }), withTiming(0.55, { duration: 400 }));
      shineSweep.value = withDelay(150, withTiming(1, { duration: 450, easing: Easing.inOut(Easing.quad) }));

      // Exit: the logo rushes at you and fades as the curtains split open.
      const exitDelay = 480;
      logoScale.value = withDelay(exitDelay, withTiming(5, { duration: 380, easing: Easing.in(Easing.cubic) }));
      logoOpacity.value = withDelay(exitDelay, withTiming(0, { duration: 330 }));
      beamsOpacity.value = withDelay(exitDelay + 60, withTiming(0, { duration: 260 }));
      curtainTop.value = withDelay(exitDelay + 60, withTiming(-halfHeight, openCurtains));
      curtainBottom.value = withDelay(
        exitDelay + 60,
        withTiming(halfHeight, openCurtains, (done) => {
          if (done) runOnJS(setSplashComplete)(true);
        })
      );
    });

    // Safety net: never leave the curtains closed if the animation is
    // interrupted.
    const fallback = setTimeout(() => setSplashComplete(true), 3500);
    return () => clearTimeout(fallback);
  }, [isInitialized, segments, fontsReady]);

  const animatedTopCurtain = useAnimatedStyle(() => ({
    transform: [{ translateY: curtainTop.value }],
  }));

  const animatedBottomCurtain = useAnimatedStyle(() => ({
    transform: [{ translateY: curtainBottom.value }],
  }));

  const animatedCenterGroup = useAnimatedStyle(() => ({
    transform: [
      { translateX: shakeX.value },
      { translateY: shakeY.value },
    ],
  }));

  const animatedRingStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));

  const animatedLogoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }, { rotate: `${logoRotate.value}deg` }],
  }));

  const animatedRing2Style = useAnimatedStyle(() => ({
    opacity: ring2Opacity.value,
    transform: [{ scale: ring2Scale.value }],
  }));

  const animatedBeamsStyle = useAnimatedStyle(() => ({
    opacity: beamsOpacity.value,
    transform: [{ rotate: `${beamsRotation.value}deg` }],
  }));

  const animatedShineStyle = useAnimatedStyle(() => ({
    opacity: shineSweep.value > 0 && shineSweep.value < 1 ? 1 : 0,
    transform: [{ translateX: -LOGO_SIZE * 0.7 + shineSweep.value * LOGO_SIZE * 1.9 }, { rotate: '20deg' }],
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <View style={styles.root}>
        {fontsReady && <Stack screenOptions={{ headerShown: false }} />}
        {/* The app's popups (lib/alert.ts), in the app's colours */}
        {fontsReady && <AlertHost />}

        {!splashComplete && (
          <View pointerEvents="none" style={styles.splashContainer}>
            <Animated.View style={[styles.curtainTop, animatedTopCurtain]}>
              <View style={[styles.curtainEdge, { bottom: 0 }]} />
            </Animated.View>
            <Animated.View style={[styles.curtainBottom, animatedBottomCurtain]}>
              <View style={[styles.curtainEdge, { top: 0 }]} />
            </Animated.View>

            <Animated.View style={[styles.centerContainer, animatedCenterGroup]}>
              <Animated.View style={[styles.beams, animatedBeamsStyle]}>
                <Svg width={BEAMS_SIZE} height={BEAMS_SIZE} viewBox="0 0 200 200">
                  {Array.from({ length: 16 }, (_, i) => {
                    const a1 = ((i * 22.5 - 4) * Math.PI) / 180;
                    const a2 = ((i * 22.5 + 4) * Math.PI) / 180;
                    return (
                      <Path
                        key={i}
                        d={`M100 100 L${100 + 100 * Math.cos(a1)} ${100 + 100 * Math.sin(a1)} L${100 + 100 * Math.cos(a2)} ${100 + 100 * Math.sin(a2)} Z`}
                        fill={i % 2 === 0 ? LAUNCH_GOLD : '#FFE58A'}
                        opacity={0.22}
                      />
                    );
                  })}
                </Svg>
              </Animated.View>
              <Animated.View style={[styles.shockwaveRing, animatedRingStyle]} />
              <Animated.View style={[styles.shockwaveRing, styles.goldRing, animatedRing2Style]} />
              {Array.from({ length: SPARK_COUNT }, (_, i) => (
                <LaunchSpark key={i} index={i} progress={sparkProgress} />
              ))}
              <Animated.View style={[styles.logoClip, animatedLogoStyle]}>
                <Animated.Image
                  source={require("../assets/logo.jpg")}
                  style={styles.logo}
                  resizeMode="cover"
                />
                <Animated.View style={[styles.logoShine, animatedShineStyle]} />
              </Animated.View>
            </Animated.View>
          </View>
        )}
      </View>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  splashContainer: {
    ...StyleSheet.absoluteFill,
    zIndex: 999,
  },
  curtainTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: LAUNCH_RED,
  },
  curtainBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: LAUNCH_RED,
  },
  // A gold seam along each curtain's inner edge, seen as they split open.
  curtainEdge: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: LAUNCH_GOLD,
  },
  centerContainer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  beams: {
    position: 'absolute',
    width: BEAMS_SIZE,
    height: BEAMS_SIZE,
  },
  shockwaveRing: {
    position: 'absolute',
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE / 2,
    borderWidth: 4,
    borderColor: '#F4ECE1',
  },
  goldRing: {
    borderColor: LAUNCH_GOLD,
    borderWidth: 5,
  },
  // The logo in a circle, so the shine sweeping across it stays inside.
  logoClip: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE / 2,
    overflow: 'hidden',
  },
  logoShine: {
    position: 'absolute',
    top: -LOGO_SIZE * 0.25,
    left: 0,
    width: LOGO_SIZE * 0.3,
    height: LOGO_SIZE * 1.5,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  logo: {
    width: 220,
    height: 220,
  },
});