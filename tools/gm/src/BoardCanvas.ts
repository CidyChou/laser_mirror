import { LaserSimulator } from '@/gameplay/LaserSimulator';
import { cellCenter } from '@/gameplay/geometry';
import type { BoardGeometry, LevelDefinition, LevelItem as GameItem, Port as GamePort } from '@/gameplay/types';
import {
  createItem,
  samePort,
  type GmLevel,
  type LevelItem,
  type PlaceableType,
  type Port,
  type Side,
  type Tool,
} from '../schema';

export type Selection =
  | { kind: 'none' }
  | { kind: 'item'; x: number; y: number }
  | { kind: 'emitter' }
  | { kind: 'target'; index: number };

export type BoardHandlers = {
  onChange: (level: GmLevel) => void;
  onSelect: (selection: Selection) => void;
};

type Hit =
  | { type: 'cell'; x: number; y: number }
  | { type: 'port'; side: Side; index: number };

type Drag =
  | { kind: 'item'; fromX: number; fromY: number; item: LevelItem; px: number; py: number; moved: boolean }
  | { kind: 'emitter'; px: number; py: number; moved: boolean }
  | { kind: 'target'; index: number; px: number; py: number; moved: boolean };

const PORTAL_COLORS = ['#9a7cff', '#55ddff', '#ffd66c', '#55efae', '#ff8b5a'];
const simulator = new LaserSimulator();

