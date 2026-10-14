import { Container, FillGradient, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import { clamp, easeOutCubic } from '@/core/easing';
import { uiText } from '../theme';
import { LoadingBoard } from './LoadingBoard';

const WIDTH = 720;
const CONTENT_HEIGHT = 1110;
const BG = 0x080f1f;
const START_Y = 940;

/** Shared Pixi loading screen: the wordmark is the only image asset. */
export class LoadingScene extends Container {
  private readonly backdrop = new Graphics();
  private readonly atmosphere = new Graphics();
  private readonly stars = new Graphics();
  private readonly content = new Container();
  private readonly title = new Sprite(Texture.EMPTY);
  private readonly fallback = new Text({ text: '光线\n急转弯', style: uiText({ fontSize: 100, align: 'center', fill: 0xe8fcff, lineHeight: 110, letterSpacing: 8 }) });
  private readonly board = new LoadingBoard();
  private readonly progress = new Container();
  private readonly progressFill = new Graphics();
  readonly startButton = new Container();
  private readonly buttonFace = new Container();
  private readonly backgroundFill = new FillGradient({
    type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 },
    colorStops: [{ offset: 0, color: '#0b1729' }, { offset: 1, color: '#060c18' }],
  });
  private readonly wash = new FillGradient({
    type: 'radial', center: { x: .5, y: .5 }, outerCenter: { x: .5, y: .5 },
    innerRadius: 0, outerRadius: .5, textureSize: 128,
    colorStops: [{ offset: 0, color: '#21536d50' }, { offset: 1, color: '#102d4500' }],
  });
  private readonly buttonFill = new FillGradient({
    type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 },
    colorStops: [{ offset: 0, color: '#c5fff4' }, { offset: .48, color: '#7ae7df' }, { offset: 1, color: '#3abec8' }],
  });
  private progressTarget = 0;
  private displayedProgress = 0;
  private readyAt: number | null = null;
  private pressed = false;

  constructor(private readonly reducedMotion = false) {
    super();
    this.eventMode = 'static';
    this.addChild(this.backdrop, this.atmosphere, this.stars, this.content);
    this.content.addChild(this.fallback, this.title);
    this.title.anchor.set(.5, 0);
    this.title.position.set(360, 0);
    this.title.visible = false;
    this.fallback.anchor.set(.5, 0);
    this.fallback.position.set(360, 35);
    this.board.position.set(360, 590);
    this.progress.position.set(210, 895);
    this.progress.addChild(new Graphics().roundRect(0, 0, 300, 5, 2.5).fill(0x203547), this.progressFill);
    this.progressFill.roundRect(0, 0, 300, 5, 2.5).fill(0x75e9e4);
    this.progressFill.scale.x = 0;
    this.content.addChild(this.board, this.progress, this.startButton);
    this.buildStartButton();
  }

  private makeLabel(text: string, fontSize: number, fill: number) {
    const label = new Text({ text, style: { ...uiText({ fontSize, fill, letterSpacing: 2 }), fontWeight: '500' } });
    label.anchor.set(.5);
    return label;
  }

  private buildStartButton() {
    this.startButton.position.set(360, START_Y);
    this.startButton.hitArea = new Rectangle(-219, -50, 438, 100);
    this.startButton.cursor = 'pointer';
    this.startButton.eventMode = 'none';
    this.startButton.visible = false;
    const shadow = new Graphics().roundRect(-222, -42, 444, 106, 34).fill({color:0x020812,alpha:.35})
      .roundRect(-219, -43, 438, 100, 32).fill(0x147887);
    const face = new Graphics().roundRect(-219, -50, 438, 100, 32).fill(this.buttonFill)
      .stroke({color:0xd0fff7,alpha:.55,width:1.5})
      .moveTo(-181, -46).lineTo(181, -46).stroke({ color: 0xf0fffc, alpha: .66, width: 1.5,cap:'round' });
    const label = this.makeLabel('开始游戏', 34, 0x082e3c);
    label.style.fontWeight='700';
    label.position.set(0,-4);
    this.startButton.addChild(shadow, this.buttonFace);
    this.buttonFace.addChild(face, label);
    this.startButton.on('pointerdown', () => this.setPressed(true));
    this.startButton.on('pointerup', () => this.setPressed(false));
    this.startButton.on('pointerupoutside', () => this.setPressed(false));
    this.startButton.on('pointercancel', () => this.setPressed(false));
  }

  private setPressed(value: boolean) {
    this.pressed = value;
    this.buttonFace.y = value ? 6 : 0;
  }

  setTitleTexture(texture: Texture) {
    if (texture === Texture.EMPTY || texture.width <= 1) return;
    this.title.texture = texture;
    this.title.scale.set(Math.min(510 / texture.width, 310 / texture.height));
    this.title.visible = true;
    this.fallback.visible = false;
  }

  setProgress(ratio: number) {
    this.progressTarget = Math.max(this.progressTarget, clamp(ratio, 0, 1));
  }

  showStart(elapsedMs: number) {
    this.setProgress(1);
    this.readyAt ??= elapsedMs;
    this.progress.visible = false;
    this.startButton.visible = true;
    this.startButton.eventMode = 'static';
  }

  resize(width: number, height: number, safeTop = 0) {
    this.hitArea = new Rectangle(0, 0, width, height);
    this.backdrop.clear().rect(0, 0, width, height).fill(BG).fill(this.backgroundFill);
    const top = Math.max(24, safeTop + 12);
    const bottom = 30;
    const scale = Math.min(width / WIDTH, Math.max(1, height - top - bottom) / CONTENT_HEIGHT);
    this.content.scale.set(scale);
    this.content.position.set((width - WIDTH * scale) / 2, top + Math.max(0, height - top - bottom - CONTENT_HEIGHT * scale) * .35);
    this.atmosphere.clear().ellipse(width * .43, height * .48, width * .95, height * .52).fill(this.wash);
    this.stars.clear();
    // Stable, sparse dust. No per-frame random allocation or background image.
    for (let i = 0; i < 28; i++) {
      const x = ((i * 137.508 + 43) % 719) / 720 * width;
      const y = ((i * 211.3 + 29) % 1279) / 1280 * height;
      this.stars.circle(x, y, i % 5 === 0 ? 1.1 : .65).fill({ color: 0x96d9e4, alpha: i % 5 === 0 ? .32 : .14 });
    }
  }

  update(elapsedMs: number, deltaMs: number) {
    this.board.update(elapsedMs, this.reducedMotion);
    this.displayedProgress += (this.progressTarget - this.displayedProgress) * Math.min(1, deltaMs / 120);
    if (this.readyAt === null) {
      this.progressFill.scale.x = this.displayedProgress;
    } else {
      const enter = this.reducedMotion ? 1 : easeOutCubic(clamp((elapsedMs - this.readyAt) / 320, 0, 1));
      this.startButton.alpha = enter;
      this.startButton.y = START_Y + (1 - enter) * 14;
      if (!this.pressed) this.buttonFace.y = 0;
    }
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    super.destroy(options);
    this.backgroundFill.destroy();
    this.wash.destroy();
    this.buttonFill.destroy();
  }
}
