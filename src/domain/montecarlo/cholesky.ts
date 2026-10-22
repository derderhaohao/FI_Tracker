/**
 * Lower-triangular Cholesky factor L of a correlation matrix (C = L·Lᵀ).
 * Matrices that are not positive definite are repaired by shrinking the
 * off-diagonal terms toward zero until the factorisation succeeds.
 */
export function cholesky(matrix: readonly (readonly number[])[]): number[][] {
  const n = matrix.length;
  for (let shrink = 1; shrink >= 0; shrink -= 0.05) {
    const L = tryCholesky(matrix, n, Math.max(shrink, 0));
    if (L) return L;
  }
  return identity(n);
}

function tryCholesky(m: readonly (readonly number[])[], n: number, shrink: number): number[][] | null {
  const L = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      const mij = i === j ? m[i][j] : m[i][j] * shrink;
      let sum = mij;
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        if (sum <= 1e-12) return null;
        L[i][j] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }
  return L;
}

export function identity(n: number): number[][] {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
}

/** out = L · z, for a lower-triangular L. */
export function correlate(
  L: readonly (readonly number[])[],
  z: ArrayLike<number>,
  out: Float64Array,
): Float64Array {
  const n = L.length;
  for (let i = 0; i < n; i++) {
    let s = 0;
    const row = L[i];
    for (let k = 0; k <= i; k++) s += row[k] * z[k];
    out[i] = s;
  }
  return out;
}
