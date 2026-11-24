import { McpServer } from '@modelcontextprotocol/server';
import { knowledge } from './engine/data';
import { registerTools } from './tools/index';
import { registerResources } from './resources';
import { registerPrompts } from './prompts';

export const SERVER_NAME = 'game-design-versus';
export const SERVER_VERSION = '0.1.0';

/** Factory used by serveStdio (one instance per connection) and by tests. */
export function buildServer(): McpServer {
  const k = knowledge();
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        'This-or-that game design interviewer. You ask, the server referees: call versus_start, then loop versus_next / versus_answer, rendering each askUserQuestion object verbatim. Stop when stopRecommended is true, then call versus_brief.',
    },
  );
  registerTools(server, k);
  registerResources(server, k);
  registerPrompts(server);
  return server;
}
