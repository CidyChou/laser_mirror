import { api } from './api';
import { BoardCanvas, type Selection } from './BoardCanvas';
import {
  CHAPTERS,
  ITEM_LABELS,
  TOOLS,
  cloneLevel,
  emptyLevel,
  gmEmitters,
  rotateItem,
  resizeLevel,
  validateLevel,
  type Direction,
  type GmLevel,
  type LevelItem,
  type Tool,
} from '../schema';

type Snapshot = { levels: GmLevel[]; selectedId: string | null };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let listDidDrag = false;

const board = new BoardCanvas($<HTMLCanvasElement>('board'), {
  onChange: level => app.replaceLevel(level, false),
  onSelect: selection => app.setSelection(selection),
});

const app = {
  levels: [] as GmLevel[],
  selectedId: null as string | null,
  selection: { kind: 'none' } as Selection,
  tool: 'select' as Tool,
  preview: true,
  dirty: false,
  filter: '',
  undoStack: [] as Snapshot[],
  redoStack: [] as Snapshot[],
  saveTimer: 0,
  inspectorTick: '',
  savePromise: null as Promise<void> | null,

  get current(): GmLevel | null {
    return this.levels.find(level => level.id === this.selectedId) ?? this.levels[0] ?? null;
  },

  async boot() {
    bindChrome(this);
    renderTools(this);
    const state = await api.state();
    this.levels = state.levels;
    this.dirty = state.dirty;
    const savedId = sessionStorage.getItem('gm-selected');
    this.selectedId = this.levels.some(level => level.id === savedId) ? savedId : this.levels[0]?.id ?? null;
    const savedTool = sessionStorage.getItem('gm-tool') as Tool | null;
    if (savedTool && TOOLS.some(tool => tool.id === savedTool)) this.tool = savedTool;
    this.preview = sessionStorage.getItem('gm-preview') !== '0';
    $<HTMLInputElement>('preview-toggle').checked = this.preview;
    this.refresh(true);
    new ResizeObserver(() => board.resize()).observe($('board-wrap'));
    board.resize();
    window.addEventListener('keydown', e => this.onKey(e));
    window.addEventListener('beforeunload', () => { void this.flushSave(); });
  },

  refresh(forceInspector = false) {
    const level = this.current;
    renderList(this);
    renderStatus(this);
    if (level) board.setState(level, this.selection, this.tool, this.preview);
    renderInspector(this, forceInspector);
    sessionStorage.setItem('gm-selected', this.selectedId ?? '');
    sessionStorage.setItem('gm-tool', this.tool);
    sessionStorage.setItem('gm-preview', this.preview ? '1' : '0');
  },

  snapshot(): Snapshot {
    return { levels: structuredClone(this.levels), selectedId: this.selectedId };
  },

  pushUndo() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
  },

  undo() {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.snapshot());
    this.levels = prev.levels;
    this.selectedId = prev.selectedId;
    this.selection = { kind: 'none' };
    this.dirty = true;
    this.refresh(true);
    this.scheduleSave();
  },

  redo() {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.snapshot());
    this.levels = next.levels;
    this.selectedId = next.selectedId;
    this.selection = { kind: 'none' };
    this.dirty = true;
    this.refresh(true);
    this.scheduleSave();
  },

  mutate(fn: () => void, opts: { inspector?: boolean } = {}) {
    this.pushUndo();
    fn();
    this.dirty = true;
    this.refresh(opts.inspector ?? false);
    this.scheduleSave();
  },

  replaceLevel(next: GmLevel, inspector = false) {
    this.mutate(() => {
      this.levels = this.levels.map(level => level.id === next.id ? next : level);
    }, { inspector });
  },

  setSelection(selection: Selection) {
    this.selection = selection;
    renderInspector(this, false);
    const level = this.current;
    if (level) board.setState(level, this.selection, this.tool, this.preview);
  },

  setTool(tool: Tool) {
    this.tool = tool;
    renderTools(this);
    const level = this.current;
    if (level) board.setState(level, this.selection, this.tool, this.preview);
    sessionStorage.setItem('gm-tool', tool);
  },

  selectLevel(id: string) {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.selection = { kind: 'none' };
    this.refresh(true);
  },

  reorder(ids: string[]) {
    this.mutate(() => {
      const map = new Map(this.levels.map(level => [level.id, level]));
      this.levels = ids.map(id => map.get(id)).filter((level): level is GmLevel => !!level);
    });
  },

  createLevel() {
    const current = this.current;
    const created = emptyLevel({
      chapter: current?.chapter,
      chapterNo: current?.chapterNo,
      shots: current?.shots ?? 5,
    });
    this.mutate(() => {
      const index = this.levels.findIndex(level => level.id === this.selectedId);
      this.levels.splice(index + 1, 0, created);
      this.selectedId = created.id;
      this.selection = { kind: 'none' };
    }, { inspector: true });
  },

  duplicateLevel() {
    const current = this.current;
    if (!current) return;
    const copy = cloneLevel(current);
    this.mutate(() => {
      const index = this.levels.findIndex(level => level.id === current.id);
      this.levels.splice(index + 1, 0, copy);
      this.selectedId = copy.id;
      this.selection = { kind: 'none' };
    }, { inspector: true });
  },

  async deleteLevel() {
    if (this.levels.length <= 1) return toast('至少保留一关', 'err');
    const current = this.current;
    if (!current) return;
    if (!await confirmDlg(`删除「${current.name}」？此操作可撤销。`)) return;
    this.mutate(() => {
      const index = this.levels.findIndex(level => level.id === current.id);
      this.levels = this.levels.filter(level => level.id !== current.id);
      this.selectedId = this.levels[Math.min(index, this.levels.length - 1)]?.id ?? null;
      this.selection = { kind: 'none' };
    }, { inspector: true });
  },

  deleteSelection() {
    const level = this.current;
    if (!level) return;
    if (this.selection.kind === 'item') {
      const { x, y } = this.selection;
      this.replaceLevel({ ...level, items: level.items.filter(item => !(item.x === x && item.y === y)) });
      this.selection = { kind: 'none' };
      this.refresh(true);
      return;
    }
    if (this.selection.kind === 'target' && level.targets.length > 1) {
      const removeAt = this.selection.index;
      const targets = level.targets.filter((_, index) => index !== removeAt);
      this.replaceLevel({ ...level, targets });
      this.selection = { kind: 'none' };
      this.refresh(true);
      return;
    }
    if (this.selection.kind === 'emitter') {
      const emitters = gmEmitters(level);
      if (emitters.length <= 1) return;
      const removeAt = this.selection.index;
      const next = emitters.filter((_, index) => index !== removeAt);
      this.replaceLevel({
        ...level,
        emitter: next[0],
        emitters: next.length > 1 ? next : undefined,
      });
      this.selection = { kind: 'none' };
      this.refresh(true);
    }
  },

  rotateSelection() {
    const level = this.current;
    if (!level || this.selection.kind !== 'item') return;
    const { x, y } = this.selection;
    this.replaceLevel({
      ...level,
      items: level.items.map(item => item.x === x && item.y === y ? rotateItem(item) : item),
    }, true);
  },

  scheduleSave() {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => { void this.flushSave(); }, 350);
  },

  async flushSave() {
    window.clearTimeout(this.saveTimer);
    if (this.savePromise) await this.savePromise;
    const levels = this.levels;
    this.savePromise = api.save(levels).then(() => undefined).catch(error => {
      toast(error instanceof Error ? error.message : '保存失败', 'err');
    }).finally(() => {
      this.savePromise = null;
    });
    await this.savePromise;
  },

  async exportToProject() {
    await this.flushSave();
    try {
      const result = await api.exportToProject();
      this.dirty = false;
      renderStatus(this);
      toast(`已导出 ${result.count} 关到 ${result.exportPath}`);
    } catch (error) {
      const err = error as Error & { issues?: { message: string; level: number }[] };
      const extra = err.issues?.slice(0, 4).map(issue => `#${issue.level} ${issue.message}`).join('；');
      toast(extra ? `${err.message}：${extra}` : err.message, 'err');
      this.refresh(true);
    }
  },

  async reloadFromProject() {
    if (!await confirmDlg('用项目里的 levels.json 覆盖当前 GM 草稿？未导出的修改会丢失。')) return;
    const result = await api.resetFromProject();
    this.levels = result.levels;
    this.selectedId = result.levels[0]?.id ?? null;
    this.selection = { kind: 'none' };
    this.dirty = false;
    this.undoStack = [];
    this.redoStack = [];
    this.refresh(true);
    toast(`已载入项目中的 ${result.count} 关`);
  },

  onKey(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) this.redo(); else this.undo();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void this.exportToProject();
      return;
    }
    if (typing) return;
    const keyMap: Record<string, Tool> = {
      v: 'select', x: 'eraser',
      '1': 'mirror', '2': 'splitter', '3': 'wall', '4': 'switch',
      '5': 'door', '6': 'portal', '7': 'focus', '8': 'combiner', '9': 'emitter', '0': 'target',
    };
    if (keyMap[event.key.toLowerCase()]) {
      this.setTool(keyMap[event.key.toLowerCase()]);
      return;
    }
    if (event.key.toLowerCase() === 'r') this.rotateSelection();
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.deleteSelection();
    }
    if (event.key === 'Escape') this.setSelection({ kind: 'none' });
  },
};

