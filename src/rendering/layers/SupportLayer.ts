import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '@/config/GameConfig';
import { Button } from '../ui/Button';
import { Theme, uiText } from '../theme';

export interface SupportAction { label: string; run: () => void; primary?: boolean; disabled?: boolean }
export interface SupportCopy { title: string; body: string; actions: SupportAction[] }

/** The same compact sheet hosts supplies, puzzle help and community actions. */
export class SupportLayer extends Container {
  readonly closeButton = new Button(56, 56, '✕', 'icon');
  private readonly dim = new Graphics();
  private readonly panel = new Container();
  private readonly chrome = new Graphics();
  private readonly title = new Text({ text: '', style: uiText({ fontSize: 36, fill: Theme.ink }) });
  private readonly body = new Text({ text: '', style: uiText({ fontSize: 21, fill: Theme.inkSoft,
    align: 'center', lineHeight: 34, wordWrap: true, breakWords: true, wordWrapWidth: 460 }) });
  private buttons: Button[] = [];

  constructor() {
    super();
    this.visible = false;
    this.eventMode = 'static';
    this.dim.eventMode = 'static';
    this.title.anchor.set(.5);
    this.body.anchor.set(.5, 0);
    this.closeButton.setLabelSize(24);
    this.panel.addChild(this.chrome, this.title, this.body, this.closeButton);
    this.addChild(this.dim, this.panel);
    this.setViewport(new Rectangle(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT));
  }

  show(copy: SupportCopy) {
    for (const button of this.buttons) { this.panel.removeChild(button); button.destroy({ children: true }); }
    this.buttons = [];
    this.title.text = copy.title;
    this.body.text = copy.body;
    const textHeight = Math.max(60, this.body.height);
    const height = 176 + textHeight + copy.actions.length * 80;
    this.panel.position.set(360, Math.max(100, (DESIGN_HEIGHT - height) / 2));
    this.chrome.clear().roundRect(-280, 8, 560, height, 30).fill({ color: Theme.shadow, alpha: .35 })
      .roundRect(-280, 0, 560, height, 30).fill(Theme.surface).stroke({ color: Theme.surfaceLine, width: 2 });
    this.title.position.set(0, 52);
    this.body.position.set(0, 98);
    this.closeButton.position.set(202, 20);
    copy.actions.forEach((action, index) => {
      const button = new Button(464, 64, action.label, action.primary ? 'primary' : 'secondary');
      button.setLabelSize(24);
      button.position.set(-232, 126 + textHeight + index * 80);
      button.setDisabled(action.disabled ?? false);
      button.on('pointertap', action.run);
      this.buttons.push(button);
      this.panel.addChild(button);
    });
    this.visible = true;
  }

  setViewport(bounds: Rectangle) {
    this.hitArea = bounds;
    this.dim.clear().rect(bounds.x, bounds.y, bounds.width, bounds.height).fill({ color: Theme.overlay, alpha: .8 });
  }

  hide() { this.visible = false; }
}
