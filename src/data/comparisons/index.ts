// Static index so esbuild can bundle every comparison file. validate-data checks this list matches the directory.
import camera_controls from './camera_controls.json';
import card from './card.json';
import combat from './combat.json';
import crafting_building_survival from './crafting_building_survival.json';
import economy from './economy.json';
import experience from './experience.json';
import failure_difficulty from './failure_difficulty.json';
import fighting from './fighting.json';
import frame from './frame.json';
import genre from './genre.json';
import horror from './horror.json';
import idle from './idle.json';
import loop from './loop.json';
import management from './management.json';
import meta from './meta.json';
import movement from './movement.json';
import multiplayer from './multiplayer.json';
import narrative from './narrative.json';
import party from './party.json';
import presentation from './presentation.json';
import progression from './progression.json';
import puzzle from './puzzle.json';
import racing from './racing.json';
import rhythm from './rhythm.json';
import sports from './sports.json';
import strategy from './strategy.json';
import world from './world.json';

export const COMPARISON_FILES: Record<string, unknown> = {
  camera_controls,
  card,
  combat,
  crafting_building_survival,
  economy,
  experience,
  failure_difficulty,
  fighting,
  frame,
  genre,
  horror,
  idle,
  loop,
  management,
  meta,
  movement,
  multiplayer,
  narrative,
  party,
  presentation,
  progression,
  puzzle,
  racing,
  rhythm,
  sports,
  strategy,
  world,
};
