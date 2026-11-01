import { useRef, type PointerEvent } from 'react';

/**
 * Captures the pointer on press and reports every position until release.
 * Used by the sliders.
 */
export function usePointerDrag(onDrag: (e: PointerEvent<HTMLElement>) => void, onEnd?: () => void) {
  const active = useRef<number | null>(null);
  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      active.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
      onDrag(e);
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      if (active.current === e.pointerId) onDrag(e);
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      if (active.current !== e.pointerId) return;
      active.current = null;
      onEnd?.();
    },
    onPointerCancel(e: PointerEvent<HTMLElement>) {
      if (active.current !== e.pointerId) return;
      active.current = null;
      onEnd?.();
    },
  };
}
