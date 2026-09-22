export const DESIGN_WIDTH = 720;
export const DESIGN_HEIGHT = 1280;

export const STAGE_TOP = 278;
export const STAGE_HEIGHT = 714;

export const UI_TOKENS = {
  radius: { sm: 12, md: 18, lg: 26, xl: 36 },
  button: { idleDepth: 6, pressedDepth: 2, chromeDepth: 5, labelOpticalLift: 0.18 },
} as const;

export const UI_RECTS = {
  settings: { x: 46, y: 152, w: 82, h: 76 },
  progress: { x: 198, y: 152, w: 324, h: 76 },
  hearts: { x: 554, y: 152, w: 124, h: 76 },
  coinCounter: { x: 550, y: 152, w: 136, h: 76 },
  fire: { x: 158, y: 1052, w: 404, h: 100 },
  hint: { x: 360, y: 1180 },
  resultWin: { x: 80, y: 256, w: 560, h: 640 },
  resultLose: { x: 90, y: 318, w: 540, h: 540 },
  settingsPanel: { x: 70, y: 160, w: 580, h: 960 },
} as const;

export const COMBO_MOTION = {
  duration: 1250,
  enterDuration: 180,
  burstDuration: 760,
  holdUntil: 900,
  badgeY: UI_RECTS.progress.y + UI_RECTS.progress.h / 2,
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
  coinFlightStagger: 62,
  coinPopDuration: 220,
  coinHoverDuration: 220,
  coinFlightDuration: 400,
  coinArrivalDuration: 140,
  coinSoundGap: 45,
  rewardCoinRevealDuration: 420,
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
    // The hold itself drives the muzzle charge; release happens at completion.
    inputChargeMs: 1200,
    chargeMs: 480,
    challengeLifetimeMs: 20000,
    spentAdjustmentFadeMs: 6000,
    stoppedBeamFadeMs: 900,
    challengeTailCells: 6,
    startSpeed: 410,
    acceleration: 300,
    maxSpeed: 720,
    mirrorPauseDistance: 34,
    portalTransitMs: 520,
    doorSignalMs: 420,
    doorOpenMs: 280,
    combinerChargeMs: 1500,
    combinedWidthScale: 3,
    settleMs: 160,
    comboHoldMs: 720,
  },
  performance: {
    highParticleBudget: 360,
    mediumParticleBudget: 220,
    lowParticleBudget: 120,
  },
};
