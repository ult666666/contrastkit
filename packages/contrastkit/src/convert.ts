/**
 * Conversions between sRGB, linear-light sRGB, OKLab, OKLCH and HSL.
 *
 * These are pure math: they do not validate or clamp. Results of `oklabToRgb` /
 * `oklchToRgb` fall outside [0, 1] when the color is outside the sRGB gamut; see
 * `gamutMapOklch` for bringing such colors back in.
 *
 * References:
 * - IEC 61966-2-1:1999 (sRGB) and CSS Color Module Level 4 (sRGB transfer function).
 * - Björn Ottosson, "A perceptual color space for image processing" (2020),
 *   https://bottosson.github.io/posts/oklab/ (OKLab matrices).
 * - CSS Color Module Level 4 (HSL, OKLab and OKLCH definitions).
 */
import { multiply, normalizeHue, type Matrix3 } from './math';
import type { Hsl, LinearRgb, Oklab, Oklch, Rgb } from './types';

/**
 * Chroma below which a color is treated as neutral. Grays converted from sRGB come out with
 * chroma around 1e-8 (rounding in the published matrices), so their hue is meaningless.
 */
export const ACHROMATIC_CHROMA = 1e-6;

/**
 * Decodes one gamma-encoded sRGB channel to linear light (IEC 61966-2-1).
 *
 * The curve has a short linear segment near black (below 0.04045) and a 2.4 power curve
 * above it. Negative values are mirrored, as CSS Color 4 does, so out-of-gamut
 * intermediate results stay well-defined.
 */
export function srgbChannelToLinear(value: number): number {
  const magnitude = Math.abs(value);
  const linear = magnitude <= 0.04045 ? magnitude / 12.92 : ((magnitude + 0.055) / 1.055) ** 2.4;
  return Math.sign(value) * linear;
}

/** Encodes one linear-light channel back to gamma-encoded sRGB; the inverse of {@link srgbChannelToLinear}. */
export function linearChannelToSrgb(value: number): number {
  const magnitude = Math.abs(value);
  const encoded =
    magnitude <= 0.0031308 ? magnitude * 12.92 : 1.055 * magnitude ** (1 / 2.4) - 0.055;
  return Math.sign(value) * encoded;
}

/** Removes the sRGB transfer function from every channel. Alpha is not part of linear RGB. */
export function rgbToLinear({ r, g, b }: Rgb): LinearRgb {
  return { r: srgbChannelToLinear(r), g: srgbChannelToLinear(g), b: srgbChannelToLinear(b) };
}

/** Applies the sRGB transfer function to every channel and attaches `alpha`. */
export function linearToRgb({ r, g, b }: LinearRgb, alpha = 1): Rgb {
  return {
    r: linearChannelToSrgb(r),
    g: linearChannelToSrgb(g),
    b: linearChannelToSrgb(b),
    alpha,
  };
}

// Ottosson's M1: linear sRGB → approximate cone responses (LMS).
const LINEAR_RGB_TO_LMS: Matrix3 = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
];

// Ottosson's M2: cube-rooted LMS → OKLab.
const LMS_ROOT_TO_OKLAB: Matrix3 = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
];

// The published inverses of M2 and M1.
const OKLAB_TO_LMS_ROOT: Matrix3 = [
  [1, 0.3963377774, 0.2158037573],
  [1, -0.1055613458, -0.0638541728],
  [1, -0.0894841775, -1.291485548],
];

const LMS_TO_LINEAR_RGB: Matrix3 = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.707614701],
];

/**
 * Converts linear-light sRGB to OKLab (Ottosson 2020).
 *
 * The color goes to an LMS cone-like space, through a cube root (a simple model of how
 * perceived intensity compresses), then to opponent axes. The cube root is why equal
 * steps in OKLab look roughly equal, which plain RGB distances do not.
 */
