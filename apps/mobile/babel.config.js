module.exports = function(api) {
  api.cache(true);
  return {
    presets: [
      // Adds the react-native-worklets plugin (Reanimated) by itself.
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
