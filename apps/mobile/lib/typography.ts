import type { TextStyle } from 'react-native';

// Every digit the same width ("tabular figures"), so prices in a column line
// up on the decimal and a running total doesn't shift sideways as it
// changes. A plain style object rather than NativeWind's tabular-nums class:
// that class is built from CSS variables, which can't safely be toggled
// after a component's first render (see lib/shadows.ts).
export const tabularNums: TextStyle = { fontVariant: ['tabular-nums'] };
