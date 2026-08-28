export type Side = 'N' | 'E' | 'S' | 'W';
export type Direction = 0 | 1 | 2 | 3;
export type Orientation = 0 | 1;

export interface Port { side: Side; index: number }
export interface Target extends Port { hit?: boolean }

export type LevelItem =
  | { type: 'mirror'; x: number; y: number; s: Orientation; fixed?: boolean; decoy?: boolean }
  | { type: 'splitter'; x: number; y: number; s: Orientation; fixed?: boolean; decoy?: boolean }
  | { type: 'wall'; x: number; y: number }
  | { type: 'switch'; x: number; y: number; id: string }
  | { type: 'door'; x: number; y: number; id: string; requires: string[] }
  | { type: 'portal'; x: number; y: number; pair: string };

export interface LevelDefinition {
  name: string;
  chapter: string;
  chapterNo: number;
  rows: number;
  cols: number;
  emitter: Port;
  targets: Port[];
  items: LevelItem[];
  shots: number;
  hint?: string;
}

export interface Point { x: number; y: number }
export interface BoardGeometry {
  cell: number;
  boardW: number;
  boardH: number;
  ox: number;
  oy: number;
  wall: number;
}

export interface LaserSegment {
  x1: number; y1: number; x2: number; y2: number;
  startDist: number; endDist: number; branch: number;
}

export type ImpactType = 'mirror' | 'splitter' | 'portal' | 'switch' | 'door' | 'wall' | 'target';
export interface ImpactEvent {
  type: ImpactType;
  at: number;
  x?: number; y?: number;
  px: number; py: number;
  id?: string;
  pair?: string;
  targetIndex?: number;
  toX?: number; toY?: number;
}

export interface LaserTrace {
  switches: Set<string>;
  exits: Port[];
  segments: LaserSegment[];
  impactEvents: ImpactEvent[];
  maxTravel: number;
  doorStates: Record<string, boolean>;
  hits: boolean[];
}

export interface GameState {
  levelIndex: number;
  level: LevelDefinition;
  items: LevelItem[];
  targets: Target[];
  hearts: number;
  firing: boolean;
  won: boolean;
  shotStart: number;
  beamDistance: number;
  result: LaserTrace | null;
  activeSwitches: Set<string>;
  activeDoorStates: Record<string, boolean>;
  comboCount: number;
}
