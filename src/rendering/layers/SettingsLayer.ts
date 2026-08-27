import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { DESIGN_HEIGHT, DESIGN_WIDTH, UI_RECTS, UI_TOKENS } from '@/config/GameConfig';
import { Button } from '../ui/Button';
import { Theme, uiText } from '../theme';

export class SettingsLayer extends Container {
  readonly closeButton = new Button(64, 64, '✕', 'icon');
  readonly audioButton = new Button(500, 72, '声音  开', 'secondary');
  readonly restartButton = new Button(500, 78, '重新开始本关', 'primary');
  private readonly dim = new Graphics();
  private readonly panel = new Graphics();
  private readonly title = new Text({
    text: '设置',
    style: uiText({ fontSize: 40, fill: Theme.ink }),
  });

  constructor() {
    super();
    this.visible = false;
    this.eventMode = 'static';
    this.hitArea = new Rectangle(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    this.title.anchor.set(0.5);
    this.closeButton.setLabelSize(26);
    this.audioButton.setLabelSize(24);
    this.restartButton.setLabelSize(26);
    this.addChild(this.dim, this.panel, this.title, this.closeButton, this.audioButton, this.restartButton);
    this.layout();
  }

  show(audioEnabled: boolean) {
    this.visible = true;
    this.setAudioEnabled(audioEnabled);
  }

  hide() {
    this.visible = false;
  }

  setAudioEnabled(enabled: boolean) {
    this.audioButton.setText(enabled ? '声音  开' : '声音  关');
  }

  private layout() {
    const rect = UI_RECTS.settingsPanel;
    this.dim.rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT).fill({ color: Theme.overlay, alpha: 0.78 });
    this.panel.roundRect(rect.x + 6, rect.y + 10, rect.w, rect.h, UI_TOKENS.radius.xl).fill({ color: Theme.shadow, alpha: 0.4 })
      .roundRect(rect.x, rect.y, rect.w, rect.h, UI_TOKENS.radius.xl).fill(Theme.surface).stroke({ color: Theme.surfaceLine, width: 2 });
    this.title.position.set(DESIGN_WIDTH / 2, rect.y + 58);
    this.closeButton.position.set(rect.x + rect.w - 84, rect.y + 22);
    this.audioButton.position.set(rect.x + 40, rect.y + 140);
    this.restartButton.position.set(rect.x + 40, rect.y + 248);
  }
}
