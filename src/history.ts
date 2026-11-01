import { DOC_H, DOC_W } from './layerStore';
import type { Item, Tool } from './model';
import type { Pt } from './brushes';

// Rewind's history: every stroke is recorded as data, and strokes group into
// versions that close on a pause, a time cap, or a layer change (decisions.md Q1).

export interface Stroke {
  tool: Tool;
  color: string;
  width: number; // document pixels
  opacity: number; // 0–1
  layerId: string;
  seed: number;
  points: Pt[];
  t0: number;
  t1: number;
}

export interface Version {
  n: number;
  strokes: Stroke[];
  tools: Partial<Record<Tool, number>>;
  cells: Set<number>; // edit size: grid cells the strokes passed through
  start: number;
  end: number;
  closedBy: string | null;
  closedAt: number;
  /** The layer stack: as of opening while recording, as of closing afterwards. */
  stack: Item[];
  /** Pixels at close of the layers this version changed. Earlier versions hold the rest. */
  keyframe: Map<string, ImageData>;
  forkedFrom?: Version;
}

/** Shares every version before its fork point (the same objects), then has its own. */
export interface Branch {
  id: string;
  name: string;
  versions: Version[];
}

export const TIMING = {
  real: { pause: 90_000, cap: 600_000, capLabel: '10 min of drawing' },
  demo: { pause: 4_000, cap: 30_000, capLabel: 'time cap (demo: 30s)' },
};

export const GRID = 24; // edit-size grid: canvas split into GRID×GRID cells

function markStroke(cells: Set<number>, points: Pt[]) {
  const mark = (x: number, y: number) => {
    const cx = Math.min(GRID - 1, Math.max(0, Math.floor((x / DOC_W) * GRID)));
    const cy = Math.min(GRID - 1, Math.max(0, Math.floor((y / DOC_H) * GRID)));
    cells.add(cy * GRID + cx);
  };
  points.forEach((b, i) => {
    const a = points[i - 1] ?? b;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 10));
    for (let t = 0; t <= steps; t++) mark(a.x + ((b.x - a.x) * t) / steps, a.y + ((b.y - a.y) * t) / steps);
  });
}

export function addStroke(v: Version, s: Stroke) {
  v.strokes.push(s);
  v.tools[s.tool] = (v.tools[s.tool] ?? 0) + 1;
  markStroke(v.cells, s.points);
}

/** Recount a version's summary after a stroke is taken off by undo. */
export function recount(v: Version) {
  v.tools = {};
  v.cells = new Set();
  const strokes = v.strokes;
  v.strokes = [];
  strokes.forEach((s) => addStroke(v, s));
}

/** The first k strokes of a version, as a closed version of its own. Its keyframe is filled on entry. */
export function partialVersion(from: Version, k: number): Version {
  const v: Version = {
    ...from,
    strokes: [],
    tools: {},
    cells: new Set(),
    end: from.strokes[k - 1].t1,
    closedBy: 'forked',
    closedAt: 0,
    keyframe: new Map(),
    forkedFrom: from,
  };
  from.strokes.slice(0, k).forEach((s) => addStroke(v, s));
  return v;
}

// pos runs 0 … versions.length. Version i occupies [i, i+1); the fraction inside
// it picks how many of its strokes to show. pos === null means live.
export function posToTarget(versions: Version[], pos: number) {
  const i = Math.min(Math.floor(pos), versions.length - 1);
  const f = Math.min(1, pos - i);
  // a boundary between versions reads as "end of the previous one", not "stroke 0 of the next"
  if (f === 0 && i > 0) return { i: i - 1, k: versions[i - 1].strokes.length };
  return { i, k: Math.round(f * versions[i].strokes.length) };
}

export interface Row {
  branch: Branch;
  start: number; // column where this branch splits off
  parent: number; // row it split from, -1 for main
}

// One timeline row per branch. A version is drawn once, in the row of the first
// branch that has it, so a fork's row starts at the column where it splits off.
export function timelineRows(branches: Branch[]): Row[] {
  const prefix = (a: Branch, b: Branch) => {
    let p = 0;
    while (p < a.versions.length && p < b.versions.length && a.versions[p] === b.versions[p]) p++;
    return p;
  };
  return branches.map((branch, j) => {
    let start = 0;
    let parent = -1;
    for (let k = 0; k < j; k++) {
      const p = prefix(branch, branches[k]);
      if (parent < 0 || p > start) {
        start = p;
        parent = k;
      }
    }
    return { branch, start, parent };
  });
}
