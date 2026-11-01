import { useSyncExternalStore } from 'react';
import {
  addStroke,
  partialVersion,
  posToTarget,
  recount,
  TIMING,
  type Branch,
  type Stroke,
  type Version,
} from './history';
import { ctx2d, getLayerCanvas, readPixels } from './layerStore';
import { findActiveLayer, layerIds, seedDoc, type Doc, type Tool } from './model';
import { firstLayerOf, selectLayer } from './ops';
import { invalidatePreview, pixelsAt, replayStroke, restore } from './replay';

export interface BrushSettings {
  tool: Tool;
  color: string;
  size: number; // 0–1
  opacity: number; // 0–1
}

/**
 * All of Rewind's state, outside React: pixels and history change too often and
 * too imperatively to live in component state. Components re-render on `emit`.
 */
class Rewind {
  doc: Doc = seedDoc();
  brush: BrushSettings = { tool: 'pen', color: '#1D1B19', size: 0.3, opacity: 0.9 };
  /** Bumped whenever layer pixels change outside of `doc`, so thumbnails redraw. */
  pixelVersion = 0;

  versions: Version[] = []; // closed versions, then the open one (if any) last
  open: Version | null = null; // the version currently recording
  drawing = false; // a stroke is in progress
  redoStack: Stroke[] = []; // strokes taken off by undo, most recent last
  lastActivity = 0;

  branches: Branch[] = [{ id: 'B0', name: 'main', versions: this.versions }];
  branchId = 'B0';
  branchCounter = 0;
  private branchDocs = new Map<string, Doc>();

  pos: number | null = null; // playhead position; null = live ("now")
  playing = false;
  private playTimer = 0;

  expanded = true; // timeline shows every branch's row; collapsed = current branch only
  demo = true;
  showHint = true;
  toastText: string | null = null;
  pastNotice = false;
  private toastTimer = 0;
  private noticeTimer = 0;

  private rev = 0;
  private listeners = new Set<() => void>();

