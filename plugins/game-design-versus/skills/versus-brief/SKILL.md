---
name: versus-brief
description: Regenerate and save the GDD seed brief for an existing game-design-versus session. Use when the user asks for their design brief, wants to update a saved brief after more answers, or lost the brief file.
argument-hint: "[session id]"
---

# Versus brief

1. If no session id was given, call `versus_list` and ask which session (show title, question count and clarity).
2. Call `versus_brief` with the session id and `format: "markdown"`.
3. Show the user the pitch line, the pillars, the comparable titles and the open questions. Mention the core progress (`core.settled` of `core.total`), the overall clarity and whether the server recommended stopping.
4. Offer to save it. If the user agrees, call `versus_brief` again with `outPath: "docs/design/<slug>-brief.md"` (slug from the title, lowercase with hyphens). If that file already exists the call fails; ask before passing `overwrite: true`. Use `format: "json"` and a `.json` path if the user wants machine-readable output.
5. If open questions remain, offer to resume the interview with the `versus` skill (`resume <id>`).
