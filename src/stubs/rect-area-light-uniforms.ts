/**
 * Stands in for three's RectAreaLightUniformsLib in production builds. IWSDK's
 * light binding calls init() for rect area lights, which Palmlight never uses,
 * and the real module carries 240 KB of lookup tables. See vite.config.ts.
 */
export const RectAreaLightUniformsLib = {
  init(): void {
    // No rect area lights in this game.
  },
};
