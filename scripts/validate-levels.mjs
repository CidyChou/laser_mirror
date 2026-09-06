import fs from 'node:fs';

const MAX_COLS = 8;
const MAX_ROWS = 8;
const levels = JSON.parse(fs.readFileSync(new URL('../src/levels/levels.json', import.meta.url), 'utf8'));
const handcrafted = JSON.parse(fs.readFileSync(new URL('../src/levels/handcrafted.json', import.meta.url), 'utf8'));
const errors = [];

function portInBounds(port, level) {
  if (!port || !['N', 'E', 'S', 'W'].includes(port.side) || !Number.isInteger(port.index)) return false;
  const limit = port.side === 'N' || port.side === 'S' ? level.cols : level.rows;
  return port.index >= 0 && port.index < limit;
}

function emittersOf(level) {
  if (Array.isArray(level.emitters) && level.emitters.length) return level.emitters;
  return [level.emitter];
}

if (levels.length !== 130) errors.push(`levels.json should contain 130 levels, got ${levels.length}`);
Object.entries(handcrafted).forEach(([number, level]) => {
  if (JSON.stringify(levels[Number(number) - 1] ?? {}) !== JSON.stringify(level)) {
    errors.push(`#${number} diverged from handcrafted.json`);
  }
});

levels.forEach((level, index) => {
  const number = index + 1;
  if (!Number.isInteger(level.rows) || !Number.isInteger(level.cols) || level.rows < 1 || level.cols < 1) {
    errors.push(`#${number} invalid board`);
  }
  if (level.cols > MAX_COLS) errors.push(`#${number} has ${level.cols} columns; max is ${MAX_COLS}`);
  if (level.rows > MAX_ROWS) errors.push(`#${number} has ${level.rows} rows; max is ${MAX_ROWS}`);
  const emitters = emittersOf(level);
  const emitterKeys = new Set();
  for (const [emitterIndex, port] of emitters.entries()) {
    if (!portInBounds(port, level)) errors.push(`#${number} invalid emitter ${emitterIndex + 1}`);
    const key = `${port.side}:${port.index}`;
    if (emitterKeys.has(key)) errors.push(`#${number} duplicate emitter ${key}`);
    emitterKeys.add(key);
  }
  const hasFocus = (level.items ?? []).some((item) => item.type === 'focus');
  if (!level.targets?.length && !hasFocus) errors.push(`#${number} no target`);
  for (const [targetIndex, target] of (level.targets ?? []).entries()) {
    if (!portInBounds(target, level)) errors.push(`#${number} invalid target ${targetIndex + 1}`);
    if (emitterKeys.has(`${target.side}:${target.index}`)) errors.push(`#${number} target ${targetIndex + 1} overlaps emitter`);
  }
  if (!level.shots || level.shots < 1) errors.push(`#${number} invalid shots`);

  const cells = new Set();
  for (const item of level.items ?? []) {
    const key = `${item.x},${item.y}`;
    if (cells.has(key)) errors.push(`#${number} duplicate item cell ${key}`);
    cells.add(key);
    if (item.x < 0 || item.x >= level.cols || item.y < 0 || item.y >= level.rows) {
      errors.push(`#${number} out-of-board item ${key}`);
    }
    if (item.type === 'combiner' && ![0, 1, 2, 3].includes(item.dir)) {
      errors.push(`#${number} combiner ${key} has invalid dir`);
    }
  }

  const portalPairs = {};
  for (const item of level.items ?? []) {
    if (item.type === 'portal') portalPairs[item.pair] = (portalPairs[item.pair] ?? 0) + 1;
  }
  for (const [pair, count] of Object.entries(portalPairs)) {
    if (count !== 2) errors.push(`#${number} portal ${pair} count=${count}`);
  }

  const switches = new Set((level.items ?? []).filter((item) => item.type === 'switch').map((item) => item.id));
  for (const door of (level.items ?? []).filter((item) => item.type === 'door')) {
    for (const id of door.requires ?? []) {
      if (!switches.has(id)) errors.push(`#${number} door ${door.id} missing switch ${id}`);
    }
  }
});

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`Validated ${levels.length} levels (max ${MAX_COLS} columns × ${MAX_ROWS} rows).`);
