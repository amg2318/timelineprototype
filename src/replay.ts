import { brushes, type StrokeState } from './brushes';
import type { Stroke, Version } from './history';
import { compositeStack, createCanvas, ctx2d, DOC_H, DOC_W } from './layerStore';
import { layerIds, type Item } from './model';

// One path for painting a stroke, used live and on replay, so a replayed stroke
// lands on exactly the same pixels as the one the artist drew.

const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const strokeState = (s: Stroke, ctx: CanvasRenderingContext2D): StrokeState => ({
  ctx,
  color: s.color,
  width: s.width,
  last: null,
  carry: 0,
  rng: seeded(s.seed),
});

export function beginPaint(s: Stroke, state: StrokeState) {
  const pt = s.points[0];
  brushes[s.tool].begin(state, pt);
  state.last = pt;
}

/** Merge a stroke's full-strength buffer into a layer at the stroke's opacity. */
export function mergeBuffer(s: Stroke, buffer: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  ctx.globalAlpha = s.opacity * brushes[s.tool].alpha;
  ctx.globalCompositeOperation = s.tool === 'erase' ? 'destination-out' : 'source-over';
  ctx.drawImage(buffer, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

let replayBuffer: HTMLCanvasElement | undefined;

export function replayStroke(s: Stroke, ctx: CanvasRenderingContext2D) {
  replayBuffer ??= createCanvas();
  const buf = ctx2d(replayBuffer);
  buf.clearRect(0, 0, DOC_W, DOC_H);
  const state = strokeState(s, buf);
  beginPaint(s, state);
  for (const pt of s.points.slice(1)) brushes[s.tool].move(state, pt);
  mergeBuffer(s, replayBuffer, ctx);
}

/** A layer's pixels at the end of version `upTo`: its latest keyframe at or before it. */
export function pixelsAt(versions: Version[], upTo: number, layerId: string) {
  for (let j = upTo; j >= 0; j--) {
    const data = versions[j]?.keyframe.get(layerId);
    if (data) return data;
  }
  return null;
}

/** Overwrite a canvas with a layer's pixels, or blank it if the layer had none yet. */
export function restore(ctx: CanvasRenderingContext2D, data: ImageData | null) {
  if (data) ctx.putImageData(data, 0, 0);
  else ctx.clearRect(0, 0, DOC_W, DOC_H);
}

// ---------------------------------------------------------------- scrubbing

// The past gets its own set of layer canvases, so the live ones stay untouched.
const pool: HTMLCanvasElement[] = [];
const inUse = new Map<string, HTMLCanvasElement>();
let shown: { v: Version; k: number } | null = null;

export const invalidatePreview = () => {
  shown = null;
};

/** Paint version `i` with its first `k` strokes into `view`, using the given stack. */
export function renderPreview(versions: Version[], i: number, k: number, stack: Item[], view: CanvasRenderingContext2D) {
  const v = versions[i];
  let from = 0;
  if (shown?.v === v && k >= shown.k) {
    from = shown.k; // moving forward inside the same version: just add strokes
  } else {
    pool.push(...inUse.values());
    inUse.clear();
    // the end of a closed version is already on file, no replay needed
    const atEnd = !!v.closedBy && k === v.strokes.length;
    for (const id of layerIds(stack)) {
      const c = pool.pop() ?? createCanvas();
      inUse.set(id, c);
      restore(ctx2d(c), pixelsAt(versions, atEnd ? i : i - 1, id));
    }
    from = atEnd ? k : 0;
  }
  for (const s of v.strokes.slice(from, k)) {
    const c = inUse.get(s.layerId);
    if (c) replayStroke(s, ctx2d(c));
  }
  shown = { v, k };
  compositeStack(stack, view, (id) => inUse.get(id)!);
}
