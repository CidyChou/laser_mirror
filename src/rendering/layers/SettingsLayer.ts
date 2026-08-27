import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { DESIGN_HEIGHT, DESIGN_WIDTH, UI_RECTS, UI_TOKENS } from '@/config/GameConfig';
import { Button } from '../ui/Button';
import { THEMES, Theme, type GameTheme, type ThemeId, uiText } from '../theme';

const CARD_W = 156;
const CARD_H = 150;

export class SettingsLayer extends Container {
  readonly closeButton = new Button(64, 64, '✕', 'icon');
  readonly audioButton = new Button(500, 72, '声音  开', 'secondary');
  readonly restartButton = new Button(500, 78, '重新开始本关', 'primary');
  private readonly dim = new Graphics();
  private readonly panel = new Graphics();
  private readonly title = new Text({ text: '设置', style: uiText({ fontSize: 40, fill: Theme.ink }) });
  private readonly appearanceLabel = sectionLabel('外观主题');
  private readonly audioLabel = sectionLabel('声音与触感');
  private readonly actionLabel = sectionLabel('本局操作');
  private readonly footer = new Text({
    text: '主题切换不会影响关卡进度',
    style: uiText({ fontSize: 14, fill: Theme.inkSoft }),
  });
  private readonly themeCards = THEMES.map((theme) => new ThemeCard(theme));
  private themeHandler: (id: ThemeId) => void = () => {};

  constructor(themeId: ThemeId) {
    super();
    this.visible = false;
    this.eventMode = 'static';
    this.hitArea = new Rectangle(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    this.title.anchor.set(0.5);
    this.footer.anchor.set(0.5);
    this.closeButton.setLabelSize(26);
    this.audioButton.setLabelSize(22);
    this.restartButton.setLabelSize(24);
    for (const card of this.themeCards) {
      card.on('pointertap', () => this.themeHandler(card.theme.id));
    }
    this.addChild(
      this.dim, this.panel, this.title, this.closeButton,
      this.appearanceLabel, ...this.themeCards,
      this.audioLabel, this.audioButton,
      this.actionLabel, this.restartButton, this.footer,
    );
    this.setThemeId(themeId);
    this.layout();
  }

  setThemeHandler(handler: (id: ThemeId) => void) {
    this.themeHandler = handler;
  }

  show(audioEnabled: boolean, themeId: ThemeId) {
    this.visible = true;
    this.setAudioEnabled(audioEnabled);
    this.setThemeId(themeId);
  }

  hide() {
    this.visible = false;
  }

  setAudioEnabled(enabled: boolean) {
    this.audioButton.setText(enabled ? '声音与震动  ·  已开启' : '声音与震动  ·  已关闭');
  }

  setThemeId(themeId: ThemeId) {
    for (const card of this.themeCards) card.setSelected(card.theme.id === themeId);
  }

  private layout() {
    const rect = UI_RECTS.settingsPanel;
    this.dim.rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT).fill({ color: Theme.overlay, alpha: 0.78 });
    this.panel.roundRect(rect.x + 6, rect.y + 10, rect.w, rect.h, UI_TOKENS.radius.xl)
      .fill({ color: Theme.shadow, alpha: 0.4 })
      .roundRect(rect.x, rect.y, rect.w, rect.h, UI_TOKENS.radius.xl)
      .fill(Theme.surface)
      .stroke({ color: Theme.surfaceLine, width: 2 });
    this.title.position.set(DESIGN_WIDTH / 2, rect.y + 58);
    this.closeButton.position.set(rect.x + rect.w - 84, rect.y + 22);
    this.appearanceLabel.position.set(rect.x + 40, rect.y + 122);
    this.themeCards.forEach((card, index) => card.position.set(rect.x + 40 + index * (CARD_W + 16), rect.y + 154));
    this.audioLabel.position.set(rect.x + 40, rect.y + 352);
    this.audioButton.position.set(rect.x + 40, rect.y + 388);
    this.actionLabel.position.set(rect.x + 40, rect.y + 506);
    this.restartButton.position.set(rect.x + 40, rect.y + 542);
    this.footer.position.set(DESIGN_WIDTH / 2, rect.y + 710);
  }
}

class ThemeCard extends Container {
  readonly chrome = new Graphics();
  readonly preview = new Graphics();
  readonly check = new Graphics();
  readonly nameText: Text;
  readonly tagline: Text;
  private selected = false;

  constructor(readonly theme: GameTheme) {
    super();
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(0, 0, CARD_W, CARD_H);
    this.nameText = new Text({ text: theme.name, style: uiText({ fontSize: 20, fill: theme.colors.ink }) });
    this.tagline = new Text({ text: theme.tagline, style: uiText({ fontSize: 13, fill: theme.colors.inkSoft }) });
    this.nameText.anchor.set(0.5);
    this.tagline.anchor.set(0.5);
    this.nameText.position.set(CARD_W / 2, 108);
    this.tagline.position.set(CARD_W / 2, 132);
    this.drawPreview();
    this.addChild(this.chrome, this.preview, this.nameText, this.tagline, this.check);
    this.redraw();
  }

  setSelected(selected: boolean) {
    if (this.selected === selected) return;
    this.selected = selected;
    this.redraw();
  }

  private drawPreview() {
    const c = this.theme.colors;
    this.preview.roundRect(10, 10, CARD_W - 20, 76, 13).fill(c.bg);
    this.preview.roundRect(24, 24, 78, 48, 10).fill(c.boardTop).stroke({ color: c.surfaceLine, width: 1 });
    this.preview.roundRect(31, 31, 28, 34, 7).fill(c.cellA);
    this.preview.roundRect(66, 31, 28, 34, 7).fill(c.cellB);
    this.preview.moveTo(30, 58).lineTo(91, 37).stroke({ color: c.beam2, width: 10, alpha: 0.22, cap: 'round' });
    this.preview.moveTo(30, 58).lineTo(91, 37).stroke({ color: c.beam, width: 4, alpha: 0.95, cap: 'round' });
    this.preview.roundRect(111, 28, 16, 40, 7).fill(c.cyan).stroke({ color: c.white, width: 1, alpha: 0.7 });
  }

  private redraw() {
    const c = this.theme.colors;
    this.chrome.clear()
      .roundRect(0, 5, CARD_W, CARD_H, UI_TOKENS.radius.md).fill({ color: c.shadow, alpha: 0.28 })
      .roundRect(0, 0, CARD_W, CARD_H - 5, UI_TOKENS.radius.md)
      .fill(c.surface)
      .stroke({ color: this.selected ? c.accent : c.surfaceLine, width: this.selected ? 3 : 1.5 });
    this.check.clear();
    if (this.selected) {
      this.check.circle(132, 18, 13).fill(c.accent).stroke({ color: c.white, width: 1.5, alpha: 0.82 });
      this.check.moveTo(126, 18).lineTo(130, 22).lineTo(138, 13).stroke({ color: c.textOnAccent, width: 3, cap: 'round', join: 'round' });
    }
  }
}

function sectionLabel(text: string) {
  return new Text({ text, style: uiText({ fontSize: 18, fill: Theme.inkSoft }) });
}
