import "../global.css";
import { useEffect, useState, useRef } from "react";
import { View, StyleSheet, Dimensions, LogBox } from "react-native";
import { Stack, useRouter, useSegments, SplashScreen } from "expo-router";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
  Easing,
  runOnJS
} from "react-native-reanimated";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import { useLocationStore } from "../store/locationStore";
import { registerForPushNotificationsAsync, savePushToken } from "../lib/pushNotifications";

SplashScreen.preventAutoHideAsync().catch(() => {});
const queryClient = new QueryClient();

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

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  const logoScale = useSharedValue(2.4);
  const logoOpacity = useSharedValue(0);
  const ringScale = useSharedValue(0.6);
  const ringOpacity = useSharedValue(0);
  const shakeX = useSharedValue(0);
  const shakeY = useSharedValue(0);
  const curtainTop = useSharedValue(0);
  const curtainBottom = useSharedValue(0);

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

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession()
      .then(({ data: { session: currentSession } }) => {
        if (isMounted) {
          setSession(currentSession);
          setInitialized(true);
        }
      })
      .catch(() => {
        if (isMounted) {
          setSession(null);
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
      const isAnonymous = session.user?.is_anonymous ?? false;
      if (isAnonymous) {
        useLocationStore.setState({ locationId: null, isLoaded: true });
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

          if (showWheel) {
            router.replace('/(main)/spin-wheel');
            return;
          }

          await useLocationStore.getState().loadSavedLocation();
          const savedId = useLocationStore.getState().locationId;
          router.replace(savedId ? `/(main)/menu/${savedId}` : '/(main)');
        })();
      }
    }
  }, [session, isInitialized, segments]);

  useEffect(() => {
    const rootSegment = segments[0];
    const isRouteReady = rootSegment === '(auth)' || rootSegment === '(main)';

    if (!isInitialized || !isRouteReady || !fontsLoaded) return;

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
  }, [isInitialized, segments, fontsLoaded]);

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