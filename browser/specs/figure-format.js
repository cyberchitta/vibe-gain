/**
 * A figure as text: whole numbers without decimals, others to two decimals
 * below 10 and one above, trailing zeros dropped (153, 300.5, 0.18).
 * @param {number} v
 * @returns {string}
 */
export function formatFigure(v) {
  if (Number.isInteger(v)) return String(v);
  return String(Number(v.toFixed(Math.abs(v) < 10 ? 2 : 1)));
}
