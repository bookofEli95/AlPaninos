import "../global.css";
import { useEffect, useState, useRef } from "react";
import { View, StyleSheet, Dimensions, LogBox } from "react-native";
import { Stack, useRouter, useSegments, SplashScreen } from "expo-router";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
  runOnJS
} from "react-native-reanimated";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import { useLocationStore } from "../store/locationStore";
import { registerForPushNotificationsAsync, savePushToken } from "../lib/pushNotifications";

SplashScreen.preventAutoHideAsync().catch(() => {});
const queryClient = new QueryClient();

// Known-benign dev-only noise, not app bugs -- both are internal timing
// quirks (Metro's dev socket reconnecting, expo-router's own initial-URL
// resolution racing the root component's mount) that never appear outside
// Expo Go's live-development mode. Matched by substring so real warnings
// with different text still show up normally.
LogBox.ignoreLogs([
  'Cannot connect to Expo CLI',
  "Can't perform a React state update on a component that hasn't mounted yet",
]);
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function Layout() {
  const { session, isInitialized, setSession, setInitialized } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();
  const [splashComplete, setSplashComplete] = useState(false);
  const navigationAttempted = useRef(false);

  // Reanimated shared values
  const logoScale = useSharedValue(2.4);
  const logoOpacity = useSharedValue(0);
  const ringScale = useSharedValue(0.6);
  const ringOpacity = useSharedValue(0);
  const shakeX = useSharedValue(0);
  const shakeY = useSharedValue(0);
  const curtainTop = useSharedValue(0);
  const curtainBottom = useSharedValue(0);

  // 1. Entrance: Stamp Slam, Shockwave, and Shake
  useEffect(() => {
    logoOpacity.value = withTiming(1, { duration: 100 });

    logoScale.value = withTiming(1.0, {
      duration: 250,
      easing: Easing.bezier(0.5, 0, 0.8, 0.2),
    }, (finished) => {
      if (finished) {
        logoScale.value = withSequence(
          withTiming(1.04, { duration: 50 }),
          withTiming(1.0, { duration: 70 })
        );

        ringOpacity.value = withSequence(
          withTiming(0.9, { duration: 20 }),
          withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) })
        );
        ringScale.value = withTiming(3.2, {
          duration: 440,
          easing: Easing.out(Easing.cubic),
        });

        shakeY.value = withSequence(
          withTiming(4, { duration: 25 }),
          withTiming(-4, { duration: 25 }),
          withTiming(2, { duration: 25 }),
          withTiming(-1, { duration: 25 }),
          withTiming(0, { duration: 25 })
        );
        shakeX.value = withSequence(
          withTiming(-3, { duration: 25 }),
          withTiming(3, { duration: 25 }),
          withTiming(-2, { duration: 25 }),
          withTiming(0, { duration: 25 })
        );
      }
    });
  }, []);

  // 2. Auth Session Bootstrap
  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
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

  // 2b. Push registration -- runs for guests too, since their sessions
  // persist the same way a registered user's does (see orders.tsx).
  useEffect(() => {
    if (!session?.user?.id) return;
    (async () => {
      const token = await registerForPushNotificationsAsync();
      if (token) await savePushToken(token);
    })();
  }, [session?.user?.id]);

  // 3. Navigation Guard (Blocks until initial route group is resolved)
  useEffect(() => {
    const rootSegment = segments[0];
    const inAuthGroup = rootSegment === '(auth)';
    const inMainGroup = rootSegment === '(main)';

    // Do nothing until auth is loaded AND Expo Router has resolved the initial route
    if (!isInitialized || (!inAuthGroup && !inMainGroup)) return;

    if (!session && !inAuthGroup) {
      navigationAttempted.current = true;
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      navigationAttempted.current = true;
      // The remembered location (see locationStore) is saved per-device, not
      // per-account -- a guest session on a device that previously had a
      // registered user (or an earlier guest session) pick a location would
      // otherwise skip straight to that remembered menu instead of letting
      // this guest choose fresh. Guests always land on location selection.
      const isAnonymous = session.user?.is_anonymous ?? false;
      if (isAnonymous) {
        // (main)/_layout.tsx also calls loadSavedLocation() itself on mount
        // -- marking it already loaded (with nothing) here stops that from
        // re-populating the stale device-level value right after this.
        useLocationStore.setState({ locationId: null, isLoaded: true });
        router.replace('/(main)');
      } else {
        useLocationStore.getState().loadSavedLocation().then(() => {
          const savedId = useLocationStore.getState().locationId;
          router.replace(savedId ? `/(main)/menu/${savedId}` : '/(main)');
        });
      }
    }
  }, [session, isInitialized, segments]);

  // 4. Splash Screen Curtain Exit
  useEffect(() => {
    const rootSegment = segments[0];
    const isRouteReady = rootSegment === '(auth)' || rootSegment === '(main)';

    if (!isInitialized || !isRouteReady) return;

    SplashScreen.hideAsync().catch(() => {});

    let isMounted = true;
    const timeout = setTimeout(() => {
      logoOpacity.value = withTiming(0, { duration: 200 });
      logoScale.value = withTiming(0.92, { duration: 200 });

      const halfHeight = SCREEN_HEIGHT / 2 + 50;
      curtainTop.value = withTiming(-halfHeight, {
        duration: 450,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      });
      curtainBottom.value = withTiming(halfHeight, {
        duration: 450,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      }, (finished) => {
        if (finished && isMounted) {
          runOnJS(setSplashComplete)(true);
        }
      });
    }, 700);

    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [isInitialized, segments]);

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
    transform: [{ scale: logoScale.value }],
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <View style={styles.root}>
        <Stack screenOptions={{ headerShown: false }} />

        {!splashComplete && (
          <View pointerEvents="none" style={styles.splashContainer}>
            <Animated.View style={[styles.curtainTop, animatedTopCurtain]} />
            <Animated.View style={[styles.curtainBottom, animatedBottomCurtain]} />

            <Animated.View style={[styles.centerContainer, animatedCenterGroup]}>
              <Animated.View style={[styles.shockwaveRing, animatedRingStyle]} />
              <Animated.Image
                source={require("../assets/logo.jpg")}
                style={[styles.logo, animatedLogoStyle]}
                resizeMode="contain"
              />
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
    backgroundColor: '#A61C14',
  },
  curtainBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: '#A61C14',
  },
  centerContainer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shockwaveRing: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 4,
    borderColor: '#F4ECE1',
  },
  logo: {
    width: 220,
    height: 220,
  },
});