import assert from 'node:assert/strict';
import { GameSession } from '../src/gameplay/GameSession';
import { TutorialDirector, isChallengeLevel, tutorialLessonIds, tutorialSolution } from '../src/gameplay/tutorial';
import { computeGeometry } from '../src/gameplay/geometry';
import { LaserSimulator } from '../src/gameplay/LaserSimulator';
import { itemKey } from '../src/gameplay/levelAccess';
import { loadTutorialProgress, TUTORIAL_STORAGE_KEY } from '../src/progression/tutorialProgress';
import type { LevelDefinition } from '../src/gameplay/types';
import type { IPlatform } from '../src/platform/IPlatform';
import { hydrateLevels, toGameLevel } from '../tools/gm/schema';
import raw from '../src/levels/levels.json';
import { LevelRepository } from '../src/levels/LevelRepository';

const levels = raw as LevelDefinition[];
const sim = new LaserSimulator();
let writes = 0;
const seen = new Set<string>();
const guide = new TutorialDirector(seen, () => { writes++; });
const session = new GameSession(levels);
session.on(event => {
  if (event.type === 'rotate') guide.rotated(session.state, event.x, event.y);
  if (event.type === 'victory') guide.victory();
});
function completeGuide() {
  let count = 0;
  while (guide.current) {
    assert(++count < 100, 'Every guide must have a reachable end');
    const step = guide.current;
    if (step.action === 'next') guide.next();
    else if (step.action === 'rotate') {
      const a = step.anchors[0]; assert(a.kind === 'cell');
      assert(!guide.allowsFire());
      assert(!guide.allowsRotate(-1, -1));
      guide.next(); assert.equal(guide.current, step, 'Next must not skip an exercise');
      session.rotateAt(a.x, a.y);
    } else {
      assert(guide.allowsFire());
      session.fire(); session.update(0);
      for (let ms = 16; ms < 60000 && session.state.firing; ms += 16) session.update(ms);
      assert(session.state.won, 'A forced fire must use an actual solution');
      assert.equal(session.state.hearts, 5, 'The first guided success should cost no hearts');
    }
  }
}
guide.enter(session.state); completeGuide();
assert(seen.has('basics') && seen.has('mirror'));
session.reset(); guide.enter(session.state); assert.equal(guide.current, null);

// Moving the emitter, mirror and target, changing dimensions and item ordering needs no tutorial edits.
const moved: LevelDefinition = { ...levels[0], cols: 5, rows: 4, emitter: { side: 'E', index: 2 }, targets: [{ side: 'S', index: 3 }],
  items: [{ type: 'wall', x: 0, y: 0 }, { type: 'mirror', x: 3, y: 2, s: 0 }] };
const movedSession = new GameSession([moved]);
const movedGuide = new TutorialDirector(new Set(), () => {});
movedGuide.enter(movedSession.state);
const planned = [];
while (movedGuide.current) {
  const step = movedGuide.current; planned.push(step);
  if (step.action === 'next') movedGuide.next();
  else if (step.action === 'rotate') {
    const a = step.anchors[0]; assert(a.kind === 'cell'); assert.deepEqual([a.x, a.y], [3, 2]);
    movedSession.rotateAt(a.x, a.y); movedGuide.rotated(movedSession.state, a.x, a.y);
  } else {
    const trace = sim.simulate(moved, movedSession.state.items, computeGeometry(moved));
    assert(trace.hits.every(Boolean)); movedGuide.victory();
  }
}
assert(planned.some(s => s.action === 'rotate'));

// A board already aimed correctly has no forced rotation; an impossible/large board has no forced shot.
const solved = { ...levels[0], items: [{ type: 'mirror', x: 1, y: 1, s: 1 }] } as LevelDefinition;
for (const board of [solved, { ...levels[0], items: [] }, levels[100]]) {
  const director = new TutorialDirector(new Set(), () => {});
  director.enter(new GameSession([board]).state);
  let steps = 0;
  while (director.current) {
    assert(++steps < 100); assert.notEqual(director.current.action, 'rotate');
    if (director.current.action === 'fire') { assert.equal(board, solved); director.victory(); }
    else director.next();
  }
}

