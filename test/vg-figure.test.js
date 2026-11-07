import { describe, expect, test } from "bun:test";
import { parseVgFigure } from "../core/data/vg-figure.js";

const series = (extra = {}) => ({
  format: "vg-figure/1",
  series: [
    { id: "A", group: "m", values: [1, 2, 3] },
    { id: "B", group: "u", values: [4] },
  ],
  ...extra,
});
const rows = (extra = {}) => ({
  format: "vg-figure/1",
  rows: [
    { id: "A", group: "m", loc: 10, deps: 0 },
    { id: "B", group: "u", deps: 3, loc: 2.5 },
  ],
  ...extra,
});
const parse = (raw) => parseVgFigure(raw, "f.json");
const refuses = (raw, message) => expect(() => parse(raw)).toThrow(message);

describe("parseVgFigure", () => {
  test("series come back as given, frozen", () => {
    const fig = parse(series());
    expect(fig).toEqual({ series: series().series });
    expect(Object.isFrozen(fig.series[0])).toBe(true);
    expect(Object.isFrozen(fig.series[0].values)).toBe(true);
  });

  test("rows come back as given, frozen", () => {
    const fig = parse(rows());
    expect(fig).toEqual({ rows: rows().rows });
    expect(Object.isFrozen(fig.rows[1])).toBe(true);
  });

  test("scope passes through as a string or an object of strings", () => {
    expect(parse(series({ scope: "bounty parts" })).scope).toBe("bounty parts");
    expect(parse(rows({ scope: { default: "bounty parts", deps: "whole repo" } })).scope).toEqual({
      default: "bounty parts",
      deps: "whole repo",
    });
    refuses(series({ scope: 3 }), "f.json: scope must be a string, or an object of strings");
    refuses(series({ scope: { deps: 1 } }), "scope must be a string");
  });

  test("refuses a file that is not vg-figure/1", () => {
    refuses([], "f.json: expected a vg-figure/1 object");
    refuses(series({ format: "vg-figure/2" }), 'format is "vg-figure/2"');
    refuses(series({ colour: "red" }), 'unknown key "colour"');
    refuses({ format: "vg-figure/1" }, "exactly one of series and rows");
    refuses({ ...series(), rows: rows().rows }, "exactly one of series and rows");
  });

  test("refuses entries without an id and group, or with an id twice", () => {
    refuses({ format: "vg-figure/1", series: [] }, "series must be a non-empty array");
    refuses({ format: "vg-figure/1", rows: [{ group: "m", loc: 1 }] }, "rows[0] needs a non-empty string id and a string group");
    refuses({ format: "vg-figure/1", series: [{ id: "", group: "m", values: [1] }] }, "series[0] needs");
    refuses({ format: "vg-figure/1", series: [{ id: "A", group: 2, values: [1] }] }, "series[0] needs");
    refuses({ format: "vg-figure/1", series: [series().series[0], series().series[0]] }, 'id "A" appears twice in series');
  });

  test("refuses series values that are not finite numbers", () => {
    const one = (values) => ({ format: "vg-figure/1", series: [{ id: "A", group: "m", values }] });
    refuses(one([]), 'series[0] ("A") needs values');
    refuses(one([1, "2"]), "finite numbers");
    refuses(one([1, NaN]), "finite numbers");
    refuses(one([Infinity]), "finite numbers");
  });

  test("refuses rows whose columns differ or are not finite numbers", () => {
    const two = (b) => ({ format: "vg-figure/1", rows: [{ id: "A", group: "m", loc: 1, deps: 2 }, { id: "B", group: "u", ...b }] });
    refuses(two({ loc: 1 }), 'rows[1] ("B") has columns loc; rows[0] has deps, loc');
    refuses(two({ loc: 1, deps: 2, tests: 3 }), "has columns");
    refuses(two({ loc: 1, deps: "2" }), 'rows[1] ("B") deps is "2"; expected a finite number');
    refuses(two({ loc: null, deps: 2 }), "loc is null");
  });
});
