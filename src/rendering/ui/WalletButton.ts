import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { Button } from './Button';
import { drawCoinIcon } from './icons';
import { Theme, uiText } from '../theme';

/** Persistent menu balance; the separate plus button starts the coin video. */
export class WalletButton extends Container {
  readonly body = new Button(184, 76, '', 'icon');
  readonly plus = new Button(40, 44, '+', 'primary');
  private readonly icon = new Sprite(Texture.EMPTY);
  private readonly fallback = new Graphics();
  private readonly value = new Text({ text: '0', style: uiText({ fontSize: 26, fill: Theme.coin }) });

  constructor() {
    super();
    this.icon.anchor.set(.5);
    this.icon.position.set(26, 35);
    drawCoinIcon(this.fallback, 18);
    this.fallback.position.copyFrom(this.icon.position);
    this.value.anchor.set(.5);
    this.value.position.set(91, 33);
    this.value.eventMode = this.icon.eventMode = this.fallback.eventMode = 'none';
    this.plus.position.set(136, 15);
    this.plus.setLabelSize(28);
    this.plus.setCornerRadius(13);
    this.body.addChild(this.fallback, this.icon, this.value);
    this.addChild(this.body, this.plus);
  }

  setBalance(coins: number) {
    this.value.text = String(Math.max(0, Math.floor(coins)));
    this.value.scale.set(1);
    this.value.scale.set(Math.min(1, 78 / Math.max(1, this.value.width)));
  }

  setCoinTexture(texture: Texture) {
    this.icon.texture = texture;
    this.icon.width = this.icon.height = 36;
    this.icon.visible = texture !== Texture.EMPTY && texture.width > 1;
    this.fallback.visible = !this.icon.visible;
  }
}
