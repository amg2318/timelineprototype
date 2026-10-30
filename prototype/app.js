// Rewind — canvas page + timeline bar mockup.
// Drawing: p5.brush built-in brushes. History: every stroke is recorded as data
// ({brush, color, weight, layer, seed, segments}); strokes group into versions
// that close on a pause, a time cap, or a layer add/delete (decisions.md Q1).
// Past versions are read-only; "Fork from here" starts a new branch (Q2).

const PAPER = "#fbf8f1";

const PALETTE = [
  { name: "Black", hex: "#1d1b19" },
  { name: "Gray", hex: "#8a8580" },
  { name: "Teal", hex: "#2a9d8f" },
  { name: "Dark Green", hex: "#1f5f4a" },
  { name: "Light Blue", hex: "#8ecae6" },
  { name: "Tan", hex: "#d9b77e" },
  { name: "Orange", hex: "#e0632a" },
  { name: "Red Pastel", hex: "#e9787a" },
  { name: "Magenta", hex: "#b5179e" },
  { name: "Cream", hex: "#f4eee3" },
];

const ICONS = {
  pen: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M7 25l2.5-7L21 6.5l4.5 4.5L14 22.5z"/><path d="M9.5 18l4.5 4.5M19 8.5l4.5 4.5"/></svg>',
  marker: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 24l-3-3 12-12 3 3z"/><path d="M9 21l-3 5 5-2"/><path d="M19 11l3 3"/></svg>',
  HB: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M6 26l2-6L22 6l4 4-14 14z"/><path d="M8 20l4 4M6 26l2.5-.8"/></svg>',
  "2B": '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M6 26l2-6L22 6l4 4-14 14z"/><path d="M8 20l4 4"/></svg>',
  charcoal: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M8 22l12-14 5 4-12 14z" fill="currentColor" fill-opacity=".25"/><path d="M6 27c3-1 5-1 8 0" stroke-dasharray="2 2"/></svg>',
  spray: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="11" y="12" width="9" height="15" rx="2"/><path d="M13 12V9h5v3M18 7h2"/><g fill="currentColor" stroke="none"><circle cx="24" cy="6" r="1"/><circle cx="26.5" cy="9" r="1"/><circle cx="23.5" cy="10.5" r=".9"/><circle cx="27" cy="5" r=".8"/></g></svg>',
  eye: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><path d="M4 20L20 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
};

const BRUSHES = [
  { id: "pen", label: "pen", weight: 1 },
  { id: "marker", label: "marker", weight: 1.4 },
  { id: "HB", label: "pencil", weight: 1.2 },
  { id: "2B", label: "soft", weight: 1.4 },
  { id: "charcoal", label: "charcoal", weight: 1.2 },
  { id: "spray", label: "spray", weight: 1 },
];

const TIMING = {
  real: { pause: 90_000, cap: 600_000, capLabel: "10 min of drawing" },
  demo: { pause: 4_000, cap: 30_000, capLabel: "time cap (demo: 30s)" },
};

const MAX_LAYERS = 8; // each layer is its own WebGL context; browsers cap those at ~16

const GRID = 24; // edit-size grid: canvas split into GRID×GRID cells

const state = {
  W: 0, H: 0,
  brush: "pen", color: PALETTE[0].hex, size: 1,
  layers: [], activeLayerId: null, layerCounter: 0,
  versions: [],        // closed versions, then the open one (if any) last
  open: null,          // the version currently recording
  drawing: null,       // stroke in progress
  queue: [],           // live segments waiting to be rendered: {stroke, seg}
  actions: [],         // work that must run inside draw(): closing versions, layer ops
  lastActivity: 0,
  pos: null,           // playhead position; null = live ("now")
  branches: [],        // {id, name, versions, layers}; state.versions is the current branch's list
  branchId: null, branchCounter: 0,
  spare: [],           // recycled layer buffers (each one is a WebGL context, so reuse them)
  rebuild: [],         // layers to redraw from recorded strokes, one per frame: {layer, strokes}
  loading: false,      // true while forking / switching branches
  expanded: true,      // timeline shows every branch's row; collapsed = current branch only
  rows: [],            // the rows currently on screen, top to bottom: {branch, start, parent}
  redo: [],            // strokes taken off by undo, most recent last
  preview: { key: null, i: -1, k: 0 },
  playing: false, playTimer: 0,
  demo: true, showHint: true,
};

let compositeFb, previewPg, canvasEl;

// ---------------------------------------------------------------- p5 setup

