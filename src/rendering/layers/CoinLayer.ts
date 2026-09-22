import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { UI_RECTS, UI_TOKENS, WIN_REWARD_MOTION } from '@/config/GameConfig';
import { clamp, easeOutCubic } from '@/core/easing';
import { Theme, uiText } from '../theme';
import { drawCoinIcon } from '../ui/icons';

const FLIGHT_POOL = 12;
const COIN_RADIUS = 18;

type Flight = {
  sprite: Sprite;
  fallback: Graphics;
  start: { x: number; y: number };
  offset: { x: number; y: number };
  hoverDuration: number;
  size: number;
  startRadius: number;
  drift: { x:number;y:number };
  flip:number;
  flipSpeed:number;
  popDuration:number;
  startedAt: number;
  duration: number;
  value: number;
  arrived: boolean;
  launched: boolean;
  spin: number;
};

export class CoinLayer extends Container {
  private readonly counter = new Container();
  private readonly chromeIdle = new Graphics();
  private readonly chromeHot = new Graphics();
  private readonly counterIcon = new Sprite(Texture.EMPTY);
  private readonly counterFallback = new Graphics();
  private readonly counterValue = new Text({
    text: '0',
    style: uiText({ fontSize: 26, fill: Theme.ink }),
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
  private onLaunch: (() => void) | undefined;
  private onComplete: ((now: number) => void) | undefined;
  private flightPhase: 'idle' | 'waiting' | 'flying' = 'idle';
  private getStart: () => { x: number; y: number } = () => ({ x: 360, y: 580 });
  private layout = counterLayout();
  private topOffset = 0;
  private arrivedAt = -Infinity;
  private arrivalPulseFrom = 0;
  private arrivedCount = 0;
  private lastSoundAt = -Infinity;

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

  setHandlers(handlers: { onSound: () => void; onLaunch?: () => void; onComplete?: (now: number) => void }) {
    this.onSound = handlers.onSound;
    this.onLaunch = handlers.onLaunch;
    this.onComplete = handlers.onComplete;
  }

  setTopOffset(offset: number) {
    if (this.topOffset === offset) return;
    this.topOffset = offset;
    this.counter.position.set(UI_RECTS.coinCounter.x, UI_RECTS.coinCounter.y + offset);
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
    if(amount<=0)return;
    this.flightPhase = 'waiting';
    this.getStart = getStart;
    const start = getStart();
    const flightCount = Math.min(this.pool.length, Math.max(1, amount));
    const baseValue = Math.floor(amount / flightCount);
    const remainder = amount % flightCount;
    const spreadRotation=Math.random()*Math.PI*2;
    const firstArrival = now + WIN_REWARD_MOTION.coinFlightStartDelay
      + WIN_REWARD_MOTION.coinPopDuration + WIN_REWARD_MOTION.coinHoverDuration
      + WIN_REWARD_MOTION.coinFlightDuration + 100;
    for (let index = 0; index < flightCount; index++) {
      // The first coin takes over the result icon at its original size and pose.
      const sourceCoin = index === 0;
      // Distribute through an ellipse, not two left/right piles. A little
      // jitter preserves separation while keeping each reward different.
      const angle=spreadRotation+index*2.39996+(Math.random()-.5)*.35;
      const spread=Math.sqrt((index+.6)/flightCount);
      const offset={x:Math.cos(angle)*(35+spread*83),y:-28+Math.sin(angle)*(20+spread*58)};
      const direction=offset.x<0?-1:1;
      const startedAt = now + WIN_REWARD_MOTION.coinFlightStartDelay + (sourceCoin ? 0 : Math.random()*65);
      const popDuration = WIN_REWARD_MOTION.coinPopDuration + Math.random()*65;
      const duration = WIN_REWARD_MOTION.coinFlightDuration + Math.random()*70;
      // Keep the burst organic while giving arrivals a clear collection rhythm.
      const arriveAt = firstArrival + index*WIN_REWARD_MOTION.coinFlightStagger + (sourceCoin ? 0 : (Math.random()-.5)*8);
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
        offset,
        drift:{x:direction*(5+Math.random()*9),y:-8-Math.random()*12},
        flip:sourceCoin ? 0 : Math.random()*Math.PI*2,
        flipSpeed:(Math.random()<.5?-1:1)*(3+Math.random()*3),
        popDuration,
        hoverDuration: arriveAt - startedAt - popDuration - duration,
        size: sourceCoin ? 1 : .76+Math.random()*.38,
        startRadius: sourceCoin ? 23 : 17*.45,
        startedAt,
        duration,
        value: baseValue + (index < remainder ? 1 : 0),
        arrived: false,
        launched: false,
        spin: sourceCoin ? 0 : (Math.random()-.5)*1.1,
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
    return { x: UI_RECTS.coinCounter.x + this.layout.x, y: UI_RECTS.coinCounter.y + this.topOffset + this.layout.y };
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
    let arrivals = 0;
    for (const flight of this.flights) {
      if(flight.arrived)continue;
      if (now < flight.startedAt) {
        live = true;
        continue;
      }
      if (!flight.launched) {
        flight.launched = true;
        const start = this.getStart();
        flight.start = start;
        if (this.flightPhase === 'waiting') {
          this.flightPhase = 'flying';
          this.onLaunch?.();
        }
      }
      const age=now-flight.startedAt;
      const popDuration=flight.popDuration;
      const travelAge=age-popDuration-flight.hoverDuration;
      if(travelAge>=flight.duration){
        flight.arrived = true;
        flight.sprite.visible=false;flight.fallback.visible=false;
        this.displayed += flight.value;
        this.syncValue();
        this.arrivedCount++;
        arrivals++;
        continue;
      }
      let x:number,y:number,radius:number,rotation:number;
      const hoverX=flight.start.x+flight.offset.x;
      const hoverY=flight.start.y+flight.offset.y;
      if(age<popDuration){
        const t=clamp(age/popDuration,0,1),ease=easeOutCubic(t);
        x=flight.start.x+flight.offset.x*ease;
        y=flight.start.y+flight.offset.y*ease;
        radius=flight.startRadius+(17*1.5-flight.startRadius)*ease;
        rotation=flight.spin+Math.sin(t*Math.PI)**2*.16;
      }else if(travelAge<0){
        const t=clamp((age-popDuration)/flight.hoverDuration,0,1);
        const ease=t*t*(3-2*t);
        x=hoverX+flight.drift.x*ease;
        y=hoverY+flight.drift.y*ease;
        radius=17*(1.5-.15*ease);
        rotation=flight.spin+Math.sin(t*Math.PI)**2*.06;
      }else{
        const t=clamp(travelAge/flight.duration,0,1),ease=t*t;
        const inverse=1-ease;
        const fromX=hoverX+flight.drift.x,fromY=hoverY+flight.drift.y;
        const controlX=fromX+flight.drift.x*2;
        const controlY=fromY+(end.y-fromY)*.3;
        x=inverse*inverse*fromX+2*inverse*ease*controlX+ease*ease*end.x;
        y=inverse*inverse*fromY+2*inverse*ease*controlY+ease*ease*end.y;
        radius=17*(1.35-.8*ease);
        rotation=flight.spin*(1-ease);
      }
      placeCoin(flight.sprite,flight.fallback,x,y,radius*flight.size,rotation,this.texture);
      // Foreshortening suggests a tumbling coin, with a readable face near
      // arrival. Both textured coins and the vector fallback share it.
      const flip=.28+.72*Math.abs(Math.cos(flight.flip+age*.001*flight.flipSpeed));
      const align=clamp(travelAge/flight.duration,0,1)**2;
      const face=flip+(1-flip)*align;
      flight.sprite.scale.x*=face;
      flight.fallback.scale.x*=face;
      const absorb=clamp((travelAge/flight.duration-.86)/.14,0,1);
      flight.sprite.alpha=flight.fallback.alpha=1-absorb*absorb*(3-2*absorb);
      live=true;
    }
    if (arrivals > 0) {
      this.arrivalPulseFrom = this.counterPulse(now) - 1;
      this.arrivedAt = now;
      // Coalesce missed frames into one sound, never a burst of overlapping notes.
      if (now - this.lastSoundAt >= WIN_REWARD_MOTION.coinSoundGap || this.arrivedCount === this.flights.length) {
        this.lastSoundAt = now;
        this.onSound?.();
      }
    }
    if (this.flightPhase === 'flying' && this.arrivedCount === this.flights.length) {
      this.flightPhase = 'idle';
      this.onComplete?.(now);
    }
    const arrival=clamp((now-this.arrivedAt)/WIN_REWARD_MOTION.coinArrivalDuration,0,1);
    this.setHighlighted(arrival<1);
    const pulse=this.counterPulse(now);
    this.counterIcon.width=this.counterIcon.height=COIN_RADIUS*2*pulse;
    this.counterFallback.scale.set(pulse);
    if(arrival<1)live=true;
    if (!live) this.clearFlights();
    return live;
  }

  private counterPulse(now: number) {
    const t = clamp((now - this.arrivedAt) / WIN_REWARD_MOTION.coinArrivalDuration, 0, 1);
    return 1 + this.arrivalPulseFrom*(1-t) + (.20-this.arrivalPulseFrom)*Math.sin(t*Math.PI);
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
    this.layout = counterLayout();
    this.placeCounter();
  }

  private setHighlighted(value: boolean) {
    if (this.highlighted === value) return;
    this.highlighted = value;
    this.chromeIdle.visible = !value;
    this.chromeHot.visible = value;
    this.counterValue.style.fill = value ? Theme.gold : Theme.ink;
    this.layout = counterLayout();
    this.placeCounter();
  }

  private placeCounter() {
    this.counterIcon.position.set(this.layout.x, this.layout.y);
    this.counterIcon.width = this.layout.radius * 2;
    this.counterIcon.height = this.layout.radius * 2;
    this.counterFallback.position.set(this.layout.x, this.layout.y);
    this.counterFallback.scale.set(this.layout.radius / COIN_RADIUS);
    this.counterValue.position.set(this.layout.textX, this.layout.y);
  }

  private clearFlights() {
    this.flightPhase = 'idle';
    this.arrivedCount = 0;
    this.lastSoundAt = -Infinity;
    this.arrivalPulseFrom = 0;
    this.arrivedAt=-Infinity;
    this.counterIcon.width=this.counterIcon.height=COIN_RADIUS*2;
    this.counterFallback.scale.set(1);
    for (const item of this.pool) {
      item.sprite.visible = false;
      item.fallback.visible = false;
    }
    this.flights = [];
  }
}

function counterLayout() {
  const radius = COIN_RADIUS;
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
    .fill(Theme.surfaceSide)
    .roundRect(0, 0, w, h - 5, UI_TOKENS.radius.md)
    .fill(highlighted ? Theme.surfaceTop : Theme.surface)
    .stroke({ color: highlighted ? Theme.coin : Theme.surfaceLine, width: 1.5 });
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
  drawCoinIcon(g, COIN_RADIUS);
}

function placeCoin(sprite: Sprite, fallback: Graphics, x: number, y: number, radius: number, rotation: number, texture: Texture) {
  const ok = isTextureOk(texture);
  sprite.position.set(x, y);
  sprite.width = radius * 2;
  sprite.height = radius * 2;
  sprite.rotation = rotation;
  sprite.visible = ok;
  fallback.visible = !ok;
  fallback.position.set(x, y);
  fallback.scale.set(radius / COIN_RADIUS);
  fallback.rotation = rotation;
}
