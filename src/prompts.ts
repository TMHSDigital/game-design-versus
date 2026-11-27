import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';

export const PROTOCOL = `You are the interviewer; the game-design-versus server is the referee.
1. Call versus_start (title and pitch if known). Record anything the pitch already states with versus_set (genre.family, frame.platform, frame.players and so on), confidence 0.6 to 0.9.
2. Loop: call versus_next with count up to 4. Render each askUserQuestion object verbatim with the AskUserQuestion tool (previews only work on single-select). If AskUserQuestion is unavailable, show a numbered list of the options and moreOptions with their descriptions.
3. Map each chosen label through answerMap to a choice. "Not sure / don't know these games" maps to unsure; the topic comes back later without games. Labels in moreOptions (such as Blend of both) also map when the user types them. If the user picks Other, send choice "neither" with their text as note, or call versus_set if their text clearly states a position.
4. Call versus_answer with all answers from the round.
5. Every 5 rounds, give a one-line recap: what is now settled and the core progress (core.settled of core.total). Multi-select questions, including the systems checklist, take choice "neither" with selected keys (empty if none apply).
6. When versus_answer returns tensions, ask the probe question in your own words and record the reply with versus_reply (tensionId, response, stance accepted, mitigated or will_change). If the reply changes a position, also record it with versus_set.
7. When the user explains a nuance the options miss, improvise a follow-up with versus_ask (an existing axis or a customAxis).
8. Stop when stopRecommended is true (the brief is ready; offer to keep refining) or the user says so. Then call versus_brief and offer to save it to docs/design/<slug>-brief.md.`;

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'versus',
    {
      title: 'Start a game design interview',
      description: 'Start or continue a this-or-that design interview from a pitch.',
      argsSchema: z.object({ pitch: z.string().optional().describe('The game idea in a sentence or two') }),
    },
    ({ pitch }) => ({
      messages: [{ role: 'user', content: { type: 'text', text: `${PROTOCOL}\n\nPitch: ${pitch ?? '(ask the user for a one-line pitch first)'}` } }],
    }),
  );
  server.registerPrompt(
    'versus-resume',
    {
      title: 'Resume a design interview',
      description: 'Resume an existing session by id.',
      argsSchema: z.object({ sessionId: z.string() }),
    },
    ({ sessionId }) => ({
      messages: [{ role: 'user', content: { type: 'text', text: `${PROTOCOL}\n\nResume session ${sessionId}: call versus_status first, recap what is settled in one line, then continue the loop from step 2.` } }],
    }),
  );
  server.registerPrompt(
    'versus-brief',
    {
      title: 'Write the design brief',
      description: 'Generate and save the GDD seed brief for a session.',
      argsSchema: z.object({ sessionId: z.string() }),
    },
    ({ sessionId }) => ({
      messages: [{ role: 'user', content: { type: 'text', text: `Call versus_brief for session ${sessionId} with format markdown. Show the pitch, pillars and open questions, then offer to save the full brief to docs/design/<slug>-brief.md with outPath.` } }],
    }),
  );
}