function setup() {
  // size from the window: setup() can run before the stylesheet has laid out the stage
  // (64px rail + 72px brushes + 232px layers + 48px stage padding; 52px top bar + 96px timeline + 32px stage padding)
  state.W = Math.floor(Math.min(window.innerWidth - 64 - 72 - 232 - 48, 1300));
  state.H = Math.floor(Math.min(window.innerHeight - 52 - 96 - 32, 860));
  const c = createCanvas(state.W, state.H, WEBGL);
  c.parent("canvas-wrap");
  canvasEl = c.elt;
  brush.load();
  brush.scaleBrushes(2.6);

  compositeFb = createFramebuffer({ width: state.W, height: state.H });
  previewPg = createGraphics(state.W, state.H, WEBGL);

  addLayer("Sketch", { silent: true });
  state.branches.push({ id: "B0", name: "main", versions: state.versions, layers: null });
  state.branchId = "B0";

  buildRail();
  buildTray();
  bindCanvas();
  bindTimeline();
  bindTopbar();
  renderLayers();
  renderTimeline();

  setInterval(checkPause, 400);
}

// p5.brush (2.2.3) buffers strokes and writes them out in p5's postdraw hook,
// to whichever target is loaded at that moment. Switching targets with
// brush.load() mid-frame discards pending strokes, and p5.Framebuffer targets
// don't receive them at all. So each frame: reset to the main canvas, do all
// native drawing, then load ONE WEBGL p5.Graphics target and issue brush calls
// last. They land at the end of the frame and show up on the next one.
function draw() {
  brush.load();

  // 1. queued work (closing a version, layer ops). Runs before new segments
  //    are drawn so snapshots contain exactly the strokes that belong to them.
  if (state.actions.length && state.queue.length === 0 && !state.rebuild.length) {
    const acts = state.actions.splice(0);
    acts.forEach((fn) => fn());
  }

  // 2. playback
  if (state.playing && millis() > state.playTimer) {
    stepPlay();
    state.playTimer = millis() + 110;
  }

  // 3. present
  background(PAPER);
  if (state.pos === null) {
    drawLayers();
    if (state.rebuild.length) rebuildStep(); // brush calls → one rebuilt layer
    else flushQueue(); // brush calls → active layer, written at end of frame
  } else {
    image(previewPg, -state.W / 2, -state.H / 2, state.W, state.H);
    renderPreview(); // brush calls → preview buffer, written at end of frame
  }
}

// ---------------------------------------------------------------- layers

function makeLayer(name) {
  return {
    id: "L" + ++state.layerCounter,
    name,
    visible: true,
    opacity: 1,
    pg: state.spare.pop() || createGraphics(state.W, state.H, WEBGL),
  };
}

function addLayer(name, { silent } = {}) {
  if (state.layers.length >= MAX_LAYERS) return toast(`Max ${MAX_LAYERS} layers in this mockup`);
  const create = () => {
    const layer = makeLayer(name || "Layer " + (state.layers.length + 1));
    const idx = state.layers.findIndex((l) => l.id === state.activeLayerId);
    state.layers.splice(idx + 1, 0, layer);
    state.activeLayerId = layer.id;
    renderLayers();
  };
  if (silent) return create();
  queueClose("layer added");
  state.actions.push(create);
}

function deleteLayer(id) {
  if (state.layers.length === 1) return toast("Keep at least one layer");
  queueClose("layer deleted");
  state.actions.push(() => {
    const idx = state.layers.findIndex((l) => l.id === id);
    const [gone] = state.layers.splice(idx, 1);
    recycle(gone.pg);
    if (state.activeLayerId === id) state.activeLayerId = state.layers[Math.max(0, idx - 1)].id;
    renderLayers();
    toast(`Deleted "${gone.name}". It's still in the history`);
  });
}

function activeLayer() {
  return state.layers.find((l) => l.id === state.activeLayerId);
}

function recycle(pg) {
  pg.clear();
  state.spare.push(pg);
}

function layerMeta() {
  return state.layers.map(({ id, name, visible, opacity }) => ({ id, name, visible, opacity }));
}

function drawLayers() {
  for (const l of state.layers) {
    if (!l.visible) continue;
    tint(255, l.opacity * 255);
    image(l.pg, -state.W / 2, -state.H / 2, state.W, state.H);
  }
  noTint();
}

// ---------------------------------------------------------------- strokes

