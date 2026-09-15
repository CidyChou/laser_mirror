import { GameApplication } from '@/app/GameApplication';
import { nowMs } from '@/core/clock';
import { WebPlatform } from '@/platform/web/WebPlatform';
import type { GameSession } from '@/gameplay/GameSession';
import type { TutorialDirector } from '@/gameplay/tutorial';
import type { PixiGameView } from '@/rendering/PixiGameView';
import { LevelRepository } from '@/levels/LevelRepository';
import { stageId } from '@/levels/campaign';
import { tutorialLessonIds } from '@/gameplay/tutorial';

// Exercise the real application with isolated in-memory progress. Never touches the player's save.
const params = new URLSearchParams(location.search);
const levels = new LevelRepository().levels;
const requestedStage = params.get('stage');
const number = Number(params.get('level') ?? 1);
const index = Math.max(0, levels.findIndex(level => requestedStage ? stageId(level) === requestedStage : level.campaign?.kind === 'normal' && level.campaign.displayNumber === number));
const storage = new Map<string, string>([
  ['laser-mirror-completed-stages-v2', JSON.stringify(levels.slice(0, index).map(stageId))],
  ['laser-mirror-current-stage-v2', stageId(levels[index])],
  ['laser-mirror-audio-enabled', '0'],
  ['laser-mirror-haptics-enabled', '0'],
  ['laser-mirror-theme', params.get('theme') ?? 'void'],
]);
if (params.get('learned') === '1') storage.set('laser-mirror-tutorial-v1', JSON.stringify([...new Set(levels.flatMap(tutorialLessonIds))]));
const platform = new WebPlatform();
platform.safeTop = () => Math.max(0, Math.min(100, Number(params.get('safeTop')) || 0));
platform.storage = { get: key => storage.get(key) ?? null, set: (key, value) => { storage.set(key, value); } };
const game = new GameApplication(platform);
await game.start();
const debug = game as unknown as { session: GameSession; tutorial: TutorialDirector; view: PixiGameView };
debug.session.load(index);
const now = nowMs();
const combo = Number(params.get('combo') || 0);
const charge = params.get('charge');
if (combo >= 2) {
  debug.view.showCombo(combo, now - 420);
  debug.view.update(debug.session.state, now);
}
if (charge != null && charge !== '') debug.view.setFireCharge(Math.min(1, Math.max(0, Number(charge))), now);
const overlay = params.get('overlay');
if (overlay === 'settings') debug.view.showSettings(false, false, (params.get('theme') ?? 'void') as 'void' | 'aurora' | 'atelier');
if (overlay === 'result') {
  debug.view.showResult('win', {
    title: '通关',
    subtitle: '第 2 关',
    tip: '光路接通',
    primary: '下一关',
    reward: 20,
  }, now - 900);
  debug.view.update(debug.session.state, now);
}
Object.assign(window, { tutorialQA: { game: debug, storage } });
