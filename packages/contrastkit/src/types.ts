/**
 * A color in the sRGB color space, which is the space CSS hex, `rgb()`, `hsl()` and named
 * colors are defined in. Channels are gamma-encoded (the familiar 0–255 values divided by
 * 255) and lie in [0, 1]. `alpha` is opacity in [0, 1].
 */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly alpha: number;
}

/**
 * sRGB with the transfer function ("gamma") removed, so each channel is proportional to
 * emitted light. Luminance, color-matrix operations and OKLab conversion happen here.
 */
export interface LinearRgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * OKLab (Ottosson 2020): `l` is perceived lightness in [0, 1], `a` runs green → red and
 * `b` runs blue → yellow. Euclidean distance in this space approximates perceived difference.
 */
export interface Oklab {
  readonly l: number;
  readonly a: number;
  readonly b: number;
  readonly alpha: number;
}

/**
 * OKLCH, the polar form of OKLab: `l` is lightness in [0, 1], `c` is chroma (colorfulness,
 * at most about 0.32 inside sRGB) and `h` is the hue angle in degrees, in [0, 360).
 */
export interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
  readonly alpha: number;
}

/** HSL as defined by CSS: `h` in degrees [0, 360), `s` and `l` in [0, 1]. */
export interface Hsl {
  readonly h: number;
  readonly s: number;
  readonly l: number;
  readonly alpha: number;
}

/** What public functions accept as a color: any supported CSS color string, or an {@link Rgb}. */
export type ColorInput = string | Rgb;
