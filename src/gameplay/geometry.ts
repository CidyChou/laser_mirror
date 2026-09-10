import { DESIGN_WIDTH, STAGE_HEIGHT, STAGE_TOP } from '@/config/GameConfig';
import type { BoardGeometry, LevelDefinition, Point, Port } from './types';

function cellForBudget(cols: number, rows: number, cellGuess: number) {
  const portPad = portOutset(cellGuess) + portSize(cellGuess) * 0.16 + 6;
  const lip = Math.max(8, Math.min(12, cellGuess * 0.08));
  const maxBoardW = DESIGN_WIDTH - portPad * 2 - lip;
  const maxBoardH = STAGE_HEIGHT - portPad * 2 - lip;
  return Math.min(maxBoardW / cols, maxBoardH / rows);
}

export function computeGeometry(level: LevelDefinition): BoardGeometry {
  const cols = Math.max(1, level.cols);
  const rows = Math.max(1, level.rows);
  let cell = cellForBudget(cols, rows, 90);
  for(let i=0;i<6;i++)cell = cellForBudget(cols, rows, cell);
  const boardW = cell * cols;
  const boardH = cell * rows;
  return {
    cell,
    boardW,
    boardH,
    ox: (DESIGN_WIDTH - boardW) / 2,
    oy: STAGE_TOP + (STAGE_HEIGHT - boardH) / 2 - 4,
    wall: Math.max(16, cell * 0.16),
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

/** 6×6 boards sit near cell=110; 3×3 / 4×4 cells are much larger and need a thicker beam. */
export function beamScale(cell: number): number {
  return Math.max(0.95, Math.min(2.2, cell / 110));
}

/** Presentation-only port dimensions. Keep the simulation on the board edge. */
export function portSize(cell:number):number { return Math.min(112,cell); }
export function portOutset(cell:number):number { return portSize(cell)*.25+9; }
export function portDirection(port:Port):Point {
  return port.side==='W'?{x:1,y:0}:port.side==='E'?{x:-1,y:0}:port.side==='N'?{x:0,y:1}:{x:0,y:-1};
}
export function portPosition(g:BoardGeometry,port:Port):Point {
  const edge=borderPoint(g,port),dir=portDirection(port),offset=portOutset(g.cell);
  return{x:edge.x-dir.x*offset,y:edge.y-dir.y*offset};
}
export function portMuzzle(g:BoardGeometry,port:Port):Point {
  const center=portPosition(g,port),dir=portDirection(port),tip=portSize(g.cell)*.25;
  return{x:center.x+dir.x*tip,y:center.y+dir.y*tip};
}
