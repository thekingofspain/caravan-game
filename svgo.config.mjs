// SVGO settings for game art (public/cards, public/icons).
// All SVGs are external assets (CSS background / mask-image) with explicitly
// sized boxes, never inlined: IDs can't collide, intrinsic dimensions are dead.
// Cards render at 0.17-0.61 px/unit, so floatPrecision 1 (≈0.06px max error).
export default {
  multipass: true,
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          convertPathData: { floatPrecision: 1 },
          cleanupNumericValues: { floatPrecision: 1 },
          convertTransform: { floatPrecision: 1, transformPrecision: 1 },
          // Keep <rect> borders as <rect>: the path form is longer.
          convertShapeToPath: false,
        },
      },
    },
    // xlink:href -> native href; removeUnusedNS then drops xmlns:xlink.
    { name: 'removeXlink' },
    // Never add removeViewBox: CSS contain-scaling depends on it.
    { name: 'removeDimensions' },
  ],
};
