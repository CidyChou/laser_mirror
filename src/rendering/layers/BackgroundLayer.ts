import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '@/config/GameConfig';
import { isLightTheme, Theme } from '../theme';

/** Share the loaded texture; cover the viewport without stretching the artwork. */
export class BackgroundLayer extends Container {
  private readonly base = new Graphics();
  private readonly artwork = new Sprite(Texture.EMPTY);
  private viewport = new Rectangle(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

  constructor() {
    super();
    this.eventMode = 'none';
    this.addChild(this.base, this.artwork);
    this.layout();
  }

  setTexture(texture: Texture) {
    this.artwork.texture = texture;
    this.layout();
  }

  setViewport(bounds: Rectangle) {
    this.viewport = bounds;
    this.layout();
  }

  private layout() {
    const { x, y, width, height } = this.viewport;
    this.base.clear().rect(x, y, width, height).fill(Theme.bg);
    const texture = this.artwork.texture;
    this.artwork.visible = !isLightTheme() && texture !== Texture.EMPTY && texture.width > 1;
    if (!this.artwork.visible) return;
    const scale = Math.max(width / texture.width, height / texture.height);
    this.artwork.scale.set(scale);
    this.artwork.position.set(x + (width - texture.width * scale) / 2, y + (height - texture.height * scale) / 2);
  }
}
