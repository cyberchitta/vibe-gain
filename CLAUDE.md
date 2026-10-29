# CLAUDE.md

vibe-gain fetches GitHub commit histories, builds per-period metrics from
them, and renders those as Vega-Lite charts (`browser/`) and as text tables
(`lib/export/`). `core/` holds the data model and statistics; `lib/` the
GitHub fetch and the exports. Usage is in `README.md`.

## Consumers

cyberchitta.cc is the main consumer, pinned by tag in two places that move
together: its `package.json` (the build's llms.txt text, via `vg-chart.md.js`)
and the import map in its `src/_includes/layouts/vibe-gain.ejs` (the browser,
via jsDelivr). A tag, once pushed, is served to live pages: never move one.

## Code style

Code follows the global `code-style` and `javascript-style` skills; load them
before writing code. New code goes in new files, typed with JSDoc, and is
added to `jsconfig.json`'s `include`: `bun run typecheck` checks only those
files strictly, since the older code does not pass (a new file that imports
old code, like `browser/renderers/group-box-plot.js`, stays out). `bun test`
runs the tests. No formatter or linter yet.

The group charts (`browser/specs/group-box-plot.js`, `cumulative-share.js`,
`lib/export/group-text.js`) draw what they are given: aggregation stays in
`core/stats/` or the caller. `test/boundary.test.js` enforces it.

## Working notes (gitignored)

`_notes/` is a symlink into the private `working-notes` repo; load the
`working-notes` skill before touching it (search with `rg`, not Grep/Glob).
**AI-maintained:** sessions update it as part of the work.

- `_notes/intent.md` — what the repo is for and must not violate. Read it
  before changing any default that affects existing charts or figures.
- `_notes/worklist.md` — the state document: open work and repo state.
- Field notes go to the global default.
