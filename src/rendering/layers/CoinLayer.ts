import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { UI_RECTS, UI_TOKENS, WIN_REWARD_MOTION } from '@/config/GameConfig';
import { clamp, easeOutCubic } from '@/core/easing';
import { FONT_UI, Theme } from '../theme';

const FLIGHT_POOL = 12;
const COIN_RADIUS = 18;

type Flight = {
  sprite: Sprite;
  fallback: Graphics;
  start: { x: number; y: number };
  control: { x: number; y: number };
  index: number;
  direction: number;
  startedAt: number;
  duration: number;
  value: number;
  soundPlayed: boolean;
  arrived: boolean;
  launched: boolean;
};

export class CoinLayer extends Container {
  private readonly counter = new Container();
  private readonly chromeIdle = new Graphics();
  private readonly chromeHot = new Graphics();
  private readonly counterIcon = new Sprite(Texture.EMPTY);
  private readonly counterFallback = new Graphics();
  private readonly counterValue = new Text({
    text: '0',
    style: { fontFamily: FONT_UI, fontSize: 26, fontWeight: '900', fill: Theme.ink },
  });
  private readonly flightsRoot = new Container();
  private readonly pool: Array<{ sprite: Sprite; fallback: Graphics }> = [];
  private flights: Flight[] = [];
  private texture = Texture.EMPTY;
  private shownAt = 0;
  private displayed = 0;
  private highlighted = false;
  private lastDisplayed = -1;
  private onSound: (() => void) | null = null;
  private getStart: () => { x: number; y: number } = () => ({ x: 360, y: 580 });
  private layout = counterLayout(false);

  constructor() {
    super();
    this.visible = false;
    this.eventMode = 'none';
    this.counterValue.anchor.set(0, 0.5);
    this.counterIcon.anchor.set(0.5);
    drawCounterChrome(this.chromeIdle, false);
    drawCounterChrome(this.chromeHot, true);
    this.chromeHot.visible = false;
    drawCoinFallback(this.counterFallback);
    this.counter.addChild(this.chromeIdle, this.chromeHot, this.counterFallback, this.counterIcon, this.counterValue);
    this.addChild(this.counter, this.flightsRoot);
    this.counter.position.set(UI_RECTS.coinCounter.x, UI_RECTS.coinCounter.y);
    for (let i = 0; i < FLIGHT_POOL; i++) this.pool.push(this.makePooledCoin());
    this.placeCounter();
  }

  setCoinTexture(texture: Texture) {
    this.texture = texture;
    const ok = isTextureOk(texture);
    this.counterIcon.texture = texture;
    this.counterIcon.visible = ok;
    this.counterFallback.visible = !ok;
    for (const item of this.pool) applyCoinSprite(item.sprite, item.fallback, texture);
  }

  setHandlers(handlers: { onSound: () => void }) {
    this.onSound = handlers.onSound;
  }

  show(now: number, balance: number) {
    this.visible = true;
    this.shownAt = now;
    this.displayed = balance;
    this.setHighlighted(false);
    this.counter.alpha = 0;
    this.syncValue();
  }

  spawn(now: number, amount: number, getStart: () => { x: number; y: number }) {
    this.clearFlights();
    this.getStart = getStart;
    const start = getStart();
    const flightCount = Math.min(this.pool.length, Math.max(1, amount));
    const baseValue = Math.floor(amount / flightCount);
    const remainder = amount % flightCount;
    for (let index = 0; index < flightCount; index++) {
      const direction = index % 2 === 0 ? -1 : 1;
      const item = this.pool[index];
      applyCoinSprite(item.sprite, item.fallback, this.texture);
      item.sprite.alpha = 1;
      item.fallback.alpha = 1;
      item.sprite.visible = false;
      item.fallback.visible = false;
      this.flights.push({
        sprite: item.sprite,
        fallback: item.fallback,
        start: { ...start },
        control: flightControl(start, direction, index),
        index,
        direction,
        startedAt: now + WIN_REWARD_MOTION.coinFlightStartDelay + index * WIN_REWARD_MOTION.coinFlightStagger,
        duration: WIN_REWARD_MOTION.coinFlightDuration,
        value: baseValue + (index < remainder ? 1 : 0),
        soundPlayed: false,
        arrived: false,
        launched: false,
      });
    }
  }

  settle(): number {
    let leftover = 0;
    for (const flight of this.flights) {
      if (!flight.arrived) leftover += flight.value;
    }
    this.clearFlights();
    if (leftover) {
      this.displayed += leftover;
      this.syncValue();
    }
    this.setHighlighted(false);
    return leftover;
  }

  hide() {
    this.visible = false;
    this.shownAt = 0;
    this.clearFlights();
    this.setHighlighted(false);
  }

  iconCenter() {
    return { x: UI_RECTS.coinCounter.x + this.layout.x, y: UI_RECTS.coinCounter.y + this.layout.y };
  }

