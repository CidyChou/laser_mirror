export const DESIGN_WIDTH = 720;
export const DESIGN_HEIGHT = 1400;

export const STAGE_TOP = 248;
export const STAGE_HEIGHT = 880;

export const UI_TOKENS = {
  radius: { sm: 12, md: 18, lg: 26, xl: 36 },
  button: { idleDepth: 6, pressedDepth: 2, chromeDepth: 5 },
} as const;

export const UI_RECTS = {
  settings: { x: 32, y: 104, w: 80, h: 80 },
  progress: { x: 230, y: 104, w: 260, h: 80 },
  hearts: { x: 572, y: 104, w: 116, h: 80 },
  coinCounter: { x: 520, y: 104, w: 168, h: 72 },
  fire: { x: 210, y: 1186, w: 300, h: 92 },
  hint: { x: 360, y: 1292 },
  resultWin: { x: 86, y: 300, w: 548, h: 560 },
  resultLose: { x: 90, y: 318, w: 540, h: 540 },
  settingsPanel: { x: 70, y: 210, w: 580, h: 960 },
} as const;

export const COMBO_MOTION = {
  duration: 1250,
  enterDuration: 180,
  burstDuration: 760,
  holdUntil: 900,
  badgeY: 144,
  tiers: {
    1: { badgeScale: 1, ringCount: 1 },
    2: { badgeScale: 1.05, ringCount: 2 },
    3: { badgeScale: 1.1, ringCount: 3 },
  },
} as const;

export const WIN_REWARD_MOTION = {
  counterRevealDelay: 1600,
  counterRevealDuration: 160,
  coinFlightStartDelay: 1800,
  coinFlightStagger: 75,
  coinFlightDuration: 850,
} as const;

export const WIN_CONFETTI_MOTION = {
  duration: 3800,
  launchInset: 18,
  launchYRatio: 0.4,
  staggerWindow: 250,
  counts: { high: 53, medium: 40, low: 28 },
} as const;

export const GameConfig = {
  renderer: {
    // Modern iPhones expose a 3x Retina canvas. Keep that native density when
    // the framebuffer stays inside the mobile GPU budget instead of letting
    // the OS upscale a 2x image to 3x.
    maxResolution: 3,
    minAdaptiveResolution: 1.5,
    maxBackBufferPixels: 3_300_000,
    lowQualityResolutionScale: 0.8,
    staticCacheResolution: 2,
    preference: 'webgl' as const,
    preferWebGLVersion: 2 as 1 | 2,
    antialias: true,
  },
  laser: {
    chargeMs: 480,
    startSpeed: 410,
    acceleration: 300,
    maxSpeed: 720,
    mirrorPauseDistance: 34,
    portalPauseDistance: 58,
    settleMs: 160,
    comboHoldMs: 720,
  },
  performance: {
    highParticleBudget: 360,
    mediumParticleBudget: 220,
    lowParticleBudget: 120,
  },
};
