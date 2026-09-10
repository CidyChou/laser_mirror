import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import levelsRaw from '../src/levels/levels.json';
import bossesRaw from '../src/levels/time-bosses.json';
import handcrafted from '../src/levels/handcrafted.json';
import { GameSession } from '../src/gameplay/GameSession';
import type { LevelDefinition } from '../src/gameplay/types';
import { inspectLevel, layoutSimilarity, valueOf } from './level-quality';
import { verifyTimeBoss } from './verify-time-bosses';

const levels = levelsRaw as LevelDefinition[];
const errors: string[] = [];
const solutions: Record<number, LevelDefinition> = {};
assert.equal(levels.length, 130);
for (const [number, level] of Object.entries(handcrafted)) assert.deepEqual(levels[Number(number) - 1], level);
const report = levels.map((level, index) => {
  const number = index + 1;
  const { best, states, controlIndexes, freeIndexes, liveIndexes, ...metrics } = inspectLevel(level);
  const mostSimilar = levels.flatMap((other, j) => j === index ? [] : [{ number: j + 1, similarity: layoutSimilarity(level, other) }])
    .sort((a, b) => b.similarity - a.similarity)[0];
  const check = (condition: boolean, message: string) => { if (!condition) errors.push(`#${number}: ${message}`); };
  check(level.rows <= 8 && level.cols <= 8, 'board exceeds 8 × 8');
  check(!!best && !metrics.startsSolved, 'no solution or already solved start');
  if (number >= 101) {
    check(metrics.live >= 8, 'fewer than 8 live controls');
    check((metrics.minClicks ?? 0) >= 5, 'fewer than 5 clicks');
    check(metrics.correctLive >= 3 && metrics.wrongLive >= 3, 'start must mix retained and changed controls');
    check(metrics.temptingDecoys >= 1, 'no reachable wrong branch');
    check(!metrics.allFlipWins && !metrics.mirrorFlipWins, 'flip-all shortcut');
    check(mostSimilar.similarity <= .48, 'layout too similar to another board');
    check((metrics.effectiveBits ?? 0) >= 7, 'too many unconstrained settings');
    check(!metrics.bypassableMechanics.length, 'a featured mechanism can be blocked without breaking the closest solution');
  }
  if (best) {
    // Play the exact minimum-click solution through the actual session, including
    // charging and door timing. Solver success alone does not prove gameplay wins.
    const session = new GameSession([level]);
    for (const i of controlIndexes) {
      const size = level.items[i].type === 'combiner' ? 4 : 2;
      const clicks = (valueOf(best[i]) - valueOf(level.items[i]) + size) % size;
      for (let click = 0; click < clicks; click++) session.rotateAt(best[i].x, best[i].y);
    }
    session.fire(); session.update(0);
    for (let ms = 20; ms <= 120000 && session.state.firing; ms += 20) session.update(ms);
    check(session.state.won, 'minimum solution did not win in GameSession');
    solutions[number] = { ...level, items: best };
  }
  console.log(`#${number} clicks=${metrics.minClicks} live=${metrics.live} retain=${metrics.correctLive} tempting=${metrics.temptingDecoys} solutions=${metrics.solutions}`);
  return { number, ...metrics, mostSimilar };
});
const bossReport=(bossesRaw as LevelDefinition[]).map((_,index)=>verifyTimeBoss(levels[index*10+9],(index+1)*10));
writeFileSync('docs/level-audit-after.json', JSON.stringify(report, null, 2) + '\n');
// Development-only review fixture; not imported by the shipped game.
writeFileSync('tools/visual/campaign-solutions.json', JSON.stringify(solutions, null, 2) + '\n');
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`${report.length} original levels and ${bossReport.length} separate chapter challenges verified; handcrafted boards and challenge quality checks passed.`);
