// Same look as Tailwind's shadow-sm, as a plain style object.
//
// Use this (via the style prop) instead of a shadow-* class whenever the
// shadow is switched on and off by state -- e.g. `isSelected ? ... : ...`.
// NativeWind builds shadow-* classes out of CSS variables, and a component
// that only starts using variables after its first render triggers
// react-native-css-interop's "upgrade warning", whose own props dump then
// crashes the app ("Couldn't find a navigation context"). A style object
// never goes through that path, so it's safe to toggle.
export const shadowSm = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 2,
  elevation: 1,
};
