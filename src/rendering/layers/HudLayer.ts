import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { UI_RECTS } from '@/config/GameConfig';
import type { GameState } from '@/gameplay/types';
import { Button } from '../ui/Button';
import { FONT_UI, Theme } from '../theme';

export class HudLayer extends Container {
  readonly settingsButton = new Button(UI_RECTS.settings.w, UI_RECTS.settings.h, '', 'icon');
  readonly fireButton = new Button(UI_RECTS.fire.w, UI_RECTS.fire.h, '发射', 'fire');
  private readonly progressBg = new Graphics();
  private readonly progressFill = new Graphics();
  private readonly progressLabel = new Text({
    text: '',
    style: { fontFamily: FONT_UI, fontSize: 15, fontWeight: '700', fill: Theme.inkSoft },
  });
  private readonly hearts = new Graphics();
  private readonly heartsCount = new Text({
    text: '',
    style: { fontFamily: FONT_UI, fontSize: 28, fontWeight: '800', fill: Theme.ink },
  });
  private readonly hint = new Text({
    text: '',
    style: { fontFamily: FONT_UI, fontSize: 15, fill: Theme.inkSoft, align: 'center', wordWrap: true, wordWrapWidth: 640 },
  });
  private gear = new Sprite(Texture.EMPTY);
  private lastHit = -1;
  private lastTotal = -1;
  private lastShots = -1;
  private lastHint = '';

  constructor() {
    super();
    this.build();
  }

  setGearTexture(texture: Texture) {
    const ok = texture !== Texture.EMPTY && texture.width > 1;
    this.gear.texture = texture;
    this.gear.visible = ok;
    this.settingsButton.setText(ok ? '' : '设');
  }

  private build() {
    const settings = UI_RECTS.settings;
    this.settingsButton.position.set(settings.x, settings.y);
    this.gear.anchor.set(0.5);
    this.gear.position.set(settings.w / 2, settings.h / 2 - 3);
    this.gear.width = 52;
    this.gear.height = 52;
    this.gear.tint = Theme.settingsIcon;
    this.gear.eventMode = 'none';
    this.settingsButton.addChild(this.gear);

    const progress = UI_RECTS.progress;
    this.progressBg.position.set(progress.x, progress.y);
    this.progressFill.position.set(progress.x, progress.y);
    this.progressLabel.anchor.set(0.5);
    this.progressLabel.position.set(progress.x + progress.w / 2, progress.y + 22);
    this.drawProgressChrome();

    const hearts = UI_RECTS.hearts;
    this.hearts.position.set(hearts.x, hearts.y);
    this.heartsCount.anchor.set(0, 0.5);

    this.fireButton.position.set(UI_RECTS.fire.x, UI_RECTS.fire.y);
    this.fireButton.setLabelSize(32);
    this.hint.anchor.set(0.5, 0);
    this.hint.position.set(UI_RECTS.hint.x, UI_RECTS.hint.y);

    this.addChild(this.settingsButton, this.progressBg, this.progressFill, this.progressLabel, this.hearts, this.heartsCount, this.fireButton, this.hint);
  }

  private drawProgressChrome() {
    const { w, h } = UI_RECTS.progress;
    this.progressBg.clear()
      .roundRect(0, 6, w, h - 2, UI_RECTS.progress.h / 2)
      .fill({ color: Theme.shadow, alpha: 0.34 })
      .roundRect(0, 5, w, h - 5, h / 2)
      .fill(0x10161c)
      .roundRect(0, 0, w, h - 5, h / 2)
      .fill(Theme.surface)
      .stroke({ color: Theme.surfaceLine, width: 1.5 });
  }

  sync(state: GameState) {
    const hit = state.targets.filter((target) => target.hit).length;
    const total = Math.max(1, state.targets.length);
    if (hit !== this.lastHit || total !== this.lastTotal) {
      this.lastHit = hit;
      this.lastTotal = total;
      this.progressLabel.text = `终点  ${hit} / ${total}`;
      this.drawProgressFill(hit / total);
    }
    if (state.shotsLeft !== this.lastShots) {
      this.lastShots = state.shotsLeft;
      this.drawHearts(state.shotsLeft);
    }
    const hint = state.level.hint || '镜子可无限旋转 · 确认路线后再发射';
    if (hint !== this.lastHint) {
      this.lastHint = hint;
      this.hint.text = hint;
    }
    this.fireButton.setDisabled(state.firing || state.won || state.shotsLeft <= 0);
    this.fireButton.setActive(state.firing);
    this.fireButton.setText('发射');
  }

  setHeartsVisible(visible: boolean) {
    this.hearts.visible = visible;
    this.heartsCount.visible = visible;
  }

  private drawProgressFill(ratio: number) {
    const { w, h } = UI_RECTS.progress;
    const inset = 10;
    const barY = 40;
    const barH = 18;
    const barW = w - inset * 2;
    const fillW = Math.max(0, barW * Math.min(1, Math.max(0, ratio)));
    this.progressFill.clear()
      .roundRect(inset, barY, barW, barH, barH / 2)
      .fill(0x2a3340)
      .roundRect(inset, barY, Math.max(fillW, fillW > 0 ? barH : 0), barH, barH / 2)
      .fill(Theme.accent);
  }

  private drawHearts(left: number) {
    const { x: cardX, y: cardY, w, h } = UI_RECTS.hearts;
    const empty = left <= 0;
    this.hearts.clear()
      .roundRect(0, 6, w, h - 2, 18)
      .fill({ color: Theme.shadow, alpha: 0.34 })
      .roundRect(0, 5, w, h - 5, 18)
      .fill(0x10161c)
      .roundRect(0, 0, w, h - 5, 18)
      .fill(Theme.surface)
      .stroke({ color: Theme.surfaceLine, width: 1.5 });

    const size = 22;
    const gap = 8;
    const faceH = h - 5;
    this.heartsCount.text = `${Math.max(0, left)}`;
    this.heartsCount.style.fill = empty ? Theme.inkSoft : Theme.ink;
    const groupW = size + gap + this.heartsCount.width;
    const startX = (w - groupW) / 2;
    drawHeart(this.hearts, startX + size / 2, faceH / 2 + 1, size, empty ? Theme.heartEmpty : Theme.heart);
    this.heartsCount.position.set(cardX + startX + size + gap, cardY + faceH / 2);
  }
}

function drawHeart(g: Graphics, x: number, y: number, size: number, color: number) {
  const s = size / 2;
  g.circle(x - s * 0.42, y - s * 0.18, s * 0.52).fill(color);
  g.circle(x + s * 0.42, y - s * 0.18, s * 0.52).fill(color);
  g.moveTo(x - s * 0.92, y - s * 0.02)
    .lineTo(x, y + s * 0.95)
    .lineTo(x + s * 0.92, y - s * 0.02)
    .fill(color);
}
