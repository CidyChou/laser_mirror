export const DESIGN_WIDTH = 720;
export const DESIGN_HEIGHT = 1400;

export const GameConfig = {
  renderer: {
    maxResolution: 2,
    preference: 'webgl' as const,
    preferWebGLVersion: 2 as 1 | 2,
    antialias: true,
  },
  laser: {
    chargeMs: 480,
    startSpeed: 430,
    acceleration: 360,
    maxSpeed: 840,
    mirrorPauseDistance: 34,
    portalPauseDistance: 58,
  },
  performance: {
    highParticleBudget: 360,
    mediumParticleBudget: 220,
    lowParticleBudget: 120,
  },
};
