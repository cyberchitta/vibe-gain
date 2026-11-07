/**
 * The `vg-figure/1` data format: what a figure draws, in one JSON file.
 * Either `series` (many values each: group box plots, cumulative shares) or
 * `rows` (one number per column: linked columns), never both. `scope` says
 * what was counted and is carried through unread: a string for the whole
 * file, or strings per column with `default` for the rest. A change that
 * would refuse a valid `vg-figure/1` file is `vg-figure/2`.
 *
 * @typedef {string | Readonly<Record<string, string>>} VgScope
 * @typedef {{ readonly id: string, readonly group: string, readonly values: readonly number[] }} VgSeries
 * @typedef {{ readonly id: string, readonly group: string, readonly [column: string]: string | number }} VgRow
 * @typedef {{ readonly scope?: VgScope, readonly series: readonly VgSeries[] }} VgSeriesFigure
 * @typedef {{ readonly scope?: VgScope, readonly rows: readonly VgRow[] }} VgRowsFigure
 */

export const VG_FIGURE_FORMAT = "vg-figure/1";

const TOP_KEYS = new Set(["format", "scope", "series", "rows"]);

/**
 * Parse a `vg-figure/1` file, already read as JSON, into frozen series or
 * rows. Anything else throws, naming `source`, the entry and what was
 * expected.
 * @param {unknown} raw
 * @param {string} source - names the file in errors, a path say
 * @returns {VgSeriesFigure | VgRowsFigure}
 */
export function parseVgFigure(raw, source) {
  const fail = (/** @type {string} */ what) => {
    throw new Error(`${source}: ${what}`);
  };
  if (!isObject(raw)) return fail(`expected a ${VG_FIGURE_FORMAT} object`);
  if (raw.format !== VG_FIGURE_FORMAT) return fail(`format is ${JSON.stringify(raw.format)}; expected "${VG_FIGURE_FORMAT}"`);
  const unknown = Object.keys(raw).find((k) => !TOP_KEYS.has(k));
  if (unknown !== undefined) return fail(`unknown key "${unknown}"; a file holds format, scope, and series or rows`);
  if (("series" in raw) === ("rows" in raw)) return fail("expected exactly one of series and rows");
  const scope = raw.scope === undefined ? {} : { scope: parseScope(raw.scope, fail) };
  return Object.freeze(
    "series" in raw
      ? { ...scope, series: entries(raw.series, "series", fail).map((s, i) => parseSeries(s, i, fail)) }
      : { ...scope, rows: parseRows(entries(raw.rows, "rows", fail), fail) },
  );
}

/**
 * @param {unknown} scope
 * @param {(what: string) => never} fail
 * @returns {VgScope}
 */
function parseScope(scope, fail) {
  if (typeof scope === "string") return scope;
  if (isObject(scope) && Object.values(scope).every((v) => typeof v === "string")) {
    return Object.freeze({ .../** @type {Record<string, string>} */ (scope) });
  }
  return fail("scope must be a string, or an object of strings");
}

/**
 * A non-empty array of entries, each with a string id and group, ids unique.
 * @param {unknown} list
 * @param {string} name
 * @param {(what: string) => never} fail
 * @returns {Record<string, unknown>[]}
 */
function entries(list, name, fail) {
  if (!Array.isArray(list) || list.length === 0) return fail(`${name} must be a non-empty array`);
  list.forEach((e, i) => {
    if (!isObject(e) || typeof e.id !== "string" || e.id === "" || typeof e.group !== "string") {
      fail(`${name}[${i}] needs a non-empty string id and a string group`);
    }
  });
  const ids = list.map((e) => e.id);
  const twice = ids.find((id, i) => ids.indexOf(id) !== i);
  if (twice !== undefined) fail(`id "${twice}" appears twice in ${name}`);
  return list;
}

/**
 * @param {Record<string, unknown>} s
 * @param {number} i
 * @param {(what: string) => never} fail
 * @returns {VgSeries}
 */
function parseSeries(s, i, fail) {
  const { id, group, values } = s;
  if (!Array.isArray(values) || values.length === 0 || !values.every(isFiniteNumber)) {
    return fail(`series[${i}] ("${id}") needs values, a non-empty array of finite numbers`);
  }
  return Object.freeze({ id: String(id), group: String(group), values: Object.freeze([...values]) });
}

/**
 * Rows with the same columns each, every column a finite number.
 * @param {Record<string, unknown>[]} rows
 * @param {(what: string) => never} fail
 * @returns {VgRow[]}
 */
function parseRows(rows, fail) {
  const columnsOf = (/** @type {Record<string, unknown>} */ r) => Object.keys(r).filter((k) => k !== "id" && k !== "group").sort();
  const columns = columnsOf(rows[0]).join(", ");
  rows.forEach((r, i) => {
    if (columnsOf(r).join(", ") !== columns) fail(`rows[${i}] ("${r.id}") has columns ${columnsOf(r).join(", ")}; rows[0] has ${columns}`);
    const bad = columnsOf(r).find((k) => !isFiniteNumber(r[k]));
    if (bad !== undefined) fail(`rows[${i}] ("${r.id}") ${bad} is ${JSON.stringify(r[bad])}; expected a finite number`);
  });
  return rows.map((r) => Object.freeze(/** @type {VgRow} */ ({ ...r })));
}

/** @param {unknown} v @returns {v is Record<string, unknown>} */
function isObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** @param {unknown} v @returns {v is number} */
function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}
