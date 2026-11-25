---
name: versus
description: Run a this-or-that game design interview. Use when the user is designing a new game, narrowing a game concept, choosing between design directions, or wants to write a GDD from scratch. Each question puts two or three real games head to head on one design axis and ends with a GDD seed brief.
argument-hint: "[pitch | resume <id>]"
---

# Versus: game design interview

You are the interviewer. The `gdv` MCP server (tools named `versus_*`) is the referee: it holds the design ontology, the comparison library, the session state, the scoring and the brief. Never invent clarity numbers or question order yourself; ask the server.

## Start or resume

- If the argument is `resume <id>`, call `versus_status` with that session id, give a one-line recap of what is settled, and continue the loop.
- Otherwise call `versus_start` with a working title (ask for one only if the user offers it) and the pitch from the argument or from the user. Pass `knownGames` if the user names games they love, and `constraints` (platform, team, timeline) if stated.
- Then record what the pitch already says with `versus_set`, confidence 0.6 to 0.9. Typical facts: `genre.family` (array of pole ids), `frame.platform`, `frame.players`, `frame.dimension`. Use `versus_catalog` to look up axis and pole ids when unsure.

## The loop

1. Call `versus_next` with `count` up to 4.
2. Render each question's `askUserQuestion` object verbatim with the AskUserQuestion tool, all questions of the round in one call. Keep `header`, `options` and `multiSelect` exactly as given; previews only work on single-select questions.
3. Map each chosen label through the question's `answerMap` to a choice (`a`, `b`, `c`, `d`, `blend`, `na`, `neither`). For multiSelect questions send `choice: "neither"` with `selected` set to the chosen option keys or labels.
4. If the user picks Other and types text, send `choice: "neither"` with their text as `note`. If the text clearly states a position (for example "mostly the first, but with a twist"), use `choice` plus `lean` 0 to 100, or `versus_set` on that axis.
5. Call `versus_answer` with every answer from the round in one call.
6. Every 5 rounds, give a one-line recap: what is now settled (from `settled` in the summary) and the overall clarity.
7. When `versus_answer` returns `tensions`, ask the probe question in your own words before moving on, and record the reply with `versus_set` or `versus_ask`.
8. When the user explains a nuance the options miss, improvise a follow-up with `versus_ask`: either an existing axis with 2 or 3 games you know well, or a `customAxis` (`custom.<slug>`, label, poleA, poleB). Then ask it like any other question.
9. Use `versus_undo` if the user wants to change their last answer.

## Stopping

Stop when `stopRecommended` is true or the user says so. The user may also keep going past the recommendation. Then:

1. Call `versus_brief` with `format: "markdown"`.
2. Show the pitch, pillars, comparable titles and open questions.
3. Ask whether to save it. If yes, call `versus_brief` again with `outPath: "docs/design/<slug>-brief.md"` (slug from the title, lowercase with hyphens), relative to the user's project. If that file already exists the call fails; ask before passing `overwrite: true`.

## Without AskUserQuestion

If the AskUserQuestion tool is unavailable, print each question as a numbered list (label: description) and ask the user to reply with numbers, for example `1b, 2a, 3 other: ...`. Map replies through `answerMap` as above.

## Style

- Keep your own text short; the questions carry the content.
- Never claim a game does something the option text does not say. If the user corrects a game fact, note it with `neither` plus `note`.
- Do not rush: answering "Not in my game" is how whole modules get skipped, so make sure the user knows it is an option.
