/**
 * Place one dot per value beside a box, spreading sideways the values that
 * sit close together on the y axis. Values are placed smallest first; each
 * one that lands near earlier ones takes the next slot, alternating right
 * and left of the centre.
 * @param {readonly number[]} values - as drawn (already clamped to any floor)
 * @param {number} center - x position of the column
 * @param {object} axis
 * @param {boolean} axis.log - nearness in decades on a log axis, else in units
 * @param {number} axis.span - the y domain's width, for a linear axis
 * @returns {{ value: number, x: number }[]}
 */
export function swarm(values, center, { log, span }) {
  const step = 0.045;
  const pos = (/** @type {number} */ v) => (log ? Math.log10(v) : v);
  const gap = log ? 0.05 : 0.02 * span;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.map((value, i) => {
    const near = sorted.slice(0, i).filter((p) => Math.abs(pos(p) - pos(value)) < gap).length;
    const slot = near === 0 ? 0 : (near % 2 ? 1 : -1) * Math.ceil(near / 2);
    return { value, x: center + slot * step };
  });
}