function bindCanvas() {
  canvasEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (state.pos !== null) return showPastNotice();
    if (state.loading) return toast("Loading branch…");
    const layer = activeLayer();
    if (!layer.visible) return toast(`"${layer.name}" is hidden`);
    try { canvasEl.setPointerCapture(e.pointerId); } catch {}
    const p = toCanvas(e);
    ensureOpenVersion();
    state.drawing = {
      brush: state.brush,
      color: state.color,
      weight: +(BRUSHES.find((b) => b.id === state.brush).weight * state.size).toFixed(2),
      layerId: layer.id,
      seed: Math.floor(Math.random() * 1e9),
      segs: [],
      t0: Date.now(),
      t1: 0,
      seeded: false,
      last: p,
    };
  });

  canvasEl.addEventListener("pointermove", (e) => {
    const s = state.drawing;
    if (!s) return;
    const coalesced = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    const events = coalesced.length ? coalesced : [e];
    for (const ev of events) {
      const p = toCanvas(ev);
      if (Math.hypot(p.x - s.last.x, p.y - s.last.y) < 3) continue;
      addSeg(s, [s.last.x, s.last.y, p.x, p.y]);
      s.last = p;
    }
  });

  const end = () => {
    const s = state.drawing;
    if (!s) return;
    if (!s.segs.length) addSeg(s, [s.last.x, s.last.y, s.last.x + 1, s.last.y + 1]); // a tap = a dot
    s.t1 = Date.now();
    delete s.last;
    state.drawing = null;
    const v = state.open;
    state.redo = [];
    v.strokes.push(s);
    v.tools[s.brush] = (v.tools[s.brush] || 0) + 1;
    v.end = s.t1;
    state.lastActivity = s.t1;
    if (s.t1 - v.start >= timing().cap) queueClose(timing().capLabel);
    renderTimeline();
  };
  canvasEl.addEventListener("pointerup", end);
  canvasEl.addEventListener("pointercancel", end);
}

function addSeg(stroke, seg) {
  stroke.segs.push(seg);
  state.queue.push({ stroke, seg });
  markCells(state.open.cells, seg);
}

// edit size: mark the grid cells a segment touches
function markCells(cells, seg) {
  const steps = Math.max(1, Math.ceil(Math.hypot(seg[2] - seg[0], seg[3] - seg[1]) / 10));
  for (let t = 0; t <= steps; t++) {
    const x = seg[0] + ((seg[2] - seg[0]) * t) / steps;
    const y = seg[1] + ((seg[3] - seg[1]) * t) / steps;
    const cx = Math.min(GRID - 1, Math.max(0, Math.floor((x / state.W) * GRID)));
    const cy = Math.min(GRID - 1, Math.max(0, Math.floor((y / state.H) * GRID)));
    cells.add(cy * GRID + cx);
  }
}

function toCanvas(e) {
  const r = canvasEl.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) * state.W) / r.width,
    y: ((e.clientY - r.top) * state.H) / r.height,
  };
}

function flushQueue() {
  if (!state.queue.length) return;
  // only one brush target per frame: take the leading run of items on the
  // same layer, leave the rest for the next frame
  const layerId = state.queue[0].stroke.layerId;
  let n = 0;
  while (n < state.queue.length && state.queue[n].stroke.layerId === layerId) n++;
  const batch = state.queue.splice(0, n);
  const layer = state.layers.find((l) => l.id === layerId);
  if (!layer) return;
  brush.load(layer.pg);
  for (const { stroke, seg } of batch) {
    if (!stroke.seeded) { randomSeed(stroke.seed); stroke.seeded = true; }
    drawSeg(stroke, seg);
  }
}

function drawSeg(stroke, seg) {
  const hw = state.W / 2, hh = state.H / 2;
  brush.set(stroke.brush, stroke.color, stroke.weight);
  brush.line(seg[0] - hw, seg[1] - hh, seg[2] - hw, seg[3] - hh);
}

// ---------------------------------------------------------------- versions

function timing() {
  return state.demo ? TIMING.demo : TIMING.real;
}

function ensureOpenVersion() {
  if (state.open) return;
  state.open = {
    n: state.versions.length + 1,
    strokes: [],
    tools: {},
    cells: new Set(),
    start: Date.now(),
    end: Date.now(),
    closedBy: null,
    snapshot: null,
    layers: layerMeta(),    // layer stack when the version opened, used to rebuild forks
    isNew: true,
  };
  state.versions.push(state.open);
  renderTimeline();
}

function queueClose(reason) {
  const v = state.open;
  if (!v || v.closing) return;
  if (!v.strokes.length && !state.drawing) {
    // nothing recorded yet: drop the empty version rather than closing it
    state.versions.pop();
    state.open = null;
    renderTimeline();
    return;
  }
  v.closing = true;
  state.actions.push(() => closeVersion(v, reason));
}

function closeVersion(v, reason) {
  if (state.drawing && state.open === v) {
    // a stroke is mid-flight; retry once it lands
    v.closing = false;
    return;
  }
  v.closedBy = reason;
  v.snapshot = takeSnapshot();
  state.redo = []; // a closed version is history: undo/redo stop at its boundary
  if (state.open === v) state.open = null;
  v.justClosed = true;
  renderTimeline();
}

function checkPause() {
  const v = state.open;
  if (!v || !v.strokes.length || state.drawing || v.closing) return;
  if (Date.now() - state.lastActivity >= timing().pause) queueClose("paused drawing");
}

function takeSnapshot() {
  compositeFb.draw(() => {
    clear();
    background(PAPER);
    drawLayers();
  });
  return compositeFb.get();
}

