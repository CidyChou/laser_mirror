import { Container, FillGradient, Graphics } from 'pixi.js';
import { clamp, easeOutCubic } from '@/core/easing';

type Point = { readonly x: number; readonly y: number };
const PATH: readonly Point[] = [
  { x: -242, y: 158 }, { x: 79, y: 158 }, { x: 79, y: 0 },
  { x: -79, y: 0 }, { x: -79, y: -158 }, { x: 242, y: -158 },
];
const ANGLES = [-Math.PI / 4, Math.PI / 4, Math.PI / 4, -Math.PI / 4];
const LAUNCH_MS = 1050;
const SPEED = .65;
const CYCLE_MS = 6000;

/** A decorative optical path. Geometry is built once; frames only change transforms. */
export class LoadingBoard extends Container {
  private readonly beams: { root: Container; start: number; length: number }[] = [];
  private readonly mirrors: { body: Graphics; flash: Graphics; distance: number }[] = [];
  private readonly light = new Container();
  private readonly head = new Graphics();
  private readonly receiver = new Graphics();
  private readonly receiverGlow = new Graphics();
  private readonly emitterGlow = new Graphics();
  private readonly photons: Graphics[] = [];
  private readonly glow = new FillGradient({
    type: 'radial', center: { x: .5, y: .5 }, outerCenter: { x: .5, y: .5 },
    innerRadius: 0, outerRadius: .5, textureSize: 64,
    colorStops: [{ offset: 0, color: '#ffffff' }, { offset: .2, color: '#ffffff88' }, { offset: 1, color: '#ffffff00' }],
  });
  private totalLength = 0;

