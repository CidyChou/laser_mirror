import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { DESIGN_HEIGHT, DESIGN_WIDTH, UI_TOKENS } from '@/config/GameConfig';
import type { LevelDefinition } from '@/gameplay/types';
import { firstIncompleteLevel, isLevelUnlocked } from '@/progression/levelProgress';
import { Button } from '../ui/Button';
import { drawGearIcon } from '../ui/icons';
import { Theme, uiText } from '../theme';

const CARD_X = 50;
const CARD_Y = 242;
const CARD_W = 620;
const CARD_H = 174;
const CARD_GAP = 14;

export class LevelSelectLayer extends Container {
  readonly closeButton = new Button(72, 72, '‹', 'icon');
  readonly settingsButton = new Button(72, 72, '', 'icon');
  private readonly background = new Graphics();
  private readonly title = new Text({ text: '选择关卡', style: uiText({ fontSize: 44, fill: Theme.ink }) });
  private readonly progressLabel = new Text({ text: '', style: uiText({ fontSize: 18, fill: Theme.inkSoft }) });
  private readonly progressTrack = new Graphics();
  private readonly progressFill = new Graphics();
  private readonly gear = new Graphics();
  private readonly chapterCards: ChapterCard[] = [];
  private selectHandler: (index: number) => void = () => {};

  constructor(private readonly levels: readonly LevelDefinition[]) {
    super();
    this.visible = false;
    this.eventMode = 'static';
    this.hitArea = new Rectangle(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    this.background.eventMode = 'static';
    this.drawBackground();

    this.title.anchor.set(0.5);
    this.title.position.set(DESIGN_WIDTH / 2, 126);
    this.progressLabel.anchor.set(0.5);
    this.progressLabel.position.set(DESIGN_WIDTH / 2, 184);
    this.closeButton.position.set(38, 92);
    this.closeButton.setLabelSize(44);
    this.settingsButton.position.set(610, 92);
    this.gear.position.set(36, 33);
    drawGearIcon(this.gear, 40);
    this.gear.eventMode = 'none';
    this.settingsButton.addChild(this.gear);

    this.progressTrack.roundRect(120, 210, 480, 10, 5).fill(Theme.surfaceMuted);
    this.addChild(
      this.background,
      this.title,
      this.progressLabel,
      this.progressTrack,
      this.progressFill,
      this.closeButton,
      this.settingsButton,
    );

    const groups = new Map<number, Array<{ index: number; level: LevelDefinition }>>();
    levels.forEach((level, index) => {
      const entries = groups.get(level.chapterNo) ?? [];
      entries.push({ index, level });
      groups.set(level.chapterNo, entries);
    });
    [...groups.entries()].sort(([a], [b]) => a - b).forEach(([chapterNo, entries], order) => {
      const card = new ChapterCard(chapterNo, entries[0]?.level.chapter ?? `章节 ${chapterNo}`, entries);
      card.position.set(CARD_X, CARD_Y + order * (CARD_H + CARD_GAP));
      card.setSelectHandler((index) => this.selectHandler(index));
      this.chapterCards.push(card);
      this.addChild(card);
    });
  }

  setSelectHandler(handler: (index: number) => void) {
    this.selectHandler = handler;
  }

  show(currentIndex: number, completed: ReadonlySet<number>) {
    this.visible = true;
    this.sync(currentIndex, completed);
  }

  hide() {
    this.visible = false;
  }

  sync(currentIndex: number, completed: ReadonlySet<number>) {
    const total = this.levels.length;
    const done = [...completed].filter((index) => index >= 0 && index < total).length;
    const next = firstIncompleteLevel(total, completed);
    const nextCopy = done >= total ? `再次挑战第 ${total} 关` : `下一挑战第 ${next + 1} 关`;
    this.progressLabel.text = `已完成 ${done} / ${total}  ·  ${nextCopy}`;
    const fillW = total > 0 ? 480 * done / total : 0;
    this.progressFill.clear();
    if (fillW > 0) this.progressFill.roundRect(120, 210, Math.max(10, fillW), 10, 5).fill(Theme.accent);
    for (const card of this.chapterCards) card.sync(currentIndex, completed, total);
  }

  private drawBackground() {
    this.background.rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT).fill(Theme.bg);
    this.background.ellipse(40, 180, 440, 320).fill({ color: Theme.beam, alpha: 0.025 });
    this.background.ellipse(680, 1040, 500, 440).fill({ color: Theme.cyan, alpha: 0.02 });
    this.background.moveTo(150, 228).lineTo(570, 228).stroke({ color: Theme.surfaceLine, width: 1.5, alpha: 0.45 });
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
    this.chrome.roundRect(4, 8, CARD_W, CARD_H, UI_TOKENS.radius.lg)
      .fill({ color: Theme.shadow, alpha: 0.3 })
      .roundRect(0, 0, CARD_W, CARD_H, UI_TOKENS.radius.lg)
      .fill(Theme.surface)
      .stroke({ color: Theme.surfaceLine, width: 1.5 });
    this.chapterBadge.roundRect(18, 14, 56, 34, 12).fill(Theme.surfaceMuted).stroke({ color: Theme.surfaceLine, width: 1 });
    this.chapterNumber = new Text({ text: String(chapterNo).padStart(2, '0'), style: uiText({ fontSize: 19, fill: Theme.ink }) });
    this.chapterNumber.anchor.set(0.5);
    this.chapterNumber.position.set(46, 31);
    this.title = new Text({ text: chapterName, style: uiText({ fontSize: 23, fill: Theme.ink }) });
    this.title.position.set(88, 20);
    this.progress = new Text({ text: '', style: uiText({ fontSize: 15, fill: Theme.inkSoft }) });
    this.progress.anchor.set(1, 0);
    this.progress.position.set(CARD_W - 22, 23);
    this.tiles = entries.map(({ index }) => new ChapterLevelTile(index));
    this.tiles.forEach((tile, order) => {
      tile.position.set(20 + (order % 5) * 120, 58 + Math.floor(order / 5) * 56);
      tile.setSelectHandler((index) => this.selectHandler(index));
    });
    this.addChild(this.chrome, this.chapterBadge, this.chapterNumber, this.title, this.progress, ...this.tiles);
  }

