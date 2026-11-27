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
- "Not sure / don't know these games" answer (`unsure`) on every game comparison: nothing is recorded, those games
  are avoided, the topic returns in plain words, and an axis answered "not sure" twice is set aside as an open
  question.
- Brief-ready stop rule: the interview ends once frame, gates and core axes are settled. Summaries report
  `core.settled` of `core.total` and `coreReady`; with frame and gates settled the stop is recommended at
  `softQuestions` (48), and 60 questions is the hard cap.
- `versus_brief` refuses to replace an existing file unless `overwrite: true` is passed.
- `versus_reply` records the user's answer to a tension probe (`response`, optional `stance`: accepted, mitigated or
  will_change). The brief's Risks section shows the reply instead of the probe, the decision log keeps it, and
  `versus_answer` does not raise an answered tension again.
- `versus_revise` changes an earlier answer without undoing later rounds: a `retract` event takes back every answer,
  set and constraint on one axis (the decision log keeps them, marked revised) and optionally records the new
  position. It reports modules the change unlocked or skipped, and `versus_undo` takes it back.
