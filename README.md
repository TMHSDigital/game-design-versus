# game-design-versus

An agentic "this or that" game design questionnaire for any game developer, any genre, any platform. Each question
puts two (sometimes three) real games head to head on one design axis: "Combat: Half Sword or Skyrim?", "Economy:
Big Ambitions or Civilization VI?". Every answer narrows the design space and gates out whole modules that no longer
apply, until the game is clear. Then it writes a GDD seed brief: pitch, pillars, core loop, systems spec, comparable
titles, scope, risks and open questions.

It ships as an MCP server (TypeScript, Node 20+, stdio) for Claude Code, Claude Desktop, Cursor, Codex and VS Code
with Copilot, and as a Claude Code plugin with its own marketplace. The server never calls an LLM and needs no API key.

```
/plugin marketplace add TMHSDigital/game-design-versus
/plugin install game-design-versus@tmhs-digital
```

## Demo: four rounds

```
> /game-design-versus:versus a medieval sword fighting game where the physics decide every hit

  [versus_start, then versus_set genre.family = action, fighting]

Round 1
  Combat presence: should fighting be the heart of the game?
  > Combat is core
  Camera view: which fits your game?
  > Over-shoulder third person

Round 2
  Combat simulation: Half Sword or The Elder Scrolls V: Skyrim?
    Half Sword: weapons are physical objects steered by the mouse on active-ragdoll bodies
    Skyrim: swings play animations; damage comes from weapon stats, perks and skill
  > Half Sword
  Economy: should earning and spending shape play?
  > Not in my game            (economy module skipped: 10 axes gone)

Round 3
  Attack input: Kingdom Come: Deliverance II, Dark Souls or For Honor?
  > Kingdom Come: Deliverance II
  Players: who plays together?
  > Online competitive

  Tension (risk): Physics-simulated melee in online PvP is hard to network.
  Probe: Would you accept server-authoritative physics with input delay, or keep PvP local or co-op only?

Round 4
  Failure penalty: Dark Souls, Celeste or XCOM 2?
  > Celeste (instant retry)

  Recap: physics melee, directional input, online competitive, no economy. Clarity 0.46.
```

## How it works

- **The agent is the interviewer.** It words questions, renders them with AskUserQuestion (or a numbered list),
  handles free-text answers, asks tension probes and improvises follow-ups.
- **The server is the referee and knowledge base.** It owns the ontology (154 axes in 27 modules), the comparison
  library, the event-sourced session state, the scoring and the next-question selection, and it writes the brief.

Under the hood:

- Each binary axis holds a probability over 5 bins (A strong, A lean, blend, B lean, B strong). Answers multiply in
  fixed likelihoods (A: 0.50, 0.30, 0.14, 0.04, 0.02; B mirrors; blend 0.05, 0.20, 0.50, 0.20, 0.05; an explicit lean
  0-100 is a Gaussian, sigma 0.6).
- A posterior over 48 archetypes (soulslike ARPG, colony sim, roguelike deckbuilder...) updates from the same answers
  and supplies the prior for every unasked axis.
- Gate axes set flags (`has_combat`, `is_multiplayer`, `is_strategy`...). A module whose flag is false is skipped
  entirely. Gating is three-valued: an axis whose gate is unanswered is undetermined, and gates are asked first.
- Next question: importance times expected information gain on the axis, plus 0.5 times information gain on the
  archetypes, plus a gate bonus, plus a familiarity bonus, minus repetition penalties. The server picks uniformly from
  the top 3 with a PRNG seeded per session, so runs are reproducible (`GDV_DETERMINISTIC=1` forces top-1).
- Clarity per axis is 1 - H(p)/log(n). The server recommends stopping at overall clarity 0.80 with every frame and
  gate axis resolved and every core axis at 0.6 or more, or after 60 questions.
- Comparable titles come from Elo ratings over the games the user picked (K 24, start 1500).
- 35 tension rules (netcode risk for physics PvP, MMO on a solo team, the patented Nemesis system...) fire as answers
  arrive and come back with a probe question.

### Engine notes (calibration)

Three documented deviations from a literal reading of the spec keep the 0.80 stop rule reachable within the 45 to 60
question budget. All three live in `src/engine/config.ts`:

- The prior's uniform share starts at 0.3 (spec) and decays to 0.02 as the archetype posterior concentrates.
- An axis the user answered directly counts as at least 0.9 clear (`decidedClarityFloor`); a "no preference" axis
  counts as settled.
- Archetype profiles are completed with weak (+-1) rule-based defaults for axes they did not specify (for example a
  single ending unless the story branches).

The user's own answers always set the position of a decided axis; the archetype prior only fills open axes.

## Install

Build first if you cloned the repo: `npm ci && npm run build`. The runtime artifact is the single dependency-free
file `plugins/game-design-versus/server/index.js`.

### Claude Code (plugin)

```
/plugin marketplace add TMHSDigital/game-design-versus
/plugin install game-design-versus@tmhs-digital
```