// ---------------------------------------------------------------- undo / redo

// Undo only reaches strokes in the open version: closed versions are history,
// and going back to them is what the timeline is for.
function canUndo() {
  return state.pos === null && !state.loading && !state.drawing && !!state.open && state.open.strokes.length > 0;
}

function canRedo() {
  return state.pos === null && !state.loading && !state.drawing && !!state.open && state.redo.length > 0;
}

function undo() {
  if (!canUndo()) return;
  const v = state.open;
  const s = v.strokes.pop();
  state.redo.push(s);
  if (--v.tools[s.brush] === 0) delete v.tools[s.brush];
  v.cells = new Set();
  v.strokes.forEach((st) => st.segs.forEach((seg) => markCells(v.cells, seg)));
  // pixels can't be un-drawn: clear the stroke's layer and replay what's left on it
  state.actions.push(() => {
    const layer = state.layers.find((l) => l.id === s.layerId);
    if (!layer) return;
    layer.pg.clear();
    state.rebuild = state.rebuild.filter((job) => job.layer !== layer); // quick repeat undos: replay once
    state.rebuild.push({ layer, strokes: state.versions.flatMap((x) => x.strokes).filter((x) => x.layerId === layer.id) });
  });
  state.lastActivity = Date.now();
  renderTimeline();
}

function redo() {
  if (!canRedo()) return;
  const v = state.open;
  const s = state.redo.pop();
  v.strokes.push(s);
  v.tools[s.brush] = (v.tools[s.brush] || 0) + 1;
  s.seeded = false;
  s.segs.forEach((seg) => {
    markCells(v.cells, seg);
    state.queue.push({ stroke: s, seg });
  });
  state.lastActivity = Date.now();
  renderTimeline();
}

function updateUndoUI() {
  document.getElementById("btn-undo").disabled = !canUndo();
  document.getElementById("btn-redo").disabled = !canRedo();
}

// ---------------------------------------------------------------- scrubbing

// pos runs 0 … versions.length. Version i occupies [i, i+1); the fraction
// inside it picks how many of its strokes to show. pos === null means live.
function posToTarget(pos) {
  let i = Math.min(Math.floor(pos), state.versions.length - 1);
  const f = Math.min(1, pos - i);
  // a boundary between versions reads as "end of the previous one", not "stroke 0 of the next"
  if (f === 0 && i > 0) return { i: i - 1, k: state.versions[i - 1].strokes.length };
  return { i, k: Math.round(f * state.versions[i].strokes.length) };
}

function renderPreview() {
  const { i, k } = posToTarget(state.pos);
  const p = state.preview;
  const key = i + ":" + k;
  if (p.key === key) return;

  const v = state.versions[i];
  let from = 0;
  if (p.i === i && k >= p.k) {
    from = p.k; // moving forward inside the same version: just add strokes
  } else {
    const base = i > 0 ? state.versions[i - 1].snapshot : null;
    previewPg.clear();
    previewPg.background(PAPER);
    if (base) previewPg.image(base, -state.W / 2, -state.H / 2, state.W, state.H);
  }
  if (k > from) {
    brush.load(previewPg);
    for (const s of v.strokes.slice(from, k)) {
      randomSeed(s.seed);
      for (const seg of s.segs) drawSeg(s, seg);
    }
  }
  Object.assign(p, { key, i, k });
}

function setPos(pos, { fromUser } = {}) {
  const n = state.versions.length;
  if (pos === null || n === 0 || pos >= n - 1e-6) {
    // the live end. If the last version is closed and fully shown, that's "now" too.
    pos = null;
  } else {
    pos = Math.max(0, pos);
  }
  if (fromUser) stopPlay();
  state.pos = pos;
  updatePastUI();
  updateUndoUI();
  updatePlayhead();
}

function versionBoundary(dir) {
  const n = state.versions.length;
  if (!n) return;
  const cur = state.pos === null ? n : state.pos;
  let target;
  if (dir < 0) target = Math.ceil(cur - 1e-6) - 1;
  else target = Math.floor(cur + 1e-6) + 1;
  setPos(Math.max(0, Math.min(n, target)), { fromUser: true });
}

function togglePlay() {
  if (state.playing) return stopPlay();
  if (!state.versions.some((v) => v.strokes.length)) return toast("Nothing to play yet");
  if (state.pos === null) setPos(0);
  state.playing = true;
  document.getElementById("t-play").textContent = "❚❚";
}

function stopPlay() {
  state.playing = false;
  document.getElementById("t-play").textContent = "▶";
}

function stepPlay() {
  if (state.pos === null) return stopPlay();
  let { i, k } = posToTarget(state.pos);
  const v = state.versions[i];
  if (k < v.strokes.length) k++;
  else { i++; k = 1; }
  if (i >= state.versions.length) { setPos(null); return stopPlay(); }
  const len = state.versions[i].strokes.length || 1;
  setPos(i + Math.min(k, len) / len);
  scrollPlayheadIntoView();
}

