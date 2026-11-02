/**
 * Color-vision-deficiency (CVD) simulation.
 *
 * Method: Machado, Oliveira & Fernandes, "A Physiologically-based Model for Simulation of
 * Color Vision Deficiency", IEEE Transactions on Visualization and Computer Graphics 15(6),
 * 2009. The paper models anomalous trichromacy as a shift of one cone type's peak spectral
 * sensitivity and publishes, in its supplementary material, a 3×3 matrix per deficiency for
 * severities 0.0 to 1.0 in steps of 0.1. Severity 0 is typical vision (the identity matrix)
 * and severity 1 is dichromacy, a missing cone type. Between the published steps the matrices
 * are interpolated linearly, as the authors suggest.
 *
 * The matrices act on linear-light RGB, so colors are linearized first, multiplied, clipped
 * to the gamut and re-encoded.
 *
 * Limitations: this is an approximation of an average observer, not a picture of what any
 * individual sees, and severity is the model's parameter, not a clinical measure. The
 * protanopia and deuteranopia matrices are rank 2 (they collapse one dimension of color, as
 * dichromacy does); the tritanopia matrix is not, and tritan simulations are generally
 * considered less reliable.
 */
import { linearToRgb, rgbToLinear } from './convert';
import { InvalidArgumentError } from './errors';
import { clamp, multiply, type Matrix3, type Vector3 } from './math';
import { toRgb } from './parse';
import type { ColorInput, Rgb } from './types';

/**
 * The three dichromacies: a missing long-wavelength (L, "red") cone, a missing
 * medium-wavelength (M, "green") cone, or a missing short-wavelength (S, "blue") cone.
 */
export type CvdType = 'protanopia' | 'deuteranopia' | 'tritanopia';

export const CVD_TYPES: readonly CvdType[] = ['protanopia', 'deuteranopia', 'tritanopia'];

/**
 * The three anomalous trichromacies: all three cone types are present, but one responds to
 * shifted wavelengths. They are more common than the dichromacies and range from mild to
 * severe.
 */
export type AnomalousCvdType = 'protanomaly' | 'deuteranomaly' | 'tritanomaly';

export const ANOMALOUS_CVD_TYPES: readonly AnomalousCvdType[] = [
  'protanomaly',
  'deuteranomaly',
  'tritanomaly',
];

/** Any deficiency that {@link simulateCvd} can simulate. */
export type CvdKind = CvdType | AnomalousCvdType;

/** One simulation: a deficiency and its severity, from 0 (typical vision) to 1 (dichromacy). */
export interface CvdSimulation {
  readonly type: CvdKind;
  readonly severity: number;
}

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
 * Machado et al. (2009), supplementary material: the matrix for each anomalous trichromacy at
 * severities 0.0, 0.1, …, 1.0 (index = severity × 10), applied to linear RGB. The 1.0 entries
 * equal {@link CVD_MATRICES}.
 */