Or from a local clone: `claude --plugin-dir ./plugins/game-design-versus`. Run `/mcp` once to confirm the tool prefix
(plugin MCP tools are named like `mcp__plugin_game-design-versus_gdv__versus_start`) before adding any of them to
`allowed-tools`. Start an interview with `/game-design-versus:versus <pitch>`; regenerate a brief with
`/game-design-versus:versus-brief <session id>`.

### Cursor

`.cursor/mcp.json` in a project, or `%USERPROFILE%\.cursor\mcp.json` for all projects:

```json
{ "mcpServers": { "gdv": { "command": "node", "args": ["C:/path/to/game-design-versus/plugins/game-design-versus/server/index.js"] } } }
```

After npm publish: `{ "mcpServers": { "gdv": { "command": "npx", "args": ["-y", "game-design-versus"] } } }`

### Codex

`%USERPROFILE%\.codex\config.toml` (TOML literal strings in single quotes avoid backslash escaping):

```toml
[mcp_servers.gdv]
command = "node"
args = ['C:\path\to\game-design-versus\plugins\game-design-versus\server\index.js']
```

After npm publish: `command = "npx"` and `args = ["-y", "game-design-versus"]`.

### VS Code with Copilot

Workspace `.mcp.json`:

```json
{ "mcpServers": { "gdv": { "type": "stdio", "command": "node", "args": ["C:/path/to/game-design-versus/plugins/game-design-versus/server/index.js"] } } }
```

Legacy `.vscode/mcp.json`:

```json
{ "servers": { "gdv": { "type": "stdio", "command": "node", "args": ["C:/path/to/game-design-versus/plugins/game-design-versus/server/index.js"] } } }
```

After npm publish, use `"command": "npx", "args": ["-y", "game-design-versus"]`.

### Claude Desktop

`%APPDATA%\Claude\claude_desktop_config.json`. With the Microsoft Store build of Claude Desktop the file lives under
`%LOCALAPPDATA%\Packages\Claude_<id>\LocalCache\Roaming\Claude\claude_desktop_config.json` instead.

```json
{ "mcpServers": { "gdv": { "command": "node", "args": ["C:/path/to/game-design-versus/plugins/game-design-versus/server/index.js"] } } }
```

Other agents: see [AGENTS.md](AGENTS.md) for the interview protocol, including a numbered-list fallback when no
structured question tool exists.

## Tools

| Tool | Purpose |
| --- | --- |
| `versus_start { title?, pitch?, knownGames?, seed?, constraints?: { platform?, team?, timeline? } }` | New session; returns a summary |
| `versus_next { sessionId, count?: 1-4 }` | Up to 4 questions from different modules, each with a ready `askUserQuestion` object and an `answerMap` |
| `versus_answer { sessionId, answers: [{ questionId, choice, lean?, note?, selected? }] }` | Record answers; returns clarity deltas, unlocked and skipped modules, tensions and follow-up hints |
| `versus_ask { sessionId, axis \| customAxis, options: [{ game, how }] }` | Register an improvised (unverified) comparison and get a questionId |
| `versus_set { sessionId, axis, value, confidence, source }` | Record a fact the user volunteered |
| `versus_status { sessionId }` | Clarity per module, settled decisions, tensions, archetypes, comparables |
| `versus_undo { sessionId }` | Undo the last answer, set or skip |
| `versus_list {}` | Saved sessions |
| `versus_brief { sessionId, format: markdown \| json, outPath? }` | The GDD seed brief; relative outPath resolves against the server's working directory |
| `versus_catalog { module?, axis?, game?, query? }` | Browse axes and comparisons |

Choices: `a`, `b`, `c`, `d` (options), `blend`, `neither` (Other, with `note`), `no_pref`, `na` (not in my game),
`skip`. Multi-select questions take `selected` option keys.

Resources: `gdv://ontology`, `gdv://axes/{axisId}`, `gdv://comparisons/{axisId}`, `gdv://sessions/{sessionId}`,
`gdv://sessions/{sessionId}/brief`. Prompts: `versus` (pitch), `versus-resume` (sessionId), `versus-brief` (sessionId).

MCP elicitation is not used in v1 (future work: asking questions through elicitation when the client supports it).

## Data

- `src/data/axes.json`: modules and axes (`id`, `module`, `kind` bipolar | categorical | multi | rank | gate, `poles`,
  `appliesWhen`, `sets`, `importance`, `tier`, `questionTemplate`, `header`).
- `src/data/archetypes.json`: 48 archetypes with profiles (`axis: bin -2..2`, or a pole id, or pole ids).
- `src/data/tensions.json`: 35 rules `{ id, when, severity, message, probe }`.
- `src/data/comparisons/<module>.json`: the comparison library.

