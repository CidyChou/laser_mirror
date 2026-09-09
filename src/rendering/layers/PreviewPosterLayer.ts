import { Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import { DESIGN_HEIGHT, DESIGN_WIDTH, STAGE_HEIGHT, UI_TOKENS } from '@/config/GameConfig';
import { clamp, easeOutBack, easeOutCubic } from '@/core/easing';
import { Button } from '../ui/Button';
import { Theme, uiText } from '../theme';

export type PosterMeta = {
  stageLabel: string;
  comboCount: number;
};

const CARD_W = 608;
const PHOTO_W = 536;
const CLOSE_SIZE = 64;
const HEADER_H = 92;
const PHOTO_Y = 28 + HEADER_H;

export class PreviewPosterLayer extends Container {
  readonly closeButton = new Button(CLOSE_SIZE, CLOSE_SIZE, '✕', 'icon');
  readonly saveButton = new Button(420, 76, '保存到相册', 'primary');
  readonly card = new Container();
  private readonly dim = new Graphics();
  private readonly flash = new Graphics();
  private readonly cardGfx = new Graphics();
  private readonly photoFrame = new Graphics();
  private readonly photoMask = new Graphics();
  private readonly photo = new Sprite(Texture.EMPTY);
  private readonly title = new Text({ text: '光线急转弯', style: uiText({ fontSize: 34, fill: Theme.ink }) });
  private readonly subtitle = new Text({ text: '', style: uiText({ fontSize: 20, fill: Theme.inkSoft }) });
  private readonly caption = new Text({ text: '', style: uiText({ fontSize: 18, fill: Theme.green }) });
  private photoTexture: Texture | null = null;
  private shownAt = 0;
  private entering = false;
  private topOffset = 0;
  private cardH = 0;

  constructor() {
    super();
    this.visible = false;
    this.eventMode = 'static';
    this.hitArea = new Rectangle(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    this.dim.eventMode = 'static';
    this.card.eventMode = 'static';
    this.title.anchor.set(0.5, 0);
    this.subtitle.anchor.set(0.5, 0);
    this.caption.anchor.set(0.5, 0);
    this.photo.anchor.set(0.5, 0);
    this.closeButton.setLabelSize(26);
    this.saveButton.setLabelSize(26);
    this.photo.mask = this.photoMask;
    this.card.addChild(this.cardGfx, this.photoFrame, this.photo, this.photoMask, this.title, this.subtitle, this.caption, this.closeButton);
    this.addChild(this.dim, this.card, this.saveButton, this.flash);
    this.drawChrome();
  }

  setTopOffset(offset: number) {
    if (this.topOffset === offset) return;
    this.topOffset = offset;
    if (this.visible) this.layout();
  }

  show(texture: Texture, meta: PosterMeta, now: number) {
    this.disposePhoto();
    this.photoTexture = texture;
    this.photo.texture = texture;
    this.subtitle.text = `${meta.stageLabel} · 通关`;
    this.caption.text = meta.comboCount >= 2 ? `连击 ×${meta.comboCount}  ·  光路接通` : '光路接通';
    this.saveButton.setText('保存到相册');
    this.saveButton.setDisabled(false);
    this.shownAt = now;
    this.entering = true;
    this.visible = true;
    this.layout();
    this.syncMotion(now);
  }

  hide() {
    this.visible = false;
    this.entering = false;
    this.flash.alpha = 0;
    this.flash.visible = false;
    this.disposePhoto();
  }

  exportTarget() {
    return this.card;
  }

  setSaveStatus(status: 'idle' | 'saving' | 'saved' | 'error') {
    this.saveButton.setDisabled(status === 'saving' || status === 'saved');
    this.saveButton.setText(
      status === 'saving' ? '保存中…' : status === 'saved' ? '已保存' : '保存到相册',
    );
  }

  update(now: number): boolean {
    if (!this.visible) return false;
    return this.syncMotion(now);
  }

  private layout() {
    const photoH = Math.round(PHOTO_W * STAGE_HEIGHT / DESIGN_WIDTH);
    const footerH = 52;
    this.cardH = PHOTO_Y + photoH + footerH;
    const saveH = this.saveButton.heightPx;
    const topLimit = 36 + this.topOffset;
    const bottomLimit = DESIGN_HEIGHT - 28 - saveH - 18;
    const cardY = Math.max(topLimit, Math.round((topLimit + bottomLimit - this.cardH) / 2));
    this.card.position.set(DESIGN_WIDTH / 2, cardY);
    this.drawCard(photoH);
    this.title.position.set(0, 24);
    this.subtitle.position.set(0, 66);
    this.photo.position.set(0, PHOTO_Y);
    this.photo.width = PHOTO_W;
    this.photo.height = photoH;
    this.photoMask.position.set(-PHOTO_W / 2, PHOTO_Y);
    this.photoMask.clear().roundRect(0, 0, PHOTO_W, photoH, 16).fill(Theme.white);
    this.photoFrame.position.set(0, 0);
    this.caption.position.set(0, PHOTO_Y + photoH + 14);
    this.closeButton.position.set(CARD_W / 2 - 18 - CLOSE_SIZE, 16);
    this.saveButton.position.set((DESIGN_WIDTH - this.saveButton.widthPx) / 2, cardY + this.cardH + 18);
  }

  private drawChrome() {
    this.dim.clear().rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT).fill({ color: Theme.overlay, alpha: 0.82 });
    this.flash.clear().rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT).fill(Theme.white);
    this.flash.alpha = 0;
    this.flash.visible = false;
    this.flash.eventMode = 'none';
  }

  private drawCard(photoH: number) {
    const x = -CARD_W / 2;
    const y = 0;
    this.cardGfx.clear()
      .roundRect(x + 6, y + 10, CARD_W, this.cardH, UI_TOKENS.radius.xl)
      .fill({ color: Theme.shadow, alpha: 0.42 })
      .roundRect(x, y, CARD_W, this.cardH, UI_TOKENS.radius.xl)
      .fill(Theme.surfaceSide)
      .stroke({ color: Theme.accent, width: 2 })
      .roundRect(x + 4, y + 4, CARD_W - 8, this.cardH - 8, 32)
      .fill(Theme.surface);
    const photoX = -PHOTO_W / 2;
    this.photoFrame.clear()
      .roundRect(photoX - 6, PHOTO_Y - 6, PHOTO_W + 12, photoH + 12, 20)
      .fill(Theme.surfaceMuted)
      .stroke({ color: Theme.surfaceLine, width: 1.5, alpha: 0.9 });
  }

  private syncMotion(now: number): boolean {
    const elapsed = now - this.shownAt;
    const flash = clamp(1 - elapsed / 180, 0, 1);
    this.flash.alpha = flash * 0.88;
    const entering = clamp((elapsed - 50) / 340, 0, 1);
    const scale = 0.84 + easeOutBack(entering) * 0.16;
    this.card.scale.set(scale);
    this.card.alpha = clamp(entering / 0.35, 0, 1);
    this.saveButton.alpha = clamp((elapsed - 220) / 180, 0, 1);
    this.closeButton.alpha = clamp((elapsed - 80) / 160, 0, 1);
    this.dim.alpha = 0.55 + 0.45 * easeOutCubic(clamp(elapsed / 220, 0, 1));
    this.flash.visible = flash > 0.02;
    this.entering = this.flash.visible || entering < 1 || this.saveButton.alpha < 1;
    return this.entering;
  }

  private disposePhoto() {
    this.photo.texture = Texture.EMPTY;
    if (this.photoTexture && this.photoTexture !== Texture.EMPTY) {
      this.photoTexture.destroy(true);
    }
    this.photoTexture = null;
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    this.disposePhoto();
    super.destroy(options);
  }
}
