import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Dimensions, ActivityIndicator } from 'react-native';
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
import * as Clipboard from 'expo-clipboard';
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
    return { opacity: 0.28 + glow * 0.72 };
  });
  return (
    <AnimatedCircle
      cx={x}
      cy={y}
      r={index % 2 === 0 ? 5 : 4}
      fill={index % 2 === 0 ? '#D4A017' : '#F4ECE1'}
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
  const [copied, setCopied] = useState(false);
  const [prizeImageUrl, setPrizeImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const rotation = useSharedValue(0);
  const lightsPhase = useSharedValue(0);
  const pulseScale = useSharedValue(1);
  const cardScale = useSharedValue(0.7);
  const cardOpacity = useSharedValue(0);
  const tickTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  const videoPlayer = useVideoPlayer(require('../../assets/videos/wheel-background.mp4'), (player) => {
    player.loop = true;
    player.muted = true;
    player.play();
  });

  const isBigWin = result?.index === 3;

  const handleCopyCode = async (code: string) => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // This screen is the mandatory first thing a new registered user sees
  // (see app/_layout.tsx's navigation guard) -- there's nothing to go back
  // to yet, so the hardware back button / system back gesture is swallowed
  // instead of following the usual pattern of returning somewhere.
  useBackHandler(() => {});

  // Chasing rim lights run continuously from mount -- a casino wheel's
  // marquee lights don't wait for anything.
  useEffect(() => {
    lightsPhase.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.linear }), -1, false);
  }, []);

  // The SPIN button pulses to draw the eye while idle, and settles down
  // once the wheel is actually moving (or the prize is showing) rather than
  // pulsing behind the disabled state.
  useEffect(() => {
    if (spinning || result) {
      pulseScale.value = withTiming(1, { duration: 200 });
    } else {
      pulseScale.value = withRepeat(withTiming(1.06, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true);
    }
  }, [spinning, result]);

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

  // Bounce the win card in rather than have it just appear.
  useEffect(() => {
    if (result) {
      cardScale.value = withTiming(1, { duration: 450, easing: Easing.out(Easing.back(1.6)) });
      cardOpacity.value = withTiming(1, { duration: 250 });
    } else {
      cardScale.value = 0.7;
      cardOpacity.value = 0;
    }
  }, [result]);

  useEffect(() => {
    return () => {
      tickTimeouts.current.forEach(clearTimeout);
    };
  }, []);

  const animatedWheelStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulseScale.value }] }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
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
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]}
        pointerEvents="none"
      />

      <Text className="text-[#F4ECE1] text-3xl font-display-bold text-center mb-2">Welcome to Al Paninos!</Text>
      <Text className="text-[#F4ECE1] opacity-80 text-center mb-10 text-base">
        Spin the wheel for a one-time welcome prize.
      </Text>

      <View style={{ width: RING_SIZE, height: RING_SIZE + 30, alignItems: 'center' }}>
        <View style={styles.pointer}>
          <Ionicons name="caret-down" size={36} color="#D4A017" />
        </View>

        <View style={{ width: RING_SIZE, height: RING_SIZE, marginTop: 20 }}>
          <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
            {Array.from({ length: LIGHT_COUNT }, (_, i) => (
              <RimLight key={i} index={i} phase={lightsPhase} />
            ))}
          </Svg>

          <Animated.View
            style={[
              { position: 'absolute', left: RING_MARGIN, top: RING_MARGIN, width: WHEEL_SIZE, height: WHEEL_SIZE },
              animatedWheelStyle,
            ]}
          >
            <Svg width={WHEEL_SIZE} height={WHEEL_SIZE}>
              {WHEEL_SEGMENTS.map((seg, i) => (
                <Path
                  key={seg.index}
                  d={describeSlice(R, R, R - 2, i * WHEEL_SEGMENT_ANGLE, (i + 1) * WHEEL_SEGMENT_ANGLE)}
                  fill={seg.color}
                  stroke="#D4A017"
                  strokeWidth={2}
                />
              ))}
              <Circle cx={R} cy={R} r={R - 2} fill="none" stroke="#D4A017" strokeWidth={3} />
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

            <View style={[styles.centerHub, { width: HUB_SIZE, height: HUB_SIZE, borderRadius: HUB_SIZE / 2, left: R - HUB_SIZE / 2, top: R - HUB_SIZE / 2 }]}>
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
        <Text className="text-[#F4ECE1] bg-[#A61C14] px-4 py-2 rounded-lg mt-8 text-center">{errorMessage}</Text>
      )}

      {!result && (
        <Animated.View style={pulseStyle} className="mt-10">
          <TouchableOpacity
            onPress={handleSpin}
            disabled={spinning}
            className={`px-10 py-4 rounded-full items-center shadow-lg ${spinning ? 'bg-stone-600' : 'bg-[#A61C14] active:bg-[#85140E]'}`}
            style={!spinning ? styles.spinGlow : undefined}
          >
            <Text className="text-[#F4ECE1] font-display-bold text-xl tracking-wide">
              {spinning ? 'Spinning...' : 'SPIN'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {result && (
        <View style={StyleSheet.absoluteFill} className="items-center justify-center bg-black/70 px-6">
          <ConfettiBurst count={isBigWin ? 70 : 36} />

          <Animated.View style={cardStyle} className="w-full items-center">
            <View className="bg-[#FAF6F0] rounded-3xl p-6 w-full items-center shadow-xl border-2 border-[#D4A017]">
              <Text className="text-4xl mb-2">{isBigWin ? '🏆' : '🎉'}</Text>
              <Text className="text-[#78716C] font-inter-bold uppercase tracking-wider text-xs mb-1">You Won</Text>
              <Text className="text-2xl font-display-bold text-[#1C1917] text-center mb-4">{result.title}</Text>

              {result.index >= 0 && (
                <View className="mb-4">
                  {imageLoading ? (
                    <View style={{ width: 168, height: 168 }} className="rounded-full bg-stone-200 items-center justify-center">
                      <ActivityIndicator color="#A61C14" />
                    </View>
                  ) : prizeImageUrl ? (
                    <View style={{ width: 168, height: 168 }} className="rounded-full overflow-hidden border-4 border-[#D4A017] shadow-lg">
                      <Image source={{ uri: prizeImageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    </View>
                  ) : (
                    <View style={{ width: 168, height: 168 }} className="rounded-full bg-[#A61C14] items-center justify-center border-4 border-[#D4A017] shadow-lg">
                      <Text style={{ fontSize: 64 }}>{result.index === 3 ? '🏆' : result.index === 6 ? '💰' : '🎁'}</Text>
                    </View>
                  )}
                </View>
              )}

              {result.code ? (
                <TouchableOpacity
                  onPress={() => handleCopyCode(result.code!)}
                  className="flex-row items-center bg-white border-2 border-dashed border-[#A61C14] rounded-xl px-6 py-3 mb-4"
                >
                  <Text className="text-[#A61C14] font-inter-extrabold text-xl tracking-widest mr-3">{result.code}</Text>
                  <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={20} color="#A61C14" />
                </TouchableOpacity>
              ) : (
                <Text className="text-[#78716C] text-center mb-4">
                  We've added it to your account -- no code needed.
                </Text>
              )}

              {result.code && (
                <Text className="text-[#78716C] text-center text-sm mb-6">
                  {copied
                    ? 'Copied! Paste it in the Promo Code box at checkout to redeem it.'
                    : 'Tap the code to copy it. Enter it in the Promo Code box at checkout to redeem it. It never expires.'}
                </Text>
              )}

              <TouchableOpacity
                onPress={handleContinue}
                className="bg-[#A61C14] px-8 py-3.5 rounded-xl items-center w-full active:bg-[#85140E]"
              >
                <Text className="text-[#F4ECE1] font-display text-lg">Let's Eat</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pointer: {
    position: 'absolute',
    top: -6,
    zIndex: 10,
  },
  segmentLabel: {
    color: '#F4ECE1',
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: LABEL_FONT_SIZE,
    textAlign: 'center',
    lineHeight: LABEL_LINE_HEIGHT,
  },
  centerHub: {
    position: 'absolute',
    backgroundColor: '#F4ECE1',
    borderWidth: 3,
    borderColor: '#D4A017',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  spinGlow: {
    shadowColor: '#D4A017',
    shadowOpacity: 0.8,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
});