```json
{
  "id": "cmp.combat.sim.halfsword-skyrim",
  "axis": "combat.sim",
  "options": [
    { "pole": "physics", "game": "Half Sword", "year": 2026, "how": "Weapons are physical objects steered by the mouse..." },
    { "pole": "animated", "game": "The Elder Scrolls V: Skyrim", "year": 2011, "how": "Swings play animations..." }
  ],
  "tags": { "genres": ["action", "rpg"], "platforms": ["pc", "console"], "era": "2010s", "indie": true },
  "sources": [{ "url": "https://store.steampowered.com/...", "note": "Half Sword: ..." }, { "url": "https://...", "note": "Skyrim: ..." }],
  "verification": { "status": "verified", "checkedAt": "2026-11-23", "by": "seed" }
}
```

### Contributing comparisons

Read [docs/library-brief.md](docs/library-brief.md). In short:

- One axis per comparison; neither pole obviously better; each `how` (160 characters or fewer) describes how that game
  handles this axis only.
- At least one source per option: Steam store page or official site, an official or community wiki, a reputable
  review (PC Gamer, IGN, Eurogamer, Game Developer) or a GDC talk. Never invent mechanics.
- Mark an item `verified` only when every option was checked against its source. Unverified items are hidden unless
  `GDV_ALLOW_UNVERIFIED=1`.
- Run `npm run validate:data` and `npm run coverage` before opening a PR. No em dashes or emoji anywhere.

## Coverage

Output of `npm run coverage` for v0.1.0:

```
Comparisons served: 653 (verified 653, unverified 128); targets >= 600, stretch 1000
Distinct games: 705; top: Mario Kart 8 Deluxe 10, Darkest Dungeon 9, Animal Crossing: New Horizons 9, Terraria 9
Indie share: 66.8% (target >= 30%)
Eras: pre2000 15.9%, 2000s 21.6%, 2010s 51.0%, 2020s 11.5% (each >= 10%)
Per genre: every family >= 33 (target 25)
Thin bipolar axes (< 4): combat.commitment=2, combat.numbers=2, combat.ai=3, ranged.assist=3,
  stealth.failure=3, ui.diegesis=2, audio.music=3, audio.sync=3, strat.micro=2, strat.victory=2
Uncovered categorical poles: none
Overused games (> 12): none
```

The 10 thin axes have 2 or 3 verified comparisons, and unverified candidates already exist for most of them. They
need sources confirmed (see `docs/library-brief.md`). An axis with no comparison left falls back to a plain pole
question, so the interview still works.

Persona simulation (`npm run simulate`): 8 personas answer from a hidden profile. All reach clarity 0.80 within 45
questions, none is asked an irrelevant module, and each persona's archetype ranks first.

| Persona | Questions | Clarity | Top archetype |
| --- | --- | --- | --- |
| Physics brawler (Half Sword) | 45 | 0.812 | physics_brawler |
| Business sim (Big Ambitions) | 35 | 0.802 | business_tycoon |
| 4X (Civilization VI) | 44 | 0.801 | x4 |
| Cozy farming | 36 | 0.800 | cozy_farming |
| Extraction shooter | 45 | 0.801 | extraction_shooter |
| Roguelike deckbuilder | 37 | 0.801 | roguelike_deckbuilder |
| Survival horror | 43 | 0.801 | survival_horror |
| Party game | 36 | 0.810 | party_game |

## Environment variables

| Variable | Effect |
| --- | --- |
| `GDV_HOME` | Where sessions are stored. Default `%USERPROFILE%\.game-design-versus` (`~/.game-design-versus`). Sessions are one JSON file each under `sessions\`, written atomically. They are never stored in the plugin folder, which updates replace. |
| `GDV_DETERMINISTIC=1` | Always pick the top-scoring question instead of a seeded pick from the top 3. |
| `GDV_ALLOW_UNVERIFIED=1` | Also serve comparisons marked unverified. |

## Development

```
npm ci
npm run check      # typecheck, lint, validate:data, build, test, coverage
npm run dev        # tsx watch
npm run simulate   # persona simulation (8 personas)
npm run inspect    # MCP Inspector against the built bundle (needs Node 22+)
```

Built with `@modelcontextprotocol/server` 2.4.0 (served with `serveStdio`, so 2025-era and 2026-07-28 clients both
work), zod 4.6.7, TypeScript 6.0.3, esbuild, vitest 4.1.12.

## Troubleshooting

- **No tools in the client.** Check the path to `server/index.js` and that `node --version` is 20 or newer. Run
  `npm run inspect` to see the server's stderr log.
- **"session not found".** Sessions live in `GDV_HOME`; a client started with a different `GDV_HOME` will not see them.
  Use `versus_list`.
- **Few questions use real games.** Only verified comparisons are served. Set `GDV_ALLOW_UNVERIFIED=1` to include the
  rest, or contribute sources.
- **Windows paths in JSON.** Use forward slashes or doubled backslashes; in TOML use single-quoted literal strings.

## License

MIT, Thomas Mathes / TMHSDigital.
