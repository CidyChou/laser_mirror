import { Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import { UI_RECTS } from '@/config/GameConfig';
import type { GameState } from '@/gameplay/types';
import { Button } from '../ui/Button';
import { drawGearIcon } from '../ui/icons';
import { Theme, uiText } from '../theme';

export class HudLayer extends Container {
  readonly settingsButton = new Button(UI_RECTS.settings.w, UI_RECTS.settings.h, '', 'icon');
  readonly levelButton = new Container();
  readonly fireButton = new Button(UI_RECTS.fire.w, UI_RECTS.fire.h, '发射', 'fire');
  private readonly levelCard = new Graphics();
  private readonly levelLabel = new Text({
    text: '',
    style: uiText({ fontSize: 36, fill: Theme.ink }),
  });
  private readonly hearts = new Graphics();
  private readonly heartsCount = new Text({
    text: '',
    style: uiText({ fontSize: 32, fill: Theme.ink }),
  });
  private readonly hint = new Text({
    text: '',
    style: uiText({ fontSize: 15, fill: Theme.inkSoft, align: 'center', wordWrap: true, wordWrapWidth: 640 }),
  });
  private readonly gearIcon = new Graphics();
  private gear = new Sprite(Texture.EMPTY);
  private lastLevel = -1;
  private lastHearts = -1;
  private lastHint = '';
  private topOffset = 0;

  constructor() {
    super();
    this.build();
  }

  setGearTexture(texture: Texture) {
    const ok = texture !== Texture.EMPTY && texture.width > 1;
    this.gear.texture = texture;
    this.gear.visible = ok;
    this.gearIcon.visible = !ok;
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
    this.settingsButton.setText('');
    this.gear.anchor.set(0.5);
    this.gear.position.set(settings.w / 2, settings.h / 2 - 3);
    this.gear.width = 46;
    this.gear.height = 46;
    this.gear.tint = Theme.settingsIcon;
    this.gear.eventMode = 'none';
    this.gear.visible = false;
    this.gearIcon.eventMode = 'none';
    this.gearIcon.position.set(settings.w / 2, settings.h / 2 - 3);
    drawGearIcon(this.gearIcon, 46);
    this.settingsButton.addChild(this.gearIcon, this.gear);

    const progress = UI_RECTS.progress;
    this.levelButton.position.set(progress.x, progress.y);
    this.levelButton.eventMode = 'static';
    this.levelButton.cursor = 'pointer';
    this.levelButton.hitArea = new Rectangle(0, 0, progress.w, progress.h);
    this.levelLabel.anchor.set(0.5);
    this.levelLabel.position.set(progress.w / 2, (progress.h - 5) / 2);
    this.drawLevelCard();
    this.levelButton.addChild(this.levelCard, this.levelLabel);

    const hearts = UI_RECTS.hearts;
    this.hearts.position.set(hearts.x, hearts.y);
    this.heartsCount.anchor.set(0, 0.5);

    this.fireButton.position.set(UI_RECTS.fire.x, UI_RECTS.fire.y);
    this.fireButton.setLabelSize(32);
    this.hint.anchor.set(0.5, 0);
    this.hint.position.set(UI_RECTS.hint.x, UI_RECTS.hint.y);

    this.addChild(this.settingsButton, this.levelButton, this.hearts, this.heartsCount, this.fireButton, this.hint);
  }

  private drawLevelCard() {
    const { w, h } = UI_RECTS.progress;
    this.levelCard.clear()
      .roundRect(0, 6, w, h - 2, UI_RECTS.progress.h / 2)
      .fill({ color: Theme.shadow, alpha: 0.34 })
      .roundRect(0, 5, w, h - 5, h / 2)
      .fill(Theme.surfaceSide)
      .roundRect(0, 0, w, h - 5, h / 2)
      .fill(Theme.surface)
      .stroke({ color: Theme.surfaceLine, width: 1.5 });
  }

  sync(state: GameState) {
    if (state.levelIndex !== this.lastLevel) {
      this.lastLevel = state.levelIndex;
      this.levelLabel.text = `第 ${state.levelIndex + 1} 关`;
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