  update(now: number): boolean {
    if (!this.visible) return false;
    const elapsed = now - this.shownAt;
    const reveal = clamp(
      (elapsed - WIN_REWARD_MOTION.counterRevealDelay) / WIN_REWARD_MOTION.counterRevealDuration,
      0,
      1,
    );
    this.counter.alpha = easeOutCubic(reveal);

    const end = this.iconCenter();
    let live = this.counter.alpha < 1;
    let flying = false;
    for (const flight of this.flights) {
      if (now < flight.startedAt) {
        live = true;
        continue;
      }
      if (!flight.launched) {
        flight.launched = true;
        const start = this.getStart();
        flight.start = start;
        flight.control = flightControl(start, flight.direction, flight.index);
      }
      if (!flight.soundPlayed) {
        flight.soundPlayed = true;
        this.onSound?.();
      }
      const stillVisible = now <= flight.startedAt + flight.duration + 120;
      if (stillVisible) flying = true;
      const progress = clamp((now - flight.startedAt) / flight.duration, 0, 1);
      const eased = easeOutCubic(progress);
      const inverse = 1 - eased;
      const x = inverse * inverse * flight.start.x + 2 * inverse * eased * flight.control.x + eased * eased * end.x;
      const y = inverse * inverse * flight.start.y + 2 * inverse * eased * flight.control.y + eased * eased * end.y;
      const radius = 17 + Math.sin(progress * Math.PI) * 5;
      placeCoin(flight.sprite, flight.fallback, x, y, radius, this.texture);
      flight.sprite.alpha = stillVisible ? 1 : 0;
      flight.fallback.alpha = flight.sprite.alpha;
      if (progress >= 1 && !flight.arrived) {
        flight.arrived = true;
        this.displayed += flight.value;
        this.syncValue();
      }
      if (stillVisible) live = true;
    }
    this.setHighlighted(flying);
    if (!live) this.clearFlights();
    return live;
  }

  private makePooledCoin() {
    const sprite = new Sprite(this.texture);
    const fallback = new Graphics();
    sprite.anchor.set(0.5);
    sprite.visible = false;
    drawCoinFallback(fallback);
    fallback.visible = false;
    this.flightsRoot.addChild(fallback, sprite);
    return { sprite, fallback };
  }

  private syncValue() {
    if (this.displayed === this.lastDisplayed) return;
    this.lastDisplayed = this.displayed;
    this.counterValue.text = String(this.displayed);
    this.layout = counterLayout(this.highlighted);
    this.placeCounter();
  }

  private setHighlighted(value: boolean) {
    if (this.highlighted === value) return;
    this.highlighted = value;
    this.chromeIdle.visible = !value;
    this.chromeHot.visible = value;
    this.counterValue.style.fill = value ? Theme.gold : Theme.ink;
    this.layout = counterLayout(value);
    this.placeCounter();
  }

  private placeCounter() {
    this.counterIcon.position.set(this.layout.x, this.layout.y);
    this.counterIcon.width = this.layout.radius * 2;
    this.counterIcon.height = this.layout.radius * 2;
    this.counterFallback.position.set(this.layout.x, this.layout.y);
    this.counterFallback.scale.set(this.layout.radius);
    this.counterValue.position.set(this.layout.textX, this.layout.y);
  }

  private clearFlights() {
    for (const item of this.pool) {
      item.sprite.visible = false;
      item.fallback.visible = false;
    }
    this.flights = [];
  }
}

function counterLayout(highlighted: boolean) {
  const radius = highlighted ? 20 : 18;
  const gap = 10;
  const valueWidth = 72;
  const groupWidth = radius * 2 + gap + valueWidth;
  const groupX = (UI_RECTS.coinCounter.w - groupWidth) / 2 - 8;
  return {
    x: groupX + radius,
    y: UI_RECTS.coinCounter.h / 2,
    radius,
    textX: groupX + radius * 2 + gap,
  };
}

function drawCounterChrome(g: Graphics, highlighted: boolean) {
  const { w, h } = UI_RECTS.coinCounter;
  g.roundRect(0, 6, w, h - 2, UI_TOKENS.radius.md)
    .fill({ color: Theme.shadow, alpha: highlighted ? 0.5 : 0.34 })
    .roundRect(0, 5, w, h - 5, UI_TOKENS.radius.md)
    .fill(0x10161c)
    .roundRect(0, 0, w, h - 5, UI_TOKENS.radius.md)
    .fill(highlighted ? Theme.surfaceTop : Theme.surface)
    .stroke({ color: highlighted ? Theme.coin : Theme.surfaceLine, width: 1.5 });
}

function flightControl(start: { x: number; y: number }, direction: number, index: number) {
  return {
    x: start.x + direction * (86 + (index % 4) * 34),
    y: 74 + (index % 3) * 42,
  };
}

function isTextureOk(texture: Texture) {
  return texture !== Texture.EMPTY && texture.width > 1;
}

function applyCoinSprite(sprite: Sprite, fallback: Graphics, texture: Texture) {
  const ok = isTextureOk(texture);
  sprite.texture = texture;
  sprite.visible = ok;
  fallback.visible = !ok;
}

function drawCoinFallback(g: Graphics) {
  g.clear();
  g.circle(0, 2 / COIN_RADIUS, 1).fill(0xc98213);
  g.circle(0, -1 / COIN_RADIUS, 1).fill(Theme.coin);
  g.circle(0, -1 / COIN_RADIUS, 0.62).stroke({ color: 0xfff4ae, width: 0.12, alpha: 0.55 });
}

function placeCoin(sprite: Sprite, fallback: Graphics, x: number, y: number, radius: number, texture: Texture) {
  const ok = isTextureOk(texture);
  sprite.position.set(x, y);
  sprite.width = radius * 2;
  sprite.height = radius * 2;
  sprite.visible = ok;
  fallback.visible = !ok;
  fallback.position.set(x, y);
  fallback.scale.set(radius);
}