// ---------------------------------------------------------------- branches

// A branch shares every version before its fork point (the same objects), then
// has its own. Forking mid-version copies the first k strokes of that version.
// Entering a branch rebuilds its layers by replaying the recorded strokes.

function currentBranch() {
  return state.branches.find((b) => b.id === state.branchId);
}

function forkHere() {
  if (state.pos === null || state.loading) return;
  const { i, k } = posToTarget(state.pos);
  const from = state.versions[i];
  stopPlay();
  state.loading = true;
  queueClose("forked");
  state.actions.push(() => {
    const versions = state.versions.slice(0, i);
    const whole = k === from.strokes.length;
    if (whole) versions.push(from);
    else if (k > 0) versions.push(partialVersion(from, k));
    const b = { id: "B" + ++state.branchCounter, name: "fork " + state.branchCounter, versions, layers: null };
    state.branches.push(b);
    state.expanded = true; // show the new row and where it split off
    enterBranch(b, from.layers);
    toast(`Started ${b.name} from v${from.n}${whole ? "" : ` · stroke ${k}/${from.strokes.length}`}`);
  });
}

function switchBranch(id, pos = null) {
  if (id === state.branchId || state.loading) return;
  stopPlay();
  state.loading = true;
  queueClose("switched branch");
  state.actions.push(() => {
    const b = state.branches.find((x) => x.id === id);
    enterBranch(b, b.layers, pos);
  });
}

function partialVersion(v, k) {
  const strokes = v.strokes.slice(0, k);
  const tools = {};
  const cells = new Set();
  for (const s of strokes) {
    tools[s.brush] = (tools[s.brush] || 0) + 1;
    s.segs.forEach((seg) => markCells(cells, seg));
  }
  return {
    ...v, strokes, tools, cells,
    end: strokes[k - 1].t1, closedBy: "forked", snapshot: null, closing: false, forkedFrom: v,
  };
}

// runs inside draw()'s action phase
function enterBranch(b, meta, pos = null) {
  currentBranch().layers = layerMeta();
  state.branchId = b.id;
  state.versions = b.versions;
  state.open = null;
  state.pos = null;
  state.redo = [];
  Object.assign(state.preview, { key: null, i: -1, k: 0 });

  state.layers.forEach((l) => recycle(l.pg));
  state.layers = meta.map((m) => ({ ...m, pg: state.spare.pop() || createGraphics(state.W, state.H, WEBGL) }));
  state.activeLayerId = state.layers[state.layers.length - 1].id;
  const strokes = b.versions.flatMap((v) => v.strokes);
  state.rebuild = state.layers
    .map((layer) => ({ layer, strokes: strokes.filter((s) => s.layerId === layer.id) }))
    .filter((job) => job.strokes.length);
  // after the rebuilt strokes land: a partial version still needs its snapshot
  state.actions.push(() => {
    const last = b.versions[b.versions.length - 1];
    if (last && !last.snapshot) last.snapshot = takeSnapshot();
    state.loading = false;
    if (pos !== null) setPos(pos);
  });

  renderLayers();
  renderTimeline();
}

function rebuildStep() {
  const { layer, strokes } = state.rebuild.shift();
  brush.load(layer.pg);
  for (const s of strokes) {
    randomSeed(s.seed);
    for (const seg of s.segs) drawSeg(s, seg);
  }
}

// One timeline row per branch. A version is drawn once, in the row of the first
// branch that has it, so a fork's row starts at the column where it splits off.
function timelineRows() {
  const prefix = (a, b) => {
    let p = 0;
    while (p < a.versions.length && p < b.versions.length && a.versions[p] === b.versions[p]) p++;
    return p;
  };
  return state.branches.map((b, j) => {
    let start = 0, parent = -1;
    for (let k = 0; k < j; k++) {
      const p = prefix(b, state.branches[k]);
      if (parent < 0 || p > start) { start = p; parent = k; }
    }
    return { branch: b, start, parent };
  });
}

// ---------------------------------------------------------------- UI: rail, brushes, layers

function buildRail() {
  const wrap = document.getElementById("swatches");
  PALETTE.forEach((c) => {
    const b = document.createElement("button");
    b.className = "swatch" + (c.hex === state.color ? " active" : "");
    b.style.background = c.hex;
    b.title = c.name;
    b.onclick = () => {
      state.color = c.hex;
      wrap.querySelectorAll(".swatch").forEach((s) => s.classList.toggle("active", s === b));
    };
    wrap.appendChild(b);
  });
  const size = document.getElementById("size");
  size.oninput = () => {
    state.size = +size.value;
    document.getElementById("size-readout").textContent = state.size.toFixed(1);
  };
}

