import { useEffect, useMemo } from 'react';
import { Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  interpolate,
  Extrapolation,
  SharedValue,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DEFAULT_COLORS = ['#D4A017', '#F4ECE1', '#A61C14', '#FFFFFF'];
const TOTAL_DURATION = 1600;
const FALL_DURATION = 1200;

type Particle = {
  id: number;
  color: string;
  size: number;
  startX: number;
  driftX: number;
  fallY: number;
  rotateStart: number;
  rotateSpin: number;
  delay: number;
};

function buildParticles(count: number, colors: string[]): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const startX = (Math.random() - 0.5) * SCREEN_WIDTH * 0.7;
    return {
      id: i,
      color: colors[i % colors.length],
      size: 6 + Math.random() * 6,
      startX,
      driftX: startX + (Math.random() - 0.5) * 160,
      fallY: 260 + Math.random() * 240,
      rotateStart: Math.random() * 360,
      rotateSpin: Math.random() * 720 - 360,
      delay: Math.random() * (TOTAL_DURATION - FALL_DURATION),
    };
  });
}

// Every particle rides the same shared "progress" clock (one animation, not
// N independent ones) -- each just reads its own slice of it via `delay`,
// which is what staggers the burst instead of every piece falling in
// lockstep.
function ConfettiPiece({ particle, progress }: { particle: Particle; progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const elapsed = progress.value * TOTAL_DURATION - particle.delay;
    const t = Math.min(1, Math.max(0, elapsed / FALL_DURATION));
    return {
      opacity: interpolate(t, [0, 0.08, 0.85, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: interpolate(t, [0, 1], [particle.startX, particle.driftX], Extrapolation.CLAMP) },
        { translateY: interpolate(t, [0, 1], [-20, particle.fallY], Extrapolation.CLAMP) },
        { rotate: `${particle.rotateStart + t * particle.rotateSpin}deg` },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: 0,
          left: '50%',
          width: particle.size,
          height: particle.size * 1.6,
          backgroundColor: particle.color,
          borderRadius: 2,
        },
        style,
      ]}
    />
  );
}

// Plays once -- on mount, or (with `playing`) the moment `playing` turns
// true. Mounting it early with playing={false} gets the setup cost (one
// view per particle) out of the way before the moment it's needed, so the
// burst itself starts without a hitch.
export default function ConfettiBurst({
  count = 36,
  colors = DEFAULT_COLORS,
  playing = true,
}: {
  count?: number;
  colors?: string[];
  playing?: boolean;
}) {
  const particles = useMemo(() => buildParticles(count, colors), [count, colors]);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!playing) return;
    progress.value = 0;
    progress.value = withTiming(1, { duration: TOTAL_DURATION, easing: Easing.out(Easing.quad) });
  }, [playing]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 520, overflow: 'hidden' }}
    >
      {particles.map((particle) => (
        <ConfettiPiece key={particle.id} particle={particle} progress={progress} />
      ))}
    </Animated.View>
  );
}
