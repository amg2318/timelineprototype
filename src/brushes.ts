import type { Tool } from './model';

export interface Pt {
  x: number;
  y: number;
  /** Normalised pressure, 0–1. */
  p: number;
}

export interface StrokeState {
  ctx: CanvasRenderingContext2D; // stroke buffer, painted at full opacity
  color: string;
  width: number; // base width in document pixels
  last: Pt | null;
  carry: number; // distance left over since the last stamp
  rng: () => number; // seeded per stroke, so a replay lays down the same marks
}

interface Brush {
  begin(s: StrokeState, pt: Pt): void;
  move(s: StrokeState, pt: Pt): void;
  /** Extra opacity multiplier applied when the buffer is merged into the layer. */
  alpha: number;
}

const rand = (s: StrokeState, r: number) => (s.rng() * 2 - 1) * r;

/** Call `stamp` at even spacing along the segment from s.last to pt. */
function walk(s: StrokeState, pt: Pt, spacing: number, stamp: (x: number, y: number, p: number) => void) {
  const a = s.last ?? pt;
  const dist = Math.hypot(pt.x - a.x, pt.y - a.y);
  let d = spacing - s.carry;
  while (d <= dist) {
    const t = dist === 0 ? 0 : d / dist;
    stamp(a.x + (pt.x - a.x) * t, a.y + (pt.y - a.y) * t, a.p + (pt.p - a.p) * t);
    d += spacing;
  }
  s.carry = dist - (d - spacing);
  s.last = pt;
}

function line(s: StrokeState, pt: Pt, width: number, cap: CanvasLineCap = 'round') {
  const a = s.last ?? pt;
  const { ctx } = s;
  ctx.strokeStyle = s.color;
  ctx.lineCap = cap;
  ctx.lineJoin = 'round';
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(pt.x + (a === pt ? 0.01 : 0), pt.y);
  ctx.stroke();
  s.last = pt;
}

const pressureWidth = (s: StrokeState, p: number) => s.width * (0.3 + 0.7 * p);

const pen: Brush = {
  alpha: 1,
  begin: (s, pt) => line(s, pt, pressureWidth(s, pt.p)),
  move: (s, pt) => line(s, pt, pressureWidth(s, pt.p)),
};

const pencilStamp = (s: StrokeState) => (x: number, y: number, p: number) => {
  const r = Math.max(1, s.width * 0.25 * (0.4 + 0.6 * p));
  s.ctx.fillStyle = s.color;
  for (let i = 0; i < 4; i++) {
    s.ctx.globalAlpha = 0.25 + s.rng() * 0.35;
    s.ctx.fillRect(x + rand(s, r), y + rand(s, r), 1.6, 1.6);
  }
  s.ctx.globalAlpha = 1;
};

const pencil: Brush = {
  alpha: 1,
  begin: (s, pt) => pencilStamp(s)(pt.x, pt.y, pt.p),
  move: (s, pt) => walk(s, pt, 1, pencilStamp(s)),
};

const marker: Brush = {
  alpha: 0.6,
  begin: (s, pt) => line(s, pt, s.width * 1.6, 'square'),
  move: (s, pt) => line(s, pt, s.width * 1.6, 'square'),
};

const softStamp = (s: StrokeState) => (x: number, y: number, p: number) => {
  const r = s.width * 1.4;
  const g = s.ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, s.color);
  g.addColorStop(1, 'transparent');
  s.ctx.globalAlpha = 0.08 + 0.12 * p;
  s.ctx.fillStyle = g;
  s.ctx.fillRect(x - r, y - r, r * 2, r * 2);
  s.ctx.globalAlpha = 1;
};

const soft: Brush = {
  alpha: 1,
  begin: (s, pt) => softStamp(s)(pt.x, pt.y, pt.p),
  move: (s, pt) => walk(s, pt, Math.max(2, s.width * 0.2), softStamp(s)),
};

const sprayStamp = (s: StrokeState) => (x: number, y: number, p: number) => {
  const r = s.width * 1.8;
  s.ctx.fillStyle = s.color;
  const n = Math.ceil(6 + 10 * p);
  for (let i = 0; i < n; i++) {
    const a = s.rng() * Math.PI * 2;
    const d = Math.sqrt(s.rng()) * r;
    s.ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, 2, 2);
  }
};

const spray: Brush = {
  alpha: 1,
  begin: (s, pt) => sprayStamp(s)(pt.x, pt.y, pt.p),
  move: (s, pt) => walk(s, pt, Math.max(3, s.width * 0.4), sprayStamp(s)),
};

export const brushes: Record<Tool, Brush> = { pen, pencil, marker, soft, spray, erase: pen };

/** Map the 0–1 size slider to a base width in document pixels. */
export const sizeToWidth = (size: number) => 2 + Math.pow(size, 1.5) * 70;