export function linearRgbToOklab({ r, g, b }: LinearRgb, alpha = 1): Oklab {
  const [l, m, s] = multiply(LINEAR_RGB_TO_LMS, [r, g, b]);
  const [lightness, a, bAxis] = multiply(LMS_ROOT_TO_OKLAB, [
    Math.cbrt(l),
    Math.cbrt(m),
    Math.cbrt(s),
  ]);
  return { l: lightness, a, b: bAxis, alpha };
}

/** Converts OKLab to linear-light sRGB; the inverse of {@link linearRgbToOklab}. */
export function oklabToLinearRgb({ l, a, b }: Oklab): LinearRgb {
  const [lRoot, mRoot, sRoot] = multiply(OKLAB_TO_LMS_ROOT, [l, a, b]);
  const [red, green, blue] = multiply(LMS_TO_LINEAR_RGB, [lRoot ** 3, mRoot ** 3, sRoot ** 3]);
  return { r: red, g: green, b: blue };
}

/**
 * Converts OKLab to its polar form, OKLCH. Hue is reported as 0 for neutral colors
 * (chroma below {@link ACHROMATIC_CHROMA}), where any angle would be rounding noise.
 */
export function oklabToOklch({ l, a, b, alpha }: Oklab): Oklch {
  const c = Math.hypot(a, b);
  const h = c < ACHROMATIC_CHROMA ? 0 : normalizeHue((Math.atan2(b, a) * 180) / Math.PI);
  return { l, c, h, alpha };
}

/** Converts OKLCH to OKLab. */
export function oklchToOklab({ l, c, h, alpha }: Oklch): Oklab {
  const radians = (h * Math.PI) / 180;
  return { l, a: c * Math.cos(radians), b: c * Math.sin(radians), alpha };
}

/** Converts gamma-encoded sRGB to OKLab. */
export function rgbToOklab(color: Rgb): Oklab {
  return linearRgbToOklab(rgbToLinear(color), color.alpha);
}

/** Converts gamma-encoded sRGB to OKLCH. */
export function rgbToOklch(color: Rgb): Oklch {
  return oklabToOklch(rgbToOklab(color));
}

/** Converts OKLab to gamma-encoded sRGB. Channels fall outside [0, 1] for out-of-gamut colors. */
export function oklabToRgb(color: Oklab): Rgb {
  return linearToRgb(oklabToLinearRgb(color), color.alpha);
}

/** Converts OKLCH to gamma-encoded sRGB. Channels fall outside [0, 1] for out-of-gamut colors. */
export function oklchToRgb(color: Oklch): Rgb {
  return oklabToRgb(oklchToOklab(color));
}

/** Converts HSL to sRGB (the sample algorithm from CSS Color 4). */
export function hslToRgb({ h, s, l, alpha }: Hsl): Rgb {
  const hue = normalizeHue(h);
  const amplitude = s * Math.min(l, 1 - l);
  const channel = (offset: number): number => {
    const k = (offset + hue / 30) % 12;
    return l - amplitude * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return { r: channel(0), g: channel(8), b: channel(4), alpha };
}

/** Converts sRGB (channels in [0, 1]) to HSL. Grays get hue 0 and saturation 0. */
export function rgbToHsl({ r, g, b, alpha }: Rgb): Hsl {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const range = max - min;
  if (range === 0) return { h: 0, s: 0, l, alpha };

  // With range > 0 and channels in [0, 1], l is strictly between 0 and 1.
  const s = (max - l) / Math.min(l, 1 - l);
  let sector: number;
  if (max === r) sector = (g - b) / range + (g < b ? 6 : 0);
  else if (max === g) sector = (b - r) / range + 2;
  else sector = (r - g) / range + 4;
  return { h: normalizeHue(sector * 60), s, l, alpha };
}

/**
 * ΔE_OK: the straight-line distance between two OKLab colors. Because OKLab is roughly
 * perceptually uniform, this approximates how different two colors look; CSS Color 4
 * treats 0.02 as a just-noticeable difference. Alpha is ignored.
 */
export function oklabDistance(a: Oklab, b: Oklab): number {
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}
