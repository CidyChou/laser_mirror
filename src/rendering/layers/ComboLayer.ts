import { Container, Graphics, Text } from 'pixi.js';
import { COMBO_MOTION, UI_RECTS } from '@/config/GameConfig';
import { clamp, easeInCubic, easeOutBack, easeOutCubic, lerp } from '@/core/easing';
import { comboPraiseForCount, comboTierForCount, type ComboTier } from '@/gameplay/combo';
import type { Quality } from '@/performance/PerformanceManager';
import { setUiFontSize, Theme, uiText } from '../theme';

type ComboFx = {
  count: number;
  tier: ComboTier;
  startedAt: number;
  endsAt: number;
};

export class ComboLayer extends Container {
  private readonly rings = new Graphics();
  private readonly body = new Graphics();
  private readonly praise = new Text({
    text: '',
    style: uiText({ fontSize: 20, fill: Theme.textOnAccent }),
  });
  private readonly comboText = new Text({
    text: '',
    style: uiText({ fontSize: 36, fill: Theme.textOnAccent }),
  });
  private effect: ComboFx | null = null;
  private topOffset = 0;

  constructor() {
    super();
    this.rings.blendMode = 'add';
    this.praise.anchor.set(0.5);
    this.comboText.anchor.set(0.5);
    this.addChild(this.rings, this.body, this.praise, this.comboText);
    this.visible = false;
    this.eventMode = 'none';
  }

  show(count: number, now: number) {
    const tier = comboTierForCount(count);
    this.effect = { count, tier, startedAt: now, endsAt: now + COMBO_MOTION.duration };
    this.praise.text = comboPraiseForCount(count);
    this.comboText.text = `COMBO ×${count}`;
    setUiFontSize(this.praise, 18 + tier);
    setUiFontSize(this.comboText, 32 + tier * 3);
    this.drawBody(tier);
    this.visible = true;
  }

  setTopOffset(offset: number) {
    this.topOffset = offset;
  }

  clear() {
    this.effect = null;
    this.visible = false;
  }

  update(now: number, quality: Quality = 'high'): boolean {
    if (!this.effect) {
      this.visible = false;
      return false;
    }
    if (now >= this.effect.endsAt) {
      this.clear();
      return false;
    }
    this.draw(this.effect, now, quality);
    return true;
  }

  private drawBody(tier: ComboTier) {
    const width = 300 + tier * 16;
    const height = 86 + tier * 4;
    this.body.clear();
    this.body.roundRect(-width / 2, -height / 2 + 8, width, height, height / 2).fill(Theme.comboSide);
    this.body.roundRect(-width / 2, -height / 2, width, height, height / 2).fill(Theme.beam).stroke({ color: Theme.coin, width: 5 });
    this.body.moveTo(-width * 0.34, -height * 0.28).quadraticCurveTo(0, -height * 0.47, width * 0.34, -height * 0.28)
      .stroke({ color: Theme.beamHot, width: 4, alpha: 0.88 });
    drawStar(this.body, -width / 2 + 32, 0, 11 + tier * 2, Theme.coin);
    drawStar(this.body, width / 2 - 32, 0, 11 + tier * 2, Theme.coin);
  }

  private draw(effect: ComboFx, now: number, quality: Quality) {
    const elapsed = now - effect.startedAt;
    const enter = easeOutBack(clamp(elapsed / COMBO_MOTION.enterDuration, 0, 1), 1.28);
    const exit = easeInCubic(clamp(
      (elapsed - COMBO_MOTION.holdUntil) / Math.max(1, COMBO_MOTION.duration - COMBO_MOTION.holdUntil),
      0,
      1,
    ));
    const alpha = clamp(elapsed / 70, 0, 1) * (1 - exit);
    const tierMotion = COMBO_MOTION.tiers[effect.tier];
    const width = 300 + effect.tier * 16;
    const height = 86 + effect.tier * 4;
    const pulse = 1 + Math.sin(clamp((elapsed - COMBO_MOTION.enterDuration) / 430, 0, 1) * Math.PI) * 0.045 * (1 - exit);
    const scale = lerp(0.56, tierMotion.badgeScale, enter) * pulse * (1 - exit * 0.08);
    const x = UI_RECTS.progress.x + UI_RECTS.progress.w / 2;
    const y = Math.max(height * scale / 2 + 10, COMBO_MOTION.badgeY - exit * 18) + this.topOffset;

    this.position.set(x, y);
    this.scale.set(scale);
    this.rotation = lerp(-0.055, 0, enter);
    this.alpha = alpha;
    this.praise.position.set(0, -18);
    this.comboText.position.set(0, 16);

    this.rings.clear();
    if (quality === 'low') {
      this.rings.visible = false;
      return;
    }
    this.rings.visible = true;
    for (let ring = 0; ring < tierMotion.ringCount; ring++) {
      const ringProgress = easeOutCubic(clamp((elapsed - ring * 72) / (440 + ring * 55), 0, 1));
      if (ringProgress <= 0 || ringProgress >= 1) continue;
      const inset = -10 - ringProgress * (24 + ring * 8);
      this.rings.roundRect(-width / 2 + inset, -height / 2 + inset * 0.35, width - inset * 2, height - inset * 0.7, height / 2)
        .stroke({ color: ring % 2 === 0 ? Theme.coin : Theme.beamHot, width: 5 - ringProgress * 2, alpha: (1 - ringProgress) * 0.82 });
    }
  }
}

function drawStar(g: Graphics, x: number, y: number, radius: number, color: number) {
  const points: number[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? radius : radius * 0.42;
    const a = -Math.PI / 2 + i * Math.PI / 5;
    points.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.poly(points).fill(color);
}
