import { computeGeometry } from './geometry';
import { LaserSimulator } from './LaserSimulator';
import { combinerNeed, focusNeed, itemKey, levelEmitters } from './levelAccess';
import type { GameState, LevelDefinition, LevelItem, Port } from './types';

export type TutorialAnchor = { kind: 'cell'; x: number; y: number } | { kind: 'port'; port: Port } | { kind: 'fire' };
export interface TutorialStep {
  id: string;
  title: string;
  body: string;
  anchors: TutorialAnchor[];
  action: 'next' | 'rotate' | 'fire';
  button?: string;
  desired?: number;
  completes?: string;
}
interface Lesson { id: string; title: string; body: string; anchors: TutorialAnchor[]; control?: LevelItem }
const cell = (item: LevelItem): TutorialAnchor => ({ kind: 'cell', x: item.x, y: item.y });
const port = (value: Port): TutorialAnchor => ({ kind: 'port', port: value });
const movable = (item: LevelItem) => ['mirror', 'splitter', 'combiner'].includes(item.type) && !('fixed' in item && item.fixed);
const value = (item: LevelItem) => item.type === 'combiner' ? item.dir : item.type === 'mirror' || item.type === 'splitter' ? item.s : 0;
const goalAnchors = (level: LevelDefinition) => [...level.targets.map(port), ...level.items.filter(i => i.type === 'focus').map(cell)];

/** Challenge is level metadata, so moving or inserting a board does not move its tutorial. */
export function isChallengeLevel(level: LevelDefinition) {
  return level.mode === 'challenge' || level.campaign?.kind === 'boss' || Boolean(level.timeBoss);
}

/** Everything is discovered from the live board, including paired portals and multi-key doors. */
function lessonsFor(level: LevelDefinition, items: LevelItem[]): Lesson[] {
  const lessons: Lesson[] = [];
  const sorted = [...items].sort((a, b) => Number('decoy' in a && !!a.decoy) - Number('decoy' in b && !!b.decoy) || a.y - b.y || a.x - b.x);
  const add = (id: string, title: string, body: string, anchors: TutorialAnchor[], control?: LevelItem) => lessons.push({ id, title, body, anchors, control });
  const mirror = sorted.find(i => i.type === 'mirror' && !i.fixed);
  if (mirror) add('mirror', '镜子让光转弯', '点按镜子，切换镜面的倾斜方向。\n旋转不消耗爱心，可以反复调整。', [cell(mirror)], mirror);
  for (const type of ['mirror', 'splitter', 'combiner'] as const) {
    const fixed = sorted.find(i => i.type === type && i.fixed);
    if (fixed) add(`fixed-${type}`, `固定${type === 'mirror' ? '镜' : type === 'splitter' ? '分光镜' : '聚合核心'}`, '带锁的底座不能旋转。\n利用它现有的方向，调整其他镜子接通光路。', [cell(fixed)]);
  }
  const splitter = sorted.find(i => i.type === 'splitter');
  if (splitter) add('splitter', '一束光，分成两路', '分光镜让一束光继续直行，另一束反射转弯。\n用两条分支连接不同的目标或机关。', [cell(splitter)], movable(splitter) ? splitter : undefined);
  const wall = sorted.find(i => i.type === 'wall');
  if (wall) add('wall', '遇到墙，就要绕路', '墙会挡住激光，也不能移动。\n利用镜子改变方向，从空出的格子绕过去。', [cell(wall)]);
  const sw = sorted.find(i => i.type === 'switch');
  if (sw) add('switch', '用激光点亮开关', '光穿过圆形开关时，会点亮它。\n信号会传到对应的光门，让光路继续前进。', [cell(sw), ...sorted.filter(i => i.type === 'door' && i.requires.includes(sw.id)).map(cell)]);
  const door = sorted.find(i => i.type === 'door');
  if (door) add('door', '先开锁，再通行', '沿光门的连线找到对应开关。\n本次发射点亮所需开关后，光门自动打开。', [cell(door), ...sorted.filter(i => i.type === 'switch' && door.requires.includes(i.id)).map(cell)]);
  const multiDoor = sorted.find(i => i.type === 'door' && i.requires.length > 1);
  if (multiDoor?.type === 'door') add('multi-lock', '一扇门，多把钥匙', `这扇光门需要 ${multiDoor.requires.length} 个开关全部点亮。\n同一次发射中，每条开关支路都要接通。`, [cell(multiDoor), ...sorted.filter(i => i.type === 'switch' && multiDoor.requires.includes(i.id)).map(cell)]);
  const portal = sorted.find(i => i.type === 'portal');
  if (portal) add('portal', '同色传送，方向不变', '光会从同色、同标记的另一端出现。\n传送前后的前进方向保持不变。', sorted.filter(i => i.type === 'portal' && i.pair === portal.pair).map(cell));
  const emitters = levelEmitters(level);
  if (emitters.length > 1) add('multi-source', '多个光源，一起出发', `本关有 ${emitters.length} 个光源，点击发射会同时启动。\n分别追踪每束光，安排它们各自的路线。`, emitters.map(port));
  if (level.targets.length > 1) add('multi-target', '每个终点都要亮', `本关有 ${level.targets.length} 个边缘终点。\n一次发射中全部点亮，才算接通光路。`, level.targets.map(port));
  for (const need of new Set(sorted.filter(i => i.type === 'focus').map(focusNeed))) {
    const focus = sorted.find(i => i.type === 'focus' && focusNeed(i) === need)!;
    add(`focus-${need}`, `${need} 束光，充满终点`, `这个菱形终点需要来自 ${need} 个不同方向的光。\n填满它的能量格，也别漏掉其他终点。`, [cell(focus)]);
  }
  for (const need of new Set(sorted.filter(i => i.type === 'combiner').map(combinerNeed))) {
    const combiner = sorted.find(i => i.type === 'combiner' && combinerNeed(i) === need)!;
    add(`combiner-${need}`, '聚合后，再次出发', `先从${need}个不同方向，把光送入核心。\n${movable(combiner) ? '蓄力后沿箭头发射，点按可旋转箭头。' : '蓄力后沿固定箭头发射，继续接通光路。'}`, [cell(combiner)], movable(combiner) ? combiner : undefined);
  }
  return lessons;
}

