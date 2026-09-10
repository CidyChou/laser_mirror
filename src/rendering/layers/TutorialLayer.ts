import { Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import { DESIGN_HEIGHT, DESIGN_WIDTH, UI_RECTS } from '@/config/GameConfig';
import { borderPoint, cellCenter, computeGeometry } from '@/gameplay/geometry';
import type { LevelDefinition } from '@/gameplay/types';
import type { TutorialStep } from '@/gameplay/tutorial';
import { Theme, uiText } from '../theme';
import { Button } from '../ui/Button';

/** A single spotlight layer. Geometry is rebuilt only when a step or layout changes. */
export class TutorialLayer extends Container {
  readonly nextButton = new Button(174, 60, '继续', 'primary');
  readonly skipButton = new Button(128, 48, '跳过引导', 'secondary');
  private readonly dim = new Graphics();
  private readonly outlines = new Graphics();
  private readonly target = new Container();
  private readonly card = new Container();
  private readonly chrome = new Graphics();
  private readonly progress = new Text({ text: '', style: uiText({ fontSize: 18, fill: Theme.inkSoft }) });
  private readonly titleText = new Text({ text: '', style: uiText({ fontSize: 30, fill: Theme.ink }) });
  private readonly body = new Text({ text: '', style: uiText({ fontSize: 26, lineHeight: 38, fill: Theme.inkSoft, wordWrap: true, breakWords: true, wordWrapWidth: 568 }) });
  private readonly instruction = new Text({ text: '', style: uiText({ fontSize: 20, fill: Theme.inkSoft }) });
  private readonly finger = new Sprite(Texture.EMPTY);
  private readonly fallback = new Graphics();
  private fingerX = 0;
  private fingerY = 0;
  private step: TutorialStep | null = null;
  private level: LevelDefinition | null = null;
  private count = { current: 1, total: 1 };
  private topOffset = 0;
  private tapHandler: () => void = () => {};

  constructor() {
    super();
    this.visible = false;
    this.eventMode = 'passive';
    this.dim.eventMode = 'static';
    // Keep navigation/settings reachable; every other board tap is captured by this layer.
    this.dim.hitArea = { contains: (_x: number, y: number) => y >= 202 + this.topOffset };
    this.outlines.eventMode = 'none';
    this.target.eventMode = 'static';
    this.target.cursor = 'pointer';
    this.target.on('pointertap', () => this.tapHandler());
    this.card.eventMode = 'static';
    this.finger.eventMode = 'none';
    this.finger.anchor.set(.22, .12);
    this.fallback.eventMode = 'none';
    this.fallback.circle(0, 0, 10).fill({ color: Theme.white, alpha: .9 });
    this.skipButton.setLabelSize(18);
    this.nextButton.setLabelSize(23);
    this.card.addChild(this.chrome, this.progress, this.titleText, this.body, this.instruction, this.nextButton, this.skipButton);
    this.addChild(this.dim, this.outlines, this.target, this.card, this.fallback, this.finger);
  }

  setTapHandler(handler: () => void) { this.tapHandler = handler; }
  setFingerTexture(texture: Texture) {
    this.finger.texture = texture;
    if (this.step) this.layout();
  }
  setTopOffset(offset: number) {
    if (this.topOffset === offset) return;
    this.topOffset = offset;
    if (this.step) this.layout();
  }
  show(step: TutorialStep | null, level: LevelDefinition, progress: { current: number; total: number }) {
    const unchanged = this.step === step && this.level === level;
    this.step = step; this.level = level; this.count = progress;
    this.visible = !!step;
    if (step && !unchanged) this.layout();
  }

  private layout() {
    const step = this.step, level = this.level;
    if (!step || !level) return;
    const g = computeGeometry(level);
    const rects = step.anchors.map(anchor => {
      if (anchor.kind === 'fire') return new Rectangle(UI_RECTS.fire.x - 8, UI_RECTS.fire.y - 8, UI_RECTS.fire.w + 16, UI_RECTS.fire.h + 16);
      const p = anchor.kind === 'cell' ? cellCenter(g, anchor.x, anchor.y) : borderPoint(g, anchor.port);
      const size = anchor.kind === 'cell' ? Math.min(g.cell * .85, 154) : Math.max(46, Math.min(g.cell * .64, 100));
      return new Rectangle(Math.max(6, Math.min(DESIGN_WIDTH - size - 6, p.x - size / 2)), p.y - size / 2, size, size);
    });
    this.dim.clear().rect(0, 202 + this.topOffset, DESIGN_WIDTH, DESIGN_HEIGHT - 202 - this.topOffset).fill({ color: Theme.overlay, alpha: .66 });
    this.outlines.clear();
    for (const rect of rects) {
      this.dim.roundRect(rect.x, rect.y, rect.width, rect.height, 16).cut();
      this.outlines.roundRect(rect.x, rect.y, rect.width, rect.height, 16).stroke({ color: Theme.cyan, width: 3, alpha: .95 });
    }
    const actionable = step.action !== 'next';
    const first = rects[0];
    this.target.visible = actionable && !!first;
    this.target.hitArea = first ?? new Rectangle();
    this.finger.visible = actionable && this.finger.texture !== Texture.EMPTY;
    this.fallback.visible = actionable && !this.finger.visible;
    if (first) {
      this.fingerX = first.x + first.width / 2;
      this.fingerY = first.y + first.height / 2;
      const scale = 112 / Math.max(1, this.finger.texture.width);
      this.finger.scale.set(this.fingerX > 560 ? -scale : scale, scale);
      this.finger.position.set(this.fingerX, this.fingerY);
      this.fallback.position.copyFrom(this.finger.position);
    }
    this.progress.text = `玩法引导  ${this.count.current} / ${this.count.total}`;
    this.titleText.text = step.title;
    this.body.text = step.body;
    // Search both position and width. A narrower card can sit between edge ports on dense boards.
    // Informational cards may occupy the fire area while that button is intentionally blocked.
    const obstacles = [...rects];
    if (actionable && first) obstacles.push(new Rectangle(this.fingerX - (this.fingerX > 560 ? 88 : 24), this.fingerY, 112, 126));
    let y = 220 + this.topOffset, width = 624, best = Infinity;
    for (const candidateWidth of [624, 560, 496]) {
      this.body.style.wordWrapWidth = candidateWidth - 56;
      const height = 220 + this.body.height, x = (DESIGN_WIDTH - candidateWidth) / 2;
      for (let candidate = 220 + this.topOffset; candidate <= DESIGN_HEIGHT - 24 - height; candidate += 8) {
        const overlap = obstacles.reduce((sum, rect) => sum
          + Math.max(0, Math.min(candidate + height + 16, rect.bottom) - Math.max(candidate - 16, rect.top))
          * Math.max(0, Math.min(x + candidateWidth + 12, rect.right) - Math.max(x - 12, rect.left)), 0);
        const score = overlap + (624 - candidateWidth) * .1
          + Math.abs(candidate - (first && first.y < 670 ? 1130 - height : 230 + this.topOffset)) * .01;
        if (score < best) { best = score; y = candidate; width = candidateWidth; }
      }
    }
    this.body.style.wordWrapWidth = width - 56;
    const height = 220 + this.body.height, x = (DESIGN_WIDTH - width) / 2;
    this.card.position.set(x, y);
    this.card.hitArea = new Rectangle(0, 0, width, height);
    this.chrome.clear().roundRect(0, 6, width, height, 26).fill({ color: Theme.shadow, alpha: .3 })
      .roundRect(0, 0, width, height, 26).fill(Theme.surface).stroke({ color: Theme.surfaceLine, width: 2 });
    this.progress.position.set(28, 28);
    this.skipButton.position.set(width - 152, 16);
    this.titleText.position.set(28, 70);
    this.body.position.set(28, 116);
    this.nextButton.visible = !actionable;
    this.nextButton.position.set(width - 202, height - 80);
    this.nextButton.setText(step.button ?? (this.count.current === this.count.total ? '知道了' : '继续'));
    this.instruction.visible = actionable;
    this.instruction.text = step.action === 'fire' ? '点击下方「发射」' : '点击手指所指的位置';
    this.instruction.position.set(28, height - 55);
  }

  update(now: number) {
    if (!this.visible || this.step?.action === 'next') return;
    const shift = 4 + (1 - Math.cos(now / 180)) * 5;
    this.finger.position.set(this.fingerX + shift * .3, this.fingerY + shift);
    this.fallback.scale.set(.8 + shift * .03);
  }
  get active() { return this.visible && this.step?.action !== 'next'; }
}
