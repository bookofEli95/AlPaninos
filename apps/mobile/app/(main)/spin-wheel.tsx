import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useBackHandler } from '../../hooks/useBackHandler';
import { WHEEL_SEGMENTS, WHEEL_SEGMENT_ANGLE } from '../../lib/wheelPrizes';

const WHEEL_SIZE = Math.min(300, Dimensions.get('window').width - 80);
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

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function describeSlice(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  return [`M ${cx} ${cy}`, `L ${start.x} ${start.y}`, `A ${r} ${r} 0 0 0 ${end.x} ${end.y}`, 'Z'].join(' ');
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
  const rotation = useSharedValue(0);

  // This screen is the mandatory first thing a new registered user sees
  // (see app/_layout.tsx's navigation guard) -- there's nothing to go back
  // to yet, so the hardware back button / system back gesture is swallowed
  // instead of following the usual pattern of returning somewhere.
  useBackHandler(() => {});

  const animatedWheelStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const handleSpinFinished = useCallback((prize: PrizeResult) => {
    setSpinning(false);
    setResult(prize);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

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

      rotation.value = withTiming(
        target,
        { duration: 4200, easing: Easing.out(Easing.cubic) },
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
      <Text className="text-[#F4ECE1] text-3xl font-extrabold text-center mb-2">Welcome to AlPaninos!</Text>
      <Text className="text-[#F4ECE1] opacity-80 text-center mb-10 text-base">
        Spin the wheel for a one-time welcome prize.
      </Text>

      <View style={{ width: WHEEL_SIZE, height: WHEEL_SIZE + 30, alignItems: 'center' }}>
        <View style={styles.pointer}>
          <Ionicons name="caret-down" size={36} color="#F4ECE1" />
        </View>

        <Animated.View style={[{ width: WHEEL_SIZE, height: WHEEL_SIZE, marginTop: 20 }, animatedWheelStyle]}>
          <Svg width={WHEEL_SIZE} height={WHEEL_SIZE}>
            {WHEEL_SEGMENTS.map((seg, i) => (
              <Path
                key={seg.index}
                d={describeSlice(R, R, R - 2, i * WHEEL_SEGMENT_ANGLE, (i + 1) * WHEEL_SEGMENT_ANGLE)}
                fill={seg.color}
                stroke="#F4ECE1"
                strokeWidth={2}
              />
            ))}
            <Circle cx={R} cy={R} r={R - 2} fill="none" stroke="#F4ECE1" strokeWidth={3} />
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

      {errorMessage && (
        <Text className="text-[#F4ECE1] bg-[#A61C14] px-4 py-2 rounded-lg mt-8 text-center">{errorMessage}</Text>
      )}

      {!result && (
        <TouchableOpacity
          onPress={handleSpin}
          disabled={spinning}
          className={`mt-10 px-10 py-4 rounded-full items-center shadow-lg ${spinning ? 'bg-stone-600' : 'bg-[#A61C14] active:bg-[#85140E]'}`}
        >
          <Text className="text-[#F4ECE1] font-extrabold text-xl tracking-wide">
            {spinning ? 'Spinning...' : 'SPIN'}
          </Text>
        </TouchableOpacity>
      )}

      {result && (
        <View style={StyleSheet.absoluteFill} className="items-center justify-center bg-black/70 px-6">
          <View className="bg-[#FAF6F0] rounded-3xl p-6 w-full items-center shadow-xl">
            <Text className="text-4xl mb-2">🎉</Text>
            <Text className="text-[#78716C] font-bold uppercase tracking-wider text-xs mb-1">You Won</Text>
            <Text className="text-2xl font-extrabold text-[#1C1917] text-center mb-4">{result.title}</Text>

            {result.code ? (
              <View className="bg-white border-2 border-dashed border-[#A61C14] rounded-xl px-6 py-3 mb-4">
                <Text className="text-[#A61C14] font-extrabold text-xl tracking-widest">{result.code}</Text>
              </View>
            ) : (
              <Text className="text-[#78716C] text-center mb-4">
                We've added it to your account -- no code needed.
              </Text>
            )}

            {result.code && (
              <Text className="text-[#78716C] text-center text-sm mb-6">
                Enter this code in the Promo Code box at checkout to redeem it. It never expires.
              </Text>
            )}

            <TouchableOpacity
              onPress={handleContinue}
              className="bg-[#A61C14] px-8 py-3.5 rounded-xl items-center w-full active:bg-[#85140E]"
            >
              <Text className="text-[#F4ECE1] font-bold text-lg">Let's Eat</Text>
            </TouchableOpacity>
          </View>
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
    fontWeight: 'bold',
    fontSize: LABEL_FONT_SIZE,
    textAlign: 'center',
    lineHeight: LABEL_LINE_HEIGHT,
  },
  centerHub: {
    position: 'absolute',
    backgroundColor: '#F4ECE1',
    borderWidth: 3,
    borderColor: '#A61C14',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