  setSelectHandler(handler: (index: number) => void) {
    this.selectHandler = handler;
  }

  sync(currentIndex: number, completed: ReadonlySet<number>, totalLevels: number) {
    const done = this.tiles.filter((tile) => completed.has(tile.levelIndex)).length;
    this.progress.text = `${done} / ${this.tiles.length}`;
    this.progress.style.fill = done === this.tiles.length ? Theme.success : Theme.inkSoft;
    for (const tile of this.tiles) {
      tile.sync({
        completed: completed.has(tile.levelIndex),
        unlocked: isLevelUnlocked(tile.levelIndex, totalLevels, completed),
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
  private selectHandler: (index: number) => void = () => {};

  constructor(readonly levelIndex: number) {
    super();
    this.eventMode = 'static';
    this.hitArea = new Rectangle(0, 0, 102, 46);
    this.numberText = new Text({ text: String(levelIndex + 1), style: uiText({ fontSize: 22, fill: Theme.ink }) });
    this.numberText.anchor.set(0.5);
    this.numberText.position.set(45, 22);
    this.on('pointertap', () => { if (this.unlocked) this.selectHandler(this.levelIndex); });
    this.addChild(this.chrome, this.numberText, this.status);
  }

  setSelectHandler(handler: (index: number) => void) {
    this.selectHandler = handler;
  }

  sync(state: { completed: boolean; unlocked: boolean; current: boolean }) {
    this.unlocked = state.unlocked;
    this.cursor = state.unlocked ? 'pointer' : 'default';
    const fill = state.completed ? Theme.accent : state.unlocked ? Theme.surfaceTop : Theme.surfaceMuted;
    const edge = state.current ? Theme.cyan : state.completed ? Theme.accentDark : Theme.surfaceLine;
    this.chrome.clear()
      .roundRect(0, 4, 102, 46, 14).fill({ color: Theme.shadow, alpha: state.unlocked ? 0.28 : 0.12 })
      .roundRect(0, 0, 102, 43, 14).fill(fill)
      .stroke({ color: edge, width: state.current ? 3 : 1.5, alpha: state.unlocked ? 1 : 0.55 });
    this.numberText.style.fill = state.completed ? Theme.textOnAccent : state.unlocked ? Theme.ink : Theme.inkSoft;
    this.numberText.alpha = state.unlocked ? 1 : 0.62;
    this.status.clear();
    if (state.completed) {
      this.status.moveTo(82, 21).lineTo(87, 26).lineTo(95, 16)
        .stroke({ color: Theme.textOnAccent, width: 2.5, cap: 'round', join: 'round' });
    } else if (!state.unlocked) {
      this.status.arc(89, 18, 6, Math.PI, Math.PI * 2).stroke({ color: Theme.inkSoft, width: 2 });
      this.status.roundRect(82, 18, 14, 12, 3).fill(Theme.inkSoft);
    } else {
      this.status.circle(90, 22, 4).fill(state.current ? Theme.cyan : Theme.gold);
    }
  }
}