function bindChrome(state: typeof app) {
  $('btn-new').addEventListener('click', () => state.createLevel());
  $('btn-dup').addEventListener('click', () => state.duplicateLevel());
  $('btn-del').addEventListener('click', () => { void state.deleteLevel(); });
  $('btn-export').addEventListener('click', () => { void state.exportToProject(); });
  $('btn-reload').addEventListener('click', () => { void state.reloadFromProject(); });
  $('preview-toggle').addEventListener('change', e => {
    state.preview = (e.target as HTMLInputElement).checked;
    state.refresh();
  });
  $('level-filter').addEventListener('input', e => {
    state.filter = (e.target as HTMLInputElement).value.trim();
    renderList(state);
  });
  const list = $('level-list');
  list.addEventListener('dragover', event => {
    if (state.filter) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const dragging = list.querySelector('.dragging');
    if (!(dragging instanceof HTMLElement)) return;
    const after = dragAfter(list, event.clientY);
    if (after) list.insertBefore(dragging, after);
    else list.append(dragging);
  });
  list.addEventListener('drop', event => {
    event.preventDefault();
    if (state.filter) return;
    const ids = [...list.querySelectorAll('li')].map(node => (node as HTMLElement).dataset.id).filter((id): id is string => !!id);
    if (ids.length === state.levels.length) state.reorder(ids);
  });
}