  constructor() {
    setInterval(this.checkPause, 400);
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  getRev = () => this.rev;
  private emit = () => {
    this.rev++;
    this.listeners.forEach((fn) => fn());
  };

  get timing() {
    return this.demo ? TIMING.demo : TIMING.real;
  }
  get viewing() {
    return this.pos !== null && this.versions.length > 0;
  }
  get currentBranch() {
    return this.branches.find((b) => b.id === this.branchId)!;
  }

  setBrush = (patch: Partial<BrushSettings>) => {
    this.brush = { ...this.brush, ...patch };
    this.emit();
  };
  setOption = (patch: Partial<Pick<Rewind, 'demo' | 'showHint' | 'expanded'>>) => {
    Object.assign(this, patch);
    this.emit();
  };

  // -------------------------------------------------------------- messages

  toast = (text: string) => {
    this.toastText = text;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastText = null;
      this.emit();
    }, 2400);
    this.emit();
  };

  private showPastNotice() {
    this.pastNotice = true;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => {
      this.pastNotice = false;
      this.emit();
    }, 4000);
    this.emit();
  }

  // -------------------------------------------------------------- layers

  private setDoc(doc: Doc) {
    this.doc = doc;
    this.emit();
  }

  /** Selection only: no effect on the picture, so it's allowed while viewing the past. */
  navigate = (update: (doc: Doc) => Doc) => this.setDoc(update(this.doc));

  /** Order, visibility and grouping: recorded when the version closes, doesn't close it. */
  arrange = (update: (doc: Doc) => Doc) => {
    if (this.viewing) return this.showPastNotice();
    this.setDoc(update(this.doc));
  };

  /**
   * A change to the set of layers, which closes the current version. `copies`
   * means new layers arrive with pixels that no stroke made: those go into the
   * last closed version's keyframe, so later lookups find them.
   */
  commit = (update: (doc: Doc) => Doc, reason: string, { copies = false } = {}) => {
    if (this.viewing) return this.showPastNotice();
    if (this.drawing) return;
    const prev = this.doc;
    const next = update(prev);
    if (next === prev) return;
    this.closeVersion(reason);
    if (copies) {
      const had = new Set(layerIds(prev.items));
      const last = this.versions[this.versions.length - 1];
      if (last) for (const id of layerIds(next.items)) if (!had.has(id)) last.keyframe.set(id, readPixels(id));
    }
    this.setDoc(next);
  };

  // -------------------------------------------------------------- strokes

  /** Pen down: returns the layer to draw on, or null if drawing isn't allowed right now. */
  beginStroke = () => {
    if (this.viewing) {
      this.showPastNotice();
      return null;
    }
    const target = findActiveLayer(this.doc);
    if (!target) return null;
    if (!target.layer.visible || target.group?.visible === false) {
      this.toast(`"${(target.group?.visible === false ? target.group : target.layer).name}" is hidden`);
      return null;
    }
    this.drawing = true;
    if (!this.open) {
      this.open = {
        n: this.versions.length + 1,
        strokes: [],
        tools: {},
        cells: new Set(),
        start: Date.now(),
        end: Date.now(),
        closedBy: null,
        closedAt: 0,
        stack: this.doc.items,
        keyframe: new Map(),
      };
      this.versions.push(this.open);
    }
    this.emit();
    return target.layer.id;
  };

  finishStroke = (s: Stroke) => {
    const v = this.open!;
    this.drawing = false;
    this.redoStack = [];
    addStroke(v, s);
    v.end = s.t1;
    this.lastActivity = s.t1;
    this.pixelVersion++;
    if (s.t1 - v.start >= this.timing.cap) this.closeVersion(this.timing.capLabel);
    this.emit();
  };

  // -------------------------------------------------------------- versions

  private closeVersion(reason: string) {
    const v = this.open;
    if (!v) return;
    this.open = null;
    this.redoStack = []; // a closed version is history: undo/redo stop at its boundary
    if (!v.strokes.length) {
      // nothing left in it (everything was undone): drop it rather than closing it
      this.versions.pop();
      return;
    }
    v.closedBy = reason;
    v.closedAt = Date.now();
    v.stack = this.doc.items;
    for (const id of new Set(v.strokes.map((s) => s.layerId))) v.keyframe.set(id, readPixels(id));
  }

  private checkPause = () => {
    const v = this.open;
    if (!v || !v.strokes.length || this.drawing) return;
    if (Date.now() - this.lastActivity >= this.timing.pause) {
      this.closeVersion('paused drawing');
      this.emit();
    }
  };

  // -------------------------------------------------------------- undo / redo

  // Undo only reaches strokes in the open version: closed versions are history,
  // and going back to them is what the timeline is for.
  get canUndo() {
    return this.pos === null && !this.drawing && !!this.open && this.open.strokes.length > 0;
  }
  get canRedo() {
    return this.pos === null && !this.drawing && !!this.open && this.redoStack.length > 0;
  }

  undo = () => {
    if (!this.canUndo) return;
    const v = this.open!;
    const s = v.strokes.pop()!;
    this.redoStack.push(s);
    recount(v);
    // pixels can't be un-drawn: go back to the layer's last keyframe and replay what's left
    const ctx = ctx2d(getLayerCanvas(s.layerId));
    restore(ctx, pixelsAt(this.versions, this.versions.length - 2, s.layerId));
    v.strokes.filter((x) => x.layerId === s.layerId).forEach((x) => replayStroke(x, ctx));
    this.lastActivity = Date.now();
    this.pixelVersion++;
    this.emit();
  };

  redo = () => {
    if (!this.canRedo) return;
    const s = this.redoStack.pop()!;
    addStroke(this.open!, s);
    replayStroke(s, ctx2d(getLayerCanvas(s.layerId)));
    this.lastActivity = Date.now();
    this.pixelVersion++;
    this.emit();
  };

  // -------------------------------------------------------------- scrubbing

  setPos = (pos: number | null, { fromUser = false } = {}) => {
    if (this.drawing) return;
    const n = this.versions.length;
    const live = pos === null || n === 0 || pos >= n - 1e-6;
    this.pos = live ? null : Math.max(0, pos);
    if (live) {
      invalidatePreview();
      this.pastNotice = false;
    }
    if (fromUser) this.stopPlay();
    this.emit();
  };

  stepBoundary = (dir: -1 | 1) => {
    const n = this.versions.length;
    if (!n) return;
    const cur = this.pos ?? n;
    const target = dir < 0 ? Math.ceil(cur - 1e-6) - 1 : Math.floor(cur + 1e-6) + 1;
    this.setPos(Math.max(0, Math.min(n, target)), { fromUser: true });
  };

  togglePlay = () => {
    if (this.drawing) return;
    if (this.playing) return this.stopPlay();
    if (!this.versions.some((v) => v.strokes.length)) return this.toast('Nothing to play yet');
    if (this.pos === null) this.setPos(0);
    this.playing = true;
    this.playTimer = window.setInterval(this.stepPlay, 110);
    this.emit();
  };

  stopPlay = () => {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.playTimer);
    this.emit();
  };

  private stepPlay = () => {
    if (this.pos === null) return this.stopPlay();
    let { i, k } = posToTarget(this.versions, this.pos);
    if (k < this.versions[i].strokes.length) k++;
    else {
      i++;
      k = 1;
    }
    if (i >= this.versions.length) {
      this.setPos(null);
      return this.stopPlay();
    }
    const len = this.versions[i].strokes.length || 1;
    this.setPos(i + Math.min(k, len) / len);
  };

  // -------------------------------------------------------------- branches

  // A branch shares every version before its fork point. Forking mid-version
  // copies the first k strokes of that version.
  fork = () => {
    if (this.pos === null) return;
    const { i, k } = posToTarget(this.versions, this.pos);
    const from = this.versions[i];
    const whole = k > 0 && k === from.strokes.length;
    this.stopPlay();
    this.closeVersion('forked');
    const versions = this.versions.slice(0, i);
    if (whole) versions.push(from);
    else if (k > 0) versions.push(partialVersion(from, k));
    const n = ++this.branchCounter;
    const branch: Branch = { id: `B${n}`, name: `fork ${n}`, versions };
    this.branches.push(branch);
    this.expanded = true; // show the new row and where it split off
    const doc = selectLayer({ items: from.stack, activeLayerId: null, selectedIds: [] }, firstLayerOf(from.stack[0]));
    this.enterBranch(branch, doc);
    this.toast(`Started ${branch.name} from v${from.n}${whole ? '' : ` · stroke ${k}/${from.strokes.length}`}`);
  };

  switchBranch = (id: string, pos: number | null = null) => {
    if (id === this.branchId || this.drawing) return;
    this.stopPlay();
    this.closeVersion('switched branch');
    this.enterBranch(this.branches.find((b) => b.id === id)!, this.branchDocs.get(id)!, pos);
  };

  // Branches share layer ids but not pixels, so every layer is reloaded on entry.
  private enterBranch(branch: Branch, doc: Doc, pos: number | null = null) {
    this.branchDocs.set(this.branchId, this.doc);
    this.branchId = branch.id;
    this.versions = branch.versions;
    this.open = null;
    this.redoStack = [];
    this.pastNotice = false;
    invalidatePreview();

    const last = this.versions.length - 1;
    for (const id of layerIds(doc.items)) restore(ctx2d(getLayerCanvas(id)), pixelsAt(this.versions, last, id));
    // a partial version has no keyframe yet: replay its strokes, then keep the result
    const tip = this.versions[last];
    if (tip && !tip.keyframe.size) {
      for (const s of tip.strokes) replayStroke(s, ctx2d(getLayerCanvas(s.layerId)));
      for (const s of tip.strokes) if (!tip.keyframe.has(s.layerId)) tip.keyframe.set(s.layerId, readPixels(s.layerId));
    }

    this.doc = doc;
    this.pixelVersion++;
    this.pos = null;
    if (pos !== null) this.setPos(pos);
    else this.emit();
  }

  // -------------------------------------------------------------- keyboard

  onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
    } else if (e.key === 'ArrowLeft') this.stepBoundary(-1);
    else if (e.key === 'ArrowRight') this.stepBoundary(1);
    else if (e.key === 'Escape') this.setPos(null, { fromUser: true });
    else if (e.key === ' ') {
      e.preventDefault();
      this.togglePlay();
    }
  };
}

export const rewind = new Rewind();

export function useStore() {
  useSyncExternalStore(rewind.subscribe, rewind.getRev);
  return rewind;
}

