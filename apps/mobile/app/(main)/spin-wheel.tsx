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

// RING_MARGIN reserves room for the chasing light bulbs outside the wheel's
// own edge -- baked into WHEEL_SIZE's cap (not just RING_SIZE) so the whole
// assembly, bulbs included, still fits the same width-80 safety margin the
// plain wheel used to reserve on its own.
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
  const { x, y } = polarToCartesian(RING_SIZE / 2, RING_SIZE / 2, RING_SIZE / 2 - 9, angle);
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

  const rotation = useSharedValue(0);
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
    let gap = 55;
    while (t < totalDuration - 150) {
      t += gap;
      timeouts.push(
        setTimeout(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }, t)
      );
      gap = Math.min(gap * 1.16, 380);
    }
    tickTimeouts.current = timeouts;
  };

  const handleSpin = async () => {
    if (spinning || result) return;
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
    <View className="flex-1 bg-[#1C1917] items-center justify-center px-6">
      <VideoView
        player={videoPlayer}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        pointerEvents="none"
      />
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.65)' }]}
        pointerEvents="none"
      />

      {/* Screen Header */}
      <View className="items-center mb-6">
        <Text className="text-[#F4ECE1] opacity-70 font-inter-bold text-xs uppercase tracking-widest mb-1.5">
          Welcome Perk
        </Text>
        <Text className="text-[#F4ECE1] text-2xl font-display-bold text-center tracking-tight">
          Welcome to Al Paninos
        </Text>
        <Text className="text-[#F4ECE1] opacity-70 text-center text-xs mt-1 max-w-[260px]">
          Spin the wheel for a one-time welcome prize.
        </Text>
      </View>

      {/* Wheel Assembly */}
      <View style={{ width: RING_SIZE, height: RING_SIZE + 30, alignItems: 'center' }}>
        <View style={styles.pointer}>
          <Ionicons name="caret-down" size={34} color="#F4ECE1" />
        </View>

        <View style={{ width: RING_SIZE, height: RING_SIZE, marginTop: 18 }}>
          <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
            {Array.from({ length: LIGHT_COUNT }, (_, i) => (
              <RimLight key={i} index={i} phase={lightsPhase} />
            ))}
          </Svg>

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
                  stroke="#1C1917"
                  strokeWidth={1.5}
                />
              ))}
              <Circle cx={R} cy={R} r={R - 2} fill="none" stroke="#F4ECE1" strokeWidth={2} />
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
                  <Text style={styles.segmentLabel}>{seg.label}</Text>
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
                style={{ width: HUB_SIZE, height: HUB_SIZE, borderRadius: HUB_SIZE / 2 }}
                resizeMode="cover"
              />
            </View>
          </Animated.View>
        </View>
      </View>

      {errorMessage && (
        <Text className="text-[#F4ECE1] bg-[#A61C14] px-4 py-2 rounded-xl mt-6 text-center text-xs font-inter-medium">
          {errorMessage}
        </Text>
      )}

      {/* Spin Button */}
      {!result && (
        <Animated.View style={pulseStyle} className="mt-8">
          <TouchableOpacity
            onPress={handleSpin}
            disabled={spinning}
            className={`px-12 py-3.5 rounded-full items-center shadow-lg ${
              spinning ? 'bg-stone-700' : 'bg-[#A61C14] active:bg-[#85140E]'
            }`}
          >
            <Text className="text-[#F4ECE1] font-display-bold text-lg tracking-wider">
              {spinning ? 'SPINNING...' : 'TAP TO SPIN'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Result panel -- slides up from the bottom. No prize code shown:
          code prizes already appear on the Deals tab (tap to apply) and
          on Profile ("Redeem Now"), so there's nothing to copy down here. */}
      {result && (
        <View style={StyleSheet.absoluteFill} className="justify-end bg-black/60">
          <ConfettiBurst count={isBigWin ? 70 : 24} />

          <Animated.View
            style={[styles.resultSheet, sheetAnimatedStyle]}
            className="bg-[#FAF6F0] rounded-t-[32px] p-6 pb-10 items-center shadow-2xl border-t border-stone-200"
          >
            {/* Prize photo */}
            <View className="mb-3.5">
              {imageLoading ? (
                <View className="w-24 h-24 rounded-2xl bg-stone-200 items-center justify-center">
                  <ActivityIndicator color="#A61C14" size="small" />
                </View>
              ) : prizeImageUrl ? (
                <Image
                  source={{ uri: prizeImageUrl }}
                  className="w-24 h-24 rounded-2xl bg-stone-100 border border-stone-200 shadow-sm"
                  resizeMode="cover"
                />
              ) : (
                <View className="w-20 h-20 rounded-2xl bg-white border border-stone-200 items-center justify-center shadow-sm">
                  <Ionicons name={isBigWin ? 'trophy' : 'gift'} size={32} color="#A61C14" />
                </View>
              )}
            </View>

            <View className="items-center mb-5">
              {isBigWin && (
                <Text className="text-[#A61C14] font-inter-extrabold text-xs uppercase tracking-widest mb-1.5">
                  🏆 Grand Prize Winner
                </Text>
              )}
              <View className="bg-emerald-100 px-3 py-0.5 rounded-full mb-1.5 flex-row items-center">
                <Ionicons name="checkmark-circle" size={13} color="#047857" />
                <Text className="text-emerald-800 text-[11px] font-inter-bold ml-1 uppercase tracking-wider">
                  Gift Added to Deals
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
              className="bg-[#A61C14] py-3.5 rounded-2xl items-center w-full shadow-sm flex-row justify-center active:bg-[#85140E]"
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
    zIndex: 10,
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
    backgroundColor: '#F4ECE1',
    borderWidth: 2,
    borderColor: '#1C1917',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  resultSheet: {
    width: '100%',
  },
});