export function tutorialLessonIds(level: LevelDefinition): string[] {
  return ['basics', ...lessonsFor(level, level.items).map(l => l.id), ...(isChallengeLevel(level) ? ['challenge'] : [])];
}

/** A small, bounded search helps teach simple boards without storing an answer or coordinates.
 * Large/unsolvable edited boards fall back to explanations, never to an impossible forced tap.
 * Runs only when entering/replaying a lesson, never in the render loop. */
export function tutorialSolution(level: LevelDefinition, original: LevelItem[]): LevelItem[] | null {
  const controls = original.flatMap((item, index) => movable(item) ? [index] : []);
  const states = controls.reduce((n, i) => n * (original[i].type === 'combiner' ? 4 : 2), 1);
  if (states > 256) return null;
  const items = original.map(i => ({ ...i }));
  const simulator = new LaserSimulator(), geometry = computeGeometry(level);
  const initial = simulator.simulate(level, items, geometry);
  if (initial.hits.every(Boolean) && items.every(i => i.type !== 'focus' || initial.focusOn[itemKey(i.x, i.y)])) return items;
  let best: LevelItem[] | null = null, bestClicks = Infinity;
  const started = Date.now();
  for (let code = 0; code < states; code++) {
    if (code > 0 && Date.now() - started > 24) break;
    let rest = code, clicks = 0;
    for (const i of controls) {
      const item = items[i], size = item.type === 'combiner' ? 4 : 2, next = rest % size;
      rest = Math.floor(rest / size);
      clicks += (next - value(original[i]) + size) % size;
      if (item.type === 'combiner') item.dir = next as 0 | 1 | 2 | 3;
      if (item.type === 'mirror' || item.type === 'splitter') item.s = next as 0 | 1;
    }
    if (clicks >= bestClicks) continue;
    const result = simulator.simulate(level, items, geometry);
    if (result.hits.every(Boolean) && items.every(i => i.type !== 'focus' || result.focusOn[itemKey(i.x, i.y)])) {
      best = items.map(i => ({ ...i })); bestClicks = clicks;
    }
  }
  return best;
}

export class TutorialDirector {
  private steps: TutorialStep[] = [];
  private index = 0;
  constructor(private seen: Set<string>, private readonly save: (seen: ReadonlySet<string>) => void) {}
  get current(): TutorialStep | null { return this.steps[this.index] ?? null; }
  get progress() { return { current: this.index + 1, total: this.steps.length }; }