export const ANOMALY_MATRICES: Readonly<Record<AnomalousCvdType, readonly Matrix3[]>> = {
  protanomaly: [
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ], // 0.0
    [
      [0.856167, 0.182038, -0.038205],
      [0.029342, 0.955115, 0.015544],
      [-0.00288, -0.001563, 1.004443],
    ], // 0.1
    [
      [0.734766, 0.334872, -0.069637],
      [0.05184, 0.919198, 0.028963],
      [-0.004928, -0.004209, 1.009137],
    ], // 0.2
    [
      [0.630323, 0.465641, -0.095964],
      [0.069181, 0.890046, 0.040773],
      [-0.006308, -0.007724, 1.014032],
    ], // 0.3
    [
      [0.539009, 0.579343, -0.118352],
      [0.082546, 0.866121, 0.051332],
      [-0.007136, -0.011959, 1.019095],
    ], // 0.4
    [
      [0.458064, 0.679578, -0.137642],
      [0.092785, 0.846313, 0.060902],
      [-0.007494, -0.016807, 1.024301],
    ], // 0.5
    [
      [0.38545, 0.769005, -0.154455],
      [0.100526, 0.829802, 0.069673],
      [-0.007442, -0.02219, 1.029632],
    ], // 0.6
    [
      [0.319627, 0.849633, -0.169261],
      [0.106241, 0.815969, 0.07779],
      [-0.007025, -0.028051, 1.035076],
    ], // 0.7
    [
      [0.259411, 0.923008, -0.18242],
      [0.110296, 0.80434, 0.085364],
      [-0.006276, -0.034346, 1.040622],
    ], // 0.8
    [
      [0.203876, 0.990338, -0.194214],
      [0.112975, 0.794542, 0.092483],
      [-0.005222, -0.041043, 1.046265],
    ], // 0.9
    [
      [0.152286, 1.052583, -0.204868],
      [0.114503, 0.786281, 0.099216],
      [-0.003882, -0.048116, 1.051998],
    ], // 1.0
  ],
  deuteranomaly: [
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ], // 0.0
    [
      [0.866435, 0.177704, -0.044139],
      [0.049567, 0.939063, 0.01137],
      [-0.003453, 0.007233, 0.99622],
    ], // 0.1
    [
      [0.760729, 0.319078, -0.079807],
      [0.090568, 0.889315, 0.020117],
      [-0.006027, 0.013325, 0.992702],
    ], // 0.2
    [
      [0.675425, 0.43385, -0.109275],
      [0.125303, 0.847755, 0.026942],
      [-0.00795, 0.018572, 0.989378],
    ], // 0.3
    [
      [0.605511, 0.52856, -0.134071],
      [0.155318, 0.812366, 0.032316],
      [-0.009376, 0.023176, 0.9862],
    ], // 0.4
    [
      [0.547494, 0.607765, -0.155259],
      [0.181692, 0.781742, 0.036566],
      [-0.01041, 0.027275, 0.983136],
    ], // 0.5
    [
      [0.498864, 0.674741, -0.173604],
      [0.205199, 0.754872, 0.039929],
      [-0.011131, 0.030969, 0.980162],
    ], // 0.6
    [
      [0.457771, 0.731899, -0.18967],
      [0.226409, 0.731012, 0.042579],
      [-0.011595, 0.034333, 0.977261],
    ], // 0.7
    [
      [0.422823, 0.781057, -0.203881],
      [0.245752, 0.709602, 0.044646],
      [-0.011843, 0.037423, 0.974421],
    ], // 0.8
    [
      [0.392952, 0.82361, -0.216562],
      [0.263559, 0.69021, 0.046232],
      [-0.01191, 0.040281, 0.97163],
    ], // 0.9
    [
      [0.367322, 0.860646, -0.227968],
      [0.280085, 0.672501, 0.047413],
      [-0.01182, 0.04294, 0.968881],
    ], // 1.0
  ],
  tritanomaly: [
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ], // 0.0
    [
      [0.92667, 0.092514, -0.019184],
      [0.021191, 0.964503, 0.014306],
      [0.008437, 0.054813, 0.93675],
    ], // 0.1
    [
      [0.89572, 0.13333, -0.02905],
      [0.029997, 0.9454, 0.024603],
      [0.013027, 0.104707, 0.882266],
    ], // 0.2
    [
      [0.905871, 0.127791, -0.033662],
      [0.026856, 0.941251, 0.031893],
      [0.01341, 0.148296, 0.838294],
    ], // 0.3
    [
      [0.948035, 0.08949, -0.037526],
      [0.014364, 0.946792, 0.038844],
      [0.010853, 0.193991, 0.795156],
    ], // 0.4
    [
      [1.017277, 0.027029, -0.044306],
      [-0.006113, 0.958479, 0.047634],
      [0.006379, 0.248708, 0.744913],
    ], // 0.5
    [
      [1.104996, -0.046633, -0.058363],
      [-0.032137, 0.971635, 0.060503],
      [0.001336, 0.317922, 0.680742],
    ], // 0.6
    [
      [1.193214, -0.109812, -0.083402],
      [-0.058496, 0.97941, 0.079086],
      [-0.002346, 0.403492, 0.598854],
    ], // 0.7
    [
      [1.257728, -0.139648, -0.118081],
      [-0.078003, 0.975409, 0.102594],
      [-0.003316, 0.501214, 0.502102],
    ], // 0.8
    [
      [1.278864, -0.125333, -0.153531],
      [-0.084748, 0.957674, 0.127074],
      [-0.000989, 0.601151, 0.399838],
    ], // 0.9
    [
      [1.255528, -0.076749, -0.178779],
      [-0.078411, 0.930809, 0.147602],
      [0.004733, 0.691367, 0.3039],
    ], // 1.0
  ],
};

const DICHROMACY: Readonly<Record<AnomalousCvdType, CvdType>> = {
  protanomaly: 'protanopia',
  deuteranomaly: 'deuteranopia',
  tritanomaly: 'tritanopia',
};

function isDichromacy(type: CvdKind): type is CvdType {
  return Object.hasOwn(CVD_MATRICES, type);
}

function isAnomaly(type: CvdKind): type is AnomalousCvdType {
  return Object.hasOwn(ANOMALY_MATRICES, type);
}

