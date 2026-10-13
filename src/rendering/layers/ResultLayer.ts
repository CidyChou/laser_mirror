import { Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import { DESIGN_HEIGHT, DESIGN_WIDTH, UI_RECTS, UI_TOKENS, WIN_REWARD_MOTION } from '@/config/GameConfig';
import { clamp, easeOutBack } from '@/core/easing';
import { Button } from '../ui/Button';
import { drawCoinIcon, drawCrownIcon } from '../ui/icons';
import { setUiFontSize, Theme, uiText } from '../theme';

export type ResultKind = 'win' | 'lose';

export class ResultLayer extends Container {
  readonly primary = new Button(464, 84, '下一关', 'primary');
  readonly preview = new Button(224, 60, '预览本关', 'secondary');
  readonly levels = new Button(224, 60, '选择关卡', 'secondary');
  readonly secondary = new Button(340, 64, '重新挑战', 'secondary');
  private readonly dim = new Graphics();
  private readonly panel = new Container();
  private readonly panelGfx = new Graphics();
  private readonly rewardPanel = new Graphics();
  private hasReward = false;
  private readonly title = new Text({ text: '', style: uiText({ fontSize: 52, fill: Theme.ink }) });
  private readonly subtitle = new Text({ text: '', style: uiText({ fontSize: 22, fill: Theme.inkSoft }) });
  private readonly tip = new Text({
    text: '',
    style: uiText({ fontSize: 18, fill: Theme.ink, align: 'center', wordWrap: true, wordWrapWidth: 420 }),
  });
  private readonly rewardLabel = new Text({
    text: '本关奖励',
    style: uiText({ fontSize: 24, fill: Theme.inkSoft }),
  });
  private readonly rewardValue = new Text({
    text: '+0',
    style: uiText({ fontSize: 40, fill: Theme.coin }),
  });
  private readonly rewardCoin = new Sprite(Texture.EMPTY);
  private readonly rewardCoinFallback = new Graphics();
  private readonly crown = new Sprite(Texture.EMPTY);
  private readonly crownFallback = new Graphics();
  private kind: ResultKind = 'win';
  private shownAt = 0;
  private entering = false;
  private rewardCoinRevealAt: number | null = null;
  private coinTexture = Texture.EMPTY;
  private dimDrawn = false;

  constructor() {
    super();
    this.visible = false;
    this.eventMode = 'static';
    this.hitArea = new Rectangle(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    this.dim.eventMode = 'static';
    this.title.anchor.set(0.5);
    this.subtitle.anchor.set(0.5);
    this.tip.anchor.set(0.5);
    this.rewardLabel.anchor.set(0, 0.5);
    this.rewardValue.anchor.set(1, 0.5);
    this.rewardCoin.anchor.set(0.5);
    this.crown.anchor.set(0.5);
    this.crown.width = 116;
    this.crown.height = 116;
    drawCrownIcon(this.crownFallback, 116);
    this.primary.setLabelSize(28);
    this.primary.setSurfaceDepth(4);
    this.primary.setCornerRadius(22);
    this.preview.setSurfaceDepth(2);
    this.levels.setSurfaceDepth(2);
    this.preview.setCornerRadius(18);
    this.levels.setCornerRadius(18);
    this.preview.setLabelSize(22);
    this.levels.setLabelSize(22);
    this.secondary.setLabelSize(22);
    this.panel.addChild(
      this.panelGfx,
      this.rewardPanel,
      this.crownFallback,
      this.crown,
      this.title,
      this.subtitle,
      this.tip,
      this.rewardLabel,
      this.rewardValue,
      this.rewardCoinFallback,
      this.rewardCoin,
      this.preview,
      this.levels,
      this.primary,
      this.secondary,
    );
    this.addChild(this.dim, this.panel);
  }

  setCrownTexture(texture: Texture) {
    const ok = texture !== Texture.EMPTY && texture.width > 1;
    this.crown.texture = texture;
    this.crown.width = this.crown.height = 116;
    this.crown.visible = this.kind === 'win' && ok;
    this.crownFallback.visible = this.kind === 'win' && !ok;
  }

  setCoinTexture(texture: Texture) {
    this.coinTexture = texture;
    const ok = texture !== Texture.EMPTY && texture.width > 1;
    this.rewardCoin.texture = texture;
    this.rewardCoin.width = this.rewardCoin.height = 46;
    this.rewardCoin.visible = this.hasReward && ok;
    this.rewardCoinFallback.visible = this.hasReward && !ok;
  }

  get kindValue(): ResultKind { return this.kind; }

  show(kind: ResultKind, copy: { title: string; subtitle: string; tip: string; primary: string; secondary?: string; reward?: number }, now: number) {
    this.kind = kind;
    this.shownAt = now;
    this.entering = true;
    this.visible = true;
    this.restoreRewardCoin();
    this.ensureDim();
    this.title.text = copy.title;
    this.subtitle.text = copy.subtitle;
    this.tip.text = copy.tip;
    this.primary.setText(copy.primary);
    this.secondary.setText(copy.secondary ?? '重新挑战');
    this.secondary.visible = false;
    this.preview.visible = kind === 'win';
    this.levels.visible = kind === 'win';
    const reward = Math.max(0, Math.floor(copy.reward ?? 0));
    this.rewardValue.text = `+${reward}`;
    const showReward = this.hasReward = kind === 'win' && reward > 0;
    this.rewardPanel.visible = showReward;
    this.rewardLabel.visible = showReward;
    this.rewardValue.visible = showReward;
    const coinOk = this.coinTexture !== Texture.EMPTY && this.coinTexture.width > 1;
    this.rewardCoin.visible = showReward && coinOk;
    this.rewardCoinFallback.visible = showReward && !coinOk;
    this.crown.visible = kind === 'win' && this.crown.texture !== Texture.EMPTY && this.crown.texture.width > 1;
    this.crownFallback.visible = kind === 'win' && !this.crown.visible;
    this.title.style.fill = kind === 'win' ? Theme.ink : Theme.danger;
    setUiFontSize(this.title, kind === 'win' ? 48 : 64);
    this.layout();
    this.syncMotion(now);
  }

  hide() {
    this.visible = false;
    this.entering = false;
    this.restoreRewardCoin();
  }

  hideRewardCoin() {
    this.rewardCoinRevealAt = null;
    this.setRewardCoinAlpha(0);
  }

  restoreRewardCoin(now?: number) {
    this.rewardCoinRevealAt = this.visible && this.kind === 'win' ? now ?? null : null;
    this.setRewardCoinAlpha(this.rewardCoinRevealAt === null ? 1 : 0);
  }

  private setRewardCoinAlpha(alpha: number) {
    this.rewardCoin.alpha = alpha;
    this.rewardCoinFallback.alpha = alpha;
  }

  rewardCoinPoint() {
    return {
      x: this.panel.x + this.rewardCoin.x * this.panel.scale.x,
      y: this.panel.y + this.rewardCoin.y * this.panel.scale.y,
    };
  }

  update(now: number): boolean {
    if (!this.visible) return false;
    const entering = this.syncMotion(now);
    if (this.rewardCoinRevealAt !== null) {
      const progress = clamp((now - this.rewardCoinRevealAt) / WIN_REWARD_MOTION.rewardCoinRevealDuration, 0, 1);
      this.setRewardCoinAlpha(progress * progress * (3 - 2 * progress));
      if (progress === 1) this.rewardCoinRevealAt = null;
    }
    return entering || this.rewardCoinRevealAt !== null;
  }

  private layout() {
    const win = this.kind === 'win';
    const rect = win ? UI_RECTS.resultWin : UI_RECTS.resultLose;
    const h = win && !this.hasReward ? rect.h - 112 : rect.h;
    const top = -h / 2;
    this.panel.position.set(rect.x + rect.w / 2, rect.y + rect.h / 2);
    this.drawPanel(rect.w, h);
    this.crown.position.set(0, top + 82);
    this.crownFallback.position.copyFrom(this.crown.position);
    this.title.position.set(0, top + (win ? 168 : 132));
    this.subtitle.position.set(0, top + (win ? 214 : 198));
    this.tip.position.set(0, win ? top + 254 : 18);
    this.layoutReward(top + 344);
    if (win) {
      const rewardSpace = this.hasReward ? 112 : 0;
      this.primary.position.set(-232, top + 308 + rewardSpace);
      this.preview.position.set(-232, top + 402 + rewardSpace);
      this.levels.position.set(8, top + 402 + rewardSpace);
    } else {
      this.primary.position.set(-this.primary.widthPx / 2, h / 2 - 108);
    }
    this.secondary.position.set(-this.secondary.widthPx / 2, h / 2 - 58);
  }

  private layoutReward(y: number) {
    const coinR = 23;
    this.rewardPanel.clear().roundRect(-232, y - 44, 464, 88, 20)
      .fill({ color: Theme.coin, alpha: .07 })
      .stroke({ color: Theme.coin, alpha: .20, width: 1 });
    this.rewardLabel.position.set(-208, y);
    this.rewardValue.scale.set(1);
    if (this.rewardValue.width > 160) this.rewardValue.scale.set(160 / this.rewardValue.width);
    this.rewardValue.position.set(148, y);
    this.rewardCoin.position.set(185, y);
    this.rewardCoin.width = this.rewardCoin.height = coinR * 2;
    drawCoinIcon(this.rewardCoinFallback, coinR);
    this.rewardCoinFallback.position.set(185, y);
  }

  private drawPanel(w: number, h: number) {
    const x = -w / 2, y = -h / 2;
    this.panelGfx.clear()
      .roundRect(x, y + 8, w, h, UI_TOKENS.radius.xl)
      .fill({ color: Theme.shadow, alpha: .28 })
      .roundRect(x, y, w, h, UI_TOKENS.radius.xl)
      .fill(Theme.surface)
      .stroke({ color: Theme.surfaceLine, width: 1.5, alpha: .85 });
    if (this.kind === 'lose') {
      this.panelGfx.roundRect(-210, -20, 420, 96, UI_TOKENS.radius.md)
        .fill(Theme.surfaceMuted)
        .stroke({ color: Theme.danger, width: 1, alpha: .28 });
    }
  }

  private ensureDim() {
    if (this.dimDrawn) return;
    this.dimDrawn = true;
    this.setViewport(this.hitArea as Rectangle);
  }

  setViewport(bounds: Rectangle) {
    this.hitArea = bounds;
    const { x, y, width, height } = bounds;
    this.dim.clear().rect(x, y, width, height).fill({ color: Theme.overlay, alpha: .78 });
    this.dimDrawn = true;
  }

  private syncMotion(now: number): boolean {
    const elapsed = now - this.shownAt;
    const shade = clamp(elapsed / 260, 0, 1);
    this.dim.alpha = shade;
    const entering = clamp(elapsed / 360, 0, 1);
    const scale = 0.76 + easeOutBack(entering) * 0.24;
    this.panel.scale.set(scale);
    this.primary.alpha = clamp((elapsed - 420) / 220, 0, 1);
    this.preview.alpha = this.primary.alpha;
    this.levels.alpha = this.primary.alpha;
    this.secondary.alpha = this.primary.alpha;
    this.entering = entering < 1 || this.primary.alpha < 1;
    return this.entering;
  }
}
