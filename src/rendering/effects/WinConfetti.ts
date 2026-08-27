import { Container, Graphics } from 'pixi.js';
import { DESIGN_HEIGHT, DESIGN_WIDTH, WIN_CONFETTI_MOTION } from '@/config/GameConfig';
import type { Quality } from '@/performance/PerformanceManager';
import { Theme } from '../theme';

type ConfettiPiece = {
  readonly view: Graphics;
  readonly index: number;
  readonly seedA: number;
  readonly seedB: number;
  readonly seedC: number;
  readonly left: boolean;
};

const COLORS = [Theme.coin, Theme.danger, Theme.cyan, Theme.success, Theme.purple, Theme.beamHot] as const;
const MAX_CONFETTI = WIN_CONFETTI_MOTION.counts.high;

export class WinConfetti extends Container {
  private readonly pieces: ConfettiPiece[] = [];
  private startedAt = 0;

  constructor() {
    super();
    this.eventMode = 'none';
    this.visible = false;
    for (let index = 0; index < MAX_CONFETTI; index++) {
      const seedA = ((index * 47 + 7) % 101) / 100;
      const seedB = ((index * 31 + 17) % 97) / 96;
      const seedC = ((index * 67 + 23) % 103) / 102;
      const view = new Graphics()
        .rect(-(12 + seedA * 14) / 2, -(7 + seedB * 9) / 2, 12 + seedA * 14, 7 + seedB * 9)
        .fill(COLORS[index % COLORS.length]);
      view.visible = false;
      this.pieces.push({ view, index, seedA, seedB, seedC, left: index % 2 === 0 });
      this.addChild(view);
    }
  }

  start(now: number) {
    this.startedAt = now;
    this.visible = true;
  }

  clear() {
    this.startedAt = 0;
    this.visible = false;
    for (const piece of this.pieces) piece.view.visible = false;
  }

  update(now: number, quality: Quality): boolean {
    if (!this.startedAt) return false;
    const elapsed = now - this.startedAt;
    if (elapsed >= WIN_CONFETTI_MOTION.duration) {
      this.clear();
      return false;
    }
    const count = WIN_CONFETTI_MOTION.counts[quality];
    const startY = DESIGN_HEIGHT * WIN_CONFETTI_MOTION.launchYRatio;
    for (const piece of this.pieces) {
      if (piece.index >= count) {
        piece.view.visible = false;
        continue;
      }
      const age = (elapsed - piece.seedC * WIN_CONFETTI_MOTION.staggerWindow) / 1000;
      const rise = 0.55 + piece.seedA * 0.4;
      const fall = 1.5 + piece.seedB;
      if (age < 0 || age > rise + fall) {
        piece.view.visible = false;
        continue;
      }
      const startX = piece.left
        ? WIN_CONFETTI_MOTION.launchInset
        : DESIGN_WIDTH - WIN_CONFETTI_MOTION.launchInset;
      const angle = Math.atan2(DESIGN_HEIGHT * 0.12 - startY, DESIGN_WIDTH / 2 - startX)
        + (piece.seedB - 0.5) * Math.PI * 0.44;
      const distance = DESIGN_HEIGHT * (0.22 + piece.seedC * 0.33);
      const apexX = startX + Math.cos(angle) * distance;
      const apexY = startY + Math.sin(angle) * distance;
      const landingX = apexX + (apexX - startX) * (0.5 + piece.seedA * 0.6);
      const landingY = apexY + DESIGN_HEIGHT * (0.28 + piece.seedB * 0.3);
      const rising = age <= rise;
      const progress = rising
        ? Math.sin((age / rise) * Math.PI * 0.5)
        : ((age - rise) / fall) ** 2;
      piece.view.position.set(
        mix(rising ? startX : apexX, rising ? apexX : landingX, progress),
        mix(rising ? startY : apexY, rising ? apexY : landingY, progress),
      );
      piece.view.rotation = (piece.seedA - 0.5) * 2 + age * (3 + piece.seedB * 5);
      piece.view.scale.x = Math.max(0.15, Math.abs(Math.cos(age * (5 + piece.seedC * 6))));
      piece.view.alpha = Math.min(Math.max(0, age / 0.06), Math.max(0, (rise + fall - age) / 0.6));
      piece.view.visible = true;
    }
    return true;
  }
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