  enter(state: GameState, replay = false) {
    const { level, items } = state;
    const unseen = (id: string) => replay || !this.seen.has(id);
    const basics = unseen('basics');
    const lessons = lessonsFor(level, items).filter(l => unseen(l.id));
    this.steps = []; this.index = 0;
    if (state.won || (!basics && !lessons.length && !(isChallengeLevel(level) && unseen('challenge')))) return;
    const solution = (basics || lessons.some(l => l.control)) ? tutorialSolution(level, items) : null;
    const addInfo = (id: string, title: string, body: string, anchors: TutorialAnchor[], completes?: string) =>
      this.steps.push({ id, title, body, anchors, action: 'next', completes });
    if (basics) {
      addInfo('source', '从这里，发出第一束光', '这是激光发射器。\n先规划路线，再点击下方的「发射」。', levelEmitters(level).map(port));
      addInfo('goals', '让光到达所有终点', '高亮的位置就是本关的目标。\n用镜子连接光源和目标，一次发射全部点亮。', goalAnchors(level));
    }
    if (isChallengeLevel(level) && unseen('challenge')) {
      addInfo('challenge', '进入挑战关卡', `本关有 ${levelEmitters(level).length} 个光源、${goalAnchors(level).length} 个目标。\n先从终点倒推路线，再检查每条分支上的机关。`, goalAnchors(level));
      addInfo('challenge-plan', '先观察，再动手', '有些镜面已经朝向正确方向，无需全部旋转。\n旋转不扣爱心；发射失败才扣 1 颗。', items.filter(movable).slice(0, 3).map(cell), 'challenge');
    }
    for (const lesson of lessons) {
      const target = lesson.control;
      const solvedItem = target && solution?.find(i => i.x === target.x && i.y === target.y);
      const practice = target && solvedItem && value(target) !== value(solvedItem);
      addInfo(lesson.id, lesson.title, lesson.body, lesson.anchors, practice ? undefined : lesson.id);
      if (practice) this.steps.push({
        id: `${lesson.id}-practice`, title: target.type === 'combiner' ? '试着转动输出箭头' : '点一下，让光转弯',
        body: target.type === 'combiner' ? '跟着手指点按核心，调整箭头方向。' : '跟着手指点按高亮的镜面，调整这段光路。',
        anchors: [cell(target)], action: 'rotate', desired: value(solvedItem), completes: lesson.id,
      });
    }
    if (basics) {
      // Lessons may already rotate a control. Track their desired values to avoid stale/redundant steps.
      if (solution) {
        const planned = new Map(this.steps.filter(s => s.action === 'rotate').map(s => {
          const a = s.anchors[0] as Extract<TutorialAnchor, { kind: 'cell' }>;
          return [itemKey(a.x, a.y), s.desired];
        }));
        for (const item of items.filter(movable)) {
          const solved = solution.find(i => i.x === item.x && i.y === item.y)!;
          if ((planned.get(itemKey(item.x, item.y)) ?? value(item)) === value(solved)) continue;
          this.steps.push({ id: `route-${itemKey(item.x, item.y)}`, title: '接上下一段光路', body: '继续点按高亮的镜面，连接通往终点的路线。', anchors: [cell(item)], action: 'rotate', desired: value(solved) });
        }
        this.steps.push({ id: 'fire', title: '路线就绪，发射！', body: '点击「发射」，看看光如何到达终点。\n旋转不扣爱心；发射失败才扣 1 颗。', anchors: [{ kind: 'fire' }], action: 'fire', completes: 'basics' });
      } else {
        addInfo('explore', '现在，试着接通光路', '点按镜面可以反复调整方向。\n确认所有目标都有光到达，再点击「发射」。', [{ kind: 'fire' }], 'basics');
        this.steps[this.steps.length - 1].button = '开始游玩';
      }
    }
  }

  next() { if (this.current?.action === 'next') this.advance(); }
  rotated(state: GameState, x: number, y: number) {
    const step = this.current, anchor = step?.anchors[0];
    if (step?.action !== 'rotate' || anchor?.kind !== 'cell' || anchor.x !== x || anchor.y !== y) return;
    const item = state.items.find(i => i.x === x && i.y === y);
    if (item && (step.desired === undefined || value(item) === step.desired)) this.advance();
  }
  victory() { if (this.current?.action === 'fire') this.advance(); }
  allowsRotate(x: number, y: number) {
    const step = this.current, a = step?.anchors[0];
    return !step || (step.action === 'rotate' && a?.kind === 'cell' && a.x === x && a.y === y);
  }
  allowsFire() { return !this.current || this.current.action === 'fire'; }
  skip() {
    for (const step of this.steps) if (step.completes) this.seen.add(step.completes);
    this.index = this.steps.length; this.save(this.seen);
  }
  clear() { this.seen.clear(); this.steps = []; this.index = 0; this.save(this.seen); }
  private advance() {
    const completed = this.current?.completes;
    if (completed) { this.seen.add(completed); this.save(this.seen); }
    this.index++;
  }
}