// Discover every first-use lesson from the full campaign, even when playing out of order.
for (let i = 1; i < levels.length; i++) {
  session.load(i); guide.enter(session.state); completeGuide();
  for (const id of tutorialLessonIds(levels[i])) assert(seen.has(id), `Missing ${id} at ${i + 1}`);
}
assert(seen.has('fixed-mirror') && seen.has('fixed-splitter') && seen.has('wall'));
assert(seen.has('portal') && seen.has('switch') && seen.has('door') && seen.has('multi-lock'));
assert(seen.has('focus-2') && seen.has('combiner-2'));
assert(writes > 0);
session.load(40); guide.enter(session.state, true); assert(guide.current); guide.skip();
assert.equal(guide.current, null); assert(guide.allowsFire() && guide.allowsRotate(0, 0));
guide.clear(); guide.enter(session.state); assert.equal(guide.current?.id, 'source');

// Paired anchors are matched by ID, not by item order or proximity. Counts teach new variants.
const portals = new TutorialDirector(new Set(['basics', 'mirror']), () => {});
const portalState = new GameSession([levels[40]]).state;
portalState.items.reverse(); portals.enter(portalState);
assert.equal(portals.current?.id, 'portal'); assert.equal(portals.current?.anchors.length, 2);
const variant: LevelDefinition = { ...levels[60], items: levels[60].items.map(i => i.type === 'focus' ? { ...i, need: 3 } : i) };
assert(tutorialLessonIds(variant).includes('focus-3'));
const focusOnly: LevelDefinition = { ...levels[0], targets: [], items: [{ type: 'focus', x: 1, y: 1 }] };
const focusGuide = new TutorialDirector(new Set(), () => {});
focusGuide.enter(new GameSession([focusOnly]).state); focusGuide.next();
assert.equal(focusGuide.current?.anchors[0].kind, 'cell');

// Persisted progress, old-player migration, corrupt data, clear/replay, and GM export.
const storage = new Map<string, string>();
const platform = { storage: { get: (k: string) => storage.get(k) ?? null, set: (k: string, v: string) => { storage.set(k, v); } } } as IPlatform;
assert(loadTutorialProgress(platform, levels, new Set([0])).has('basics'));
assert(!loadTutorialProgress(platform, levels, new Set([0])).has('splitter'));
storage.set(TUTORIAL_STORAGE_KEY, '[]'); assert.equal(loadTutorialProgress(platform, levels, new Set([0])).size, 0);
storage.set(TUTORIAL_STORAGE_KEY, '{broken'); assert(loadTutorialProgress(platform, levels, new Set([0])).has('mirror'));
storage.set(TUTORIAL_STORAGE_KEY, '[null,12,"portal"]'); assert.deepEqual([...loadTutorialProgress(platform, levels, new Set())], ['portal']);
const importedChallenge = toGameLevel(hydrateLevels([{ ...levels[100], mode: 'challenge' }])[0]);
assert.equal(importedChallenge.mode, 'challenge');
const challenge = new LevelRepository().timeBosses[0];
assert(isChallengeLevel(challenge)); assert(tutorialLessonIds(challenge).includes('challenge'));

// The simplified introduction boards still solve, and no unrelated mirror remains in their lesson.
for (const number of [11, 31, 41, 61, 71]) {
  const board = levels[number - 1], answer = tutorialSolution(board, board.items);
  assert(answer, `Introduction ${number} must be solvable within the teaching budget`);
  const trace = sim.simulate(board, answer, computeGeometry(board));
  assert(trace.hits.every(Boolean));
  assert(answer.every(i => i.type !== 'focus' || trace.focusOn[itemKey(i.x, i.y)]));
}
console.log('Tutorial verified: guided victory, all 130 boards, adaptive positions, solved/unsolvable/large fallbacks, new mechanisms/counts, persistence/replay, GM challenge round-trip and simplified introductions.');
