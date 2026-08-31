export type Side = 'N' | 'E' | 'S' | 'W';
export type Direction = 0 | 1 | 2 | 3;
export type Orientation = 0 | 1;

export interface Port { side: Side; index: number }
export interface Target extends Port { hit?: boolean; required?: number; charge?: number }

export type LevelItem =
  | { type: 'mirror'; x: number; y: number; s: Orientation; fixed?: boolean; decoy?: boolean }
  | { type: 'splitter'; x: number; y: number; s: Orientation; fixed?: boolean; decoy?: boolean }
  | { type: 'wall'; x: number; y: number }
  | { type: 'switch'; x: number; y: number; id: string }
  | { type: 'door'; x: number; y: number; id: string; requires: string[] }
  | { type: 'portal'; x: number; y: number; pair: string }
  | { type: 'focus'; x: number; y: number; need?: number }
  | { type: 'combiner'; x: number; y: number; dir: Direction; need?: number; fixed?: boolean };

export interface LevelDefinition {
  name: string;
  chapter: string;
  chapterNo: number;
  rows: number;
  cols: number;
  emitter: Port;
  /** Extra emitters. When omitted, the level uses only `emitter`. */
  emitters?: Port[];
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
  /** Width multiplier carried through reflections, splits and portals. */
  widthScale?: number;
}

export type ImpactType = 'mirror' | 'splitter' | 'portal' | 'switch' | 'door' | 'wall' | 'target' | 'focus' | 'combiner' | 'combiner-fire';
export interface ImpactEvent {
  type: ImpactType;
  at: number;
  x?: number; y?: number;
  px: number; py: number;
  id?: string;
  pair?: string;
  targetIndex?: number;
  toX?: number; toY?: number;
  incomingDir?: Direction;
  outgoingDirs?: Direction[];
}

export interface CombinerPulse {
  /** Milliseconds from the beginning of beam travel, excluding emitter charge. */
  readyMs: number;
  launchMs: number;
  launchDist: number;
}

export interface LaserTrace {
  switches: Set<string>;
  exits: Port[];
  segments: LaserSegment[];
  impactEvents: ImpactEvent[];
  maxTravel: number;
  doorStates: Record<string, boolean>;
  hits: boolean[];
  focusHits: Record<string, number>;
  focusOn: Record<string, boolean>;
  combinerHits: Record<string, number>;
  combinerOn: Record<string, boolean>;
  combinerPulses: Record<string, CombinerPulse>;
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
  shotElapsedMs: number;
  beamDistance: number;
  result: LaserTrace | null;
  activeSwitches: Set<string>;
  activeDoorStates: Record<string, boolean>;
  focusHits: Record<string, number>;
  combinerHits: Record<string, number>;
  combinerOn: Record<string, boolean>;
  comboCount: number;
}