  constructor() {
    super();
    this.eventMode = 'none';
    const tray = new Graphics()
      .roundRect(-222, -212, 444, 444, 32).fill(0x030913)
      .roundRect(-222, -222, 444, 444, 32).fill(0x16283b)
      .roundRect(-222, -222, 444, 444, 32).stroke({ color: 0x355267, width: 1.5 })
      .roundRect(-211, -211, 422, 422, 25).fill(0x0b1727);
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const x = (col - 2) * 79, y = (row - 2) * 79;
        tray.roundRect(x - 36, y - 36, 72, 72, 11).fill((row + col) % 2 ? 0x122235 : 0x14273a);
        tray.circle(x, y, 1.6).fill({ color: 0x6b91a6, alpha: .22 });
      }
    }
    // Four small tray fasteners give the board a physical edge without extra frames.
    for (const x of [-207, 207]) for (const y of [-207, 207]) {
      tray.circle(x, y, 2).fill(0x446076);
    }
    this.addChild(tray, this.light);
    for (let i = 1; i < PATH.length; i++) {
      const from = PATH[i - 1], to = PATH[i];
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      const root = new Container();
      root.position.set(from.x, from.y);
      root.rotation = Math.atan2(to.y - from.y, to.x - from.x);
      root.addChild(new Graphics()
        .roundRect(0, -13, length, 26, 13).fill({ color: 0xff295d, alpha: .07 })
        .roundRect(0, -7, length, 14, 7).fill({ color: 0xff326c, alpha: .15 })
        .roundRect(0, -3.5, length, 7, 3.5).fill(0xff548c)
        .roundRect(0, -1.2, length, 2.4, 1.2).fill(0xfff5f8));
      this.beams.push({ root, start: this.totalLength, length });
      this.totalLength += length;
      this.light.addChild(root);
      if (i < PATH.length - 1) {
        const mirror = this.makeMirror(to.x, to.y, ANGLES[i - 1]);
        const flash = new Graphics().circle(to.x, to.y, 28).fill(this.glow);
        flash.tint = 0xff94bb;
        this.addChild(flash);
        this.mirrors.push({ body: mirror, flash, distance: this.totalLength });
      }
    }
    // Quiet unused mirrors make this a miniature puzzle, not just a circuit diagram.
    this.makeMirror(-158, 79, -Math.PI / 4, .4);
    this.makeMirror(158, -79, Math.PI / 4, .4);
    const ports = new Graphics();
    ports.roundRect(-257, 133, 29, 50, 9).fill(0x293447)
      .roundRect(-251, 141, 20, 34, 6).fill(0x79344f)
      .roundRect(-237, 143, 7, 30, 3).fill(0xff83a7)
      .roundRect(228, -183, 29, 50, 9).fill(0x293447)
      .roundRect(231, -175, 20, 34, 6).fill(0x735831)
      .roundRect(230, -173, 7, 30, 3).fill(0xe9c477);
    this.emitterGlow.circle(-237, 158, 38).fill(this.glow);
    this.emitterGlow.tint = 0xff3977;
    this.receiver.roundRect(231, -175, 20, 34, 6).fill(0x80f4ba);
    this.receiverGlow.circle(240, -158, 55).fill(this.glow);
    this.receiverGlow.tint = 0x65f7b0;
    this.head.circle(0, 0, 17).fill(this.glow).circle(0, 0, 3.8).fill(0xffffff);
    this.head.tint = 0xffdaea;
    this.addChild(ports, this.emitterGlow, this.receiverGlow, this.receiver, this.head);
    for (let i = 0; i < 3; i++) {
      const photon = new Graphics().ellipse(0, 0, 10, 1.3).fill(0xffffff);
      this.photons.push(photon);
      this.addChild(photon);
    }
    this.update(0);
  }

  private makeMirror(x: number, y: number, angle: number, alpha = 1) {
    const socket = new Graphics().circle(x, y, 16).fill({ color: 0x53cfd9, alpha: .055 });
    const body = new Graphics()
      .roundRect(-31, -7, 62, 14, 5).fill(0x073949)
      .roundRect(-30, -5, 60, 9, 4).fill(0x35bdcc)
      .roundRect(-27, -4, 54, 3, 1.5).fill(0xc1ffff)
      .circle(-27, 0, 2).fill(0x85f6f3).circle(27, 0, 2).fill(0x85f6f3);
    body.position.set(x, y);
    body.rotation = angle;
    body.alpha = alpha;
    this.addChild(socket, body);
    return body;
  }

  update(elapsedMs: number, reducedMotion = false) {
    const time = reducedMotion ? 3350 : elapsedMs % CYCLE_MS;
    const distance = Math.max(0, (time - LAUNCH_MS) * SPEED);
    const fade = 1 - clamp((time - 4250) / 650, 0, 1);
    this.light.alpha = fade;
    this.emitterGlow.alpha = (time < LAUNCH_MS ? .2 + .45 * time / LAUNCH_MS : .6) * fade;
    for (const beam of this.beams) {
      const progress = clamp((distance - beam.start) / beam.length, 0, 1);
      beam.root.visible = progress > 0;
      beam.root.scale.x = Math.max(.001, progress);
    }
    this.mirrors.forEach((mirror, index) => {
      const turn = easeOutCubic(clamp((time - 150 - index * 110) / 390, 0, 1));
      const hit = (distance - mirror.distance) / SPEED;
      const pulse = reducedMotion ? 0 : Math.max(0, 1 - Math.abs(hit - 65) / 200);
      mirror.body.rotation = ANGLES[index] + (1 - turn) * Math.PI / 2;
      mirror.body.scale.set(1 + pulse * .12);
      mirror.flash.alpha = (.1 * Number(distance >= mirror.distance) + pulse * .8) * fade;
    });
    this.head.visible = !reducedMotion && distance > 0 && distance < this.totalLength;
    this.positionOnPath(this.head, Math.min(distance, this.totalLength));
    const arrived = clamp((distance - this.totalLength) / 120, 0, 1);
    this.receiver.alpha = arrived * fade;
    this.receiverGlow.alpha = arrived * .65 * fade;
    this.photons.forEach((photon, index) => {
      const travel = (Math.max(0, time - LAUNCH_MS) * .4 + index * 350) % this.totalLength;
      photon.visible = !reducedMotion && distance >= this.totalLength && time < 4250;
      photon.alpha = .7 * fade;
      this.positionOnPath(photon, travel);
    });
  }

  private positionOnPath(node: Container, distance: number) {
    const index = this.beams.findIndex(beam => distance <= beam.start + beam.length);
    const i = index < 0 ? this.beams.length - 1 : index;
    const beam = this.beams[i], from = PATH[i], to = PATH[i + 1];
    const ratio = clamp((distance - beam.start) / beam.length, 0, 1);
    node.position.set(from.x + (to.x - from.x) * ratio, from.y + (to.y - from.y) * ratio);
    node.rotation = beam.root.rotation;
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    super.destroy(options);
    this.glow.destroy();
  }
}
