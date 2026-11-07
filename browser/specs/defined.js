/**
 * The options a caller set, without those passed as `undefined`, so that
 * spreading them over defaults leaves a default in place of a value the
 * caller left unset.
 * @template {object} T
 * @param {T} options
 * @returns {Partial<T>}
 */
export function defined(options) {
  return /** @type {Partial<T>} */ (Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined)));
}
