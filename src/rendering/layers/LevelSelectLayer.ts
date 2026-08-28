import { Container, Graphics, Rectangle, Text, Texture, type FederatedPointerEvent } from 'pixi.js';
import { DESIGN_HEIGHT, DESIGN_WIDTH, UI_RECTS, UI_TOKENS } from '@/config/GameConfig';
import type { LevelDefinition } from '@/gameplay/types';
import { firstIncompleteLevel, isLevelUnlocked } from '@/progression/levelProgress';
import { SettingsButton } from '../ui/SettingsButton';
import { Theme, uiText } from '../theme';

const CARD_X = 50;
const CARD_W = 620;
const CARD_H = 360;
const CARD_GAP = 16;
const TILE_W = 136;
const TILE_H = 84;
const TILE_GAP_X = 12;
const TILE_GAP_Y = 12;
const TILE_COLUMNS = 4;
const SCROLL_TOP = 246;
const SCROLL_BOTTOM = DESIGN_HEIGHT - 28;
const GM_TAP_COUNT = 5;
const GM_TAP_WINDOW_MS = 2500;

export class LevelSelectLayer extends Container {
  readonly settingsButton = new SettingsButton(UI_RECTS.settings.w, UI_RECTS.settings.h);
  private readonly background = new Graphics();
  private readonly header = new Container();
  private readonly title = new Text({ text: '选择关卡', style: uiText({ fontSize: 44, fill: Theme.ink }) });
  private readonly progressLabel = new Text({ text: '', style: uiText({ fontSize: 18, fill: Theme.inkSoft }) });
  private readonly progressTrack = new Graphics();
  private readonly progressFill = new Graphics();
  private readonly cards = new Container();
  private readonly viewportCover = new Graphics();
  private readonly scrollTrack = new Graphics();
  private readonly scrollThumb = new Graphics();
  private readonly chapterCards: ChapterCard[] = [];
  private selectHandler: (index: number) => void = () => {};
  private unlockAllHandler: () => void = () => {};
  private titleTapCount = 0;
  private titleTapStartedAt = 0;
  private contentHeight = 0;
  private viewportTop = SCROLL_TOP;
  private viewportHeight = SCROLL_BOTTOM - SCROLL_TOP;
  private scrollY = 0;
  private dragStartY = 0;
  private dragStartScroll = 0;
  private dragging = false;