function buildTray() {
  const tray = document.getElementById("tray");
  BRUSHES.forEach((b) => {
    const el = document.createElement("button");
    el.className = "tool" + (b.id === state.brush ? " active" : "");
    el.innerHTML = ICONS[b.id] + `<span>${b.label}</span>`;
    el.title = `p5.brush "${b.id}"`;
    el.onclick = () => {
      state.brush = b.id;
      tray.querySelectorAll(".tool").forEach((t) => t.classList.toggle("active", t === el));
    };
    tray.appendChild(el);
  });
}

function renderLayers() {
  const list = document.getElementById("layer-list");
  list.innerHTML = "";
  [...state.layers].reverse().forEach((l) => {
    const li = document.createElement("li");
    li.className = "layer" + (l.id === state.activeLayerId ? " active" : "") + (l.visible ? "" : " hidden-layer");
    li.innerHTML = `
      <button class="icon-btn eye" title="${l.visible ? "Hide" : "Show"}">${l.visible ? ICONS.eye : ICONS.eyeOff}</button>
      <span class="layer-name">${l.name}</span>
      <button class="icon-btn del" title="Delete layer">${ICONS.trash}</button>
      ${l.id === state.activeLayerId ? `<label class="layer-opacity">opacity <input type="range" min="0" max="1" step="0.05" value="${l.opacity}"></label>` : ""}`;
    li.onclick = () => { state.activeLayerId = l.id; renderLayers(); };
    li.querySelector(".eye").onclick = (e) => { e.stopPropagation(); l.visible = !l.visible; renderLayers(); };
    li.querySelector(".del").onclick = (e) => { e.stopPropagation(); deleteLayer(l.id); };
    const op = li.querySelector(".layer-opacity input");
    if (op) {
      op.onclick = (e) => e.stopPropagation();
      op.oninput = () => { l.opacity = +op.value; };
    }
    list.appendChild(li);
  });
}

// ---------------------------------------------------------------- UI: timeline

const chipPitch = () => {
  const cs = getComputedStyle(document.documentElement);
  return { w: parseFloat(cs.getPropertyValue("--chip-w")), gap: parseFloat(cs.getPropertyValue("--chip-gap")) };
};

const ROW_H = 56, ROW_GAP = 8;

function renderTimeline() {
  const chips = document.getElementById("chips");
  const { w, gap } = chipPitch();
  const pitch = w + gap;
  const rows = state.expanded ? timelineRows() : [{ branch: currentBranch(), start: 0, parent: -1 }];
  state.rows = rows;
  const maxCells = Math.max(1, ...state.branches.flatMap((b) => b.versions.map((v) => v.cells.size)));
  chips.innerHTML = "";

  rows.forEach(({ branch, start }, r) => {
    const row = document.createElement("div");
    row.className = "row" + (branch.id === state.branchId ? " current-row" : "");
    row.dataset.b = branch.id;
    row.style.paddingLeft = start * pitch + "px";
    if (rows.length > 1) row.innerHTML = `<span class="row-name">${branch.name}</span>`;
    chips.appendChild(row);

    if (!branch.versions.length && r === 0) {
      const el = document.createElement("div");
      el.className = "chip empty";
      el.innerHTML = '<span class="chip-label">now</span>';
      row.appendChild(el);
    }

    branch.versions.slice(start).forEach((v, j) => {
      const el = document.createElement("div");
      const dominant = Object.entries(v.tools).sort((a, b) => b[1] - a[1])[0];
      el.className = "chip" + (v === state.open ? " open" : "") + (v.justClosed ? " landed" : "");
      v.justClosed = false;
      el.dataset.i = start + j;
      el.version = v;
      el.innerHTML =
        `<div class="meter" style="height:${Math.round((v.cells.size / maxCells) * 100)}%"></div>` +
        (dominant ? ICONS[dominant[0]] : '<svg viewBox="0 0 32 32"></svg>') +
        `<span class="chip-label">${v === state.open ? "now" : "v" + v.n}</span>`;
      el.addEventListener("mouseenter", () => showTooltip(el, v));
      el.addEventListener("mouseleave", hideTooltip);
      row.appendChild(el);
    });
  });

  renderConnectors(rows, pitch, w);

  document.getElementById("hint").hidden = !(state.showHint && state.versions.filter((v) => v.closedBy).length === 0);
  const closed = state.versions.filter((v) => v.closedBy).length;
  const strokes = state.versions.reduce((a, v) => a + v.strokes.length, 0);
  const toggle = document.getElementById("btn-rows");
  toggle.hidden = state.branches.length < 2;
  toggle.setAttribute("aria-expanded", state.expanded);
  toggle.textContent = state.expanded ? `▾ ${state.branches.length} branches` : `▸ ${currentBranch().name} only`;
  toggle.title = state.expanded ? "Collapse to the current branch" : "Show every branch";

  document.getElementById("timeline-meta").innerHTML =
    (rows.length > 1 ? `${currentBranch().name}<br>` : "") +
    `${closed} version${closed === 1 ? "" : "s"}<br>${strokes} stroke${strokes === 1 ? "" : "s"}` +
    (state.open ? '<br><span style="color:var(--red)">● recording</span>' : "");
  updatePlayhead();
  updatePastUI();
  updateUndoUI();
  fitCanvas();

  // past 3 rows the area scrolls; keep the current branch's row on screen
  const sc = document.getElementById("track-scroll");
  const cur = chips.querySelector(".current-row");
  if (cur && (cur.offsetTop < sc.scrollTop || cur.offsetTop + ROW_H > sc.scrollTop + sc.clientHeight)) {
    sc.scrollTop = cur.offsetTop;
  }
}

