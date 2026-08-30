export const MAX_COLS = 8;
export const MAX_ROWS = 12;

export const CHAPTERS = [
  { no: 1, name: '光的方向' },
  { no: 2, name: '分光实验' },
  { no: 3, name: '障碍区域' },
  { no: 4, name: '能源机关' },
  { no: 5, name: '空间谜题' },
] as const;

export type Side = 'N' | 'E' | 'S' | 'W';
export type Orientation = 0 | 1;
export type Port = { side: Side; index: number };

export type LevelItem =
  | { type: 'mirror'; x: number; y: number; s: Orientation; fixed?: boolean; decoy?: boolean }
  | { type: 'splitter'; x: number; y: number; s: Orientation; fixed?: boolean; decoy?: boolean }
  | { type: 'wall'; x: number; y: number }
  | { type: 'switch'; x: number; y: number; id: string }
  | { type: 'door'; x: number; y: number; id: string; requires: string[] }
  | { type: 'portal'; x: number; y: number; pair: string };

export type PlaceableType = LevelItem['type'];

export type GameLevel = {
  name: string;
  chapter: string;
  rows: number;
  cols: number;
  emitter: Port;
  targets: Port[];
  items: LevelItem[];
  hint: string;
  chapterNo: number;
  shots: number;
};

export type GmLevel = GameLevel & { id: string };

export type GmStoreFile = {
  version: 1;
  levels: GmLevel[];
};

export type Tool =
  | 'select'
  | 'eraser'
  | 'mirror'
  | 'splitter'
  | 'wall'
  | 'switch'
  | 'door'
  | 'portal'
  | 'emitter'
  | 'target';

export const TOOLS: Array<{ id: Tool; label: string; hint: string }> = [
  { id: 'select', label: '选择', hint: 'V' },
  { id: 'eraser', label: '擦除', hint: 'X' },
  { id: 'mirror', label: '反射镜', hint: '1' },
  { id: 'splitter', label: '分光镜', hint: '2' },
  { id: 'wall', label: '墙', hint: '3' },
  { id: 'switch', label: '开关', hint: '4' },
  { id: 'door', label: '门', hint: '5' },
  { id: 'portal', label: '传送门', hint: '6' },
  { id: 'emitter', label: '发射器', hint: '7' },
  { id: 'target', label: '接收器', hint: '8' },
];

export const ITEM_LABELS: Record<PlaceableType | 'emitter' | 'target', string> = {
  mirror: '反射镜',
  splitter: '分光镜',
  wall: '墙',
  switch: '开关',
  door: '门',
  portal: '传送门',
  emitter: '发射器',
  target: '接收器',
};

const SIDES: Side[] = ['N', 'E', 'S', 'W'];

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `lv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function portLimit(side: Side, rows: number, cols: number): number {
  return side === 'N' || side === 'S' ? cols : rows;
}

export function clampPort(port: Port, rows: number, cols: number): Port {
  const side = SIDES.includes(port?.side) ? port.side : 'W';
  const limit = portLimit(side, rows, cols);
  const index = Math.max(0, Math.min(limit - 1, Math.floor(Number(port?.index) || 0)));
  return { side, index };
}

export function samePort(a: Port, b: Port): boolean {
  return a.side === b.side && a.index === b.index;
}

export function withId(level: GameLevel, id = newId()): GmLevel {
  return { ...structuredClone(level), id };
}

export function emptyLevel(partial: Partial<GmLevel> = {}): GmLevel {
  const rows = clampInt(partial.rows ?? 5, 1, MAX_ROWS);
  const cols = clampInt(partial.cols ?? 5, 1, MAX_COLS);
  const chapterNo = clampInt(partial.chapterNo ?? 1, 1, 99);
  const chapter = partial.chapter ?? CHAPTERS.find(c => c.no === chapterNo)?.name ?? '未分类';
  return {
    id: partial.id ?? newId(),
    name: partial.name ?? '新关卡',
    chapter,
    chapterNo,
    rows,
    cols,
    emitter: clampPort(partial.emitter ?? { side: 'W' as Side, index: Math.floor(rows / 2) }, rows, cols),
    targets: (partial.targets?.length ? partial.targets : [{ side: 'E' as Side, index: Math.floor(rows / 2) }])
      .map(t => clampPort({ side: t.side as Side, index: t.index }, rows, cols)),
    items: Array.isArray(partial.items) ? structuredClone(partial.items) : [],
    shots: clampInt(partial.shots ?? 5, 1, 99),
    hint: partial.hint ?? '',
  };
}

export function cloneLevel(level: GmLevel): GmLevel {
  const copy = structuredClone(level);
  copy.id = newId();
  copy.name = `${level.name} 副本`;
  return copy;
}

export function clampInt(value: number, min: number, max: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function resizeLevel(level: GmLevel, rows: number, cols: number): GmLevel {
  const next = structuredClone(level);
  next.rows = clampInt(rows, 1, MAX_ROWS);
  next.cols = clampInt(cols, 1, MAX_COLS);
  next.items = next.items.filter(item => item.x >= 0 && item.x < next.cols && item.y >= 0 && item.y < next.rows);
  next.emitter = clampPort(next.emitter, next.rows, next.cols);
  const seen = new Set<string>();
  next.targets = next.targets
    .map(t => clampPort(t, next.rows, next.cols))
    .filter(t => {
      if (samePort(t, next.emitter)) return false;
      const key = `${t.side}:${t.index}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (!next.targets.length) {
    const side: Side = next.emitter.side === 'W' ? 'E' : next.emitter.side === 'E' ? 'W' : next.emitter.side === 'N' ? 'S' : 'N';
    next.targets = [clampPort({ side, index: 0 }, next.rows, next.cols)];
  }
  return next;
}

