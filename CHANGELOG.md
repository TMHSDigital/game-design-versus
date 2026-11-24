# Changelog

## 0.1.0 (unreleased)

- MCP server (`@modelcontextprotocol/server` 2.4.0, stdio via `serveStdio`) with tools `versus_start`, `versus_next`,
  `versus_answer`, `versus_ask`, `versus_set`, `versus_status`, `versus_undo`, `versus_list`, `versus_brief` and
  `versus_catalog`, five resources and three prompts.
- Ontology: 154 axes in 27 modules, every spec axis id kept.
- Added axis property `keep` (rank axes keep their top N) and pole property `noExemplar` (frame.engine "undecided"
  is exempt from pole coverage).
- Multi axes may carry up to 25 poles (genre.family has 18 and genre.form 25 as specified); categorical and rank
  axes keep the 3 to 12 limit.
- 48 archetypes and 35 tension rules.
- Engine: event-sourced sessions with undo, three-valued gating, bin posteriors, archetype posterior, EIG question
  selection with seeded top-3 picks, Elo comparable titles and the GDD seed brief.
- Calibration (see README "Calibration notes"): decaying uniform prior share, decided-axis clarity floor, rule-based
  archetype profile completion.
- Comparison library authored by parallel agents with per-option sources; unverified items are hidden by default.
- Claude Code plugin with `versus` and `versus-brief` skills and the `tmhs-digital` marketplace.
- Website at https://tmhsdigital.github.io/game-design-versus/ with a playable in-browser interview that runs the
  same engine and verified library (`src/web/demo.ts`), deployed by `.github/workflows/pages.yml`.
