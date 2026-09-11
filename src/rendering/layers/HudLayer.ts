import { Container, Graphics, Rectangle, Text, Texture } from 'pixi.js';
import { UI_RECTS } from '@/config/GameConfig';
import type { GameState } from '@/gameplay/types';
import { stageLabel } from '@/levels/campaign';
import { Button } from '../ui/Button';
import { SettingsButton } from '../ui/SettingsButton';
import { Theme, uiText } from '../theme';

export class HudLayer extends Container {
  readonly settingsButton = new SettingsButton(UI_RECTS.settings.w, UI_RECTS.settings.h);
  readonly levelButton = new Button(UI_RECTS.progress.w, UI_RECTS.progress.h, '', 'secondary');
  readonly fireButton = new Button(UI_RECTS.fire.w, UI_RECTS.fire.h, '发射', 'fire');
  readonly guideButton = new Button(48, 46, '?', 'icon');
  readonly previousLevel = levelArrow(-1);
  readonly nextLevel = levelArrow(1);
  private readonly hearts = new Graphics();
  private readonly heartsCount = new Text({
    text: '',
    style: uiText({ fontSize: 32, fill: Theme.ink }),
  });
  private readonly hint = new Text({
    text: '',
    style: uiText({ fontSize: 18, fontWeight: 'normal', fill: Theme.inkSoft, align: 'center', wordWrap: true, wordWrapWidth: 600, lineHeight: 28 }),
  });
  private readonly masthead=new Container();
  private readonly status=new Text({text:'',style:uiText({fontSize:18,fill:Theme.inkSoft})});
  private readonly statusDot=new Graphics().circle(0,0,3.4).fill(Theme.cyan);
  private lastLevel = -1;
  private lastHearts = -1;
  private lastHint = '';
  private topOffset = 0;
  private firing = false;
  private previousAvailable = false;
  private nextAvailable = false;

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
    this.masthead.y=offset;
    this.guideButton.y=88+offset;
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
    this.levelButton.setLabelSize(34);
    this.levelButton.setCornerRadius(27);
    this.previousLevel.position.set(36,37);
    this.nextLevel.position.set(progress.w-36,37);
    this.levelButton.content.addChild(this.previousLevel,this.nextLevel);
    this.levelButton.setLabelMaxWidth(progress.w-128);

    const hearts = UI_RECTS.hearts;
    this.hearts.position.set(hearts.x, hearts.y);
    this.heartsCount.anchor.set(0, 0.5);

    this.fireButton.position.set(UI_RECTS.fire.x, UI_RECTS.fire.y);
    this.fireButton.setLabelSize(34);
    this.hint.anchor.set(0.5, 0);
    this.hint.position.set(UI_RECTS.hint.x, UI_RECTS.hint.y);

    const title=new Text({text:'光线急转弯',style:uiText({fontSize:31,fill:Theme.ink,letterSpacing:3})});
    title.position.set(46,40);
    const edition=new Text({text:'LIGHT PUZZLE',style:uiText({fontSize:11,fill:Theme.inkSoft,letterSpacing:4})});
    edition.position.set(46,83);edition.alpha=.8;
    const tagline=new Text({text:'以光为引 · 解开每一道弯',style:uiText({fontSize:14,fill:Theme.inkSoft,letterSpacing:1})});
    tagline.anchor.set(1,0);tagline.position.set(678,46);
    const brandRule=new Graphics().moveTo(46,118).lineTo(63,118).stroke({color:Theme.cyan,width:1.8});
    this.guideButton.position.set(630,88);this.guideButton.setCornerRadius(23);this.guideButton.setLabelSize(24);
    this.guideButton.hitArea=new Rectangle(-12,-12,72,70);
    this.status.anchor.set(.5);this.status.position.set(370,246);
    this.statusDot.position.set(246,246);
    const legend=new Container();legend.position.set(360,1018);
    const legendText=new Text({text:'旋转镜面   /   连接所有接收器',style:uiText({fontSize:18,fill:Theme.inkSoft,letterSpacing:.6})});
    legendText.anchor.set(.5);legendText.x=16;
    const rotate=new Graphics().arc(-145,0,10,-Math.PI*.8,Math.PI*.6)
      .stroke({color:Theme.inkSoft,width:1.8,cap:'round'});
    rotate.moveTo(-155,-7).lineTo(-155,0).lineTo(-149,-3).stroke({color:Theme.inkSoft,width:1.8,cap:'round',join:'round'});
    legend.addChild(rotate,legendText);
    this.masthead.addChild(title,edition,tagline,brandRule,this.statusDot,this.status);
    this.addChild(this.masthead,legend);
    this.addChild(this.guideButton,this.settingsButton, this.levelButton, this.hearts, this.heartsCount, this.fireButton, this.hint);
  }

  sync(state: GameState) {
    this.hint.visible=!state.level.timeBoss;
    if (state.levelIndex !== this.lastLevel) {
      this.lastLevel = state.levelIndex;
      this.levelButton.setText(stageLabel(state.level, state.levelIndex));
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
    this.fireButton.setDisabled((state.firing&&!state.timeSkill) || state.won);
    this.levelButton.setDisabled(state.firing);
    this.guideButton.setDisabled(state.firing);
    this.firing=state.firing;
    this.syncArrows();
    this.fireButton.setActive(state.firing);
    this.fireButton.setText(state.hearts > 0 ? (state.firing?(state.timeSkill?'结束本次试射':'能量释放中'):'发射光束') : '补充爱心');
    this.status.text=state.won?'所有接收器已点亮':state.firing?'光束传输中':'将光束引导至所有接收器';
    this.statusDot.x=this.status.x-this.status.width/2-14;
    this.status.tint=state.won?Theme.green:state.firing?Theme.laserPlasma:Theme.white;
  }

  setHeartsVisible(visible: boolean) {
    this.hearts.visible = visible;
    this.heartsCount.visible = visible;
  }

  setLevelNavigation(previous: boolean, next: boolean) {
    this.previousAvailable=previous;
    this.nextAvailable=next;
    this.syncArrows();
  }

  private syncArrows() {
    for (const [arrow, available] of [[this.previousLevel,this.previousAvailable],[this.nextLevel,this.nextAvailable]] as const) {
      const enabled=available&&!this.firing;
      arrow.alpha=enabled?1:.25;
      // Keep disabled taps from bubbling to the surrounding level-selection button.
      arrow.eventMode='static';
      arrow.cursor=enabled?'pointer':'default';
    }
  }

  private drawHearts(left: number) {
    const { x: cardX, y: cardY, w, h } = UI_RECTS.hearts;
    const empty = left <= 0;
    this.hearts.clear()
      .roundRect(0, 5, w, h - 2, 20)
      .fill({ color: Theme.shadow, alpha: 0.18 })
      .roundRect(0, 3, w, h - 3, 20)
      .fill(Theme.surfaceSide)
      .roundRect(0, 0, w, h - 3, 20)
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

function levelArrow(direction: -1 | 1) {
  const arrow=new Graphics().moveTo(-direction*4,-9).lineTo(direction*4,0).lineTo(-direction*4,9)
    .stroke({color:Theme.inkSoft,width:3,cap:'round',join:'round'});
  arrow.eventMode='static';arrow.cursor='pointer';
  arrow.hitArea=new Rectangle(-25,-34,50,68);
  return arrow;
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
