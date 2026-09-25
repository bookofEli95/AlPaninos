import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import Svg, { Path, Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withRepeat,
  withSpring,
  withDelay,
  withSequence,
  Easing,
  runOnJS,
  SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useBackHandler } from '../../hooks/useBackHandler';
import { WHEEL_SEGMENTS, WHEEL_SEGMENT_ANGLE } from '../../lib/wheelPrizes';
import { fetchPrizeShowcaseImage } from '../../lib/prizeRedemption';
import ConfettiBurst from '../../components/ConfettiBurst';

// RING_MARGIN reserves room for the brass rim and its chasing light bulbs
// outside the wheel's own edge -- baked into WHEEL_SIZE's cap (not just
// RING_SIZE) so the whole assembly, bulbs included, still fits the same
// width-80 safety margin the plain wheel used to reserve on its own.
const RING_MARGIN = 22;
const WHEEL_SIZE = Math.min(280, Dimensions.get('window').width - 80 - RING_MARGIN * 2);
const RING_SIZE = WHEEL_SIZE + RING_MARGIN * 2;
const R = WHEEL_SIZE / 2;
// With 7 segments each wedge is only ~51deg wide, so a label box has to stay
// noticeably narrower than its radius or its corners poke past the wedge's
// edge into the next segment once rotated into place -- LABEL_WIDTH is kept
// well under what the wedge is actually wide at LABEL_RADIUS (see the
// tan(halfAngle) math this is based on) rather than matching it.
const LABEL_RADIUS = R * 0.68;
const LABEL_WIDTH = R * 0.5;
const LABEL_FONT_SIZE = 9;
const LABEL_LINE_HEIGHT = 11;
const HUB_SIZE = WHEEL_SIZE * 0.24;
const EXTRA_SPINS = 6;
const SPIN_DURATION = 4200;
const LIGHT_COUNT = 20;
const BRASS = '#D4A017';
// Matches the GRAND PRIZE segment in lib/wheelPrizes.ts (prize_index 3 in
// the spin_wheel migration) -- the one win that gets the bigger celebration.
const GRAND_PRIZE_INDEX = 3;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function describeSlice(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  return [`M ${cx} ${cy}`, `L ${start.x} ${start.y}`, `A ${r} ${r} 0 0 0 ${end.x} ${end.y}`, 'Z'].join(' ');
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// A ring of bulbs around the wheel with a single "chase head" (marquee-light
// style) sweeping around them -- driven by one shared clock (phase) rather
// than each bulb animating independently, so there's exactly one animation
// loop regardless of LIGHT_COUNT.
function RimLight({ index, phase }: { index: number; phase: SharedValue<number> }) {
  const angle = (360 / LIGHT_COUNT) * index;
  const { x, y } = polarToCartesian(RING_SIZE / 2, RING_SIZE / 2, RING_SIZE / 2 - 11, angle);
  const animatedProps = useAnimatedProps(() => {
    const head = phase.value * LIGHT_COUNT;
    let dist = Math.abs(head - index);
    dist = Math.min(dist, LIGHT_COUNT - dist);
    const glow = Math.max(0, 1 - dist / 2.4);
    return { opacity: 0.25 + glow * 0.75 };
  });
  return (
    <AnimatedCircle
      cx={x}
      cy={y}
      r={index % 2 === 0 ? 4.5 : 3.5}
      fill={index % 2 === 0 ? '#E7E5E4' : '#F4ECE1'}
      animatedProps={animatedProps}
    />
  );
}

// The brass rim around the wheel with the chasing lights inside it.
function BrassRim({ phase }: { phase: SharedValue<number> }) {
  const c = RING_SIZE / 2;
  return (
    <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
      <Circle cx={c} cy={c} r={c - 3} fill="none" stroke={BRASS} strokeWidth={2.5} />
      {Array.from({ length: LIGHT_COUNT }, (_, i) => (
        <RimLight key={i} index={i} phase={phase} />
      ))}
    </Svg>
  );
}

type PrizeResult = {
  index: number;
  title: string;
  code: string | null;
};

export default function SpinWheelScreen() {
  const router = useRouter();
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<PrizeResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [prizeImageUrl, setPrizeImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);

  // Entrance: the wheel lands from 3.2x while untwisting from -55deg,
  // overshoots to 0.88x and springs back, with a brass shockwave ring
  // bursting out at the moment it hits. The pointer drops in and the header
  // and button fade in after.
  const entranceScale = useSharedValue(3.2);
  const entranceRotation = useSharedValue(-55);
  const entranceOpacity = useSharedValue(0.1);
  const shockwaveScale = useSharedValue(0.6);
  const shockwaveOpacity = useSharedValue(0);
  const uiOpacity = useSharedValue(0);
  const pointerDropY = useSharedValue(-50);
  // The button is invisible until the header fades in -- it ignores taps
  // until then, so a quick tap can't start a spin mid-landing.
  const [uiReady, setUiReady] = useState(false);

  const rotation = useSharedValue(0);
  const haloPulse = useSharedValue(0.15);
  const lightsPhase = useSharedValue(0);
  const pulseScale = useSharedValue(1);
  const sheetTranslateY = useSharedValue(400);
  const sheetOpacity = useSharedValue(0);
  const tickTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  const videoPlayer = useVideoPlayer(require('../../assets/videos/wheel-background.mp4'), (player) => {
    player.loop = true;
    player.muted = true;
    player.play();
  });

  const isBigWin = result?.index === GRAND_PRIZE_INDEX;

  // This screen is the mandatory first thing a new registered user sees
  // (see app/_layout.tsx's navigation guard) -- there's nothing to go back
  // to yet, so the hardware back button / system back gesture is swallowed
  // instead of following the usual pattern of returning somewhere.
  useBackHandler(() => {});

  const triggerImpactThud = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  };

  useEffect(() => {
    const landing = { duration: 380, easing: Easing.bezier(0.12, 1, 0.2, 1) };
    entranceOpacity.value = withTiming(1, { duration: 120 });
    // The entrance twist is on the assembly, not the wheel disk itself
    // (that's \`rotation\`), so it can never throw off where a spin lands.
    entranceRotation.value = withTiming(0, landing);
    entranceScale.value = withTiming(0.88, landing, (finished) => {
      if (!finished) return;
      // The thud and the shockwave land at the moment of peak compression.
      runOnJS(triggerImpactThud)();
      shockwaveScale.value = withTiming(1.6, { duration: 400, easing: Easing.out(Easing.quad) });
      shockwaveOpacity.value = withSequence(
        withTiming(0.8, { duration: 40 }),
        withTiming(0, { duration: 360, easing: Easing.out(Easing.cubic) })
      );
      entranceScale.value = withSpring(1, { damping: 12, stiffness: 150, mass: 0.85 });
    });
    pointerDropY.value = withDelay(340, withSpring(0, { damping: 10, stiffness: 140 }));
    uiOpacity.value = withDelay(
      420,
      withTiming(1, { duration: 280 }, (finished) => {
        if (finished) runOnJS(setUiReady)(true);
      })
    );
    // The gold glow behind the rim breathes slowly from the start.
    haloPulse.value = withRepeat(withTiming(0.35, { duration: 1500, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [entranceOpacity, entranceRotation, entranceScale, shockwaveScale, shockwaveOpacity, pointerDropY, uiOpacity, haloPulse]);

  // Chasing rim lights run continuously from mount -- a casino wheel's
  // marquee lights don't wait for anything.
  useEffect(() => {
    lightsPhase.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.linear }), -1, false);
  }, [lightsPhase]);

  // The spin button pulses to draw the eye while idle, and settles down
  // once the wheel is actually moving (or the prize is showing) rather than
  // pulsing behind the disabled state.
  useEffect(() => {
    if (spinning || result) {
      pulseScale.value = withTiming(1, { duration: 200 });
    } else {
      pulseScale.value = withRepeat(withTiming(1.05, { duration: 750, easing: Easing.inOut(Easing.ease) }), -1, true);
    }
  }, [spinning, result, pulseScale]);

  // A real photo of the prize (when it maps to a menu category) makes the
  // reveal feel like an actual prize instead of a text label -- see
  // lib/wheelPrizes.ts's categoryName/itemNamePatterns and
  // fetchPrizeShowcaseImage.
  useEffect(() => {
    if (!result || result.index < 0) {
      setPrizeImageUrl(null);
      return;
    }
    const segment = WHEEL_SEGMENTS[result.index];
    if (segment?.imageFile) {
      setPrizeImageUrl(supabase.storage.from('menu-images').getPublicUrl(segment.imageFile).data.publicUrl);
      return;
    }
    if (!segment?.categoryName) {
      setPrizeImageUrl(null);
      return;
    }
    setImageLoading(true);
    fetchPrizeShowcaseImage(segment.categoryName, segment.itemNamePatterns)
      .then(setPrizeImageUrl)
      .catch(() => setPrizeImageUrl(null))
      .finally(() => setImageLoading(false));
  }, [result]);

  // The result panel slides up from the bottom rather than just appearing.
  useEffect(() => {
    if (result) {
      sheetTranslateY.value = withTiming(0, {
        duration: 450,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      });
      sheetOpacity.value = withTiming(1, { duration: 250 });
    } else {
      sheetTranslateY.value = 400;
      sheetOpacity.value = 0;
    }
  }, [result, sheetTranslateY, sheetOpacity]);

  useEffect(() => {
    return () => {
      tickTimeouts.current.forEach(clearTimeout);
    };
  }, []);

  const animatedWheelStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulseScale.value }] }));
  const entranceWheelStyle = useAnimatedStyle(() => ({
    opacity: entranceOpacity.value,
    transform: [{ scale: entranceScale.value }, { rotate: `${entranceRotation.value}deg` }],
  }));
  const shockwaveStyle = useAnimatedStyle(() => ({
    opacity: shockwaveOpacity.value,
    transform: [{ scale: shockwaveScale.value }],
  }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: haloPulse.value }));
  const pointerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: entranceOpacity.value,
    transform: [{ translateY: pointerDropY.value }],
  }));
  const uiFadeStyle = useAnimatedStyle(() => ({ opacity: uiOpacity.value }));
  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    opacity: sheetOpacity.value,
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  const handleSpinFinished = useCallback((prize: PrizeResult) => {
    setSpinning(false);
    setResult(prize);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  // Mimics a mechanical wheel's ratchet -- frequent ticks early, spacing out
  // as it "slows down", instead of just one haptic at the very end.
  const scheduleTicks = (totalDuration: number) => {
    tickTimeouts.current.forEach(clearTimeout);
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    let t = 0;
    let gap = 45;
    while (t < totalDuration - 180) {
      t += gap;
      timeouts.push(
        setTimeout(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }, t)
      );
      gap = Math.min(gap * 1.15, 360);
    }
    tickTimeouts.current = timeouts;
  };

  const handleSpin = async () => {
    if (spinning || result || !uiReady) return;
    setSpinning(true);
    setErrorMessage(null);

    try {
      const { data, error } = await (supabase as any).rpc('claim_wheel_prize');
      if (error) throw error;

      if (data.already_spun) {
        // Shouldn't normally happen -- the navigation guard only sends
        // unspun accounts here -- but a double-tap or a retried network
        // call could replay this, so fall back gracefully instead of
        // erroring on an already-decided prize.
        handleSpinFinished({ index: -1, title: data.title, code: data.code });
        return;
      }

      const prize: PrizeResult = { index: data.index, title: data.title, code: data.code };
      const baseOffset =
        (((-(prize.index * WHEEL_SEGMENT_ANGLE + WHEEL_SEGMENT_ANGLE / 2)) % 360) + 360) % 360;
      const target = EXTRA_SPINS * 360 + baseOffset;

      scheduleTicks(SPIN_DURATION);
      rotation.value = withTiming(
        target,
        { duration: SPIN_DURATION, easing: Easing.out(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(handleSpinFinished)(prize);
        }
      );
    } catch (e: any) {
      setSpinning(false);
      setErrorMessage(e.message ?? "Couldn't spin the wheel. Please try again.");
    }
  };

  const handleContinue = () => {
    router.replace('/(main)');
  };

  return (
    <View className="flex-1 bg-[#0F0D0C] items-center justify-center px-6">
      <VideoView
        player={videoPlayer}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        pointerEvents="none"
      />
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(15,13,12,0.72)' }]}
        pointerEvents="none"
      />

      {/* Screen Header (fades in as the wheel lands) */}
      <Animated.View style={uiFadeStyle} className="items-center mb-6">
        <View className="flex-row items-center bg-[#85140E]/80 border border-[#D4A017]/40 px-3.5 py-1 rounded-full mb-2">
          <Ionicons name="sparkles" size={12} color="#F4ECE1" />
          <Text className="text-[#F4ECE1] font-inter-bold text-[10px] uppercase tracking-widest ml-1.5">
            Member Welcome Privilege
          </Text>
        </View>
        <Text className="text-[#F4ECE1] text-2xl font-display-bold text-center tracking-tight">
          Welcome to Al Paninos
        </Text>
        <Text className="text-[#F4ECE1]/70 text-center text-xs mt-1 max-w-[280px] font-inter-medium leading-4">
          One complimentary turn on the house. Your prize is automatically banked into your account.
        </Text>
      </Animated.View>

      {/* Wheel Assembly. The pointer and shockwave sit outside the zooming,
          twisting part, so the pointer stays upright as it drops in. */}
      <View style={{ width: RING_SIZE, height: RING_SIZE + 30, alignItems: 'center' }}>
        <Animated.View
          pointerEvents="none"
          style={[styles.shockwaveRing, { width: RING_SIZE, height: RING_SIZE, top: 18 }, shockwaveStyle]}
        />

        <Animated.View style={[styles.pointer, pointerAnimatedStyle]}>
          <Ionicons name="caret-down" size={34} color={BRASS} />
        </Animated.View>

        <Animated.View style={[entranceWheelStyle, { width: RING_SIZE, height: RING_SIZE, marginTop: 18 }]}>
          {/* A faint gold band that breathes behind the lights (and a soft
              glow around the rim on iPhone). */}
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.haloGlow, haloStyle]} />
          <BrassRim phase={lightsPhase} />

          <Animated.View
            style={[
              {
                position: 'absolute',
                left: RING_MARGIN,
                top: RING_MARGIN,
                width: WHEEL_SIZE,
                height: WHEEL_SIZE,
              },
              animatedWheelStyle,
            ]}
          >
            <Svg width={WHEEL_SIZE} height={WHEEL_SIZE}>
              {WHEEL_SEGMENTS.map((seg, i) => (
                <Path
                  key={seg.index}
                  d={describeSlice(R, R, R - 2, i * WHEEL_SEGMENT_ANGLE, (i + 1) * WHEEL_SEGMENT_ANGLE)}
                  fill={seg.color}
                  stroke={BRASS}
                  strokeWidth={1.5}
                />
              ))}
              <Circle cx={R} cy={R} r={R - 2} fill="none" stroke={BRASS} strokeWidth={2.5} />
            </Svg>

            {WHEEL_SEGMENTS.map((seg, i) => {
              const midAngle = i * WHEEL_SEGMENT_ANGLE + WHEEL_SEGMENT_ANGLE / 2;
              const { x, y } = polarToCartesian(R, R, LABEL_RADIUS, midAngle);
              const lineCount = seg.label.split('\n').length;
              const labelHeight = lineCount * LABEL_LINE_HEIGHT;
              return (
                <View
                  key={seg.index}
                  style={{
                    position: 'absolute',
                    left: x - LABEL_WIDTH / 2,
                    top: y - labelHeight / 2,
                    width: LABEL_WIDTH,
                    transform: [{ rotate: `${midAngle}deg` }],
                  }}
                >
                  {/* Dark text on the gold Grand Prize wedge -- cream on gold is hard to read. */}
                  <Text style={[styles.segmentLabel, i === GRAND_PRIZE_INDEX && { color: '#1C1917' }]}>
                    {seg.label}
                  </Text>
                </View>
              );
            })}

            <View
              style={[
                styles.centerHub,
                {
                  width: HUB_SIZE,
                  height: HUB_SIZE,
                  borderRadius: HUB_SIZE / 2,
                  left: R - HUB_SIZE / 2,
                  top: R - HUB_SIZE / 2,
                },
              ]}
            >
              <Image
                source={require('../../assets/logo.jpg')}
                style={{ width: HUB_SIZE - 6, height: HUB_SIZE - 6, borderRadius: (HUB_SIZE - 6) / 2 }}
                resizeMode="cover"
              />
            </View>
          </Animated.View>
        </Animated.View>
      </View>

      {errorMessage && (
        <Text className="text-[#F4ECE1] bg-[#85140E] px-4 py-2 rounded-xl mt-6 text-center text-xs font-inter-semibold">
          {errorMessage}
        </Text>
      )}

      {/* Spin Button */}
      {!result && (
        <Animated.View style={[pulseStyle, uiFadeStyle]} className="mt-8">
          <TouchableOpacity
            onPress={handleSpin}
            disabled={spinning || !uiReady}
            activeOpacity={0.88}
            // The gold glow is a style object, not a shadow-* class (see lib/shadows.ts).
            style={styles.spinButtonGlow}
            className={`px-14 py-4 rounded-full items-center border border-[#D4A017]/60 ${
              spinning ? 'bg-stone-800' : 'bg-[#85140E] active:bg-[#6B110B]'
            }`}
          >
            <View className="flex-row items-center">
              <Ionicons name={spinning ? 'sync-outline' : 'sparkles'} size={16} color="#F4ECE1" style={{ marginRight: 8 }} />
              <Text className="text-[#F4ECE1] font-display-bold text-lg tracking-widest">
                {spinning ? 'SPINNING...' : 'TAP TO SPIN'}
              </Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Result panel -- slides up from the bottom. No prize code shown:
          code prizes already appear on the Deals tab (tap to apply) and
          on Profile ("Redeem Now"), so there's nothing to copy down here. */}
      {result && (
        <View style={StyleSheet.absoluteFill} className="justify-end bg-black/75">
          <ConfettiBurst count={isBigWin ? 70 : 24} />

          <Animated.View
            style={[styles.resultSheet, sheetAnimatedStyle]}
            className="bg-[#FAF6F0] rounded-t-[36px] p-6 pb-10 items-center shadow-2xl border-t-2 border-[#D4A017]"
          >
            <View className="w-10 h-1 bg-stone-300 rounded-full mb-5" />

            {/* Prize photo, in a round brass frame */}
            <View className="mb-4">
              {imageLoading ? (
                <View className="w-24 h-24 rounded-full bg-stone-200 items-center justify-center border-2 border-stone-300">
                  <ActivityIndicator color="#85140E" size="small" />
                </View>
              ) : prizeImageUrl ? (
                <View className="w-24 h-24 rounded-full overflow-hidden border-2 border-[#D4A017] shadow-md bg-stone-100">
                  <Image
                    source={{ uri: prizeImageUrl }}
                    className="w-full h-full"
                    resizeMode="cover"
                    // A missing file shows the gift icon rather than an empty frame.
                    onError={() => setPrizeImageUrl(null)}
                  />
                </View>
              ) : (
                <View className="w-24 h-24 rounded-full bg-[#1C1917] border-2 border-[#D4A017] items-center justify-center shadow-md">
                  <Ionicons name={isBigWin ? 'trophy' : 'gift'} size={30} color={BRASS} />
                </View>
              )}
            </View>

            <View className="items-center mb-6">
              <View className="bg-[#85140E] px-3.5 py-1 rounded-full mb-2 flex-row items-center">
                <Ionicons name={isBigWin ? 'trophy-outline' : 'gift-outline'} size={12} color="#F4ECE1" />
                <Text className="text-[#F4ECE1] text-[10px] font-inter-bold ml-1.5 uppercase tracking-widest">
                  {isBigWin ? 'Grand Prize Winner' : result.code ? 'Gift Added to Deals' : 'Added to Your Account'}
                </Text>
              </View>

              <Text className="text-2xl font-display-bold text-[#1C1917] text-center tracking-tight">
                {result.title}
              </Text>

              <Text className="text-stone-500 text-xs text-center mt-1 px-4 leading-4">
                {result.code
                  ? "It's waiting for you on the Deals tab and on your Profile -- redeem it whenever you're ready. It never expires."
                  : "It's already been added to your account -- no code needed."}
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleContinue}
              className="bg-[#85140E] py-4 rounded-2xl items-center w-full shadow-md flex-row justify-center active:bg-[#6B110B]"
              activeOpacity={0.9}
            >
              <Text className="text-[#F4ECE1] font-inter-bold text-base mr-2">Start Ordering</Text>
              <Ionicons name="arrow-forward" size={18} color="#F4ECE1" />
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pointer: {
    position: 'absolute',
    top: -8,
    zIndex: 30,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  haloGlow: {
    borderRadius: RING_SIZE / 2,
    backgroundColor: BRASS,
    shadowColor: BRASS,
    shadowOpacity: 0.9,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  shockwaveRing: {
    position: 'absolute',
    borderRadius: RING_SIZE / 2,
    borderWidth: 3,
    borderColor: BRASS,
    zIndex: 1,
  },
  segmentLabel: {
    color: '#F4ECE1',
    // SemiBold rather than Bold: each label sits in a fixed-width box inside
    // a narrow wedge, and the heavier weight is noticeably wider.
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: LABEL_FONT_SIZE,
    textAlign: 'center',
    lineHeight: LABEL_LINE_HEIGHT,
  },
  centerHub: {
    position: 'absolute',
    backgroundColor: '#1C1917',
    borderWidth: 2.5,
    borderColor: BRASS,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  spinButtonGlow: {
    shadowColor: BRASS,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },
  resultSheet: {
    width: '100%',
  },
});
