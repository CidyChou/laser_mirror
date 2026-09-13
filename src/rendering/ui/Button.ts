import { Container, FillGradient, Graphics, Rectangle, Text } from 'pixi.js';
import { UI_TOKENS } from '@/config/GameConfig';
import { isLightTheme, setUiFontSize, Theme, uiText } from '../theme';

export type ButtonKind = 'primary' | 'secondary' | 'icon' | 'fire' | 'danger';

export class Button extends Container {
  readonly content = new Container();
  private shadow = new Graphics();
  private body = new Graphics();
  private face = new Graphics();
  private chargeFill = new Graphics();
  private chargeEdge = new Graphics();
  private chargeMeter = new Graphics();
  private chargeFlare = new Graphics();
  private caption = new Text({ text: '', style: uiText({ fontSize: 26, fill: Theme.ink }) });
  private disabledState = false;
  private activeState = false;
  private pressedState = false;
  private labelOffsetY = 0;
  private cornerRadius: number | undefined;
  private labelMaxWidth = Infinity;
  private chargeProgress: number | null = null;
  private readonly finishes = new Map<number, FillGradient>();

  constructor(
    public readonly widthPx: number,
    public readonly heightPx: number,
    text: string,
    private readonly kind: ButtonKind = 'primary',
  ) {
    super();
    this.addChild(this.shadow, this.body, this.content);
    this.content.addChild(this.face, this.chargeFill, this.chargeEdge, this.chargeMeter, this.chargeFlare, this.caption);
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
    this.fitLabel();
  }

  setDisabled(value: boolean) {
    if (this.disabledState === value) return;
    this.disabledState = value;
    this.eventMode = value ? 'none' : 'static';
    this.cursor = value ? 'default' : 'pointer';
    if (value) this.pressedState = false;
    this.redraw();
  }

  setActive(value: boolean) {
    if (this.activeState === value) return;
    this.activeState = value;
    this.redraw();
  }

  setLabelSize(size: number) {
    setUiFontSize(this.caption, size);
    this.fitLabel();
  }

  setLabelMaxWidth(width: number) {
    this.labelMaxWidth = width;
    this.fitLabel();
  }

  private fitLabel() {
    this.caption.scale.set(1);
    const available = Math.min(this.labelMaxWidth, this.widthPx - (this.kind === 'fire' ? 156 : 32));
    if (this.caption.width > available) this.caption.scale.set(available / this.caption.width);
  }

  setLabelOffsetY(offset: number) {
    if (this.labelOffsetY === offset) return;
    this.labelOffsetY = offset;
    this.redraw();
  }

  setCornerRadius(radius: number) {
    this.cornerRadius = radius;
    this.redraw();
  }

  /** A single left-to-right energy layer; geometry stays cached while charging. */
  setChargeProgress(progress: number | null, now = 0) {
    this.chargeProgress = progress === null ? null : Math.max(0, Math.min(1, progress));
    const active = this.kind === 'fire' && this.chargeProgress !== null;
    this.chargeFill.visible = active;
    this.chargeEdge.visible = active;
    this.chargeMeter.visible = active;
    this.chargeFlare.visible = active;
    if (!active) {
      this.content.x = 0;
      return;
    }
    const p = this.chargeProgress!;
    const pulse=.5+.5*Math.sin(now*(.009+p*.014));
    this.chargeFill.alpha = .055 + p * .15 + pulse*p*.045;
    this.chargeEdge.alpha = .16 + p * .46 + pulse*p*.16;
    this.chargeMeter.scale.x = Math.max(.001,p);
    this.chargeMeter.alpha=.58+p*.36;
    this.chargeFlare.x=58+(this.widthPx-116)*p;
    this.chargeFlare.alpha=.42+p*.52;
    this.chargeFlare.scale.set(.72+p*.58+pulse*.12);
    const shake = Math.max(0,p-.58)**2 * 7.5;
    this.content.x = Math.sin(now * (.018 + p * .026)) * shake;
  }

  get charging() { return this.chargeProgress !== null; }

  private setPressed(value: boolean) {
    if (this.disabledState || this.pressedState === value) return;
    this.pressedState = value;
    this.redraw();
  }

