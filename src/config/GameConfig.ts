export const DESIGN_WIDTH = 720;
export const DESIGN_HEIGHT = 1400;

export const STAGE_TOP = 148;
export const STAGE_HEIGHT = 980;

export const UI_TOKENS = {
  radius: { sm: 12, md: 18, lg: 26, xl: 36 },
  button: { idleDepth: 6, pressedDepth: 2, chromeDepth: 5 },
} as const;

export const UI_RECTS = {
  settings: { x: 32, y: 28, w: 80, h: 80 },
  progress: { x: 230, y: 28, w: 260, h: 80 },
  hearts: { x: 572, y: 28, w: 116, h: 80 },
  fire: { x: 210, y: 1186, w: 300, h: 92 },
  hint: { x: 360, y: 1292 },
  resultWin: { x: 86, y: 300, w: 548, h: 560 },
  resultLose: { x: 90, y: 318, w: 540, h: 540 },
  settingsPanel: { x: 70, y: 360, w: 580, h: 420 },
} as const;

export const COMBO_MOTION = {
  duration: 1250,
  enterDuration: 180,
  burstDuration: 760,
  holdUntil: 900,
  badgeY: 68,
  tiers: {
    1: { badgeScale: 1, ringCount: 1 },
    2: { badgeScale: 1.05, ringCount: 2 },
    3: { badgeScale: 1.1, ringCount: 3 },
  },
} as const;

export const GameConfig = {
  renderer: {
    maxResolution: 2,
    preference: 'webgl' as const,
    preferWebGLVersion: 2 as 1 | 2,
    antialias: true,
  },
  laser: {
    chargeMs: 600,
    startSpeed: 195,
    acceleration: 560,
    maxSpeed: 700,
    mirrorPauseDistance: 72,
    portalPauseDistance: 112,
    settleMs: 160,
    comboHoldMs: 720,
  },
  performance: {
    highParticleBudget: 360,
    mediumParticleBudget: 220,
    lowParticleBudget: 120,
  },
};
