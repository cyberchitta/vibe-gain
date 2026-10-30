/**
 * What the group charts and their text forms take as input. They draw these
 * as given and compute nothing statistical: a caller computes the figures
 * its own way, or with `core/stats/`, which produces these shapes.
 * Types only; this module has no runtime code.
 */

/**
 * The figures a box plot draws.
 * @typedef {object} BoxFigures
 * @property {number} n
 * @property {number} min
 * @property {number} p5
 * @property {number} q1
 * @property {number} median
 * @property {number} q3
 * @property {number} p95
 * @property {number} max
 */

/**
 * A histogram bar: values in [lo, hi), `hi` may be Infinity; `share` is a
 * fraction of the group's values.
 * @typedef {object} Bin
 * @property {number} lo
 * @property {number} hi
 * @property {string} label
 * @property {number} count
 * @property {number} share
 */

/**
 * A value singled out in its group: ringed in the chart, noted in text.
 * @typedef {object} Highlight
 * @property {number} value
 * @property {string} note - e.g. "ours"
 */

/**
 * A value marked across a group's box by a dashed line, not one of its
 * values: a threshold or a target.
 * @typedef {object} Reference
 * @property {number} value
 * @property {string} label - e.g. "45min"
 */

/**
 * One labelled group. `values` is needed only for dots and the value list;
 * `bins` only for the histogram.
 * @typedef {object} BoxGroup
 * @property {string} label
 * @property {string} color
 * @property {BoxFigures} figures
 * @property {readonly number[]} [values]
 * @property {readonly Bin[]} [bins]
 * @property {readonly Highlight[]} [highlights]
 * @property {readonly Reference[]} [references]
 */

/**
 * One step of a cumulative-share curve: the share of values at or below `value`.
 * @typedef {object} SharePoint
 * @property {number} value
 * @property {number} share
 */

/**
 * One group's cumulative-share curve.
 * @typedef {object} ShareGroup
 * @property {string} label
 * @property {string} color
 * @property {readonly SharePoint[]} shares
 */

export {};
