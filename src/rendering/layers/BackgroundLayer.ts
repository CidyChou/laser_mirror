import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '@/config/GameConfig';
import { isLightTheme, Theme } from '../theme';

/** Share the loaded texture; cover the viewport without stretching the artwork. */
export class BackgroundLayer extends Container {
  private readonly base = new Graphics();
  private readonly artwork = new Sprite(Texture.EMPTY);
  private readonly sky = new Container();
  private readonly meteor = new Graphics();
  private readonly stars: { dot: Graphics; phase: number; speed: number; brightness: number }[] = [];
  private lastFrame = -Infinity;
  private motionMode = '';
  private nextMeteor = 0;
  private meteorStarted = -Infinity;
  private meteorX = 0;
  private meteorY = 0;
  private meteorDistance = 0;
  private viewport = new Rectangle(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

  constructor() {
    super();
    this.eventMode = 'none';
    this.addChild(this.base, this.artwork, this.sky);
    // Fixed geometry: animation only adjusts opacity and position, never builds particles per frame.
    for (let index = 0; index < 52; index++) {
      const dot = new Graphics();
      const bright = index % 11 === 0;
      const radius = bright ? 1.65 : .6 + (index % 4) * .22;
      dot.circle(0, 0, radius).fill(index % 3 === 0 ? 0xaad9ef : 0xe2edff);
      if (bright) {
        dot.circle(0, 0, 4).fill({ color: 0x91cce8, alpha: .07 });
        dot.moveTo(-4, 0).lineTo(4, 0).moveTo(0, -4).lineTo(0, 4)
          .stroke({ color: 0xc9e8ff, width: .6, alpha: .28 });
      }
      this.sky.addChild(dot);
      this.stars.push({ dot, phase: index * 2.39996, speed: .00028 + (index % 5) * .000055,
        brightness: bright ? .55 : .18 + (index % 4) * .065 });
    }
    for (let segment = 0; segment < 16; segment++) {
      const t = segment / 16;
      this.meteor.moveTo(-116 + segment * 7.25, 0).lineTo(-116 + (segment + 1) * 7.25, 0)
        .stroke({ color: 0xb9e2ff, width: .5 + t * 1.1, alpha: t * t * .5 });
    }
    this.meteor.circle(0, 0, 1.8).fill({ color: 0xedf8ff, alpha: .9 });
    this.meteor.rotation = .53;
    this.meteor.visible = false;
    this.sky.addChild(this.meteor);
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

  /** Low-frequency ambient updates also work while the gameplay ticker is asleep. */
  updateAmbient(now: number, quality: 'high' | 'medium' | 'low', reducedMotion = false): boolean {
    const enabled = !isLightTheme();
    const mode = `${enabled}:${quality}:${reducedMotion}`;
    const changed = mode !== this.motionMode;
    this.motionMode = mode;
    this.sky.visible = enabled;
    if (!enabled) return changed;
    if (!changed && now - this.lastFrame < (this.meteor.visible ? 30 : 100)) return false;
    this.lastFrame = now;
    for (const [index, star] of this.stars.entries()) {
      star.dot.visible = quality !== 'low' || index % 2 === 0;
      star.dot.alpha = star.brightness * (reducedMotion || quality === 'low' ? .7
        : .65 + .35 * Math.sin(now * star.speed + star.phase));
    }
    if (reducedMotion || quality === 'low') {
      this.meteor.visible = false;
      this.meteorStarted = -Infinity;
      this.nextMeteor = now + 14000;
      return changed;
    }
    if (!this.nextMeteor) this.nextMeteor = now + 6500 + Math.random() * 5000;
    // Returning from the background never catches up a backlog of meteors.
    if (now >= this.nextMeteor) {
      const bounds = this.viewport;
      this.meteorStarted = now;
      this.nextMeteor = now + 14000 + Math.random() * 14000;
      this.meteorX = bounds.x + bounds.width * (.12 + Math.random() * .52);
      // Prefer the open sky above or below the puzzle, rather than its opaque cells.
      this.meteorY = bounds.y + bounds.height * ((Math.random() < .5 ? .04 : .74) + Math.random() * .1);
      this.meteorDistance = bounds.width * (.26 + Math.random() * .2);
    }
    const progress = (now - this.meteorStarted) / 1400;
    this.meteor.visible = progress >= 0 && progress < 1;
    if (this.meteor.visible) {
      this.meteor.position.set(this.meteorX + progress * this.meteorDistance,
        this.meteorY + progress * this.meteorDistance * Math.tan(.53));
      this.meteor.alpha = Math.sin(progress * Math.PI) * .65;
    }
    return true;
  }

  private layout() {
    const { x, y, width, height } = this.viewport;
    this.base.clear().rect(x, y, width, height).fill(Theme.bg);
    this.sky.visible = !isLightTheme();
    this.stars.forEach((star, index) => {
      const u = ((index * .61803398875 + .13) % 1);
      const v = ((index * .754877666 + .07) % 1);
      star.dot.position.set(x + u * width, y + v * height);
      star.dot.alpha = star.brightness * .7;
    });
    this.meteor.visible = false;
    this.meteorStarted = -Infinity;
    const texture = this.artwork.texture;
    this.artwork.visible = !isLightTheme() && texture !== Texture.EMPTY && texture.width > 1;
    if (!this.artwork.visible) return;
    const scale = Math.max(width / texture.width, height / texture.height);
    this.artwork.scale.set(scale);
    this.artwork.position.set(x + (width - texture.width * scale) / 2, y + (height - texture.height * scale) / 2);
  }
}
