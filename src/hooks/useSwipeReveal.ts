import { useRef, useState, type PointerEvent, type MouseEvent } from 'react';

const SLOP = 8;
const SWIPE_RIGHT_TRIGGER = 40;

/**
 * Procreate-style swipe-left-to-reveal, with an optional swipe-right action.
 * Vertical drags are left to the browser (the element should have
 * `touch-action: pan-y`).
 */
export function useSwipeReveal(
  actionsWidth: number,
  open: boolean,
  setOpen: (open: boolean) => void,
  onSwipeRight?: () => void,
) {
  const [drag, setDrag] = useState<number | null>(null);
  const gesture = useRef<{ x: number; y: number; dx: number; horizontal: boolean } | null>(null);
  const swallowClick = useRef(false);
  const base = open ? -actionsWidth : 0;

  const onPointerDown = (e: PointerEvent) => {
    gesture.current = { x: e.clientX, y: e.clientY, dx: 0, horizontal: false };
    swallowClick.current = false;
  };

  const onPointerMove = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.horizontal) {
      if (Math.abs(dx) > SLOP && Math.abs(dx) > Math.abs(dy)) {
        g.horizontal = true;
        swallowClick.current = true;
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      } else {
        if (Math.abs(dy) > SLOP) gesture.current = null;
        return;
      }
    }
    g.dx = dx;
    const raw = base + dx;
    // Swiping right gets a short rubber-band nudge as feedback.
    setDrag(raw > 0 ? (onSwipeRight && !open ? Math.min(raw * 0.4, 24) : 0) : Math.max(-actionsWidth, raw));
  };

  const onPointerEnd = () => {
    const g = gesture.current;
    if (g?.horizontal && drag !== null) {
      if (drag > 0) {
        if (g.dx > SWIPE_RIGHT_TRIGGER) onSwipeRight?.();
      } else {
        setOpen(drag < -actionsWidth / 2);
      }
    }
    gesture.current = null;
    setDrag(null);
  };

  const onClickCapture = (e: MouseEvent) => {
    if (swallowClick.current) {
      e.stopPropagation();
      swallowClick.current = false;
    } else if (open) {
      // Tapping an open row closes it instead of activating it.
      e.stopPropagation();
      setOpen(false);
    }
  };

  return {
    offset: drag ?? base,
    dragging: drag !== null,
    bind: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd, onClickCapture },
  };
}