// the line from where a fork splits off down into its row
function renderConnectors(rows, pitch, w) {
  const svg = document.getElementById("connectors");
  const rowY = (r) => r * (ROW_H + ROW_GAP);
  const chipTop = (ROW_H - 48) / 2;
  const paths = rows.slice(1).map(({ branch, start, parent }, j) => {
    const r = j + 1;
    const y1 = rowY(parent) + chipTop + 48;
    const first = branch.versions[start];
    // a mid-version fork (or one from a blank canvas) sits right under its source
    if (!first || start === 0 || first.forkedFrom) {
      const x = start * pitch + w / 2;
      return `M${x} ${y1}V${rowY(r) + chipTop}`;
    }
    const x1 = (start - 1) * pitch + w / 2;
    const ym = rowY(r) + ROW_H / 2;
    return `M${x1} ${y1}V${ym - 10}Q${x1} ${ym} ${x1 + 10} ${ym}H${start * pitch}`;
  });
  const h = rows.length * (ROW_H + ROW_GAP);
  svg.setAttribute("height", h);
  svg.innerHTML = paths.map((d) => `<path d="${d}"/>`).join("");
}

function updatePlayhead() {
  const ph = document.getElementById("playhead");
  const { w, gap } = chipPitch();
  const n = state.versions.length;
  let x;
  if (!n) x = 64;
  else if (state.pos === null) x = n * (w + gap) - gap;
  else {
    const i = Math.floor(state.pos);
    x = i * (w + gap) + (state.pos - i) * w;
  }
  ph.style.left = x + "px";
  const r = state.rows.findIndex((row) => row.branch.id === state.branchId);
  ph.style.top = r * (ROW_H + ROW_GAP) + "px";
  ph.style.height = ROW_H + "px";

  // shared versions sit in an earlier row, but they're still this branch's past
  const viewing = state.pos !== null && n > 0;
  const cur = viewing ? posToTarget(state.pos).i : -1;
  document.querySelectorAll(".chip[data-i]").forEach((el) => {
    const i = state.versions.indexOf(el.version);
    el.classList.toggle("past", viewing && i >= 0 && i < cur);
    el.classList.toggle("current", viewing && i >= 0 && i === cur);
    el.classList.toggle("future", viewing && i > cur);
  });
}

// the canvas keeps its pixel size; CSS scales it down when fork rows make the timeline taller
function fitCanvas() {
  if (!canvasEl) return;
  const st = document.getElementById("stage");
  const cs = getComputedStyle(st);
  const availW = st.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const availH = st.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const k = Math.min(1, availW / state.W, availH / state.H);
  canvasEl.style.width = state.W * k + "px";
  canvasEl.style.height = state.H * k + "px";
}

function scrollPlayheadIntoView() {
  const sc = document.getElementById("track-scroll");
  const ph = document.getElementById("playhead");
  const x = ph.offsetLeft;
  if (x < sc.scrollLeft + 40 || x > sc.scrollLeft + sc.clientWidth - 40) sc.scrollLeft = x - sc.clientWidth / 2;
}

