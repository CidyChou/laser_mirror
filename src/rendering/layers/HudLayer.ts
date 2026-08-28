import { Container, Graphics, Text, Texture } from 'pixi.js';
import { UI_RECTS } from '@/config/GameConfig';
import type { GameState } from '@/gameplay/types';
import { Button } from '../ui/Button';
import { SettingsButton } from '../ui/SettingsButton';
import { Theme, uiText } from '../theme';

export class HudLayer extends Container {
  readonly settingsButton = new SettingsButton(UI_RECTS.settings.w, UI_RECTS.settings.h);
  readonly levelButton = new Button(UI_RECTS.progress.w, UI_RECTS.progress.h, '', 'secondary');
  readonly fireButton = new Button(UI_RECTS.fire.w, UI_RECTS.fire.h, '发射', 'fire');
  private readonly hearts = new Graphics();
  private readonly heartsCount = new Text({
    text: '',
    style: uiText({ fontSize: 32, fill: Theme.ink }),
  });
  private readonly hint = new Text({
    text: '',
    style: uiText({ fontSize: 15, fill: Theme.inkSoft, align: 'center', wordWrap: true, wordWrapWidth: 640 }),
  });
  private lastLevel = -1;
  private lastHearts = -1;
  private lastHint = '';
  private topOffset = 0;

  constructor() {
    super();
    this.build();
  }

  setGearTexture(texture: Texture) {
    this.settingsButton.setTexture(texture);
  }

  setTopOffset(offset: number) {
    if (this.topOffset === offset) return;
    this.topOffset = offset;
    const y = (rectY: number) => rectY + offset;
    this.settingsButton.position.set(UI_RECTS.settings.x, y(UI_RECTS.settings.y));
    this.levelButton.position.set(UI_RECTS.progress.x, y(UI_RECTS.progress.y));
    this.hearts.position.set(UI_RECTS.hearts.x, y(UI_RECTS.hearts.y));
    if (this.lastHearts >= 0) this.drawHearts(this.lastHearts);
  }

  private build() {
    const settings = UI_RECTS.settings;
    this.settingsButton.position.set(settings.x, settings.y);

    const progress = UI_RECTS.progress;
    this.levelButton.position.set(progress.x, progress.y);
    this.levelButton.setLabelSize(36);
    this.levelButton.setLabelOffsetY(-4);

    const hearts = UI_RECTS.hearts;
    this.hearts.position.set(hearts.x, hearts.y);
    this.heartsCount.anchor.set(0, 0.5);

    this.fireButton.position.set(UI_RECTS.fire.x, UI_RECTS.fire.y);
    this.fireButton.setLabelSize(32);
    this.hint.anchor.set(0.5, 0);
    this.hint.position.set(UI_RECTS.hint.x, UI_RECTS.hint.y);

    this.addChild(this.settingsButton, this.levelButton, this.hearts, this.heartsCount, this.fireButton, this.hint);
  }

  sync(state: GameState) {
    if (state.levelIndex !== this.lastLevel) {
      this.lastLevel = state.levelIndex;
      this.levelButton.setText(`第 ${state.levelIndex + 1} 关`);
    }
    if (state.hearts !== this.lastHearts) {
      this.lastHearts = state.hearts;
      this.drawHearts(state.hearts);
    }
    const hint = state.level.hint || '镜子可无限旋转 · 确认路线后再发射';
    if (hint !== this.lastHint) {
      this.lastHint = hint;
      this.hint.text = hint;
    }
    this.fireButton.setDisabled(state.firing || state.won);
    this.fireButton.setActive(state.firing);
    this.fireButton.setText(state.hearts > 0 ? '发射' : '补充爱心');
  }

  setHeartsVisible(visible: boolean) {
    this.hearts.visible = visible;
    this.heartsCount.visible = visible;
  }

  private drawHearts(left: number) {
    const { x: cardX, y: cardY, w, h } = UI_RECTS.hearts;
    const empty = left <= 0;
    this.hearts.clear()
      .roundRect(0, 6, w, h - 2, 18)
      .fill({ color: Theme.shadow, alpha: 0.34 })
      .roundRect(0, 5, w, h - 5, 18)
      .fill(Theme.surfaceSide)
      .roundRect(0, 0, w, h - 5, 18)
      .fill(Theme.surface)
      .stroke({ color: Theme.surfaceLine, width: 1.5 });

    const size = 34;
    const gap = 10;
    const faceH = h - 5;
    this.heartsCount.text = `${Math.max(0, left)}`;
    this.heartsCount.style.fill = empty ? Theme.inkSoft : Theme.ink;
    const groupW = size + gap + this.heartsCount.width;
    const startX = (w - groupW) / 2;
    drawHeart(this.hearts, startX + size / 2, faceH / 2 + 1, size, empty ? Theme.heartEmpty : Theme.heart);
    this.heartsCount.position.set(cardX + startX + size + gap, cardY + this.topOffset + faceH / 2);
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