/**
 * The simulation matrix for a deficiency at a severity from 0 to 1: a published matrix when
 * the severity is a multiple of 0.1, otherwise the element-wise linear interpolation
 * `(1 − t) · A + t · B` of the two published matrices around it. Dichromacies only exist at
 * severity 1.
 *
 * @throws {@link InvalidArgumentError} for an unknown type, a severity outside [0, 1], or a
 * dichromacy with a severity other than 1.
 */
export function cvdMatrix(type: CvdKind, severity = 1): Matrix3 {
  if (!isDichromacy(type) && !isAnomaly(type)) {
    throw new InvalidArgumentError(
      `Unknown color vision deficiency "${String(type)}"; expected one of ` +
        [...CVD_TYPES, ...ANOMALOUS_CVD_TYPES].join(', '),
    );
  }
  if (typeof severity !== 'number' || !(severity >= 0 && severity <= 1)) {
    throw new InvalidArgumentError(
      `The severity must be a number from 0 to 1, got ${String(severity)}`,
    );
  }
  if (isDichromacy(type)) {
    if (severity !== 1) {
      const anomaly = ANOMALOUS_CVD_TYPES.find((name) => DICHROMACY[name] === type);
      throw new InvalidArgumentError(
        `${type} is the complete form (severity 1); use ${String(anomaly)} for severity ${severity}`,
      );
    }
    return CVD_MATRICES[type];
  }
  const table = ANOMALY_MATRICES[type];
  const scaled = severity * 10;
  const low = Math.min(Math.floor(scaled), 9);
  const t = scaled - low;
  // The severity was checked, so both neighbours exist.
  const [a, b] = table.slice(low, low + 2) as [Matrix3, Matrix3];
  if (t === 0) return a;
  if (t === 1) return b;
  const row = (i: 0 | 1 | 2): Vector3 => [
    (1 - t) * a[i][0] + t * b[i][0],
    (1 - t) * a[i][1] + t * b[i][1],
    (1 - t) * a[i][2] + t * b[i][2],
  ];
  return [row(0), row(1), row(2)];
}

/**
 * Simulates how `color` appears with a color vision deficiency (Machado et al. 2009). The
 * dichromacies (`protanopia`, `deuteranopia`, `tritanopia`) take no severity; the anomalous
 * trichromacies (`protanomaly`, `deuteranomaly`, `tritanomaly`) take one from 0 to 1, and at
 * 1 they give exactly the matching dichromacy. Alpha is kept. Results are clipped into sRGB:
 * for very saturated inputs the matrices can produce slightly negative channels.
 *
 * @example simulateCvd('#c53030', 'deuteranomaly', 0.6)
 * @throws {@link InvalidArgumentError} for an unknown deficiency type or an invalid severity.
 */
export function simulateCvd(color: ColorInput, type: CvdKind, severity = 1): Rgb {
  const matrix = cvdMatrix(type, severity);
  const rgb = toRgb(color);
  const { r, g, b } = rgbToLinear(rgb);
  const [red, green, blue] = multiply(matrix, [r, g, b]);
  return linearToRgb(
    { r: clamp(red, 0, 1), g: clamp(green, 0, 1), b: clamp(blue, 0, 1) },
    rgb.alpha,
  );
}

/**
 * Reads a simulation written as a dichromacy name (`deuteranopia`) or as an anomalous
 * trichromacy and severity (`deuteranomaly:0.6`), the form the CLI's `--cvd` flag and the web
 * app's links use.
 *
 * @throws {@link InvalidArgumentError} with a specific reason when the text is not one.
 */
export function parseCvdSimulation(text: string): CvdSimulation {
  const [name = '', amount, ...rest] = text.trim().toLowerCase().split(':');
  const type = name as CvdKind;
  if (rest.length > 0 || (!isDichromacy(type) && !isAnomaly(type))) {
    throw new InvalidArgumentError(
      `"${text}" is not a color vision simulation; use ${CVD_TYPES.join(', ')}, or ` +
        `${ANOMALOUS_CVD_TYPES.join(', ')} with a severity such as deuteranomaly:0.6`,
    );
  }
  if (isAnomaly(type) && amount === undefined) {
    throw new InvalidArgumentError(
      `${type} needs a severity from 0 to 1, such as ${type}:0.6 (1 is ${DICHROMACY[type]})`,
    );
  }
  // Each digit run has one way to match, so a long invalid input cannot backtrack.
  const decimal = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/;
  const severity = amount === undefined ? 1 : decimal.test(amount) ? Number(amount) : NaN;
  cvdMatrix(type, severity);
  return { type, severity };
}

/** The text form that {@link parseCvdSimulation} reads, such as `deuteranomaly:0.6`. */
export function formatCvdSimulation({ type, severity }: CvdSimulation): string {
  cvdMatrix(type, severity);
  return isDichromacy(type) ? type : `${type}:${severity}`;
}
