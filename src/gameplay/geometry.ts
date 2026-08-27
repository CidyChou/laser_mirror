import type { BoardGeometry, LevelDefinition, Point, Port } from './types';

const STAGE_TOP = 205;
const STAGE_HEIGHT = 900;

export function computeGeometry(level: LevelDefinition): BoardGeometry {
  const maxBoardW = 590;
  const maxBoardH = 650;
  const cell = Math.min(maxBoardW / level.cols, maxBoardH / level.rows);
  const boardW = cell * level.cols;
  const boardH = cell * level.rows;
  return {
    cell,
    boardW,
    boardH,
    ox: (720 - boardW) / 2,
    oy: STAGE_TOP + (STAGE_HEIGHT - boardH) / 2 - 6,
    wall: Math.max(18, cell * 0.18),
  };
}

export function cellCenter(g: BoardGeometry, x: number, y: number): Point {
  return { x: g.ox + (x + 0.5) * g.cell, y: g.oy + (y + 0.5) * g.cell };
}

export function borderPoint(g: BoardGeometry, port: Port): Point {
  if (port.side === 'W') return { x: g.ox, y: g.oy + (port.index + 0.5) * g.cell };
  if (port.side === 'E') return { x: g.ox + g.boardW, y: g.oy + (port.index + 0.5) * g.cell };
  if (port.side === 'N') return { x: g.ox + (port.index + 0.5) * g.cell, y: g.oy };
  return { x: g.ox + (port.index + 0.5) * g.cell, y: g.oy + g.boardH };
}

export function samePort(a: Port, b: Port): boolean {
  return a.side === b.side && a.index === b.index;
}
