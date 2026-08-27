export default {
  multipass: true,
  js2svg: { pretty: false },
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          // Keep the viewBox: the card box ratio (212/329) is derived from it,
          // and CSS uses background-size: contain, so it must stay.
          removeViewBox: false,
          // Round coordinates. Cards render ~100px tall, so 2 decimals is
          // sub-pixel safe and is the single biggest size win.
          convertPathData: { floatPrecision: 2 },
          convertTransform: { floatPrecision: 2 },
          // cleanupIds (on by default) is safe: IDs (SCA/VCA/B1/B2) are only
          // referenced internally via <use>, so SVGO keeps refs in sync.
        },
      },
    },
    // CSS sizes the card via background-size: contain; the box ratio equals the
    // viewBox ratio, so the intrinsic width/height are redundant -> drop them.
    "removeDimensions",
    // Reorder attributes for better gzip/brotli compression across the 56 files.
    "sortAttrs",
    // `face="AC"` etc. is dead data not used by the app -> strip it.
    { name: "removeAttrs", params: { attrs: ["face"] } },
  ],
};
