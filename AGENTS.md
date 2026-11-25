# AGENTS.md

Instructions for any coding agent (Codex, Cursor, Copilot, Claude Code or others) that has the `gdv` MCP server
connected. The server name may differ in your client config; the tools are always named `versus_*`.

## What this is

game-design-versus is a this-or-that game design questionnaire. Each question puts two or three real games head to
head on one design axis ("Combat: Half Sword or Skyrim?"). Every answer narrows the design space and gates out whole
modules that no longer apply. At the end the server writes a GDD seed brief.

- You are the interviewer: wording, rendering, empathy and follow-ups.
- The server is the referee: ontology, comparison library, state, scoring, next-question selection and the brief.
- The server never calls an LLM and needs no API key.

## Interview protocol

1. Call `versus_start` with the pitch (and title, knownGames, constraints when known).
2. Record facts the pitch already states with `versus_set` (confidence 0.6 to 0.9), for example
   `genre.family = ["strategy"]`, `frame.platform = ["pc"]`. Use `versus_catalog` to find axis and pole ids.
3. Loop:
   1. Call `versus_next` with `count` up to 4.
   2. Show each question. If your client has a structured question tool, render the `askUserQuestion` object
      verbatim. Otherwise print a numbered list:

      ```
      1. Combat: Half Sword or Skyrim?
         a) Half Sword: weapons are physical objects steered by the mouse...
         b) Skyrim: swings play animations...
         c) Blend of both
         d) Not in my game
         (or type your own answer)
      ```

   3. Map each reply through the question's `answerMap` (label to choice). Typed free text becomes
      `choice: "neither"` with the text as `note`, or a `versus_set` when it clearly states a position.
      For multi-select questions send `choice: "neither"` plus `selected` option keys.
   4. Send all answers of the round in one `versus_answer` call.
   5. Every 5 rounds, recap in one line what is settled and the overall clarity.
   6. Ask the `probe` of any returned tension in your own words.
   7. When the user explains a nuance, improvise a follow-up with `versus_ask` (existing axis or `customAxis`).
4. Stop when `stopRecommended` is true or the user says so. Call `versus_brief` (markdown) and, if the user agrees,
   save it with `outPath: "docs/design/<slug>-brief.md"`. An existing file is only replaced with `overwrite: true`,
   so ask first.

## Working on this repository

- `npm run check` runs typecheck, lint, data validation, build, tests and coverage.
- Data lives in `src/data`. Comparison contribution rules are in `docs/library-brief.md`.
- No emojis and no em dashes anywhere, including data.
- The committed bundle `plugins/game-design-versus/server/index.js` must be rebuilt (`npm run build`) after any
  change under `src/`; CI fails if it is stale.
