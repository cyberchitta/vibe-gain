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
before writing code. This repo has no formatter, linter or type-check config
yet. New code goes in new files, typed with JSDoc.

## Working notes (gitignored)

`_notes/` is a symlink into the private `working-notes` repo; load the
`working-notes` skill before touching it (search with `rg`, not Grep/Glob).
**AI-maintained:** sessions update it as part of the work.

- `_notes/intent.md` — what the repo is for and must not violate. Read it
  before changing any default that affects existing charts or figures.
- `_notes/worklist.md` — the state document: open work and repo state.
- Field notes go to the global default.
