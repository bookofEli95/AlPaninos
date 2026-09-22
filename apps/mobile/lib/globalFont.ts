import { StyleSheet, Text, TextInput } from 'react-native';

// Custom fonts in React Native are each their own single-weight font file
// -- unlike the web, setting `fontWeight` on a custom `fontFamily` does
// nothing (most platforms just ignore it and render the file's one native
// weight). Every screen in this app sets weight via NativeWind's
// font-bold/font-extrabold/font-semibold/font-medium classes, so instead of
// hand-editing all ~200 of those usages to name an explicit Inter weight
// file, this patches Text/TextInput's default rendering to translate
// whatever fontWeight was already requested into the matching Inter weight
// -- the whole app picks up Inter as its body font for free.
const WEIGHT_TO_INTER: Record<string, string> = {
  '100': 'Inter_100Thin',
  '200': 'Inter_200ExtraLight',
  '300': 'Inter_300Light',
  '400': 'Inter_400Regular',
  normal: 'Inter_400Regular',
  '500': 'Inter_500Medium',
  '600': 'Inter_600SemiBold',
  '700': 'Inter_700Bold',
  bold: 'Inter_700Bold',
  '800': 'Inter_800ExtraBold',
  '900': 'Inter_900Black',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function patchDefaultFont(Component: any) {
  const originalRender = Component?.render;
  // Text/TextInput are expected to be React.forwardRef components (a
  // mutable {render: fn} object) -- if a future RN version changes that
  // shape, skip patching rather than crash the app; worst case is just the
  // system font instead of Inter everywhere, not a broken app.
  if (typeof originalRender !== 'function') return;
  Component.render = function render(props: any, ref: any) {
    const flat = StyleSheet.flatten(props.style) || {};
    // An explicit fontFamily already set on the element (e.g. the
    // font-display/font-display-bold Fredoka classes used for headlines)
    // always wins -- this only fills in a default when none was set.
    const family = flat.fontFamily || WEIGHT_TO_INTER[String(flat.fontWeight ?? '400')] || 'Inter_400Regular';
    return originalRender.call(this, { ...props, style: [{ fontFamily: family }, props.style] }, ref);
  };
}

let applied = false;

// Call once, before the app's first render (see app/_layout.tsx) -- after
// the Inter font files themselves have loaded via useFonts, or these named
// families won't resolve to anything yet.
export function applyGlobalFont() {
  if (applied) return;
  applied = true;
  try {
    patchDefaultFont(Text);
    patchDefaultFont(TextInput);
  } catch {
    // Same reasoning as the forwardRef-shape guard above -- never let a
    // cosmetic font default take the app down.
  }
}
