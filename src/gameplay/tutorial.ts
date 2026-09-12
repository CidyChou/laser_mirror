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
  completes?: string | string[];
}
interface Lesson { id: string; title: string; body: string; anchors: TutorialAnchor[]; completes?: string[] }
export const MAX_TUTORIAL_STEPS = 3;
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
  const add = (id: string, title: string, body: string, anchors: TutorialAnchor[], completes?: string[]) => lessons.push({id,title,body,anchors,completes});
  for (const need of new Set(sorted.filter(i => i.type === 'combiner').map(combinerNeed))) {
    const core = sorted.find(i => i.type === 'combiner' && combinerNeed(i) === need)!;
    add(`combiner-${need}`, '汇光，再出发', `${need} 个方向的光汇入后，沿箭头发射。${movable(core) ? '\n点按核心可转动箭头。' : ''}`, [cell(core)]);
  }
  const portal = sorted.find(i => i.type === 'portal');
  if (portal) add('portal', '同色传送', '光稍作停留，从同色另一端射出，方向不变。', sorted.filter(i => i.type === 'portal' && i.pair === portal.pair).map(cell));
  const door = sorted.find(i => i.type === 'door' && i.requires.length > 1) ?? sorted.find(i => i.type === 'door');
  const sw = sorted.find(i => i.type === 'switch');
  if (door?.type === 'door') {
    const multi = door.requires.length > 1;
    add(multi ? 'multi-lock' : 'door', multi ? '集齐开关，再开门' : '点亮开关，打开光门',
      multi ? `同一次发射，点亮这扇门的 ${door.requires.length} 个开关。` : '用光点亮同字母开关，光门就会打开。',
      [cell(door), ...sorted.filter(i => i.type === 'switch' && door.requires.includes(i.id)).map(cell)], multi ? ['switch','door','multi-lock'] : ['switch','door']);
  } else if (sw) add('switch', '点亮开关', '让光穿过开关，打开对应光门。', [cell(sw)]);
  for (const need of new Set(sorted.filter(i => i.type === 'focus').map(focusNeed))) {
    const focus = sorted.find(i => i.type === 'focus' && focusNeed(i) === need)!;
    add(`focus-${need}`, '从不同方向充能', `接入 ${need} 个方向的光，充满这颗晶体。`, [cell(focus)]);
  }
  const splitter = sorted.find(i => i.type === 'splitter');
  if (splitter) add('splitter', '一束分两路', '一束直行，一束转弯。用它连接两条路线。', [cell(splitter)]);
  const emitters = levelEmitters(level);
  if (emitters.length > 1) add('multi-source', '多束光，一起出发', '所有光源同时发射，分别安排好路线。', emitters.map(port));
  const fixed = sorted.find(i => ['mirror','splitter','combiner'].includes(i.type) && 'fixed' in i && i.fixed);
  if (fixed) add('fixed-mirror', '带锁的不能转', '保留它的方向，调整其他镜子接通光路。', [cell(fixed)], ['fixed-mirror','fixed-splitter','fixed-combiner']);
  return lessons;
}

export function tutorialLessonIds(level: LevelDefinition): string[] {
  return ['basics','mirror', ...lessonsFor(level, level.items).flatMap(l => l.completes ?? [l.id]), ...(level.timeBoss ? ['challenge'] : [])];
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
    const {level,items} = state;
    // Earlier releases taught fixed optics separately; any of those lessons
    // already explains the shared lock symbol.
    if(['fixed-mirror','fixed-splitter','fixed-combiner'].some(id=>this.seen.has(id)))this.seen.add('fixed-mirror');
    const unseen = (id: string) => replay || !this.seen.has(id);
    const basics = unseen('basics');
    const lessons = lessonsFor(level,items).filter(l=>unseen(l.id));
    this.steps=[];this.index=0;
    if(state.won)return;
    const addInfo=(id:string,title:string,body:string,anchors:TutorialAnchor[],completes:string|string[]=id)=>
      this.steps.push({id,title,body,anchors,action:'next',completes});
    if(basics){
      const solution=!level.timeBoss&&lessons.length===0?tutorialSolution(level,items):null;
      const changed=solution?items.filter(movable).filter(item=>value(item)!==value(solution.find(i=>i.x===item.x&&i.y===item.y)!)):[];
      const guided=!!solution&&changed.length<=1;
      addInfo('source','接通光路','转动镜子，让光到达所有终点。',[...levelEmitters(level).map(port),...goalAnchors(level)],guided?[]:['basics','mirror']);
      if(guided){
        for(const item of changed){
          const answer=solution!.find(i=>i.x===item.x&&i.y===item.y)!;
          this.steps.push({id:'mirror-practice',title:'点一下镜子',body:'让光朝终点转弯。',anchors:[cell(item)],action:'rotate',desired:value(answer),completes:'mirror'});
        }
        this.steps.push({id:'fire',title:'发射试试',body:'点亮终点就过关。失败才扣爱心。',anchors:[{kind:'fire'}],action:'fire',completes:['basics','mirror']});
        return;
      }
    }
    if(level.timeBoss&&unseen('challenge')){
      addInfo('challenge','边走，边换向',`发射后可换向 ${level.timeBoss.adjustmentUses} 次。\n激光逐渐缩短，消失即失败。`,items.filter(movable).slice(0,3).map(cell));
    }
    // New mechanics get one short card. Unshown lessons remain unseen and can
    // appear on a later board, instead of stacking a long introduction now.
    for(const lesson of lessons.slice(0,MAX_TUTORIAL_STEPS-this.steps.length)){
      addInfo(lesson.id,lesson.title,lesson.body,lesson.anchors,lesson.completes??lesson.id);
    }
    if(this.steps.length)this.steps[this.steps.length-1].button='开始玩';
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
    for (const step of this.steps) for (const id of completionIds(step)) this.seen.add(id);
    this.index = this.steps.length; this.save(this.seen);
  }
  clear() { this.seen.clear(); this.steps = []; this.index = 0; this.save(this.seen); }
  private advance() {
    const completed=this.current?completionIds(this.current):[];
    if(completed.length){for(const id of completed)this.seen.add(id);this.save(this.seen);}
    this.index++;
  }
}

function completionIds(step:TutorialStep):string[]{return Array.isArray(step.completes)?step.completes:step.completes?[step.completes]:[];}
