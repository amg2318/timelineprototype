import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';

const HOLD_MS = 350;
const SLOP = 8;

interface Drag {
  id: string;
  pointerId: number;
  startY: number;
  dy: number;
  from: number;
  to: number;
  rects: DOMRect[];
  /** How far siblings slide to make room: the dragged item's height plus the list gap. */
  shift: number;
  moved: boolean;
}

const blockScroll = (e: TouchEvent) => e.preventDefault();

/**
 * Press-and-hold lifts an item: release in place to call `onHold`, or drag to
 * reorder. Mice can also drag straight away; touch must hold first so plain
 * vertical drags still scroll the list.
 */
export function useReorder(ids: string[], onMove: (from: number, to: number) => void, onHold?: (id: string) => void) {
  const els = useRef(new Map<string, HTMLElement>());
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const pending = useRef<{ id: string; pointerId: number; x: number; y: number; type: string } | null>(null);
  const timer = useRef(0);
  const swallowClick = useRef(false);

  const update = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };

  useEffect(() => () => {
    clearTimeout(timer.current);
    document.removeEventListener('touchmove', blockScroll);
  }, []);

  const begin = (id: string, pointerId: number, y: number, el: HTMLElement) => {
    const rects = ids.map((i) => els.current.get(i)!.getBoundingClientRect());
    const from = ids.indexOf(id);
    const gap = rects.length > 1 ? Math.max(0, rects[1].top - rects[0].bottom) : 0;
    try {
      el.setPointerCapture(pointerId);
    } catch {
      // The pointer may already be gone if the hold timer fired late.
    }
    // Stop iOS from turning the drag into a scroll once the item is lifted.
    document.addEventListener('touchmove', blockScroll, { passive: false });
    update({ id, pointerId, startY: y, dy: 0, from, to: from, rects, shift: rects[from].height + gap, moved: false });
  };

  const end = (pointerId: number, commit: boolean) => {
    clearTimeout(timer.current);
    pending.current = null;
    const d = dragRef.current;
    if (!d || d.pointerId !== pointerId) return;
    document.removeEventListener('touchmove', blockScroll);
    swallowClick.current = true;
    update(null);
    if (!commit) return;
    if (!d.moved) onHold?.(d.id);
    else if (d.to !== d.from) onMove(d.from, d.to);
  };

  const itemStyle = (id: string, index: number): CSSProperties | undefined => {
    if (!drag) return undefined;
    if (id === drag.id) return { transform: `translateY(${drag.dy}px) scale(1.02)`, transition: 'none' };
    let offset = 0;
    if (drag.from < drag.to && index > drag.from && index <= drag.to) offset = -drag.shift;
    if (drag.to < drag.from && index >= drag.to && index < drag.from) offset = drag.shift;
    return { transform: `translateY(${offset}px)`, transition: 'transform 0.15s ease' };
  };

  const bind = (id: string) => ({
    ref: (el: HTMLElement | null) => (el ? els.current.set(id, el) : els.current.delete(id)),
    className: `reorder-item ${drag?.id === id ? 'is-lifted' : ''}`,
    style: itemStyle(id, ids.indexOf(id)),
    onPointerDown(e: PointerEvent<HTMLElement>) {
      // Nested lists (layers inside a group card) shouldn't also lift the parent.
      e.stopPropagation();
      swallowClick.current = false;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const el = e.currentTarget;
      pending.current = { id, pointerId: e.pointerId, x: e.clientX, y: e.clientY, type: e.pointerType };
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const p = pending.current;
        if (!p) return;
        pending.current = null;
        begin(p.id, p.pointerId, p.y, el);
      }, HOLD_MS);
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const p = pending.current;
      if (p && p.pointerId === e.pointerId) {
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        if (Math.hypot(dx, dy) <= SLOP) return;
        clearTimeout(timer.current);
        pending.current = null;
        if (p.type !== 'mouse' || Math.abs(dy) < Math.abs(dx)) return;
        begin(id, e.pointerId, p.y, e.currentTarget);
      }
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      const dy = e.clientY - d.startY;
      const center = d.rects[d.from].top + d.rects[d.from].height / 2 + dy;
      let to = d.from;
      for (let i = d.from + 1; i < d.rects.length; i++) if (center > d.rects[i].top + d.rects[i].height / 2) to = i;
      for (let i = d.from - 1; i >= 0; i--) if (center < d.rects[i].top + d.rects[i].height / 2) to = i;
      update({ ...d, dy, to, moved: d.moved || Math.abs(dy) > 3 });
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => end(e.pointerId, true),
    onPointerCancel: (e: PointerEvent<HTMLElement>) => end(e.pointerId, false),
    onClickCapture(e: MouseEvent) {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      e.stopPropagation();
    },
    onContextMenu: (e: MouseEvent) => e.preventDefault(),
  });

  return { bind };
}
