import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { UI_TOKENS } from '@/config/GameConfig';
import { setUiFontSize, Theme, uiText } from '../theme';

export type ButtonKind = 'primary' | 'secondary' | 'icon' | 'fire' | 'danger';

export class Button extends Container {
  private shadow = new Graphics();
  private body = new Graphics();
  private face = new Graphics();
  private caption = new Text({ text: '', style: uiText({ fontSize: 26, fill: Theme.ink }) });
  private disabledState = false;
  private activeState = false;
  private pressedState = false;
  private labelOffsetY = 0;

  constructor(
    public readonly widthPx: number,
    public readonly heightPx: number,
    text: string,
    private readonly kind: ButtonKind = 'primary',
  ) {
    super();
    this.addChild(this.shadow, this.body, this.face, this.caption);
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
    setUiFontSize(this.caption, size);
  }

  setLabelOffsetY(offset: number) {
    if (this.labelOffsetY === offset) return;
    this.labelOffsetY = offset;
    this.redraw();
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
      fill = Theme.dangerSurface;
      edge = Theme.danger;
    } else if (this.kind === 'icon') {
      fill = Theme.surface;
      edge = Theme.surfaceLine;
    }
    if (disabled && this.kind === 'fire' && !this.activeState) {
      fill = Theme.disabledSurface;
      edge = Theme.disabledEdge;
      label = Theme.inkSoft;
    } else if (disabled && !this.activeState) {
      fill = Theme.surfaceMuted;
      edge = Theme.surfaceLine;
      label = Theme.inkSoft;
    }

    // A restrained 2.5D lip and soft contact shadow. The previous full-width
    // top highlight made every control look glossy and visually noisy.
    this.shadow.roundRect(1, 7, this.widthPx - 2, this.heightPx - 2, radius)
      .fill({ color: Theme.shadow, alpha: disabled ? 0.16 : 0.26 });
    this.body.roundRect(0, depth, this.widthPx, faceH, radius).fill(shade(fill, 0.76));
    this.face.roundRect(0, 0, this.widthPx, faceH, radius).fill(fill).stroke({ color: edge, width: 1.5, alpha: 0.95 });

    this.caption.style.fill = label;
    this.caption.alpha = disabled ? 0.62 : 1;
    this.caption.position.set(this.widthPx / 2, faceH / 2 + (pressed ? 1 : 0) + this.labelOffsetY);
  }
}

function shade(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 255) * factor);
  const g = Math.round(((color >> 8) & 255) * factor);
  const b = Math.round((color & 255) * factor);
  return (r << 16) | (g << 8) | b;
}
