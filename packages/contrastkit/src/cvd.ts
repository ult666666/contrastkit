/**
 * Color-vision-deficiency (CVD) simulation.
 *
 * Method: Machado, Oliveira & Fernandes, "A Physiologically-based Model for Simulation of
 * Color Vision Deficiency", IEEE Transactions on Visualization and Computer Graphics 15(6),
 * 2009. The paper models anomalous trichromacy as a shift of one cone type's spectral
 * sensitivity and publishes a 3×3 matrix per deficiency and severity; we use the
 * severity-1.0 matrices, which model dichromacy (a missing cone type).
 *
 * The matrices act on linear-light RGB, so colors are linearized first, multiplied, clipped
 * to the gamut and re-encoded.
 *
 * Limitations: this is an approximation of an average observer, not a picture of what any
 * individual sees. Only full dichromacy is modeled (anomalous trichromacy, the more common
 * condition, is milder). The protanopia and deuteranopia matrices are rank 2 (they collapse
 * one dimension of color, as dichromacy does); the tritanopia matrix is not, and tritan
 * simulations are generally considered less reliable.
 */
import { linearToRgb, rgbToLinear } from './convert';
import { InvalidArgumentError } from './errors';
import { clamp, multiply, type Matrix3 } from './math';
import { toRgb } from './parse';
import type { ColorInput, Rgb } from './types';

/**
 * The three dichromacies: a missing long-wavelength (L, "red") cone, a missing
 * medium-wavelength (M, "green") cone, or a missing short-wavelength (S, "blue") cone.
 */
export type CvdType = 'protanopia' | 'deuteranopia' | 'tritanopia';

export const CVD_TYPES: readonly CvdType[] = ['protanopia', 'deuteranopia', 'tritanopia'];

/**
 * Machado et al. (2009) simulation matrices at severity 1.0, applied to linear RGB.
 * Each row sums to 1 (to six decimals), which is why neutral grays are unchanged.
 */
export const CVD_MATRICES: Readonly<Record<CvdType, Matrix3>> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

/**
 * Simulates how `color` appears with the given dichromacy (Machado et al. 2009, severity
 * 1.0). Alpha is kept. Results are clipped into sRGB: for very saturated inputs the
 * matrices can produce slightly negative channels.
 *
 * @throws {@link InvalidArgumentError} for an unknown deficiency type.
 */
export function simulateCvd(color: ColorInput, type: CvdType): Rgb {
  if (!Object.hasOwn(CVD_MATRICES, type)) {
    throw new InvalidArgumentError(
      `Unknown color vision deficiency "${type}"; expected one of ${CVD_TYPES.join(', ')}`,
    );
  }
  const rgb = toRgb(color);
  const { r, g, b } = rgbToLinear(rgb);
  const [red, green, blue] = multiply(CVD_MATRICES[type], [r, g, b]);
  return linearToRgb(
    { r: clamp(red, 0, 1), g: clamp(green, 0, 1), b: clamp(blue, 0, 1) },
    rgb.alpha,
  );
}
