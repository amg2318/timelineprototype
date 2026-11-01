import { useEffect, useRef, type PointerEvent } from 'react';
import { brushes, sizeToWidth, type Pt, type StrokeState } from '../brushes';
import { posToTarget, type Stroke } from '../history';
import { compositeDoc, createCanvas, ctx2d, DOC_H, DOC_W, getLayerCanvas } from '../layerStore';
import { beginPaint, mergeBuffer, renderPreview, strokeState } from '../replay';
import { rewind, useStore } from '../store';

interface Active {
  pointerId: number;
  stroke: Stroke;
  state: StrokeState;
}

/**
 * Strokes are painted at full strength into a buffer, then merged onto a copy
 * of the layer taken at pen-down, so overlapping segments don't build up
 * opacity within a single stroke.
 */
export function DrawingCanvas() {
  const { doc, pixelVersion, pos, branchId, viewing } = useStore();
  const view = useRef<HTMLCanvasElement>(null);
  const scratch = useRef<{ before: HTMLCanvasElement; buffer: HTMLCanvasElement }>();
  const active = useRef<Active | null>(null);
  const frame = useRef(0);
  const penSeen = useRef(false);

  const render = () => {
    const ctx = ctx2d(view.current!);
    if (rewind.pos === null || !rewind.versions.length) return compositeDoc(rewind.doc, ctx);
    const { i, k } = posToTarget(rewind.versions, rewind.pos);
    const v = rewind.versions[i];
    renderPreview(rewind.versions, i, k, v === rewind.open ? rewind.doc.items : v.stack, ctx);
  };

  useEffect(render, [doc, pixelVersion, pos, branchId]);

  const buffers = () => (scratch.current ??= { before: createCanvas(), buffer: createCanvas() });

  const merge = () => {
    const a = active.current;
    if (!a) return;
    const { before, buffer } = buffers();
    const ctx = ctx2d(getLayerCanvas(a.stroke.layerId));
    ctx.clearRect(0, 0, DOC_W, DOC_H);
    ctx.drawImage(before, 0, 0);
    mergeBuffer(a.stroke, buffer, ctx);
    render();
  };

  const scheduleMerge = () => {
    if (!frame.current) {
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        merge();
      });
    }
  };

  const toPoint = (e: PointerEvent | globalThis.PointerEvent): Pt => {
    const r = view.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * DOC_W,
      y: ((e.clientY - r.top) / r.height) * DOC_H,
      p: e.pointerType === 'pen' ? e.pressure || 0.5 : 0.7,
    };
  };

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.pointerType === 'pen') penSeen.current = true;
    // Palm rejection: once a stylus is in use, fingers don't paint.
    if (e.pointerType === 'touch' && penSeen.current) return;
    if (active.current) return;
    const layerId = rewind.beginStroke();
    if (!layerId) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    const { before, buffer } = buffers();
    const beforeCtx = ctx2d(before);
    beforeCtx.clearRect(0, 0, DOC_W, DOC_H);
    beforeCtx.drawImage(getLayerCanvas(layerId), 0, 0);
    const bufCtx = ctx2d(buffer);
    bufCtx.clearRect(0, 0, DOC_W, DOC_H);

    const { tool, color, size, opacity } = rewind.brush;
    const stroke: Stroke = {
      tool,
      color,
      width: sizeToWidth(size),
      opacity,
      layerId,
      seed: Math.floor(Math.random() * 2 ** 32),
      points: [toPoint(e)],
      t0: Date.now(),
      t1: 0,
    };
    const state = strokeState(stroke, bufCtx);
    active.current = { pointerId: e.pointerId, stroke, state };
    beginPaint(stroke, state);
    scheduleMerge();
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const a = active.current;
    if (!a || a.pointerId !== e.pointerId) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const pt = toPoint(ev);
      a.stroke.points.push(pt);
      brushes[a.stroke.tool].move(a.state, pt);
    }
    scheduleMerge();
  };

  const onPointerEnd = (e: PointerEvent<HTMLCanvasElement>) => {
    const a = active.current;
    if (!a || a.pointerId !== e.pointerId) return;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    merge();
    active.current = null;
    a.stroke.t1 = Date.now();
    rewind.finishStroke(a.stroke);
  };

  return (
    <canvas
      ref={view}
      className={`drawing-canvas ${viewing ? 'is-past' : ''}`}
      width={DOC_W}
      height={DOC_H}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    />
  );
}
