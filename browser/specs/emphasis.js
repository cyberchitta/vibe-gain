/**
 * The opacity of a series that is not emphasized, as a factor on the
 * opacity it is otherwise drawn at: a mark drawn unseen stays unseen.
 */
export const DIM_OPACITY = 0.2;

/**
 * The ids to dim when `emphasize` names some of `ids`; null when it names
 * none, so that a chart with nothing emphasized is built as without it.
 * An id that matches nothing is the caller's bug, so it throws.
 * @param {string} chart - the chart's function, for the message
 * @param {readonly string[]} ids - every series' id, in order
 * @param {readonly string[] | undefined} emphasize
 * @returns {Set<string> | null}
 */
export function dimmedIds(chart, ids, emphasize) {
  if (!emphasize || emphasize.length === 0) return null;
  const known = new Set(ids);
  if (known.size < ids.length) {
    const twice = ids.find((id, i) => ids.indexOf(id) !== i);
    throw new Error(`${chart}: id "${twice}" names two series; give each group its own id to emphasize it`);
  }
  const unknown = emphasize.find((id) => !known.has(id));
  if (unknown !== undefined) {
    throw new Error(`${chart}: emphasize names "${unknown}", which is not among the ids: ${ids.map((id) => `"${id}"`).join(", ")}`);
  }
  const lit = new Set(emphasize);
  return new Set(ids.filter((id) => !lit.has(id)));
}

/**
 * An opacity scaled by DIM_OPACITY, rounded so that specs read cleanly.
 * @param {number} opacity
 */
export function dim(opacity) {
  return Math.round(opacity * DIM_OPACITY * 1000) / 1000;
}