export class BoardCanvas {
  private level: GmLevel | null = null;
  private selection: Selection = { kind: 'none' };
  private tool: Tool = 'select';
  private preview = true;
  private geometry: BoardGeometry | null = null;
  private drag: Drag | null = null;
  private hover: Hit | null = null;
  private cssW = 0;
  private cssH = 0;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly handlers: BoardHandlers) {
    canvas.addEventListener('pointerdown', e => this.onDown(e));
    canvas.addEventListener('pointermove', e => this.onMove(e));
    canvas.addEventListener('pointerup', e => this.onUp(e));
    canvas.addEventListener('pointercancel', () => this.cancelDrag());
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('dragover', e => { e.preventDefault(); this.syncHover(e.clientX, e.clientY); this.draw(); });
    canvas.addEventListener('drop', e => this.onDrop(e));
    canvas.addEventListener('dblclick', e => this.onDblClick(e));
  }

  setState(level: GmLevel, selection: Selection, tool: Tool, preview: boolean) {
    this.level = level;
    this.selection = selection;
    this.tool = tool;
    this.preview = preview;
    this.draw();
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    this.cssW = Math.max(1, rect.width);
    this.cssH = Math.max(1, rect.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.cssW * dpr);
    this.canvas.height = Math.round(this.cssH * dpr);
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    this.draw();
  }

  private layout(): BoardGeometry | null {
    if (!this.level) return null;
    const pad = 56;
    const cell = Math.min((this.cssW - pad * 2) / this.level.cols, (this.cssH - pad * 2) / this.level.rows);
    const boardW = cell * this.level.cols;
    const boardH = cell * this.level.rows;
    return {
      cell,
      boardW,
      boardH,
      ox: (this.cssW - boardW) / 2,
      oy: (this.cssH - boardH) / 2,
      wall: Math.max(12, cell * 0.16),
    };
  }

  private draw() {
    const ctx = this.canvas.getContext('2d');
    const level = this.level;
    if (!ctx || !level) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    const g = this.layout();
    this.geometry = g;
    if (!g) return;

    this.drawBoard(ctx, level, g);
    this.drawCoords(ctx, level, g);
    this.drawPorts(ctx, level, g);
    this.drawPortalLinks(ctx, level, g);
    const hiding = this.drag?.kind === 'item' ? `${this.drag.fromX},${this.drag.fromY}` : '';
    for (const item of level.items) {
      if (`${item.x},${item.y}` === hiding) continue;
      this.drawItem(ctx, item, g, this.isSelectedItem(item));
    }
    if (this.preview) this.drawLaser(ctx, level, g);
    this.drawHover(ctx, g);
    if (this.drag?.kind === 'item') this.drawItem(ctx, { ...this.drag.item, x: 0, y: 0 }, g, true, this.drag.px, this.drag.py);
    if (this.drag?.kind === 'emitter') this.drawPortGhost(ctx, g, this.hover, '#ff5578');
    if (this.drag?.kind === 'target') this.drawPortGhost(ctx, g, this.hover, '#ffd66c');
  }

  private drawBoard(ctx: CanvasRenderingContext2D, level: GmLevel, g: BoardGeometry) {
    const r = 18;
    ctx.fillStyle = 'rgba(2, 5, 10, 0.34)';
    roundRect(ctx, g.ox + 3, g.oy + 10, g.boardW, g.boardH, r);
    ctx.fill();
    ctx.fillStyle = '#1c293b';
    roundRect(ctx, g.ox, g.oy, g.boardW, g.boardH, r);
    ctx.fill();
    ctx.strokeStyle = 'rgba(48, 57, 69, 0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();

    for (let y = 0; y < level.rows; y++) {
      for (let x = 0; x < level.cols; x++) {
        const inset = Math.max(4, g.cell * 0.055);
        const rx = g.ox + x * g.cell + inset;
        const ry = g.oy + y * g.cell + inset;
        const size = g.cell - inset * 2;
        const radius = Math.max(8, g.cell * 0.12);
        ctx.fillStyle = (x + y) % 2 ? '#1d2a3d' : '#24344a';
        roundRect(ctx, rx, ry, size, size, radius);
        ctx.fill();
      }
    }
  }

  private drawCoords(ctx: CanvasRenderingContext2D, level: GmLevel, g: BoardGeometry) {
    ctx.fillStyle = '#6d7885';
    ctx.font = `500 ${Math.max(10, g.cell * 0.16)}px ui-monospace, SFMono-Regular, Menlo, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let x = 0; x < level.cols; x++) {
      ctx.fillText(String(x), g.ox + (x + 0.5) * g.cell, g.oy - 16);
    }
    ctx.textAlign = 'right';
    for (let y = 0; y < level.rows; y++) {
      ctx.fillText(String(y), g.ox - 12, g.oy + (y + 0.5) * g.cell);
    }
  }

  private drawPorts(ctx: CanvasRenderingContext2D, level: GmLevel, g: BoardGeometry) {
    const draw = (port: Port, color: string, emitter: boolean, selected: boolean) => {
      const p = portPoint(g, port);
      const vertical = port.side === 'W' || port.side === 'E';
      const long = g.cell * 0.78;
      const thick = Math.max(7, g.cell * 0.09);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = color;
      ctx.globalAlpha = selected ? 1 : 0.92;
      if (vertical) roundRect(ctx, -thick / 2, -long / 2, thick, long, thick * 0.45);
      else roundRect(ctx, -long / 2, -thick / 2, long, thick, thick * 0.45);
      ctx.fill();
      const offset = thick * 1.35 + 6;
      const dx = port.side === 'W' ? -offset : port.side === 'E' ? offset : 0;
      const dy = port.side === 'N' ? -offset : port.side === 'S' ? offset : 0;
      ctx.translate(dx, dy);
      if (emitter) {
        const ang = { W: 0, E: Math.PI, N: Math.PI / 2, S: -Math.PI / 2 }[port.side];
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(g.cell * 0.14, 0);
        ctx.lineTo(-g.cell * 0.08, -g.cell * 0.1);
        ctx.lineTo(-g.cell * 0.08, g.cell * 0.1);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(6, g.cell * 0.09), 0, Math.PI * 2);
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = color;
        ctx.globalAlpha = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(2.2, g.cell * 0.03), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    draw(level.emitter, '#ff5578', true, this.selection.kind === 'emitter');
    level.targets.forEach((target, index) => {
      draw(target, '#ffd66c', false, this.selection.kind === 'target' && this.selection.index === index);
    });
  }

  private drawPortalLinks(ctx: CanvasRenderingContext2D, level: GmLevel, g: BoardGeometry) {
    const groups = new Map<string, LevelItem[]>();
    for (const item of level.items) {
      if (item.type !== 'portal') continue;
      const list = groups.get(item.pair) ?? [];
      list.push(item);
      groups.set(item.pair, list);
    }
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.4;
    for (const [pair, items] of groups) {
      if (items.length !== 2) continue;
      const a = cellCenter(g, items[0].x, items[0].y);
      const b = cellCenter(g, items[1].x, items[1].y);
      ctx.strokeStyle = portalColor(pair);
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
  }

  private drawItem(ctx: CanvasRenderingContext2D, item: LevelItem, g: BoardGeometry, selected: boolean, ax?: number, ay?: number) {
    const c = ax != null && ay != null ? { x: ax, y: ay } : cellCenter(g, item.x, item.y);
    ctx.save();
    ctx.translate(c.x, c.y);
    if (item.type === 'mirror' || item.type === 'splitter') {
      if ('decoy' in item && item.decoy) ctx.globalAlpha = 0.55;
    }
    if (item.type === 'mirror') this.drawMirror(ctx, item, g);
    else if (item.type === 'splitter') this.drawSplitter(ctx, item, g);
    else if (item.type === 'wall') this.drawWall(ctx, g);
    else if (item.type === 'switch') this.drawSwitch(ctx, item, g);
    else if (item.type === 'door') this.drawDoor(ctx, item, g);
    else this.drawPortal(ctx, item, g);

    if (selected) {
      ctx.strokeStyle = '#55ddff';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 1;
      const s = g.cell * 0.82;
      roundRect(ctx, -s / 2, -s / 2, s, s, 8);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawMirror(ctx: CanvasRenderingContext2D, item: Extract<LevelItem, { type: 'mirror' }>, g: BoardGeometry) {
    ctx.save();
    ctx.rotate(item.s === 0 ? Math.PI / 4 : -Math.PI / 4);
    const s = g.cell * 0.66;
    const t = g.cell * 0.145;
    ctx.fillStyle = '#a9c9e1';
    roundRect(ctx, -s / 2, -t / 2, s, t, Math.max(6, g.cell * 0.07));
    ctx.fill();
    ctx.fillStyle = '#f9fdff';
    roundRect(ctx, -s * 0.31, -t * 0.27, s * 0.62, t * 0.54, 4);
    ctx.fill();
    ctx.restore();
    if (item.fixed) this.drawLock(ctx, g);
  }

  private drawSplitter(ctx: CanvasRenderingContext2D, item: Extract<LevelItem, { type: 'splitter' }>, g: BoardGeometry) {
    ctx.save();
    ctx.rotate(Math.PI / 4);
    const s = g.cell * 0.46;
    ctx.fillStyle = '#79d2e9';
    roundRect(ctx, -s / 2, -s / 2, s, s, 6);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.rotate(item.s === 0 ? Math.PI / 4 : -Math.PI / 4);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-g.cell * 0.24, 0);
    ctx.lineTo(g.cell * 0.24, 0);
    ctx.stroke();
    ctx.restore();
    if (item.fixed) this.drawLock(ctx, g);
  }

  private drawWall(ctx: CanvasRenderingContext2D, g: BoardGeometry) {
    const s = g.cell * 0.72;
    ctx.fillStyle = '#43536e';
    roundRect(ctx, -s / 2, -s / 2, s, s, g.cell * 0.1);
    ctx.fill();
    ctx.fillStyle = 'rgba(38, 52, 74, 0.55)';
    roundRect(ctx, -s / 2 + 6, 2, s - 12, s * 0.28, 6);
    ctx.fill();
  }

  private drawSwitch(ctx: CanvasRenderingContext2D, item: Extract<LevelItem, { type: 'switch' }>, g: BoardGeometry) {
    ctx.fillStyle = '#25364d';
    ctx.beginPath();
    ctx.arc(0, 0, g.cell * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#68809e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, g.cell * 0.27, 0, Math.PI * 2);
    ctx.stroke();
    this.label(ctx, item.id, g, '#dce7f3');
  }

  private drawDoor(ctx: CanvasRenderingContext2D, item: Extract<LevelItem, { type: 'door' }>, g: BoardGeometry) {
    const s = g.cell * 0.68;
    ctx.fillStyle = '#78445d';
    roundRect(ctx, -s / 2, -s / 2, s, s, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 202, 215, 0.55)';
    ctx.lineWidth = 3;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * g.cell * 0.14, -g.cell * 0.22);
      ctx.lineTo(i * g.cell * 0.14, g.cell * 0.22);
      ctx.stroke();
    }
    this.label(ctx, item.id, g, '#ffe3ea');
  }

  private drawPortal(ctx: CanvasRenderingContext2D, item: Extract<LevelItem, { type: 'portal' }>, g: BoardGeometry) {
    const color = portalColor(item.pair);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, g.cell * 0.3, g.cell * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#05080d';
    ctx.beginPath();
    ctx.ellipse(0, 0, g.cell * 0.18, g.cell * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    this.label(ctx, item.pair, g, '#fff');
  }

  private drawLock(ctx: CanvasRenderingContext2D, g: BoardGeometry) {
    ctx.fillStyle = '#8b96aa';
    roundRect(ctx, -8, g.cell * 0.22, 16, 10, 3);
    ctx.fill();
  }

  private label(ctx: CanvasRenderingContext2D, text: string, g: BoardGeometry, color: string) {
    ctx.fillStyle = color;
    ctx.font = `700 ${Math.max(10, g.cell * 0.18)}px "SF Pro Text", "PingFang SC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, g.cell * 0.34);
  }

  private drawLaser(ctx: CanvasRenderingContext2D, level: GmLevel, g: BoardGeometry) {
    const trace = simulator.simulate(level as unknown as LevelDefinition, level.items as GameItem[], g);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const layers: Array<{ color: string; width: number; alpha: number }> = [
      { color: '#ff5578', width: Math.max(8, g.cell * 0.12), alpha: 0.22 },
      { color: '#ff5578', width: Math.max(3.2, g.cell * 0.048), alpha: 0.95 },
      { color: '#fff6f9', width: Math.max(1.2, g.cell * 0.018), alpha: 0.9 },
    ];
    for (const layer of layers) {
      ctx.strokeStyle = layer.color;
      ctx.globalAlpha = layer.alpha;
      ctx.lineWidth = layer.width;
      for (const seg of trace.segments) {
        ctx.beginPath();
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    level.targets.forEach((target, index) => {
      const p = portPoint(g, target);
      ctx.fillStyle = trace.hits[index] ? '#55efae' : '#ffd66c';
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(4, g.cell * 0.05), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  private drawHover(ctx: CanvasRenderingContext2D, g: BoardGeometry) {
    if (!this.hover || this.drag) return;
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = this.tool === 'eraser' ? '#d84f51' : '#55ddff';
    if (this.hover.type === 'cell') {
      const c = cellCenter(g, this.hover.x, this.hover.y);
      roundRect(ctx, c.x - g.cell * 0.42, c.y - g.cell * 0.42, g.cell * 0.84, g.cell * 0.84, 8);
      ctx.fill();
    } else {
      const p = portPoint(g, this.hover);
      ctx.beginPath();
      ctx.arc(p.x, p.y, g.cell * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawPortGhost(ctx: CanvasRenderingContext2D, g: BoardGeometry, hover: Hit | null, color: string) {
    if (!hover || hover.type !== 'port') return;
    const p = portPoint(g, hover);
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, g.cell * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private local(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  private hitTest(px: number, py: number): Hit | null {
    const g = this.geometry;
    const level = this.level;
    if (!g || !level) return null;
    if (px >= g.ox && px < g.ox + g.boardW && py >= g.oy && py < g.oy + g.boardH) {
      return {
        type: 'cell',
        x: Math.max(0, Math.min(level.cols - 1, Math.floor((px - g.ox) / g.cell))),
        y: Math.max(0, Math.min(level.rows - 1, Math.floor((py - g.oy) / g.cell))),
      };
    }
    const band = Math.max(28, g.cell * 0.32);
    if (px >= g.ox - band && px < g.ox && py >= g.oy && py < g.oy + g.boardH) {
      return { type: 'port', side: 'W', index: clampIndex((py - g.oy) / g.cell, level.rows) };
    }
    if (px >= g.ox + g.boardW && px < g.ox + g.boardW + band && py >= g.oy && py < g.oy + g.boardH) {
      return { type: 'port', side: 'E', index: clampIndex((py - g.oy) / g.cell, level.rows) };
    }
    if (py >= g.oy - band && py < g.oy && px >= g.ox && px < g.ox + g.boardW) {
      return { type: 'port', side: 'N', index: clampIndex((px - g.ox) / g.cell, level.cols) };
    }
    if (py >= g.oy + g.boardH && py < g.oy + g.boardH + band && px >= g.ox && px < g.ox + g.boardW) {
      return { type: 'port', side: 'S', index: clampIndex((px - g.ox) / g.cell, level.cols) };
    }
    return null;
  }

  private syncHover(clientX: number, clientY: number) {
    const p = this.local(clientX, clientY);
    this.hover = this.hitTest(p.x, p.y);
    this.canvas.style.cursor = this.cursorFor(this.hover);
  }

  private cursorFor(hit: Hit | null): string {
    if (this.drag) return 'grabbing';
    if (this.tool === 'eraser') return 'cell';
    if (!hit) return 'default';
    if (this.tool !== 'select') return 'copy';
    if (hit.type === 'cell' && this.level?.items.some(item => item.x === hit.x && item.y === hit.y)) return 'grab';
    return 'pointer';
  }

  private onDown(event: PointerEvent) {
    if (event.button !== 0) return;
    const level = this.level;
    if (!level) return;
    this.canvas.setPointerCapture(event.pointerId);
    const p = this.local(event.clientX, event.clientY);
    const hit = this.hitTest(p.x, p.y);
    this.hover = hit;
    if (!hit) {
      this.handlers.onSelect({ kind: 'none' });
      return;
    }
    if (hit.type === 'port') {
      const targetIndex = level.targets.findIndex(t => t.side === hit.side && t.index === hit.index);
      const isEmitter = samePort(level.emitter, hit);
      if (this.tool === 'emitter' || isEmitter) {
        this.drag = { kind: 'emitter', px: p.x, py: p.y, moved: false };
        this.handlers.onSelect({ kind: 'emitter' });
      } else if (this.tool === 'target' || targetIndex >= 0) {
        this.drag = { kind: 'target', index: targetIndex >= 0 ? targetIndex : -1, px: p.x, py: p.y, moved: false };
        if (targetIndex >= 0) this.handlers.onSelect({ kind: 'target', index: targetIndex });
      }
      this.draw();
      return;
    }

    const existing = level.items.find(item => item.x === hit.x && item.y === hit.y);
    if (this.tool === 'eraser') {
      if (existing) this.commit({ ...level, items: level.items.filter(item => item !== existing) }, { kind: 'none' });
      return;
    }
    if (this.tool === 'select' || existing) {
      if (existing) {
        this.drag = { kind: 'item', fromX: existing.x, fromY: existing.y, item: existing, px: p.x, py: p.y, moved: false };
        this.handlers.onSelect({ kind: 'item', x: existing.x, y: existing.y });
      } else {
        this.handlers.onSelect({ kind: 'none' });
      }
      this.draw();
      return;
    }
    if (isPlaceable(this.tool)) {
      this.placeAt(hit.x, hit.y, this.tool);
    }
  }

  private onMove(event: PointerEvent) {
    const p = this.local(event.clientX, event.clientY);
    this.hover = this.hitTest(p.x, p.y);
    if (this.drag) {
      const dx = p.x - this.drag.px;
      const dy = p.y - this.drag.py;
      if (Math.hypot(dx, dy) > 3) this.drag.moved = true;
      this.drag.px = p.x;
      this.drag.py = p.y;
    }
    this.canvas.style.cursor = this.cursorFor(this.hover);
    this.draw();
  }

  private onUp(event: PointerEvent) {
    const drag = this.drag;
    this.drag = null;
    const level = this.level;
    if (!level) { this.draw(); return; }
    const p = this.local(event.clientX, event.clientY);
    const hit = this.hitTest(p.x, p.y);
    if (drag?.kind === 'item' && drag.moved && hit?.type === 'cell') {
      const nextItems = moveOrStay(level.items, drag.fromX, drag.fromY, hit.x, hit.y);
      this.commit({ ...level, items: nextItems }, { kind: 'item', x: hit.x, y: hit.y });
      return;
    }
    if (drag?.kind === 'emitter' && hit?.type === 'port') {
      if (level.targets.some(t => samePort(t, hit))) return this.draw();
      if (samePort(level.emitter, hit)) return this.draw();
      this.commit({ ...level, emitter: { side: hit.side, index: hit.index } }, { kind: 'emitter' });
      return;
    }
    if (drag?.kind === 'target') {
      if (hit?.type === 'port') this.applyTargetPort(hit, drag.index, drag.moved);
      else this.draw();
      return;
    }
    if (!drag?.moved && hit?.type === 'port' && this.tool === 'target') {
      this.applyTargetPort(hit, -1, false);
      return;
    }
    this.draw();
  }

  private onDblClick(event: MouseEvent) {
    const level = this.level;
    if (!level) return;
    const p = this.local(event.clientX, event.clientY);
    const hit = this.hitTest(p.x, p.y);
    if (!hit || hit.type !== 'cell') return;
    const items = level.items.map(item => {
      if (item.x !== hit.x || item.y !== hit.y) return item;
      return rotateItemLocal(item);
    });
    this.commit({ ...level, items }, { kind: 'item', x: hit.x, y: hit.y });
  }

  private onDrop(event: DragEvent) {
    event.preventDefault();
    const type = event.dataTransfer?.getData('application/x-gm-tool') as Tool | undefined;
    if (!type) return;
    const p = this.local(event.clientX, event.clientY);
    const hit = this.hitTest(p.x, p.y);
    if (!hit) return;
    if (hit.type === 'cell' && isPlaceable(type)) this.placeAt(hit.x, hit.y, type);
    if (hit.type === 'port' && type === 'emitter') {
      const level = this.level!;
      if (level.targets.some(t => samePort(t, hit))) return;
      this.commit({ ...level, emitter: { side: hit.side, index: hit.index } }, { kind: 'emitter' });
    }
    if (hit.type === 'port' && type === 'target') this.applyTargetPort(hit, -1, false);
  }

  private cancelDrag() {
    this.drag = null;
    this.draw();
  }

  private placeAt(x: number, y: number, type: PlaceableType) {
    const level = this.level;
    if (!level) return;
    const rest = level.items.filter(item => !(item.x === x && item.y === y));
    const item = createItem(type, x, y, rest);
    this.commit({ ...level, items: [...rest, item] }, { kind: 'item', x, y });
  }

  private applyTargetPort(port: Port, existingIndex: number, moved: boolean) {
    const level = this.level;
    if (!level) return;
    if (samePort(level.emitter, port)) return;
    const found = level.targets.findIndex(t => samePort(t, port));
    if (found >= 0 && !moved) {
      this.handlers.onSelect({ kind: 'target', index: found });
      this.draw();
      return;
    }
    const next = [...level.targets];
    if (existingIndex >= 0 && existingIndex < next.length) {
      next[existingIndex] = { side: port.side, index: port.index };
      this.commit({ ...level, targets: next }, { kind: 'target', index: existingIndex });
      return;
    }
    if (found >= 0) {
      this.handlers.onSelect({ kind: 'target', index: found });
      return;
    }
    next.push({ side: port.side, index: port.index });
    this.commit({ ...level, targets: next }, { kind: 'target', index: next.length - 1 });
  }

  private commit(level: GmLevel, selection: Selection) {
    this.level = level;
    this.selection = selection;
    this.handlers.onChange(level);
    this.handlers.onSelect(selection);
    this.draw();
  }

  private isSelectedItem(item: LevelItem) {
    return this.selection.kind === 'item' && this.selection.x === item.x && this.selection.y === item.y;
  }
}

function rotateItemLocal(item: LevelItem): LevelItem {
  if (item.type === 'mirror' || item.type === 'splitter') {
    const s: 0 | 1 = item.s === 0 ? 1 : 0;
    return { ...item, s };
  }
  return item;
}

function isPlaceable(tool: Tool): tool is PlaceableType {
  return tool === 'mirror' || tool === 'splitter' || tool === 'wall' || tool === 'switch' || tool === 'door' || tool === 'portal';
}

function clampIndex(raw: number, count: number) {
  return Math.max(0, Math.min(count - 1, Math.floor(raw)));
}

function portPoint(g: BoardGeometry, port: GamePort | Port) {
  if (port.side === 'W') return { x: g.ox, y: g.oy + (port.index + 0.5) * g.cell };
  if (port.side === 'E') return { x: g.ox + g.boardW, y: g.oy + (port.index + 0.5) * g.cell };
  if (port.side === 'N') return { x: g.ox + (port.index + 0.5) * g.cell, y: g.oy };
  return { x: g.ox + (port.index + 0.5) * g.cell, y: g.oy + g.boardH };
}

function portalColor(pair: string) {
  const n = Number.parseInt(pair.replace(/\D/g, ''), 10);
  return PORTAL_COLORS[Math.max(0, (Number.isFinite(n) ? n : 1) - 1) % PORTAL_COLORS.length];
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function moveOrStay(items: LevelItem[], fromX: number, fromY: number, toX: number, toY: number): LevelItem[] {
  if (fromX === toX && fromY === toY) return items;
  const source = items.find(item => item.x === fromX && item.y === fromY);
  if (!source) return items;
  const target = items.find(item => item.x === toX && item.y === toY);
  return items.map(item => {
    if (item === source) return { ...item, x: toX, y: toY };
    if (item === target) return { ...item, x: fromX, y: fromY };
    return item;
  });
}
