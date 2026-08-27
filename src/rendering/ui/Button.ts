import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { UI_TOKENS } from '@/config/GameConfig';
import { Theme, uiText } from '../theme';

export type ButtonKind = 'primary' | 'secondary' | 'icon' | 'fire' | 'danger';

export class Button extends Container {
  private shadow = new Graphics();
  private body = new Graphics();
  private face = new Graphics();
  private shine = new Graphics();
  private caption = new Text({ text: '', style: uiText({ fontSize: 26, fill: Theme.ink }) });
  private disabledState = false;
  private activeState = false;
  private pressedState = false;

  constructor(
    public readonly widthPx: number,
    public readonly heightPx: number,
    text: string,
    private readonly kind: ButtonKind = 'primary',
  ) {
    super();
    this.addChild(this.shadow, this.body, this.face, this.shine, this.caption);
    this.caption.anchor.set(0.5);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(0, 0, widthPx, heightPx);
    this.on('pointerdown', () => this.setPressed(true));
    this.on('pointerup', () => this.setPressed(false));
    this.on('pointerupoutside', () => this.setPressed(false));
    this.on('pointercancel', () => this.setPressed(false));
    this.setText(text);
    this.redraw();
  }

  setText(text: string) {
    if (this.caption.text === text) return;
    this.caption.text = text;
  }

  setDisabled(value: boolean) {
    if (this.disabledState === value) return;
    this.disabledState = value;
    this.eventMode = value ? 'none' : 'static';
    this.cursor = value ? 'default' : 'pointer';
    if (value) this.setPressed(false);
    this.redraw();
  }

  setActive(value: boolean) {
    if (this.activeState === value) return;
    this.activeState = value;
    this.redraw();
  }

  setLabelSize(size: number) {
    this.caption.style.fontSize = size;
    this.caption.style.padding = Math.max(10, Math.round(size * 0.32));
  }

  private setPressed(value: boolean) {
    if (this.disabledState || this.pressedState === value) return;
    this.pressedState = value;
    this.redraw();
  }

  private redraw() {
    this.shadow.clear();
    this.body.clear();
    this.face.clear();
    this.shine.clear();

    const radius = this.kind === 'icon' ? UI_TOKENS.radius.md : UI_TOKENS.radius.lg;
    const pressed = this.pressedState;
    const disabled = this.disabledState;
    const depth = pressed
      ? UI_TOKENS.button.pressedDepth
      : this.kind === 'icon'
        ? UI_TOKENS.button.chromeDepth
        : UI_TOKENS.button.idleDepth;
    const faceH = this.heightPx - depth;

    let fill = Theme.surface;
    let edge = Theme.surfaceLine;
    let label = Theme.ink;
    if (this.kind === 'primary') {
      fill = Theme.accent;
      edge = Theme.accentDark;
    } else if (this.kind === 'fire') {
      fill = this.activeState ? Theme.beam : Theme.accent;
      edge = this.activeState ? Theme.beam2 : Theme.accentDark;
    } else if (this.kind === 'danger') {
      fill = 0x5a2a30;
      edge = Theme.danger;
    } else if (this.kind === 'icon') {
      fill = Theme.surface;
      edge = Theme.surfaceLine;
    }
    if (disabled && this.kind === 'fire' && !this.activeState) {
      fill = 0x3a4452;
      edge = 0x2a3340;
      label = Theme.inkSoft;
    } else if (disabled && !this.activeState) {
      fill = Theme.surfaceMuted;
      edge = Theme.surfaceLine;
      label = Theme.inkSoft;
    }

    this.shadow.roundRect(0, 6, this.widthPx, this.heightPx, radius).fill({ color: Theme.shadow, alpha: 0.38 });
    this.body.roundRect(0, depth, this.widthPx, faceH, radius).fill(shade(fill, 0.62));
    this.face.roundRect(0, 0, this.widthPx, faceH, radius).fill(fill).stroke({ color: edge, width: 1.5, alpha: 0.95 });
    this.shine.roundRect(3, 3, this.widthPx - 6, Math.max(10, faceH * 0.34), radius - 3).fill({ color: 0xffffff, alpha: disabled ? 0.04 : 0.1 });

    this.caption.style.fill = label;
    this.caption.alpha = disabled ? 0.62 : 1;
    this.caption.position.set(this.widthPx / 2, faceH / 2 + (pressed ? 1 : 0));
  }
}

function shade(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 255) * factor);
  const g = Math.round(((color >> 8) & 255) * factor);
  const b = Math.round((color & 255) * factor);
  return (r << 16) | (g << 8) | b;
}
