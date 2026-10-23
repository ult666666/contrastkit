/** Small linear-algebra and angle helpers shared by the color conversions. */

export type Vector3 = readonly [number, number, number];
export type Matrix3 = readonly [Vector3, Vector3, Vector3];

/** Multiplies a 3×3 matrix (given as rows) by a column vector. */
export function multiply(matrix: Matrix3, [x, y, z]: Vector3): Vector3 {
  const [row0, row1, row2] = matrix;
  return [
    row0[0] * x + row0[1] * y + row0[2] * z,
    row1[0] * x + row1[1] * y + row1[2] * z,
    row2[0] * x + row2[1] * y + row2[2] * z,
  ];
}

/** Determinant of a 3×3 matrix (cofactor expansion along the first row). */
export function determinant([[a, b, c], [d, e, f], [g, h, i]]: Matrix3): number {
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}

/** Wraps an angle in degrees into [0, 360). */
export function normalizeHue(degrees: number): number {
  const wrapped = degrees % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** Restricts `value` to the closed interval [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