export function toGameItem(item: LevelItem): LevelItem {
  const x = Math.floor(item.x);
  const y = Math.floor(item.y);
  if (item.type === 'mirror' || item.type === 'splitter') {
    const next: Extract<LevelItem, { type: 'mirror' | 'splitter' }> = {
      type: item.type, x, y, s: item.s === 1 ? 1 : 0,
    };
    if (item.fixed) next.fixed = true;
    if (item.decoy) next.decoy = true;
    return next;
  }
  if (item.type === 'wall') return { type: 'wall', x, y };
  if (item.type === 'switch') return { type: 'switch', x, y, id: String(item.id || 'A') };
  if (item.type === 'door') {
    return { type: 'door', x, y, id: String(item.id || 'D1'), requires: [...(item.requires ?? [])].map(String) };
  }
  return { type: 'portal', x, y, pair: String(item.pair || 'P1') };
}

export function toGameLevel(level: GmLevel): GameLevel {
  return {
    name: String(level.name ?? ''),
    chapter: String(level.chapter ?? ''),
    rows: Math.floor(Number(level.rows)),
    cols: Math.floor(Number(level.cols)),
    emitter: { side: level.emitter.side, index: Math.floor(level.emitter.index) },
    targets: (level.targets ?? []).map(t => ({ side: t.side, index: Math.floor(t.index) })),
    items: (level.items ?? []).map(toGameItem),
    hint: String(level.hint ?? ''),
    chapterNo: Math.floor(Number(level.chapterNo)),
    shots: Math.floor(Number(level.shots)),
  };
}

export function canonicalize(levels: GmLevel[]): string {
  return `${JSON.stringify(levels.map(toGameLevel), null, 2)}\n`;
}

export function hydrateLevels(raw: unknown): GmLevel[] {
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as GmStoreFile)?.levels) ? (raw as GmStoreFile).levels : [];
  return list.map((entry, index) => normalizeIncoming(entry, index));
}

function normalizeIncoming(entry: unknown, index: number): GmLevel {
  const raw = (entry ?? {}) as Partial<GmLevel>;
  const rows = clampInt(raw.rows ?? 5, 1, MAX_ROWS);
  const cols = clampInt(raw.cols ?? 5, 1, MAX_COLS);
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    name: String(raw.name ?? `关卡 ${index + 1}`),
    chapter: String(raw.chapter ?? '未分类'),
    chapterNo: clampInt(raw.chapterNo ?? 1, 1, 99),
    rows,
    cols,
    emitter: clampPort(raw.emitter ?? { side: 'W', index: 0 }, rows, cols),
    targets: Array.isArray(raw.targets) && raw.targets.length
      ? raw.targets.map(t => clampPort(t, rows, cols))
      : [{ side: 'E', index: 0 }],
    items: Array.isArray(raw.items) ? raw.items.map(item => toGameItem(item as LevelItem)) : [],
    hint: String(raw.hint ?? ''),
    shots: clampInt(raw.shots ?? 5, 1, 99),
  };
}

export function nextSwitchId(items: LevelItem[]): string {
  const used = new Set(items.filter((item): item is Extract<LevelItem, { type: 'switch' }> => item.type === 'switch').map(item => item.id));
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (!used.has(letter)) return letter;
  }
  let n = 1;
  while (used.has(`S${n}`)) n += 1;
  return `S${n}`;
}

export function nextDoorId(items: LevelItem[]): string {
  const used = new Set(items.filter((item): item is Extract<LevelItem, { type: 'door' }> => item.type === 'door').map(item => item.id));
  let n = 1;
  while (used.has(`D${n}`)) n += 1;
  return `D${n}`;
}

export function nextPortalPair(items: LevelItem[]): string {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.type === 'portal') counts.set(item.pair, (counts.get(item.pair) ?? 0) + 1);
  }
  for (const [pair, count] of counts) {
    if (count === 1) return pair;
  }
  let n = 1;
  while (counts.has(`P${n}`)) n += 1;
  return `P${n}`;
}

export function createItem(type: PlaceableType, x: number, y: number, items: LevelItem[]): LevelItem {
  if (type === 'mirror') return { type, x, y, s: 0 };
  if (type === 'splitter') return { type, x, y, s: 0 };
  if (type === 'wall') return { type, x, y };
  if (type === 'switch') return { type, x, y, id: nextSwitchId(items) };
  if (type === 'door') {
    const switches = items.filter((item): item is Extract<LevelItem, { type: 'switch' }> => item.type === 'switch');
    return { type, x, y, id: nextDoorId(items), requires: switches.length ? [switches[switches.length - 1].id] : [] };
  }
  return { type: 'portal', x, y, pair: nextPortalPair(items) };
}

