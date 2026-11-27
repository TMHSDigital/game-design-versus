# Comparison library authoring brief

This is the shared brief for authoring the game-design-versus comparison library. It is kept in the repo
so future contributors follow the same rules.

## What a comparison is

Each comparison puts 2 (sometimes 3) real games head to head on ONE design axis. The user picks the
game whose approach to THIS axis fits the game they are designing.

Quality bar (Sid Meier's "interesting decisions"):
- Neither pole may be obviously better. Both games must be well-regarded for how they handle this axis.
- Each answer must change what gets built.
- Each option's `how` describes how that game handles THIS axis only, not the game in general.
  Bad: "An open world fantasy RPG with dragons." Good: "Swings play animations; damage comes from weapon stats, perks and skill."

## Schema (src/engine/ontology.ts, ComparisonSchema)

```json
{
  "id": "cmp.combat.sim.halfsword-skyrim",
  "axis": "combat.sim",
  "options": [
    { "pole": "physics", "game": "Half Sword", "year": 2025, "how": "..." },
    { "pole": "animated", "game": "The Elder Scrolls V: Skyrim", "year": 2011, "how": "..." }
  ],
  "tags": { "genres": ["action", "rpg"], "platforms": ["pc", "console"], "era": "2010s", "indie": true },
  "sources": [
    { "url": "https://store.steampowered.com/app/...", "note": "Half Sword: active ragdoll physics combat" },
    { "url": "https://en.uesp.net/wiki/Skyrim:Combat", "note": "Skyrim: weapon damage from skill and perks" }
  ],
  "verification": { "status": "verified", "checkedAt": "2026-11-23", "by": "claude-code" }
}
```

Rules:
- `id`: `cmp.<axis id>.<slug>`, slug is lowercase letters, digits and hyphens, usually `gamea-gameb`. Unique.
- `axis`: an axis id from src/data/axes.json. Read that file for pole ids, labels and summaries.
- `options[].pole`: a pole id of that axis. Bipolar axes: one option on each pole is REQUIRED; a 3rd option may
  sit on either pole or on the special pole `blend` (a genuine middle ground). Categorical axes: each option on a
  DIFFERENT pole.
- `how`: 160 characters or fewer, concrete and mechanical, about this axis only.
- `year`: original release year of that game (early access start is fine if that is how it is known).
- `game`: the canonical title. Disambiguate remakes with the year, for example "Resident Evil 4 (2005)".
- `tags.genres`: genre.family pole ids that describe the games in the comparison (union). Valid: action, rpg,
  strategy, simulation, survival, puzzle, platformer, fighting, racing, sports, horror, narrative, shooter, sandbox,
  card, rhythm, idle, party.
- `tags.platforms`: frame.platform pole ids where these games shipped (union): pc, console, handheld, mobile, vr, web.
- `tags.era`: era of the OLDEST game in the comparison: pre2000 (< 2000), 2000s, 2010s, 2020s.
- `tags.indie`: true if ANY option is an indie game (independent studio, not owned by a major publisher).
- `sources`: at least one URL PER OPTION, each confirming the specific mechanic. Allowed: Steam store page or
  official site; official wiki or a wiki.gg or fandom wiki (also UESP, Bulbapedia-style community wikis);
  reputable reviews (PC Gamer, IGN, Eurogamer, Game Developer, Rock Paper Shotgun, GameSpot, Polygon); GDC talks.
  Put the game name at the start of each `note`.
- `verification`: `"verified"` only when you confirmed EVERY option's mechanic via WebSearch or WebFetch in this
  session. Otherwise `"unverified"` (the server hides unverified items). `checkedAt` "2026-11-23", `by` "claude-code"
  (use "seed" for items converted from the seed list).
- Optional `note` (string) for cautions, e.g. "patented: do not clone literally".
- Never invent mechanics. If unsure, search. If still unsure, mark unverified or drop it.
- No em dash characters (U+2014) and no emoji anywhere. Use commas, colons or parentheses instead.

## Library-wide targets your file contributes to

- At least 4 comparisons per bipolar axis (aim for 6). Every pole of every categorical axis covered at least once.
  Gate axes (kind "gate") and multi or rank axes need no comparisons.
- Mix: at least 30% indie, and each era bucket at least 10%. Deliberately include pre2000 and 2000s classics
  (roughly 20% each), not only recent games.
- At least 25 comparisons per genre family across the library. The minority families are card, rhythm, idle,
  party, sports, racing, fighting, puzzle, horror and platformer: wherever a game from those families truthfully
  illustrates your axis (for example Beat Saber on art.palette or Cookie Clicker on frame.session), use it.
- Spread: no game may appear in more than 12 comparisons library-wide. Within YOUR file use any single game at most
  2 times (seed items excepted). Treat these as nearly used up and avoid them outside your assigned seeds: Skyrim,
  Dark Souls, Elden Ring, Minecraft, Fortnite, Celeste, Breath of the Wild, XCOM 2, Hades, Stardew Valley, RimWorld,
  Valheim, Escape from Tarkov, Destiny 2, Genshin Impact, Overwatch 2, Apex Legends, World of Warcraft, EVE Online,
  Hollow Knight, any Resident Evil, Slay the Spire, Factorio, Half-Life 2, Sekiro, Civilization VI.
  Span AAA, AA, indie, classic and recent games, all platforms including mobile and VR.

## Process

1. Read src/data/axes.json for your axes (ids, kinds, poles) and src/engine/ontology.ts for the schema.
2. Work in batches of about 25 comparisons. For each option, verify the mechanic with WebSearch or WebFetch and
   record the URL. Write the batch to your file(s) immediately (the file is a JSON array; keep previous batches).
3. After each batch run `npx tsx scripts/validate-data.ts` from the repo root and fix any error in YOUR files.
   Errors in other files belong to other agents running in parallel: ignore them.
4. Only edit the files assigned to you. Do not touch code, tests or other data files. Do not commit.
5. Finish with a short report: comparisons written per axis, how many unverified and why, any axis you could not cover.

## Gap-fill round (verification without WebSearch)

The shared WebSearch budget is often exhausted. Verification still works with WebFetch on sources that allow it:

- Steam store search API to find an app id: `https://store.steampowered.com/api/storesearch/?term=<name>&cc=us&l=english`
- Steam appdetails API (no age gate, full description): `https://store.steampowered.com/api/appdetails?appids=<id>&l=english`.
  Cite the human store page `https://store.steampowered.com/app/<id>/` as the source URL.
- Usually reachable: wiki.gg wikis, fextralife wikis, mariowiki.com, ssbwiki.com, minecraft.wiki, Old School RuneScape
  wiki, nookipedia, GOG store pages, gamedeveloper.com, official developer and publisher sites, Nintendo and
  PlayStation official pages.
- Usually blocked: fandom.com (402), StrategyWiki, UESP, Bulbapedia, IGN, Eurogamer, Polygon, Rock Paper Shotgun.
- Do not use Wikipedia as a source for new items; it is not on the allowed list.

Rules for this round:

1. First try to VERIFY existing unverified items in your files: fetch a reachable source for each unconfirmed option,
   replace unreachable source URLs with the confirmed ones, tighten the `how` text to what the source supports, and
   flip `status` to "verified" only when every option is confirmed. If an option cannot be confirmed, swap the game for
   one you can confirm, or leave the item unverified.
2. Then ADD new comparisons until every bipolar axis you own has at least 4 VERIFIED items and every categorical pole
   is covered by a verified item.
3. For NEW items prefer pairs where every game is from 2020 or later (the library is short on the 2020s era), and use
   idle, rhythm and sports games wherever they truthfully fit.
4. Never edit items in files you do not own. Keep the 2-uses-per-file game limit.

## Quickest way to help: verify a thin-axis candidate

`npm run coverage` lists, under each thin bipolar axis, the ids of its unverified comparisons. Verifying one of
those is usually faster than writing a new item: check every option against its source (fix or replace the source if
it does not support the `how` text), then set `verification.status` to "verified" with today's `checkedAt`. Run
`npm run validate:data` and `npm run coverage` again; the axis drops off the list once it has 4 verified items.