  constructor(private readonly levels: readonly LevelDefinition[]) {
    super();
    this.visible = false;
    this.eventMode = 'static';
    this.hitArea = new Rectangle(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    this.background.eventMode = 'static';
    this.drawBackground();

    this.title.anchor.set(0.5);
    this.title.position.set(DESIGN_WIDTH / 2, 130);
    this.title.eventMode = 'static';
    this.title.hitArea = new Rectangle(-180, -44, 360, 88);
    this.title.on('pointertap', () => this.handleTitleTap());
    this.progressLabel.anchor.set(0.5);
    this.progressLabel.position.set(DESIGN_WIDTH / 2, 184);
    this.settingsButton.position.set(UI_RECTS.settings.x, UI_RECTS.settings.y);
    this.progressTrack.roundRect(120, 211, 480, 10, 5).fill(Theme.surfaceMuted);
    this.header.addChild(this.title, this.progressLabel, this.progressTrack, this.progressFill, this.settingsButton);

    const groups = new Map<number, Array<{ index: number; level: LevelDefinition }>>();
    levels.forEach((level, index) => {
      const entries = groups.get(level.chapterNo) ?? [];
      entries.push({ index, level });
      groups.set(level.chapterNo, entries);
    });
    [...groups.entries()].sort(([a], [b]) => a - b).forEach(([chapterNo, entries], order) => {
      const card = new ChapterCard(chapterNo, entries[0]?.level.chapter ?? `章节 ${chapterNo}`, entries);
      card.position.set(CARD_X, order * (CARD_H + CARD_GAP));
      card.setSelectHandler((index) => this.selectHandler(index));
      this.chapterCards.push(card);
      this.cards.addChild(card);
    });
    this.contentHeight = this.chapterCards.length
      ? this.chapterCards.length * CARD_H + (this.chapterCards.length - 1) * CARD_GAP
      : 0;

    this.addChild(
      this.background,
      this.cards,
      this.viewportCover,
      this.header,
      this.scrollTrack,
      this.scrollThumb,
    );
    this.layoutViewport();

    this.on('pointerdown', (event: FederatedPointerEvent) => this.startDrag(event));
    this.on('pointermove', (event: FederatedPointerEvent) => this.moveDrag(event));
    this.on('pointerup', () => this.stopDrag());
    this.on('pointerupoutside', () => this.stopDrag());
    this.on('pointercancel', () => this.stopDrag());
    this.on('wheel', (event: any) => {
      this.setScroll(this.scrollY + Number(event.deltaY || 0));
      event.preventDefault?.();
    });
  }

  setGearTexture(texture: Texture) {
    this.settingsButton.setTexture(texture);
  }

  setTopOffset(offset: number) {
    this.header.position.y = offset;
    this.viewportTop = SCROLL_TOP + offset;
    this.viewportHeight = Math.max(240, SCROLL_BOTTOM - this.viewportTop);
    this.layoutViewport();
  }

  setSelectHandler(handler: (index: number) => void) {
    this.selectHandler = handler;
  }

  setUnlockAllHandler(handler: () => void) {
    this.unlockAllHandler = handler;
  }

  show(currentIndex: number, completed: ReadonlySet<number>, allLevelsUnlocked = false) {
    this.visible = true;
    this.sync(currentIndex, completed, allLevelsUnlocked);
  }

  hide() {
    this.visible = false;
    this.titleTapCount = 0;
    this.titleTapStartedAt = 0;
    this.stopDrag();
  }

  get active() {
    return this.dragging;
  }

  sync(currentIndex: number, completed: ReadonlySet<number>, allLevelsUnlocked = false) {
    const total = this.levels.length;
    const done = [...completed].filter((index) => index >= 0 && index < total).length;
    const next = firstIncompleteLevel(total, completed);
    const nextCopy = done >= total ? '全部完成 · 可再次挑战' : `下一关 · 第 ${next + 1} 关`;
    this.progressLabel.text = allLevelsUnlocked
      ? `GM 已开启 · 全部关卡已解锁 · 已完成 ${done} / ${total}`
      : `已完成 ${done} / ${total}  ·  ${nextCopy}`;
    const fillW = total > 0 ? 480 * done / total : 0;
    this.progressFill.clear();
    if (fillW > 0) this.progressFill.roundRect(120, 211, Math.max(10, fillW), 10, 5).fill(Theme.accent);
    for (const card of this.chapterCards) card.sync(currentIndex, completed, total, allLevelsUnlocked);
  }

  private handleTitleTap() {
    const now = Date.now();
    if (this.titleTapCount === 0 || now - this.titleTapStartedAt > GM_TAP_WINDOW_MS) {
      this.titleTapCount = 1;
      this.titleTapStartedAt = now;
      return;
    }
    this.titleTapCount += 1;
    if (this.titleTapCount < GM_TAP_COUNT) return;
    this.titleTapCount = 0;
    this.titleTapStartedAt = 0;
    this.unlockAllHandler();
  }

  private startDrag(event: FederatedPointerEvent) {
    this.dragging = true;
    this.dragStartY = event.getLocalPosition(this).y;
    this.dragStartScroll = this.scrollY;
    this.emit('scrollchange');
  }

  private moveDrag(event: FederatedPointerEvent) {
    if (!this.dragging) return;
    const y = event.getLocalPosition(this).y;
    this.setScroll(this.dragStartScroll + this.dragStartY - y);
  }

  private stopDrag() {
    if (!this.dragging) return;
    this.dragging = false;
    this.emit('scrollchange');
  }

  private setScroll(value: number) {
    const maxScroll = Math.max(0, this.contentHeight - this.viewportHeight);
    const next = Math.max(0, Math.min(maxScroll, value));
    const changed = Math.abs(next - this.scrollY) > 0.1;
    this.scrollY = next;
    this.cards.position.y = this.viewportTop - this.scrollY;
    this.drawScrollIndicator();
    if (changed) this.emit('scrollchange');
  }

  private layoutViewport() {
    // Keep the scrolling list behind an opaque fixed header/footer. This is
    // more reliable than a stencil mask in mini-game WebGL1 implementations.
    this.viewportCover.clear()
      .rect(0, -DESIGN_HEIGHT, DESIGN_WIDTH, DESIGN_HEIGHT + this.viewportTop).fill(Theme.bg)
      .rect(0, SCROLL_BOTTOM, DESIGN_WIDTH, DESIGN_HEIGHT - SCROLL_BOTTOM).fill(Theme.bg);
    this.scrollTrack.clear().roundRect(696, this.viewportTop + 10, 5, this.viewportHeight - 20, 3)
      .fill({ color: Theme.surfaceLine, alpha: 0.46 });
    this.setScroll(this.scrollY);
  }

  private drawScrollIndicator() {
    const maxScroll = Math.max(0, this.contentHeight - this.viewportHeight);
    this.scrollThumb.clear();
    this.scrollTrack.visible = maxScroll > 0;
    if (maxScroll <= 0) return;
    const trackH = this.viewportHeight - 20;
    const thumbH = Math.max(72, trackH * this.viewportHeight / this.contentHeight);
    const travel = trackH - thumbH;
    const y = this.viewportTop + 10 + travel * this.scrollY / maxScroll;
    this.scrollThumb.roundRect(695, y, 7, thumbH, 4).fill({ color: Theme.inkSoft, alpha: 0.72 });
  }

  private drawBackground() {
    this.background.rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT).fill(Theme.bg);
    this.background.ellipse(40, 180, 440, 320).fill({ color: Theme.beam, alpha: 0.02 });
    this.background.ellipse(680, 1040, 500, 440).fill({ color: Theme.cyan, alpha: 0.016 });
  }
}

