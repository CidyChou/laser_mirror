import { Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import { DESIGN_HEIGHT, DESIGN_WIDTH, UI_RECTS, UI_TOKENS } from '@/config/GameConfig';
import { clamp, easeOutBack } from '@/core/easing';
import { Button } from '../ui/Button';
import { FONT_UI, Theme } from '../theme';

export type ResultKind = 'win' | 'lose';

export class ResultLayer extends Container {
  readonly primary = new Button(326, 82, '下一关', 'primary');
  readonly secondary = new Button(340, 64, '重新挑战', 'secondary');
  private readonly dim = new Graphics();
  private readonly panel = new Container();
  private readonly panelGfx = new Graphics();
  private readonly title = new Text({ text: '', style: { fontFamily: FONT_UI, fontSize: 52, fontWeight: '900', fill: Theme.ink } });
  private readonly subtitle = new Text({ text: '', style: { fontFamily: FONT_UI, fontSize: 22, fontWeight: '700', fill: Theme.inkSoft } });
  private readonly tip = new Text({
    text: '',
    style: { fontFamily: FONT_UI, fontSize: 18, fontWeight: '600', fill: Theme.ink, align: 'center', wordWrap: true, wordWrapWidth: 420 },
  });
  private readonly crown = new Sprite(Texture.EMPTY);
  private kind: ResultKind = 'win';
  private shownAt = 0;
  private entering = false;

  constructor() {
    super();
    this.visible = false;
    this.eventMode = 'static';
    this.hitArea = new Rectangle(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    this.dim.eventMode = 'static';
    this.title.anchor.set(0.5);
    this.subtitle.anchor.set(0.5);
    this.tip.anchor.set(0.5);
    this.crown.anchor.set(0.5);
    this.crown.width = 124;
    this.crown.height = 124;
    this.primary.setLabelSize(28);
    this.secondary.setLabelSize(22);
    this.panel.addChild(this.panelGfx, this.crown, this.title, this.subtitle, this.tip, this.primary, this.secondary);
    this.addChild(this.dim, this.panel);
  }

  setCrownTexture(texture: Texture) {
    const ok = texture !== Texture.EMPTY && texture.width > 1;
    this.crown.texture = texture;
    this.crown.visible = this.kind === 'win' && ok;
  }

  get kindValue(): ResultKind { return this.kind; }

  show(kind: ResultKind, copy: { title: string; subtitle: string; tip: string; primary: string; secondary?: string }, now: number) {
    this.kind = kind;
    this.shownAt = now;
    this.entering = true;
    this.visible = true;
    this.title.text = copy.title;
    this.subtitle.text = copy.subtitle;
    this.tip.text = copy.tip;
    this.primary.setText(copy.primary);
    this.secondary.setText(copy.secondary ?? '重新挑战');
    this.secondary.visible = false;
    this.crown.visible = kind === 'win' && this.crown.texture !== Texture.EMPTY && this.crown.texture.width > 1;
    this.title.style.fill = kind === 'win' ? Theme.ink : Theme.danger;
    this.title.style.fontSize = kind === 'win' ? 52 : 64;
    this.layout();
    this.syncMotion(now);
  }

  hide() {
    this.visible = false;
    this.entering = false;
  }

  update(now: number): boolean {
    if (!this.visible) return false;
    return this.syncMotion(now);
  }

  private layout() {
    const rect = this.kind === 'win' ? UI_RECTS.resultWin : UI_RECTS.resultLose;
    this.panel.position.set(rect.x + rect.w / 2, rect.y + rect.h / 2);
    this.drawPanel(rect.w, rect.h);
    this.crown.position.set(0, -rect.h / 2 + 78);
    this.title.position.set(0, this.kind === 'win' ? -rect.h / 2 + 168 : -rect.h / 2 + 132);
    this.subtitle.position.set(0, this.kind === 'win' ? -rect.h / 2 + 218 : -rect.h / 2 + 198);
    this.tip.position.set(0, this.kind === 'win' ? 8 : 18);
    this.primary.position.set(-this.primary.widthPx / 2, rect.h / 2 - (this.kind === 'win' ? 150 : 108));
    this.secondary.position.set(-this.secondary.widthPx / 2, rect.h / 2 - 58);
  }

  private drawPanel(w: number, h: number) {
    const x = -w / 2;
    const y = -h / 2;
    const accent = this.kind === 'win' ? Theme.accent : Theme.danger;
    this.panelGfx.clear()
      .roundRect(x + 6, y + 10, w, h, UI_TOKENS.radius.xl)
      .fill({ color: Theme.shadow, alpha: 0.42 })
      .roundRect(x, y, w, h, UI_TOKENS.radius.xl)
      .fill(Theme.surfaceSide)
      .stroke({ color: accent, width: 2 })
      .roundRect(x + 4, y + 4, w - 8, h - 8, 32)
      .fill(Theme.surface);
    if (this.kind === 'lose') {
      this.panelGfx.roundRect(-210,  -20, 420, 96, UI_TOKENS.radius.md)
        .fill(Theme.surfaceMuted)
        .stroke({ color: Theme.danger, width: 1, alpha: 0.28 });
    }
  }

  private syncMotion(now: number): boolean {
    const elapsed = now - this.shownAt;
    const shade = clamp(elapsed / 260, 0, 1);
    this.dim.clear().rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT).fill({ color: Theme.overlay, alpha: 0.78 * shade });
    const entering = clamp(elapsed / 360, 0, 1);
    const scale = 0.76 + easeOutBack(entering) * 0.24;
    this.panel.scale.set(scale);
    this.primary.alpha = clamp((elapsed - 420) / 220, 0, 1);
    this.secondary.alpha = this.primary.alpha;
    this.entering = entering < 1 || this.primary.alpha < 1;
    return this.entering;
  }
}
