import { Graphics, Sprite, Texture } from 'pixi.js';
import { drawGearIcon } from './icons';
import { Button } from './Button';
import { Theme } from '../theme';

/** Shared settings control used by both gameplay and level selection. */
export class SettingsButton extends Button {
  private readonly fallbackIcon = new Graphics();
  private readonly spriteIcon = new Sprite(Texture.EMPTY);

  constructor(width = 80, height = 80) {
    super(width, height, '', 'icon');
    const iconSize = Math.min(width, height) * 0.575;
    const centerX = width / 2;
    const centerY = (height - 5) / 2;

    this.fallbackIcon.position.set(centerX, centerY);
    this.fallbackIcon.eventMode = 'none';
    drawGearIcon(this.fallbackIcon, iconSize);

    this.spriteIcon.anchor.set(0.5);
    this.spriteIcon.position.set(centerX, centerY);
    this.spriteIcon.width = iconSize;
    this.spriteIcon.height = iconSize;
    this.spriteIcon.tint = Theme.settingsIcon;
    this.spriteIcon.eventMode = 'none';
    this.spriteIcon.visible = false;
    this.addChild(this.fallbackIcon, this.spriteIcon);
  }

  setTexture(texture: Texture) {
    const available = texture !== Texture.EMPTY && texture.width > 1;
    this.spriteIcon.texture = texture;
    this.spriteIcon.visible = available;
    this.fallbackIcon.visible = !available;
  }
}