class ChapterCard extends Container {
  private readonly chrome = new Graphics();
  private readonly chapterBadge = new Graphics();
  private readonly chapterNumber: Text;
  private readonly title: Text;
  private readonly progress: Text;
  private readonly tiles: ChapterLevelTile[];
  private selectHandler: (index: number) => void = () => {};

  constructor(
    chapterNo: number,
    chapterName: string,
    entries: Array<{ index: number; level: LevelDefinition }>,
  ) {
    super();
    this.chrome.roundRect(2, 8, CARD_W - 2, CARD_H - 2, UI_TOKENS.radius.lg)
      .fill({ color: Theme.shadow, alpha: 0.26 })
      .roundRect(0, 6, CARD_W, CARD_H - 6, UI_TOKENS.radius.lg)
      .fill(Theme.surfaceSide)
      .roundRect(0, 0, CARD_W, CARD_H - 6, UI_TOKENS.radius.lg)
      .fill(Theme.surface)
      .stroke({ color: Theme.surfaceLine, width: 1.5 })
      .moveTo(22, 58).lineTo(CARD_W - 22, 58)
      .stroke({ color: Theme.surfaceLine, width: 1, alpha: 0.72 });
    this.chapterBadge.roundRect(20, 13, 58, 34, 12).fill(Theme.surfaceMuted).stroke({ color: Theme.surfaceLine, width: 1 });
    this.chapterNumber = new Text({ text: String(chapterNo).padStart(2, '0'), style: uiText({ fontSize: 19, fill: Theme.ink }) });
    this.chapterNumber.anchor.set(0.5);
    this.chapterNumber.position.set(49, 30);
    this.title = new Text({ text: chapterName, style: uiText({ fontSize: 24, fill: Theme.ink }) });
    this.title.position.set(92, 18);
    this.progress = new Text({ text: '', style: uiText({ fontSize: 16, fill: Theme.inkSoft }) });
    this.progress.anchor.set(1, 0);
    this.progress.position.set(CARD_W - 24, 21);
    this.tiles = entries.map(({ index }) => new ChapterLevelTile(index));
    this.tiles.forEach((tile, order) => {
      tile.position.set(
        22 + (order % TILE_COLUMNS) * (TILE_W + TILE_GAP_X),
        70 + Math.floor(order / TILE_COLUMNS) * (TILE_H + TILE_GAP_Y),
      );
      tile.setSelectHandler((index) => this.selectHandler(index));
    });
    this.addChild(this.chrome, this.chapterBadge, this.chapterNumber, this.title, this.progress, ...this.tiles);
  }

  setSelectHandler(handler: (index: number) => void) {
    this.selectHandler = handler;
  }

