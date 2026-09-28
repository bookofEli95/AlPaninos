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
import Svg, { Path, Circle, Line, Ellipse, Defs, RadialGradient, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
  interpolateColor,
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

const SCREEN = Dimensions.get('window');

// RING_MARGIN is the thick gold rim and its bulbs outside the wheel's own
// edge. The wheel takes nearly the full screen width (12px each side), capped
// on big phones and by screen height so the header and Spin button still fit
// on short phones.
const RING_MARGIN = 26;
const WHEEL_SIZE = Math.min(340, SCREEN.width - 24 - RING_MARGIN * 2, SCREEN.height * 0.42);
const RING_SIZE = WHEEL_SIZE + RING_MARGIN * 2;
const R = WHEEL_SIZE / 2;
// With 7 segments each wedge is only ~51deg wide, so a label box has to stay
// noticeably narrower than its radius or its corners poke past the wedge's
// edge into the next segment once rotated into place -- LABEL_WIDTH is kept
// well under what the wedge is actually wide at LABEL_RADIUS (see the
// tan(halfAngle) math this is based on) rather than matching it. The text
// grows with the wheel.
const LABEL_RADIUS = R * 0.68;
const LABEL_WIDTH = R * 0.5;
const LABEL_FONT_SIZE = Math.max(9, Math.round(R / 15));
const LABEL_LINE_HEIGHT = LABEL_FONT_SIZE + 2;
const HUB_SIZE = WHEEL_SIZE * 0.24;
const EXTRA_SPINS = 6;
const SPIN_DURATION = 4200;
// The pull-back before a spin launches.
const WIND_UP_MS = 130;
const LIGHT_COUNT = 28;
const GOLD = '#FFC72C';
const GOLD_DEEP = '#D4A017';
const GOLD_LIGHT = '#FFE58A';
// Matches the GRAND PRIZE segment in lib/wheelPrizes.ts (prize_index 3 in
// the spin_wheel migration) -- the one win that gets the bigger celebration.
const GRAND_PRIZE_INDEX = 3;
// The win reveal's big prize photo and the gold rays around it -- a bit
// smaller on short phones so the whole jackpot card (ribbon, photo, prize,
// button) still fits on screen.
const PRIZE_FRAME_SIZE = Math.round(Math.min(210, SCREEN.height * 0.25));
const SUNBURST_SIZE = Math.round(PRIZE_FRAME_SIZE * 1.38);
// The slowly turning spotlight beams behind everything.
const BEAMS_SIZE = Math.max(SCREEN.width, SCREEN.height) * 1.5;
const CONFETTI_COLORS = ['#FFC72C', '#E11D2E', '#FFE58A', '#FFFFFF', '#B3121F'];

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function describeSlice(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  return [`M ${cx} ${cy}`, `L ${start.x} ${start.y}`, `A ${r} ${r} 0 0 0 ${end.x} ${end.y}`, 'Z'].join(' ');
}

// Lightens (amount > 0) or darkens (< 0) a #RRGGBB colour, for each wedge's
// shading: darker at the hub, brighter at the rim.
function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// A ring of bulbs around the wheel with a single "chase head" (marquee-light
// style) sweeping around them -- driven by one shared clock (phase) rather
// than each bulb animating independently, so there's exactly one animation
// loop regardless of LIGHT_COUNT. While the wheel spins (boost 0 -> 1) the
// bulbs swell and the lit head tightens, on top of the clock running 4x
// faster. Once a prize is won (celebrate = 1) every other bulb flashes in
// turn, like a jackpot. Each bulb has a soft glow disc behind it. On the way
// in, the bulbs switch on one by one around the rim (powered counts up from
// 0 to LIGHT_COUNT), the newest one flaring bright, like a machine powering
// up.
function RimLight({
  index,
  phase,
  boost,
  celebrate,
  powered,
}: {
  index: number;
  phase: SharedValue<number>;
  boost: SharedValue<number>;
  celebrate: SharedValue<number>;
  powered: SharedValue<number>;
}) {
  const angle = (360 / LIGHT_COUNT) * index;
  const { x, y } = polarToCartesian(RING_SIZE / 2, RING_SIZE / 2, RING_SIZE / 2 - RING_MARGIN / 2, angle);
  const baseRadius = index % 2 === 0 ? 4.2 : 3.4;
  const color = index % 2 === 0 ? GOLD_LIGHT : '#FFFFFF';

  const brightness = (phaseValue: number, boostValue: number, celebrateValue: number) => {
    'worklet';
    if (index >= powered.value) return 0.05;
    if (powered.value < LIGHT_COUNT && index >= powered.value - 1.5) return 1;
    if (celebrateValue > 0.5) {
      const flip = Math.floor(phaseValue * 6) % 2;
      return (index + flip) % 2 === 0 ? 1 : 0.25;
    }
    const head = phaseValue * LIGHT_COUNT;
    let dist = Math.abs(head - index);
    dist = Math.min(dist, LIGHT_COUNT - dist);
    const glow = Math.max(0, 1 - dist / (3 - boostValue * 1.2));
    return 0.3 + glow * 0.7;
  };

  const bulbProps = useAnimatedProps(() => ({
    opacity: brightness(phase.value, boost.value, celebrate.value),
    r: baseRadius + boost.value * 0.9,
  }));
  const glowProps = useAnimatedProps(() => ({
    opacity: brightness(phase.value, boost.value, celebrate.value) * 0.45,
    r: baseRadius + 4 + boost.value * 1.5,
  }));

  return (
    <>
      <AnimatedCircle cx={x} cy={y} r={baseRadius + 4} fill={color} animatedProps={glowProps} />
      <AnimatedCircle cx={x} cy={y} r={baseRadius} fill={color} animatedProps={bulbProps} />
    </>
  );
}

// The thick polished-gold rim around the wheel with the bulbs set into it.
function GoldRim({
  phase,
  boost,
  celebrate,
  powered,
}: {
  phase: SharedValue<number>;
  boost: SharedValue<number>;
  celebrate: SharedValue<number>;
  powered: SharedValue<number>;
}) {
  const c = RING_SIZE / 2;
  const bandRadius = c - RING_MARGIN / 2;
  return (
    <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="rimGold" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={GOLD_LIGHT} />
          <Stop offset="0.45" stopColor={GOLD} />
          <Stop offset="0.75" stopColor={GOLD_DEEP} />
          <Stop offset="1" stopColor="#8A6508" />
        </LinearGradient>
      </Defs>
      <Circle cx={c} cy={c} r={bandRadius} fill="none" stroke="url(#rimGold)" strokeWidth={RING_MARGIN - 2} />
      <Circle cx={c} cy={c} r={c - 1.5} fill="none" stroke="#5C4003" strokeWidth={1.5} />
      <Circle cx={c} cy={c} r={c - RING_MARGIN + 1} fill="none" stroke="#5C4003" strokeWidth={1.5} />
      {Array.from({ length: LIGHT_COUNT }, (_, i) => (
        <RimLight key={i} index={i} phase={phase} boost={boost} celebrate={celebrate} powered={powered} />
      ))}
    </Svg>
  );
}

// The pointer: a gold arrow with a ruby set in its top, drawn rather than an
// icon so it reads as part of the machine.
function Pointer() {
  return (
    <Svg width={46} height={56} viewBox="0 0 46 56">
      <Defs>
        <LinearGradient id="pointerGold" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={GOLD_DEEP} />
          <Stop offset="0.5" stopColor={GOLD_LIGHT} />
          <Stop offset="1" stopColor={GOLD_DEEP} />
        </LinearGradient>
      </Defs>
      <Path d="M4 14 Q23 2 42 14 L23 54 Z" fill="url(#pointerGold)" stroke="#5C4003" strokeWidth={2} strokeLinejoin="round" />
      <Circle cx={23} cy={16} r={7} fill="#E11D2E" stroke="#7A0E0A" strokeWidth={1.5} />
      <Circle cx={21} cy={14} r={2.2} fill="#FFFFFF" opacity={0.85} />
    </Svg>
  );
}

// One of the gold sparks that fly out from the rim when the wheel slams
// down. All of them ride one shared progress clock (0 -> 1).
const SPARK_COUNT = 18;
function Spark({ index, progress }: { index: number; progress: SharedValue<number> }) {
  const angle = ((index * (360 / SPARK_COUNT) + (index % 2) * 9 - 90) * Math.PI) / 180;
  const startRadius = RING_SIZE / 2 - 6;
  const travel = 60 + (index % 3) * 26;
  const size = index % 3 === 0 ? 9 : 6;
  const color = index % 3 === 0 ? GOLD_LIGHT : index % 3 === 1 ? GOLD : '#FFFFFF';
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
          left: RING_SIZE / 2 - size / 2,
          top: RING_SIZE / 2 - size / 2,
          width: size,
          height: size,
          backgroundColor: color,
          borderRadius: 1.5,
          shadowColor: GOLD,
          shadowOpacity: 1,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 0 },
        },
        style,
      ]}
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

  // Entrance, about 1.25s in all:
  //   * thrown onto the stage -- the wheel spins in (1.5 turns) while
  //     zooming down from 3.2x, and slams to 0.88x;
  //   * impact -- heavy thud, the screen shakes, a gold then a red
  //     shockwave ring blast out, gold sparks fly off the rim, the stage
  //     lights up and the spotlight beams flare on;
  //   * the rim bulbs power up one by one, the logo flips like a coin and
  //     a shine sweeps across the glass;
  //   * the pointer drops in, the title drops from above and the Spin
  //     button bounces up from below.
  const entranceScale = useSharedValue(3.2);
  const entranceRotation = useSharedValue(-540);
  const entranceOpacity = useSharedValue(0.1);
  const shockwaveScale = useSharedValue(0.6);
  const shockwaveOpacity = useSharedValue(0);
  const shockwave2Scale = useSharedValue(0.6);
  const shockwave2Opacity = useSharedValue(0);
  const shakeX = useSharedValue(0);
  const shakeY = useSharedValue(0);
  const sparkProgress = useSharedValue(0);
  const stageDim = useSharedValue(0.55);
  const beamsOpacity = useSharedValue(0);
  const lightsPowered = useSharedValue(0);
  const hubFlip = useSharedValue(0);
  const shineSweep = useSharedValue(0);
  const headerOpacity = useSharedValue(0);
  const headerY = useSharedValue(-140);
  const buttonOpacity = useSharedValue(0);
  const buttonY = useSharedValue(140);
  const entranceTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pointerDropY = useSharedValue(-50);
  // Its own fade, so the pointer isn't left hanging in mid-air before the
  // wheel lands -- it appears as it drops.
  const pointerOpacity = useSharedValue(0);
  // The button is invisible until it has bounced in -- it ignores taps
  // until then, so a quick tap can't start a spin mid-landing.
  const [uiReady, setUiReady] = useState(false);

  const rotation = useSharedValue(0);
  const haloPulse = useSharedValue(0.3);
  const lightsPhase = useSharedValue(0);
  const lightsBoost = useSharedValue(0);
  const lightsCelebrate = useSharedValue(0);
  const beamsRotation = useSharedValue(0);
  const titleGlow = useSharedValue(1);
  // A white flash across the screen the moment the wheel stops on a prize.
  const winFlash = useSharedValue(0);
  // The pointer's flick as each peg passes it (degrees; 0 = at rest).
  const pointerFlap = useSharedValue(0);
  // Win reveal: gold rays turning slowly behind the prize photo, which pops in.
  const sunburstRotation = useSharedValue(0);
  const prizePopScale = useSharedValue(0.1);
  const pulseScale = useSharedValue(1);
  // The jackpot card punching into the middle of the screen.
  const cardScale = useSharedValue(0.3);
  const cardOpacity = useSharedValue(0);
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

  // The JS-side half of the impact: the thud, and a light tick as the rim
  // bulbs power up.
  const onImpact = () => {
    triggerImpactThud();
    entranceTimeouts.current = Array.from({ length: 7 }, (_, k) =>
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}), 80 + k * 75)
    );
  };

  useEffect(() => {
    const landing = { duration: 520, easing: Easing.bezier(0.12, 1, 0.2, 1) };
    entranceOpacity.value = withTiming(1, { duration: 120 });
    // The entrance spin is on the assembly, not the wheel disk itself
    // (that's `rotation`), so it can never throw off where a spin lands.
    entranceRotation.value = withTiming(0, landing);
    entranceScale.value = withTiming(0.88, landing, (finished) => {
      if (!finished) return;
      runOnJS(onImpact)();
      // Screen shake
      shakeX.value = withSequence(
        withTiming(12, { duration: 40 }),
        withTiming(-10, { duration: 50 }),
        withTiming(7, { duration: 50 }),
        withTiming(-4, { duration: 50 }),
        withTiming(0, { duration: 50 })
      );
      shakeY.value = withSequence(
        withTiming(-6, { duration: 40 }),
        withTiming(5, { duration: 50 }),
        withTiming(-3, { duration: 50 }),
        withTiming(0, { duration: 60 })
      );
      // Gold shockwave, then a red one right behind it
      shockwaveScale.value = withTiming(1.6, { duration: 420, easing: Easing.out(Easing.quad) });
      shockwaveOpacity.value = withSequence(
        withTiming(0.95, { duration: 40 }),
        withTiming(0, { duration: 380, easing: Easing.out(Easing.cubic) })
      );
      shockwave2Scale.value = withDelay(90, withTiming(1.9, { duration: 480, easing: Easing.out(Easing.quad) }));
      shockwave2Opacity.value = withDelay(
        90,
        withSequence(withTiming(0.8, { duration: 40 }), withTiming(0, { duration: 440, easing: Easing.out(Easing.cubic) }))
      );
      // Sparks fly, the stage lights up, the beams flare on and settle
      sparkProgress.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) });
      stageDim.value = withTiming(0, { duration: 250 });
      beamsOpacity.value = withSequence(withTiming(1, { duration: 80 }), withTiming(0.5, { duration: 800 }));
      entranceScale.value = withSpring(1, { damping: 12, stiffness: 150, mass: 0.85 });
      // Bulbs power up around the rim
      lightsPowered.value = withDelay(60, withTiming(LIGHT_COUNT, { duration: 520, easing: Easing.linear }));
      // Coin flip on the logo, then a shine across the glass
      hubFlip.value = withDelay(200, withTiming(360, { duration: 650, easing: Easing.out(Easing.cubic) }));
      shineSweep.value = withDelay(450, withTiming(1, { duration: 600, easing: Easing.inOut(Easing.quad) }));
      // Pointer, title and button land in turn
      pointerOpacity.value = withDelay(100, withTiming(1, { duration: 120 }));
      pointerDropY.value = withDelay(120, withSpring(0, { damping: 10, stiffness: 140 }));
      headerOpacity.value = withDelay(260, withTiming(1, { duration: 120 }));
      headerY.value = withDelay(260, withSpring(0, { damping: 9, stiffness: 120 }));
      buttonY.value = withDelay(520, withSpring(0, { damping: 9, stiffness: 130 }));
      buttonOpacity.value = withDelay(
        520,
        withTiming(1, { duration: 200 }, (done) => {
          if (done) runOnJS(setUiReady)(true);
        })
      );
    });
    // The gold glow behind the rim breathes, the spotlight beams turn, and
    // the title pulses -- all from the start.
    haloPulse.value = withRepeat(withTiming(0.75, { duration: 1100, easing: Easing.inOut(Easing.ease) }), -1, true);
    beamsRotation.value = withRepeat(withTiming(360, { duration: 40000, easing: Easing.linear }), -1, false);
    titleGlow.value = withRepeat(withTiming(1.06, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);

    // Safety net: if the entrance ever gets interrupted, everything still
    // shows up and the button still works.
    const fallback = setTimeout(() => {
      stageDim.value = 0;
      beamsOpacity.value = 0.5;
      lightsPowered.value = LIGHT_COUNT;
      pointerOpacity.value = 1;
      pointerDropY.value = 0;
      headerOpacity.value = 1;
      headerY.value = 0;
      buttonOpacity.value = 1;
      buttonY.value = 0;
      setUiReady(true);
    }, 2500);
    return () => {
      clearTimeout(fallback);
      entranceTimeouts.current.forEach(clearTimeout);
    };
    // Runs once, on mount -- shared values never change identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chasing rim lights run continuously from mount -- a casino wheel's
  // marquee lights don't wait for anything -- race while it spins, and
  // flash jackpot-style once there's a prize. (Restarting the clock from 0
  // on each switch is a one-frame jump nobody can see in blinking bulbs.)
  useEffect(() => {
    const fast = spinning || !!result;
    lightsPhase.value = 0;
    lightsPhase.value = withRepeat(
      withTiming(1, { duration: fast ? 280 : 1400, easing: Easing.linear }),
      -1,
      false
    );
    lightsBoost.value = withTiming(spinning ? 1 : 0, { duration: 300 });
    lightsCelebrate.value = result ? 1 : 0;
  }, [spinning, result, lightsPhase, lightsBoost, lightsCelebrate]);

  // The win reveal: just after the flash, the jackpot card punches into the
  // middle of the screen (0.3 -> 1.08 -> 1), the rays start turning, and the
  // big prize photo pops forward a beat later.
  useEffect(() => {
    if (!result) return;
    sunburstRotation.value = 0;
    sunburstRotation.value = withRepeat(withTiming(360, { duration: 10000, easing: Easing.linear }), -1, false);
    cardScale.value = 0.3;
    cardOpacity.value = 0;
    cardScale.value = withDelay(
      280,
      withSequence(
        withTiming(1.08, { duration: 380, easing: Easing.bezier(0.12, 1, 0.2, 1) }),
        withSpring(1, { damping: 11, stiffness: 140 })
      )
    );
    cardOpacity.value = withDelay(260, withTiming(1, { duration: 200 }));
    prizePopScale.value = 0.1;
    prizePopScale.value = withDelay(
      420,
      withSequence(
        withTiming(1.15, { duration: 380, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
        withSpring(1, { damping: 10, stiffness: 130 })
      )
    );
  }, [result, sunburstRotation, cardScale, cardOpacity, prizePopScale]);

  // The spin button pulses to draw the eye while idle, and settles down
  // once the wheel is actually moving (or the prize is showing) rather than
  // pulsing behind the disabled state.
  useEffect(() => {
    if (spinning || result) {
      pulseScale.value = withTiming(1, { duration: 200 });
    } else {
      pulseScale.value = withRepeat(withTiming(1.07, { duration: 650, easing: Easing.inOut(Easing.ease) }), -1, true);
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
  const beamsStyle = useAnimatedStyle(() => ({
    opacity: beamsOpacity.value,
    transform: [{ rotate: `${beamsRotation.value}deg` }],
  }));
  const shockwave2Style = useAnimatedStyle(() => ({
    opacity: shockwave2Opacity.value,
    transform: [{ scale: shockwave2Scale.value }],
  }));
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }, { translateY: shakeY.value }],
  }));
  const stageDimStyle = useAnimatedStyle(() => ({ opacity: stageDim.value }));
  const hubFlipStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 800 }, { rotateY: `${hubFlip.value}deg` }],
  }));
  const shineStyle = useAnimatedStyle(() => ({
    opacity: shineSweep.value > 0 && shineSweep.value < 1 ? 1 : 0,
    transform: [{ translateX: -WHEEL_SIZE * 0.7 + shineSweep.value * WHEEL_SIZE * 1.9 }, { rotate: '20deg' }],
  }));
  const headerStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ translateY: headerY.value }],
  }));
  const buttonEntranceStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
    transform: [{ translateY: buttonY.value }],
  }));
  const titleStyle = useAnimatedStyle(() => ({ transform: [{ scale: titleGlow.value }] }));
  const winFlashStyle = useAnimatedStyle(() => ({ opacity: winFlash.value }));
  const pointerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: pointerOpacity.value,
    transform: [{ translateY: pointerDropY.value }, { rotate: `${pointerFlap.value}deg` }],
  }));
  const sunburstStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${sunburstRotation.value}deg` }] }));
  const prizePopStyle = useAnimatedStyle(() => ({ transform: [{ scale: prizePopScale.value }] }));
  const cardAnimatedStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));
  // The jackpot card's gold border glows and pulses in time with the rim
  // lights (the same clock) -- a smooth swell rather than an on/off flash.
  const cardGlowStyle = useAnimatedStyle(() => {
    const beat = 0.5 + 0.5 * Math.sin(lightsPhase.value * Math.PI * 2);
    return {
      borderColor: interpolateColor(beat, [0, 1], [GOLD_DEEP, GOLD_LIGHT]),
      shadowOpacity: 0.45 + beat * 0.55,
      shadowRadius: 22 + beat * 22,
    };
  });

  const handleSpinFinished = useCallback(
    (prize: PrizeResult) => {
      setSpinning(false);
      setResult(prize);
      winFlash.value = withSequence(withTiming(0.95, { duration: 70 }), withTiming(0, { duration: 520 }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    },
    [winFlash]
  );

  // A peg knocking the pointer: it flicks sideways (the wheel turns
  // clockwise, so the tip is pushed right -- a counter-clockwise turn about
  // its top) and snaps back.
  const flickPointer = () => {
    pointerFlap.value = withSequence(
      withTiming(-22, { duration: 20, easing: Easing.linear }),
      withSpring(0, { damping: 9, stiffness: 220 })
    );
  };

  // Mimics a mechanical wheel's ratchet -- frequent ticks early, spacing out
  // as it "slows down", instead of just one haptic at the very end. Each tick
  // also flicks the pointer.
  const scheduleTicks = (totalDuration: number) => {
    tickTimeouts.current.forEach(clearTimeout);
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    // Starts as the wind-up (see handleSpin) launches into the spin.
    let t = WIND_UP_MS;
    let gap = 45;
    while (t < totalDuration - 180) {
      t += gap;
      timeouts.push(
        setTimeout(() => {
          flickPointer();
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

      // Wind-up: the wheel pulls back a few degrees, then slingshots
      // forward. It still ends on exactly `target`, so where it lands is
      // unchanged.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      scheduleTicks(SPIN_DURATION);
      rotation.value = withSequence(
        withTiming(-8, { duration: WIND_UP_MS, easing: Easing.out(Easing.quad) }),
        withTiming(target, { duration: SPIN_DURATION, easing: Easing.out(Easing.cubic) }, (finished) => {
          if (finished) runOnJS(handleSpinFinished)(prize);
        })
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
    <View className="flex-1 bg-[#12060A] items-center justify-center px-3">
      <VideoView
        player={videoPlayer}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        pointerEvents="none"
      />
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(40,6,10,0.62)' }]}
        pointerEvents="none"
      />

      {/* Spotlight beams turning slowly behind everything */}
      <Animated.View pointerEvents="none" style={[styles.beams, beamsStyle]}>
        <Svg width={BEAMS_SIZE} height={BEAMS_SIZE} viewBox="0 0 200 200">
          {Array.from({ length: 16 }, (_, i) => {
            const a1 = ((i * 22.5 - 5) * Math.PI) / 180;
            const a2 = ((i * 22.5 + 5) * Math.PI) / 180;
            return (
              <Path
                key={i}
                d={`M100 100 L${100 + 100 * Math.cos(a1)} ${100 + 100 * Math.sin(a1)} L${100 + 100 * Math.cos(a2)} ${100 + 100 * Math.sin(a2)} Z`}
                fill={i % 2 === 0 ? GOLD : '#E11D2E'}
                opacity={0.2}
              />
            );
          })}
        </Svg>
      </Animated.View>

      {/* The stage starts dark and lights up on impact */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, stageDimStyle]} />

      {/* Everything on stage shakes together on impact */}
      <Animated.View style={[{ alignItems: 'center' }, shakeStyle]}>
      {/* Screen Header -- drops in from above after the wheel lands */}
      <Animated.View style={headerStyle} className="items-center mb-3">
        <Text style={styles.kicker}>★ WELCOME BONUS ★</Text>
        <Animated.Text style={[styles.title, titleStyle]}>SPIN TO WIN!</Animated.Text>
        <Text className="text-[#FFF4D6] text-center text-xs mt-0.5 max-w-[300px] font-inter-semibold leading-4">
          Welcome to Al Paninos! One free spin, and every prize is a winner.
        </Text>
      </Animated.View>

      {/* Wheel Assembly. The pointer and shockwave sit outside the zooming,
          twisting part, so the pointer stays upright as it drops in. */}
      <View style={{ width: RING_SIZE, height: RING_SIZE + 34, alignItems: 'center' }}>
        <Animated.View
          pointerEvents="none"
          style={[styles.shockwaveRing, { width: RING_SIZE, height: RING_SIZE, top: 22 }, shockwaveStyle]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.shockwaveRing,
            { width: RING_SIZE, height: RING_SIZE, top: 22, borderColor: '#E11D2E', borderWidth: 5 },
            shockwave2Style,
          ]}
        />
        <View pointerEvents="none" style={{ position: 'absolute', top: 22, width: RING_SIZE, height: RING_SIZE, zIndex: 2 }}>
          {Array.from({ length: SPARK_COUNT }, (_, i) => (
            <Spark key={i} index={i} progress={sparkProgress} />
          ))}
        </View>

        <Animated.View style={[styles.pointer, pointerAnimatedStyle]}>
          <Pointer />
        </Animated.View>

        <Animated.View style={[entranceWheelStyle, { width: RING_SIZE, height: RING_SIZE, marginTop: 22 }]}>
          {/* A gold glow that breathes around the rim (soft halo on iPhone). */}
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.haloGlow, haloStyle]} />
          <GoldRim phase={lightsPhase} boost={lightsBoost} celebrate={lightsCelebrate} powered={lightsPowered} />

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
              <Defs>
                {WHEEL_SEGMENTS.map((seg) => {
                  // Black can't get darker at the hub, so it just gets a
                  // subtle glossy lift towards the rim instead.
                  const isBlack = parseInt(seg.color.slice(1), 16) < 0x333333;
                  return (
                    <RadialGradient
                      key={seg.index}
                      id={`seg${seg.index}`}
                      cx={R}
                      cy={R}
                      r={R}
                      gradientUnits="userSpaceOnUse"
                    >
                      <Stop offset="0" stopColor={isBlack ? seg.color : shade(seg.color, -0.35)} />
                      <Stop offset="0.55" stopColor={seg.color} />
                      <Stop offset="1" stopColor={shade(seg.color, isBlack ? 0.16 : 0.22)} />
                    </RadialGradient>
                  );
                })}
              </Defs>
              {WHEEL_SEGMENTS.map((seg, i) => (
                <Path
                  key={seg.index}
                  d={describeSlice(R, R, R - 2, i * WHEEL_SEGMENT_ANGLE, (i + 1) * WHEEL_SEGMENT_ANGLE)}
                  fill={`url(#seg${seg.index})`}
                  stroke={GOLD_LIGHT}
                  strokeWidth={2}
                />
              ))}
              {/* A gold rivet at the outer tip of each divider */}
              {WHEEL_SEGMENTS.map((_, i) => {
                const { x, y } = polarToCartesian(R, R, R - 6, i * WHEEL_SEGMENT_ANGLE);
                return <Circle key={`rivet-${i}`} cx={x} cy={y} r={3} fill={GOLD} stroke="#5C4003" strokeWidth={0.8} />;
              })}
              <Circle cx={R} cy={R} r={R - 2} fill="none" stroke={GOLD_LIGHT} strokeWidth={3} />
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
                  {/* Deep red on the gold Grand Prize wedge -- white on gold is hard to read. */}
                  <Text style={[styles.segmentLabel, i === GRAND_PRIZE_INDEX && styles.grandPrizeLabel]}>
                    {seg.label}
                  </Text>
                </View>
              );
            })}

            <Animated.View
              style={[
                hubFlipStyle,
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
                style={{ width: HUB_SIZE - 8, height: HUB_SIZE - 8, borderRadius: (HUB_SIZE - 8) / 2 }}
                resizeMode="cover"
              />
            </Animated.View>
          </Animated.View>

          {/* Glass shine across the top of the wheel -- stays put while the
              wheel turns under it. */}
          <Svg
            pointerEvents="none"
            width={WHEEL_SIZE}
            height={WHEEL_SIZE}
            style={{ position: 'absolute', left: RING_MARGIN, top: RING_MARGIN }}
          >
            <Ellipse cx={R} cy={R * 0.52} rx={R * 0.78} ry={R * 0.42} fill="#FFFFFF" opacity={0.13} />
          </Svg>

          {/* The one-off shine that sweeps across the glass on the way in */}
          <View pointerEvents="none" style={styles.shineClip}>
            <Animated.View style={[styles.shineBand, shineStyle]} />
          </View>
        </Animated.View>
      </View>

      {errorMessage && (
        <Text className="text-[#F4ECE1] bg-[#85140E] px-4 py-2 rounded-xl mt-3 text-center text-xs font-inter-semibold">
          {errorMessage}
        </Text>
      )}

      {/* Spin Button -- polished gold */}
      {!result && (
        <Animated.View style={buttonEntranceStyle} className="mt-4">
        <Animated.View style={pulseStyle}>
          <TouchableOpacity
            onPress={handleSpin}
            disabled={spinning || !uiReady}
            activeOpacity={0.85}
            style={styles.spinButton}
          >
            {/* A plain colour fills the whole button (an SVG gradient didn't
                always stretch to it); the lighter top half gives the shine. */}
            <View pointerEvents="none" style={styles.spinButtonShine} />
            <View className="flex-row items-center">
              <Ionicons name={spinning ? 'sync-outline' : 'sparkles'} size={20} color="#7A0E0A" style={{ marginRight: 8 }} />
              <Text style={styles.spinText}>{spinning ? 'GOOD LUCK!' : 'SPIN!'}</Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
        </Animated.View>
      )}
      </Animated.View>

      {/* The jackpot card -- punches into the middle of the screen over a
          dimmed (not hidden) wheel, so the rim lights keep flashing around
          it. No prize code shown: code prizes already appear on the Deals
          tab and in the cart's deals list (tap to apply), and on Profile. */}
      {result && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]} className="justify-center items-center px-4">
          <ConfettiBurst count={isBigWin ? 160 : 90} colors={CONFETTI_COLORS} />

          <Animated.View style={[styles.jackpotStage, cardAnimatedStyle, cardGlowStyle]}>
            <View style={styles.winnerRibbon}>
              <Ionicons name={isBigWin ? 'trophy' : 'sparkles'} size={15} color={GOLD_LIGHT} style={{ marginRight: 6 }} />
              <Text style={styles.winnerRibbonText}>{isBigWin ? 'JACKPOT WINNER!' : 'CONGRATULATIONS!'}</Text>
            </View>

            {/* The prize photo, popping forward over slowly turning
                gold-and-red rays */}
            <View className="items-center justify-center my-2" style={{ width: SUNBURST_SIZE, height: SUNBURST_SIZE }}>
              <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, sunburstStyle]}>
                <Svg width={SUNBURST_SIZE} height={SUNBURST_SIZE} viewBox="0 0 100 100">
                  {Array.from({ length: 16 }, (_, i) => {
                    const a = (i * 22.5 * Math.PI) / 180;
                    return (
                      <Line
                        key={i}
                        x1={50 + 26 * Math.cos(a)}
                        y1={50 + 26 * Math.sin(a)}
                        x2={50 + 49 * Math.cos(a)}
                        y2={50 + 49 * Math.sin(a)}
                        stroke={i % 2 === 0 ? GOLD : '#E11D2E'}
                        strokeWidth={3.2}
                        strokeOpacity={0.65}
                        strokeDasharray="4, 3"
                        strokeLinecap="round"
                      />
                    );
                  })}
                </Svg>
              </Animated.View>

              <Animated.View style={[styles.heroPrizeFrame, prizePopStyle]}>
                {imageLoading ? (
                  <View className="w-full h-full rounded-full bg-stone-900 items-center justify-center">
                    <ActivityIndicator color={GOLD} size="large" />
                  </View>
                ) : prizeImageUrl ? (
                  <Image
                    source={{ uri: prizeImageUrl }}
                    className="w-full h-full rounded-full"
                    resizeMode="cover"
                    // A missing file shows the icon rather than an empty frame.
                    onError={() => setPrizeImageUrl(null)}
                  />
                ) : (
                  <View className="w-full h-full rounded-full bg-[#1C1917] items-center justify-center">
                    <Ionicons name={isBigWin ? 'trophy' : 'gift'} size={64} color={GOLD} />
                  </View>
                )}
              </Animated.View>
            </View>

            <View className="items-center mb-5 mt-1 px-2">
              <Text style={styles.prizeTitle} numberOfLines={2}>
                {result.title}
              </Text>

              <View className="bg-[#85140E] px-3.5 py-1 rounded-full mt-2.5 flex-row items-center border border-[#FFC72C]/40">
                <Ionicons name={isBigWin ? 'trophy-outline' : 'gift-outline'} size={12} color="#F4ECE1" />
                <Text className="text-[#F4ECE1] text-[10px] font-inter-bold ml-1.5 uppercase tracking-widest">
                  {isBigWin ? 'Grand Prize Winner' : result.code ? 'Gift Added to Deals' : 'Added to Your Account'}
                </Text>
              </View>

              <Text className="text-stone-300 text-xs text-center mt-2 px-2 leading-4 font-inter-medium">
                {result.code
                  ? "It's waiting on the Deals tab and in your cart's deals list. Redeem it whenever you're ready -- it never expires."
                  : "We've deposited it into your account -- ready to use on your next order."}
              </Text>
            </View>

            <TouchableOpacity onPress={handleContinue} activeOpacity={0.88} style={styles.claimButton}>
              <View pointerEvents="none" style={styles.spinButtonShine} />
              <View className="flex-row items-center">
                <Text style={styles.claimButtonText}>CLAIM & START ORDER</Text>
                <Ionicons name="arrow-forward" size={18} color="#7A0E0A" style={{ marginLeft: 6 }} />
              </View>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}

      {/* The win flash -- above everything, never blocks a tap */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#FFF7D6' }, winFlashStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  beams: {
    position: 'absolute',
    width: BEAMS_SIZE,
    height: BEAMS_SIZE,
    left: (SCREEN.width - BEAMS_SIZE) / 2,
    top: (SCREEN.height - BEAMS_SIZE) / 2,
  },
  kicker: {
    color: GOLD_LIGHT,
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 11,
    letterSpacing: 3,
    textShadowColor: 'rgba(255,140,0,0.9)',
    textShadowRadius: 8,
  },
  title: {
    color: GOLD,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 38,
    letterSpacing: 1,
    marginTop: 2,
    textShadowColor: '#FF6A00',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  pointer: {
    position: 'absolute',
    top: -6,
    zIndex: 30,
    // Flicks swing about its top, like a real pointer on a pin.
    transformOrigin: 'top center',
    shadowColor: '#000',
    shadowOpacity: 0.7,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  haloGlow: {
    borderRadius: RING_SIZE / 2,
    backgroundColor: GOLD,
    transform: [{ scale: 1.04 }],
    shadowColor: GOLD,
    shadowOpacity: 1,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
  },
  shineClip: {
    position: 'absolute',
    left: RING_MARGIN,
    top: RING_MARGIN,
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
    borderRadius: WHEEL_SIZE / 2,
    overflow: 'hidden',
  },
  shineBand: {
    position: 'absolute',
    top: -WHEEL_SIZE * 0.25,
    left: 0,
    width: WHEEL_SIZE * 0.28,
    height: WHEEL_SIZE * 1.5,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  shockwaveRing: {
    position: 'absolute',
    borderRadius: RING_SIZE / 2,
    borderWidth: 4,
    borderColor: GOLD_LIGHT,
    zIndex: 1,
  },
  segmentLabel: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: LABEL_FONT_SIZE,
    textAlign: 'center',
    lineHeight: LABEL_LINE_HEIGHT,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  grandPrizeLabel: {
    color: '#7A0E0A',
    textShadowColor: 'rgba(255,255,255,0.6)',
  },
  centerHub: {
    position: 'absolute',
    backgroundColor: '#1C1917',
    borderWidth: 4,
    borderColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  spinButton: {
    paddingHorizontal: 56,
    paddingVertical: 16,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFF4D6',
    shadowColor: GOLD,
    shadowOpacity: 0.8,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  spinButtonShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  spinText: {
    color: '#7A0E0A',
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 24,
    letterSpacing: 2,
  },
  jackpotStage: {
    width: Math.min(360, SCREEN.width - 24),
    backgroundColor: '#160E11',
    borderRadius: 36,
    paddingVertical: 24,
    paddingHorizontal: 18,
    alignItems: 'center',
    borderWidth: 3,
    borderColor: GOLD,
    shadowColor: GOLD,
    shadowOpacity: 0.65,
    shadowRadius: 36,
    shadowOffset: { width: 0, height: 0 },
    elevation: 20,
  },
  winnerRibbon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E11D2E',
    borderWidth: 1.5,
    borderColor: GOLD,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 4,
    shadowColor: '#E11D2E',
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  winnerRibbonText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 13,
    letterSpacing: 2,
  },
  heroPrizeFrame: {
    width: PRIZE_FRAME_SIZE,
    height: PRIZE_FRAME_SIZE,
    borderRadius: PRIZE_FRAME_SIZE / 2,
    borderWidth: 4.5,
    borderColor: GOLD,
    backgroundColor: '#1C1917',
    padding: 4,
    shadowColor: GOLD,
    shadowOpacity: 0.9,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
    elevation: 18,
  },
  prizeTitle: {
    color: '#F4ECE1',
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 26,
    textAlign: 'center',
    letterSpacing: -0.5,
    lineHeight: 30,
    textShadowColor: 'rgba(255, 199, 44, 0.4)',
    textShadowRadius: 12,
  },
  claimButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FFF4D6',
    shadowColor: GOLD,
    shadowOpacity: 0.7,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 2 },
    elevation: 10,
    marginTop: 4,
  },
  claimButtonText: {
    color: '#7A0E0A',
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 15,
    letterSpacing: 1.5,
  },
});