export function rotateItem(item: LevelItem): LevelItem {
  if (item.type === 'mirror' || item.type === 'splitter') {
    return { ...item, s: item.s === 0 ? 1 : 0 };
  }
  return item;
}

export function moveItem(items: LevelItem[], fromX: number, fromY: number, toX: number, toY: number): LevelItem[] {
  if (fromX === toX && fromY === toY) return items;
  const source = items.find(item => item.x === fromX && item.y === fromY);
  if (!source) return items;
  const target = items.find(item => item.x === toX && item.y === toY);
  return items.map(item => {
    if (item === source) return { ...item, x: toX, y: toY };
    if (item === target) return { ...item, x: fromX, y: fromY };
    return item;
  });
}

export type ValidationIssue = { level: number; message: string; fatal: boolean };

export function validateLevels(levels: GmLevel[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  levels.forEach((level, index) => {
    issues.push(...validateLevel(level, index));
  });
  return issues;
}

export function validateLevel(level: GmLevel, index: number): ValidationIssue[] {
  const n = index + 1;
  const issues: ValidationIssue[] = [];
  const push = (message: string, fatal = true) => issues.push({ level: n, message, fatal });

  if (!level.name.trim()) push('关卡名为空');
  if (!Number.isInteger(level.rows) || !Number.isInteger(level.cols) || level.rows < 1 || level.cols < 1) {
    push('棋盘尺寸无效');
  }
  if (level.cols > MAX_COLS) push(`列数为 ${level.cols}，最大 ${MAX_COLS}`);
  if (level.rows > MAX_ROWS) push(`行数为 ${level.rows}，最大 ${MAX_ROWS}`);
  if (!portInBounds(level.emitter, level)) push('发射器位置越界');
  if (!level.targets?.length) push('至少需要 1 个接收器');
  const targetKeys = new Set<string>();
  for (const [targetIndex, target] of (level.targets ?? []).entries()) {
    if (!portInBounds(target, level)) push(`接收器 ${targetIndex + 1} 位置越界`);
    const key = `${target.side}:${target.index}`;
    if (targetKeys.has(key)) push(`接收器重复 ${key}`);
    targetKeys.add(key);
    if (samePort(target, level.emitter)) push(`接收器 ${targetIndex + 1} 与发射器重叠`);
  }
  if (!level.shots || level.shots < 1) push('激光次数必须 ≥ 1');

  const cells = new Set<string>();
  for (const item of level.items ?? []) {
    const key = `${item.x},${item.y}`;
    if (cells.has(key)) push(`格子 ${key} 上有多个物体`);
    cells.add(key);
    if (item.x < 0 || item.x >= level.cols || item.y < 0 || item.y >= level.rows) {
      push(`物体 ${key} 超出棋盘`);
    }
    if ((item.type === 'mirror' || item.type === 'splitter') && item.s !== 0 && item.s !== 1) {
      push(`${ITEM_LABELS[item.type]} ${key} 朝向无效`);
    }
    if (item.type === 'switch' && !item.id) push(`开关 ${key} 缺少 id`);
    if (item.type === 'door' && !item.id) push(`门 ${key} 缺少 id`);
    if (item.type === 'portal' && !item.pair) push(`传送门 ${key} 缺少 pair`);
  }

  const portalPairs: Record<string, number> = {};
  for (const item of level.items ?? []) {
    if (item.type === 'portal') portalPairs[item.pair] = (portalPairs[item.pair] ?? 0) + 1;
  }
  for (const [pair, count] of Object.entries(portalPairs)) {
    if (count !== 2) push(`传送门 ${pair} 数量为 ${count}，必须成对`);
  }

  const switches = new Set(
    (level.items ?? []).filter((item): item is Extract<LevelItem, { type: 'switch' }> => item.type === 'switch').map(item => item.id),
  );
  const usedSwitches = new Set<string>();
  for (const door of (level.items ?? []).filter((item): item is Extract<LevelItem, { type: 'door' }> => item.type === 'door')) {
    if (!door.requires?.length) push(`门 ${door.id} 没有绑定开关`, false);
    for (const id of door.requires ?? []) {
      usedSwitches.add(id);
      if (!switches.has(id)) push(`门 ${door.id} 引用了不存在的开关 ${id}`);
    }
  }
  for (const id of switches) {
    if (!usedSwitches.has(id)) push(`开关 ${id} 没有被任何门使用`, false);
  }
  return issues;
}

function portInBounds(port: Port | undefined, level: Pick<GameLevel, 'rows' | 'cols'>): boolean {
  if (!port || !SIDES.includes(port.side) || !Number.isInteger(port.index)) return false;
  const limit = portLimit(port.side, level.rows, level.cols);
  return port.index >= 0 && port.index < limit;
}