  sync(
    currentIndex: number,
    completed: ReadonlySet<number>,
    totalLevels: number,
    allLevelsUnlocked = false,
  ) {
    const done = this.tiles.filter((tile) => completed.has(tile.levelIndex)).length;
    this.progress.text = `${done} / ${this.tiles.length}`;
    this.progress.style.fill = done === this.tiles.length ? Theme.success : Theme.inkSoft;
    for (const tile of this.tiles) {
      tile.sync({
        completed: completed.has(tile.levelIndex),
        unlocked: isLevelUnlocked(tile.levelIndex, totalLevels, completed, allLevelsUnlocked),
        current: tile.levelIndex === currentIndex,
      });
    }
  }
}

class ChapterLevelTile extends Container {
  private readonly chrome = new Graphics();
  private readonly status = new Graphics();
  private readonly numberText: Text;
  private unlocked = false;
  private pressPoint: { x: number; y: number } | null = null;
  private selectHandler: (index: number) => void = () => {};

  constructor(readonly levelIndex: number) {
    super();
    this.eventMode = 'static';
    this.hitArea = new Rectangle(0, 0, TILE_W, TILE_H);
    this.numberText = new Text({ text: String(levelIndex + 1), style: uiText({ fontSize: 30, fill: Theme.ink }) });
    this.numberText.anchor.set(0.5);
    this.numberText.position.set(54, (TILE_H - 6) / 2);
    this.on('pointerdown', (event: FederatedPointerEvent) => {
      this.pressPoint = { x: event.global.x, y: event.global.y };
    });
    this.on('pointerup', (event: FederatedPointerEvent) => {
      if (!this.pressPoint || !this.unlocked) return;
      const distance = Math.hypot(event.global.x - this.pressPoint.x, event.global.y - this.pressPoint.y);
      this.pressPoint = null;
      if (distance < 12) this.selectHandler(this.levelIndex);
    });
    this.on('pointerupoutside', () => { this.pressPoint = null; });
    this.on('pointercancel', () => { this.pressPoint = null; });
    this.addChild(this.chrome, this.numberText, this.status);
  }

  setSelectHandler(handler: (index: number) => void) {
    this.selectHandler = handler;
  }

  sync(state: { completed: boolean; unlocked: boolean; current: boolean }) {
    this.unlocked = state.unlocked;
    this.cursor = state.unlocked ? 'pointer' : 'default';
    const faceH = TILE_H - 6;
    const fill = state.completed ? Theme.accent : state.unlocked ? Theme.surfaceTop : Theme.surfaceMuted;
    const edge = state.current ? Theme.cyan : state.completed ? Theme.accentDark : Theme.surfaceLine;
    this.chrome.clear()
      .roundRect(1, 7, TILE_W - 2, TILE_H - 3, UI_TOKENS.radius.md)
      .fill({ color: Theme.shadow, alpha: state.unlocked ? 0.24 : 0.1 })
      .roundRect(0, 6, TILE_W, faceH, UI_TOKENS.radius.md)
      .fill(state.completed ? Theme.accentDark : Theme.surfaceSide)
      .roundRect(0, 0, TILE_W, faceH, UI_TOKENS.radius.md)
      .fill(fill)
      .stroke({ color: edge, width: state.current ? 3 : 1.5, alpha: state.unlocked ? 1 : 0.5 });
    this.numberText.style.fill = state.completed ? Theme.textOnAccent : state.unlocked ? Theme.ink : Theme.inkSoft;
    this.numberText.alpha = state.unlocked ? 1 : 0.58;
    this.status.clear();
    if (state.completed) {
      this.status.circle(108, 38, 16).fill({ color: Theme.accentDark, alpha: 0.8 });
      this.status.moveTo(100, 38).lineTo(106, 44).lineTo(117, 31)
        .stroke({ color: Theme.textOnAccent, width: 3.2, cap: 'round', join: 'round' });
    } else if (!state.unlocked) {
      this.status.arc(108, 34, 8, Math.PI, Math.PI * 2).stroke({ color: Theme.inkSoft, width: 2.6 });
      this.status.roundRect(98, 34, 20, 17, 4).fill(Theme.inkSoft);
    } else {
      this.status.circle(108, 39, state.current ? 7 : 6).fill(state.current ? Theme.cyan : Theme.gold);
    }
  }
}