function updatePastUI() {
  const stage = document.getElementById("stage");
  const banner = document.getElementById("past-banner");
  const viewing = state.pos !== null && state.versions.length;
  stage.classList.toggle("viewing-past", !!viewing);
  banner.hidden = !viewing;
  if (!viewing) {
    document.getElementById("past-notice").hidden = true;
    return;
  }
  const { i, k } = posToTarget(state.pos);
  const v = state.versions[i];
  const when = new Date(k > 0 ? v.strokes[k - 1].t1 : v.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
  const branch = state.branches.length > 1 ? currentBranch().name + " · " : "";
  document.getElementById("past-text").textContent = `Viewing ${branch}v${v.n} · stroke ${k}/${v.strokes.length} · ${when}`;
}

function bindTimeline() {
  const track = document.getElementById("track");
  const at = (e) => {
    const { w, gap } = chipPitch();
    const r = document.getElementById("chips").getBoundingClientRect();
    const x = e.clientX - r.left;
    const i = Math.floor(x / (w + gap));
    const f = Math.max(0, Math.min(1, (x - i * (w + gap)) / w));
    const row = Math.floor((e.clientY - r.top) / (ROW_H + ROW_GAP));
    return { pos: Math.max(0, i + f), i, row };
  };
  const scrubTo = (e) => {
    const n = state.versions.length;
    if (!n) return;
    const { pos, i } = at(e);
    setPos(i >= n ? null : pos, { fromUser: true });
  };
  track.addEventListener("pointerdown", (e) => {
    const { pos, i, row } = at(e);
    const b = state.rows[row]?.branch;
    if (b && b.id !== state.branchId) {
      // tapping another branch's row moves to that branch, at the tapped version
      hideTooltip();
      return switchBranch(b.id, i >= b.versions.length ? null : pos);
    }
    if (!state.versions.length) return;
    try { track.setPointerCapture(e.pointerId); } catch {}
    track.classList.add("dragging");
    hideTooltip();
    scrubTo(e);
  });
  track.addEventListener("pointermove", (e) => { if (track.classList.contains("dragging")) scrubTo(e); });
  const stopDrag = () => track.classList.remove("dragging");
  track.addEventListener("pointerup", stopDrag);
  track.addEventListener("pointercancel", stopDrag);
  window.addEventListener("resize", fitCanvas);

  document.getElementById("t-start").onclick = () => state.versions.length && setPos(0, { fromUser: true });
  document.getElementById("t-prev").onclick = () => versionBoundary(-1);
  document.getElementById("t-next").onclick = () => versionBoundary(1);
  document.getElementById("t-now").onclick = () => setPos(null, { fromUser: true });
  document.getElementById("t-play").onclick = togglePlay;
  document.getElementById("btn-now").onclick = () => setPos(null, { fromUser: true });
  document.getElementById("btn-fork").onclick = forkHere;
  document.getElementById("notice-fork").onclick = forkHere;

  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      return e.shiftKey ? redo() : undo();
    }
    if (e.key === "ArrowLeft") versionBoundary(-1);
    else if (e.key === "ArrowRight") versionBoundary(1);
    else if (e.key === "Escape") setPos(null, { fromUser: true });
    else if (e.key === " ") { e.preventDefault(); togglePlay(); }
  });
}

function showTooltip(el, v) {
  if (document.getElementById("track").classList.contains("dragging")) return;
  const tip = document.getElementById("tooltip");
  const r = el.getBoundingClientRect();
  const dur = Math.max(0, Math.round(((v.strokes.length ? v.end : Date.now()) - v.start) / 1000));
  const mins = Math.floor(dur / 60), secs = String(dur % 60).padStart(2, "0");
  const pct = Math.round((v.cells.size / (GRID * GRID)) * 100);
  const tools = Object.entries(v.tools).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t}×${c}`).join(", ") || "none yet";
  const sizes = [...new Set(v.strokes.map((s) => s.weight))].join(", ");
  tip.innerHTML =
    `<b>${v === state.open ? "now (recording)" : "v" + v.n}</b> · ${new Date(v.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}<br>` +
    `${v.strokes.length} strokes · ${mins}:${secs} · ${pct}% of canvas<br>` +
    `tools: ${tools}${sizes ? `<br>sizes: ${sizes}` : ""}` +
    (v.closedBy ? `<br>closed by: <b>${v.closedBy}</b>` : "") +
    (v.forkedFrom ? `<br>first ${v.strokes.length} of v${v.n}'s ${v.forkedFrom.strokes.length} strokes` : "");
  tip.style.left = r.left + r.width / 2 + "px";
  tip.style.top = r.top - 8 + "px";
  tip.hidden = false;
}

function hideTooltip() {
  document.getElementById("tooltip").hidden = true;
}

// ---------------------------------------------------------------- UI: misc

function bindTopbar() {
  document.getElementById("btn-add-layer").onclick = () => addLayer();
  document.getElementById("btn-undo").onclick = undo;
  document.getElementById("btn-rows").onclick = () => { state.expanded = !state.expanded; renderTimeline(); };
  document.getElementById("btn-redo").onclick = redo;
  document.getElementById("opt-demo").onchange = (e) => { state.demo = e.target.checked; };
  document.getElementById("opt-hint").onchange = (e) => { state.showHint = e.target.checked; renderTimeline(); };
  document.getElementById("btn-export").onclick = () => {
    state.actions.push(() => takeSnapshot().save("rewind-final", "png"));
  };
}

function showPastNotice() {
  const n = document.getElementById("past-notice");
  n.hidden = false;
  clearTimeout(showPastNotice.t);
  showPastNotice.t = setTimeout(() => (n.hidden = true), 4000);
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 2400);
}
