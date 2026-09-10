import { GameApplication } from '@/app/GameApplication';
import { WebPlatform } from '@/platform/web/WebPlatform';
import type { GameSession } from '@/gameplay/GameSession';
import type { TutorialDirector } from '@/gameplay/tutorial';
import type { PixiGameView } from '@/rendering/PixiGameView';

// Exercise the real application with isolated in-memory progress. Never touches the player's save.
const params = new URLSearchParams(location.search);
const index = Math.max(0, Math.min(129, Number(params.get('level') ?? 1) - 1));
const storage = new Map<string, string>([
  ['laser-mirror-completed-levels', JSON.stringify(Array.from({ length: index }, (_, i) => i))],
  ['laser-mirror-current-level', String(index)],
  ['laser-mirror-audio-enabled', '0'],
  ['laser-mirror-haptics-enabled', '0'],
  ['laser-mirror-theme', params.get('theme') ?? 'void'],
]);
const platform = new WebPlatform();
platform.storage = { get: key => storage.get(key) ?? null, set: (key, value) => { storage.set(key, value); } };
const game = new GameApplication(platform);
await game.start();
const debug = game as unknown as { session: GameSession; tutorial: TutorialDirector; view: PixiGameView };
debug.session.load(index);
Object.assign(window, { tutorialQA: { game: debug, storage } });