  private redraw() {
    this.shadow.clear();
    this.body.clear();
    this.face.clear();
    this.chargeFill.clear();
    this.chargeEdge.clear();
    this.chargeMeter.clear();
    this.chargeFlare.clear();

    const radius = this.cornerRadius ?? (this.kind === 'fire' ? 38 : this.kind === 'icon' ? UI_TOKENS.radius.md : 22);
    const pressed = this.pressedState;
    const disabled = this.disabledState;
    const depth = pressed
      ? UI_TOKENS.button.pressedDepth
      : this.kind === 'icon'
        ? UI_TOKENS.button.chromeDepth
        : UI_TOKENS.button.idleDepth;
    const idleDepth = this.kind === 'icon' ? UI_TOKENS.button.chromeDepth : UI_TOKENS.button.idleDepth;
    const faceH = this.heightPx - idleDepth;
    const faceY = idleDepth - depth;

    let fill = Theme.surface;
    let edge = Theme.surfaceLine;
    let label = Theme.ink;
    if (this.kind === 'primary') {
      fill = Theme.accent;
      edge = Theme.accentDark;
      label = Theme.textOnAccent;
    } else if (this.kind === 'fire') {
      fill = this.activeState ? Theme.beam2 : Theme.laserBody;
      edge = Theme.laserPlasma;
      label = Theme.white;
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

    let finish = this.finishes.get(fill);
    if (!finish) {
      finish = new FillGradient({start:{x:0,y:0},end:{x:0,y:1},textureSize:64,
        colorStops:[{offset:0,color:fill},{offset:1,color:shade(fill,this.kind==='fire'?.88:isLightTheme()?.96:.79)}]});
      this.finishes.set(fill,finish);
    }
    this.shadow.roundRect(0, 8, this.widthPx, faceH, radius)
      .fill({ color: Theme.shadow, alpha: disabled ? .10 : .20 });
    this.body.roundRect(0, idleDepth, this.widthPx, faceH, radius).fill(shade(fill, isLightTheme()?.82:.56));
    this.content.y = faceY;
    this.face.roundRect(0, 0, this.widthPx, faceH, radius).fill(finish)
      .stroke({color:edge,width:this.kind==='fire'?1.8:1.4,alpha:this.kind==='fire'?.85:.84});
    if(this.kind==='fire'){
      this.chargeFill.roundRect(3,3,this.widthPx-6,faceH-6,Math.max(4,radius-3))
        .fill({color:Theme.white,alpha:1});
      this.chargeEdge.roundRect(3,3,this.widthPx-6,faceH-6,Math.max(4,radius-3))
        .stroke({color:Theme.laserCore,width:2.4,alpha:1});
      this.chargeMeter.position.set(58,0);
      this.chargeMeter.moveTo(0,faceH-9).lineTo(this.widthPx-116,faceH-9)
        .stroke({color:Theme.white,width:3,alpha:1,cap:'round'});
      this.chargeFlare.circle(0,faceH-9,8).fill({color:Theme.beamHot,alpha:.18})
        .circle(0,faceH-9,3).fill({color:Theme.white,alpha:1});
    }
    if(this.kind==='fire'&&!disabled){
      const playX=48;
      this.face.poly([playX,faceH*.32,playX+22,faceH*.5,playX,faceH*.68],true)
        .fill({color:Theme.white,alpha:.97});
      for(let i=0;i<3;i++)this.face.roundRect(this.widthPx-56+i*7,faceH*.40,2,faceH*.20,1)
        .fill({color:Theme.white,alpha:.25});
    }
    this.caption.style.fill = label;
    this.caption.alpha = disabled ? 0.62 : 1;
    this.caption.position.set(this.widthPx / 2 + (this.kind==='fire'?8:0), faceH / 2 + this.labelOffsetY);
    this.setChargeProgress(this.chargeProgress);
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    super.destroy(options);
    this.finishes.forEach(finish=>finish.destroy());
    this.finishes.clear();
  }
}

function shade(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 255) * factor);
  const g = Math.round(((color >> 8) & 255) * factor);
  const b = Math.round((color & 255) * factor);
  return (r << 16) | (g << 8) | b;
}