function renderTools(state: typeof app) {
  const root = $('tools');
  root.replaceChildren();
  for (const tool of TOOLS) {
    const btn = h('button', {
      class: tool.id === state.tool ? 'active' : '',
      type: 'button',
      draggable: 'true',
      title: `${tool.label} (${tool.hint})`,
      onClick: () => state.setTool(tool.id),
      onDragStart: (event: DragEvent) => {
        event.dataTransfer?.setData('application/x-gm-tool', tool.id);
        event.dataTransfer?.setDragImage(event.currentTarget as Element, 20, 20);
      },
    }, tool.label, h('kbd', {}, tool.hint));
    root.append(btn);
  }
}

function renderStatus(state: typeof app) {
  const pill = $('dirty-pill');
  pill.textContent = state.dirty ? '未导出' : '已与项目同步';
  pill.classList.toggle('clean', !state.dirty);
  const level = state.current;
  const index = state.levels.findIndex(item => item.id === state.selectedId);
  $('level-chip').textContent = level ? `第 ${index + 1} / ${state.levels.length} 关 · ${level.name}` : '无关卡';
  $('level-count').textContent = `${state.levels.length} 关`;
}

function renderList(state: typeof app) {
  const list = $('level-list');
  const scroll = list.scrollTop;
  const q = state.filter.toLowerCase();
  const filtered = state.levels
    .map((level, index) => ({ level, index }))
    .filter(({ level }) => !q || `${level.name} ${level.chapter}`.toLowerCase().includes(q));
  $('filter-hint').classList.toggle('hidden', !q);
  list.replaceChildren();
  for (const { level, index } of filtered) {
    const li = h('li', {
      class: level.id === state.selectedId ? 'selected' : '',
      draggable: !q,
      onClick: () => { if (!listDidDrag) state.selectLevel(level.id); },
      onDragStart: (event: DragEvent) => {
        if (q) return event.preventDefault();
        listDidDrag = true;
        (event.currentTarget as HTMLElement).classList.add('dragging');
        event.dataTransfer?.setData('text/plain', level.id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      },
      onDragEnd: (event: DragEvent) => {
        (event.currentTarget as HTMLElement).classList.remove('dragging');
        window.setTimeout(() => { listDidDrag = false; }, 0);
      },
    },
      h('span', { class: 'handle' }, '⋮⋮'),
      h('span', { class: 'num' }, String(index + 1).padStart(2, '0')),
      h('span', { class: 'meta' },
        h('b', {}, level.name),
        h('small', {}, level.chapter),
      ),
    ) as HTMLLIElement;
    li.dataset.id = level.id;
    list.append(li);
  }
  list.scrollTop = scroll;
}

function dragAfter(list: HTMLElement, y: number): HTMLElement | null {
  const items = [...list.querySelectorAll('li:not(.dragging)')] as HTMLElement[];
  return items.reduce<{ offset: number; element: HTMLElement | null }>((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

function renderInspector(state: typeof app, force: boolean) {
  const level = state.current;
  const root = $('inspector');
  if (!level) {
    root.replaceChildren(h('p', { class: 'empty' }, '没有关卡'));
    return;
  }
  const selectedItem = selectedLevelItem(level, state.selection);
  const tick = `${level.id}:${level.rows}x${level.cols}:${state.selection.kind}:${JSON.stringify(state.selection)}:${selectedItem ? JSON.stringify(selectedItem) : ''}`;
  if (!force && tick === state.inspectorTick && root.childElementCount) return;
  state.inspectorTick = tick;
  root.replaceChildren(
    section('关卡',
      field('名称', input('text', level.name, value => patchLevel(state, current => { current.name = value; }))),
      h('div', { class: 'chips' }, ...CHAPTERS.map(chapter =>
        h('button', {
          type: 'button',
          class: level.chapterNo === chapter.no && level.chapter === chapter.name ? 'active' : '',
          onClick: () => patchLevel(state, current => { current.chapter = chapter.name; current.chapterNo = chapter.no; }, true),
        }, chapter.name),
      )),
      h('div', { class: 'row-2' },
        field('章节编号', input('number', String(level.chapterNo), value => patchLevel(state, current => { current.chapterNo = Number(value) || 1; }))),
        field('章节名', input('text', level.chapter, value => patchLevel(state, current => { current.chapter = value; }))),
      ),
      h('div', { class: 'row-2' },
        field('列 cols', input('number', String(level.cols), value => {
          const cols = Number(value);
          if (!cols) return;
          state.replaceLevel(resizeLevel(level, level.rows, cols), true);
        })),
        field('行 rows', input('number', String(level.rows), value => {
          const rows = Number(value);
          if (!rows) return;
          state.replaceLevel(resizeLevel(level, rows, level.cols), true);
        })),
      ),
      field('激光次数', input('number', String(level.shots), value => patchLevel(state, current => { current.shots = Math.max(1, Number(value) || 1); }))),
      field('提示', textarea(level.hint, value => patchLevel(state, current => { current.hint = value; }))),
    ),
    section('选中物体', renderSelection(state, level, selectedItem)),
    section('校验', renderIssues(level, state.levels.indexOf(level))),
  );
}

function renderSelection(state: typeof app, level: GmLevel, item: LevelItem | null): HTMLElement {
  if (state.selection.kind === 'emitter') {
    const emitters = gmEmitters(level);
    const port = emitters[state.selection.index] ?? level.emitter;
    return h('div', {},
      h('p', {}, `发射器 ${state.selection.index + 1} / ${emitters.length} · ${port.side}${port.index}`),
      h('p', { class: 'empty' }, '拖到棋盘外框改位置。再用发射器工具点空端口即可增加。'),
      emitters.length > 1
        ? h('button', { type: 'button', class: 'danger', onClick: () => state.deleteSelection() }, '删除此发射器')
        : h('p', { class: 'empty' }, '至少保留一个发射器'),
    );
  }
  if (state.selection.kind === 'target') {
    const target = level.targets[state.selection.index];
    return h('div', {},
      h('p', {}, `接收器 ${state.selection.index + 1} · ${target?.side}${target?.index}`),
      h('p', { class: 'empty' }, '可添加多个墙面接收器。聚能终点在棋盘格子上，需要两束激光同时打中。'),
      level.targets.length > 1
        ? h('button', { type: 'button', class: 'danger', onClick: () => state.deleteSelection() }, '删除此接收器')
        : h('p', { class: 'empty' }, '至少保留一个接收器'),
    );
  }
  if (!item) {
    return h('p', { class: 'empty' }, '从左侧拖入物体，或点选棋盘上的格子 / 边框端口。');
  }
  const kids: HTMLElement[] = [
    h('p', {}, `${ITEM_LABELS[item.type]} · (${item.x}, ${item.y})`),
  ];
  if (item.type === 'mirror' || item.type === 'splitter') {
    kids.push(
      h('div', { class: 'chips' },
        h('button', { type: 'button', class: item.s === 0 ? 'active' : '', onClick: () => patchItem(state, it => { if (it.type === 'mirror' || it.type === 'splitter') it.s = 0; }) }, '\\ 朝向'),
        h('button', { type: 'button', class: item.s === 1 ? 'active' : '', onClick: () => patchItem(state, it => { if (it.type === 'mirror' || it.type === 'splitter') it.s = 1; }) }, '/ 朝向'),
      ),
      h('div', { class: 'toggle-row' },
        check('固定不可旋转', !!item.fixed, value => patchItem(state, it => { if (it.type === 'mirror' || it.type === 'splitter') it.fixed = value || undefined; })),
        check('诱饵', !!item.decoy, value => patchItem(state, it => { if (it.type === 'mirror' || it.type === 'splitter') it.decoy = value || undefined; })),
      ),
    );
  }
  if (item.type === 'switch') {
    kids.push(field('开关 ID', input('text', item.id, value => patchItem(state, it => { if (it.type === 'switch') it.id = value.trim() || it.id; }))));
  }
  if (item.type === 'door') {
    const switches = level.items.filter((entry): entry is Extract<LevelItem, { type: 'switch' }> => entry.type === 'switch');
    kids.push(
      field('门 ID', input('text', item.id, value => patchItem(state, it => { if (it.type === 'door') it.id = value.trim() || it.id; }))),
      h('div', { class: 'toggle-row' },
        ...switches.map(sw => check(`需要 ${sw.id}`, item.requires.includes(sw.id), value => patchItem(state, it => {
          if (it.type !== 'door') return;
          it.requires = value ? [...new Set([...it.requires, sw.id])] : it.requires.filter(id => id !== sw.id);
        }))),
      ),
    );
    if (!switches.length) kids.push(h('p', { class: 'empty' }, '还没有开关。先放一个开关再绑定。'));
  }
  if (item.type === 'portal') {
    kids.push(field('传送对 pair', input('text', item.pair, value => patchItem(state, it => { if (it.type === 'portal') it.pair = value.trim() || it.pair; }))));
  }
  if (item.type === 'focus') {
    kids.push(field('需要光束', input('number', String(item.need ?? 2), value => patchItem(state, it => {
      if (it.type !== 'focus') return;
      it.need = Math.max(2, Math.min(4, Number(value) || 2));
    }))));
  }
  if (item.type === 'combiner') {
    const dir = item.dir;
    kids.push(
      h('div', { class: 'chips' },
        ...(['东', '南', '西', '北'] as const).map((label, index) =>
          h('button', {
            type: 'button',
            class: dir === index ? 'active' : '',
            onClick: () => patchItem(state, it => { if (it.type === 'combiner') it.dir = index as Direction; }),
          }, `${label} 输出`),
        ),
      ),
      field('需要光束', input('number', String(item.need ?? 2), value => patchItem(state, it => {
        if (it.type !== 'combiner') return;
        it.need = Math.max(2, Math.min(4, Number(value) || 2));
      }))),
      h('div', { class: 'toggle-row' },
        check('固定不可旋转', !!item.fixed, value => patchItem(state, it => { if (it.type === 'combiner') it.fixed = value || undefined; })),
      ),
    );
  }
  kids.push(h('button', { type: 'button', class: 'danger', onClick: () => state.deleteSelection() }, '删除物体'));
  return h('div', {}, ...kids);
}

function renderIssues(level: GmLevel, index: number): HTMLElement {
  const issues = validateLevel(level, index);
  if (!issues.length) return h('p', { class: 'empty' }, '当前关卡通过校验');
  return h('div', { class: 'issues' }, ...issues.map(issue =>
    h('div', { class: issue.fatal ? 'issue' : 'issue warn' }, issue.message),
  ));
}

function patchLevel(state: typeof app, fn: (level: GmLevel) => void, forceInspector = false) {
  const current = state.current;
  if (!current) return;
  const next = structuredClone(current);
  fn(next);
  state.replaceLevel(next, forceInspector);
}

function patchItem(state: typeof app, fn: (item: LevelItem) => void) {
  const level = state.current;
  if (!level || state.selection.kind !== 'item') return;
  const { x, y } = state.selection;
  const next = structuredClone(level);
  const item = next.items.find(entry => entry.x === x && entry.y === y);
  if (!item) return;
  fn(item);
  state.replaceLevel(next, true);
}

function selectedLevelItem(level: GmLevel, selection: Selection): LevelItem | null {
  if (selection.kind !== 'item') return null;
  return level.items.find(item => item.x === selection.x && item.y === selection.y) ?? null;
}

function section(title: string, ...kids: Array<HTMLElement | null>) {
  return h('section', { class: 'section' }, h('h3', {}, title), ...kids);
}

function field(label: string, control: HTMLElement) {
  return h('div', { class: 'field' }, h('label', {}, label), control);
}

function input(type: string, value: string, onChange: (value: string) => void) {
  return h('input', {
    type,
    value,
    onChange: (event: Event) => onChange((event.target as HTMLInputElement).value),
  });
}

function textarea(value: string, onChange: (value: string) => void) {
  return h('textarea', {
    onChange: (event: Event) => onChange((event.target as HTMLTextAreaElement).value),
  }, value);
}

function check(label: string, checked: boolean, onChange: (value: boolean) => void) {
  return h('label', {},
    h('input', {
      type: 'checkbox',
      checked,
      onChange: (event: Event) => onChange((event.target as HTMLInputElement).checked),
    }),
    label,
  );
}

function toast(message: string, kind: 'ok' | 'err' = 'ok') {
  const node = h('div', { class: `toast ${kind}` }, message);
  $('toasts').append(node);
  window.setTimeout(() => node.remove(), 3600);
}

function confirmDlg(message: string): Promise<boolean> {
  const dialog = $<HTMLDialogElement>('dialog');
  $('dialog-msg').textContent = message;
  dialog.showModal();
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
  });
}

function h(tag: string, attrs: Record<string, unknown> = {}, ...kids: Array<Node | string | null | undefined>): HTMLElement {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = String(value);
    else if (key === 'checked') (node as HTMLInputElement).checked = Boolean(value);
    else if (key === 'value') (node as HTMLInputElement).value = String(value);
    else if (key === 'draggable') node.draggable = Boolean(value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else node.setAttribute(key, String(value));
  }
  for (const child of kids) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return node;
}

void app.boot().catch(error => toast(error instanceof Error ? error.message : String(error), 'err'));
