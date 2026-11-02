import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { usePointerDrag } from '../hooks/usePointerDrag';

const MIN_THUMB = 44; // keeps the thumb big enough to grab with a finger

/**
 * A visible, draggable horizontal scrollbar for the timeline. It's drawn by hand
 * because iPad browsers don't show a scrollbar you can drag.
 */
export function TrackScrollbar({ target }: { target: RefObject<HTMLDivElement> }) {
  const [thumb, setThumb] = useState({ show: false, x: 0, w: 0 });
  const grab = useRef(0);

  useEffect(() => {
    const sc = target.current!;
    const measure = () => {
      const max = sc.scrollWidth - sc.clientWidth;
      const w = Math.max(MIN_THUMB, (sc.clientWidth / sc.scrollWidth) * sc.clientWidth);
      const x = max > 0 ? (sc.scrollLeft / max) * (sc.clientWidth - w) : 0;
      setThumb({ show: max > 0, x, w });
    };
    const resize = new ResizeObserver(measure);
    resize.observe(sc);
    resize.observe(sc.firstElementChild!); // the track grows with each version
    sc.addEventListener('scroll', measure, { passive: true });
    measure();
    return () => {
      resize.disconnect();
      sc.removeEventListener('scroll', measure);
    };
  }, [target]);

  const drag = usePointerDrag((e) => {
    const sc = target.current!;
    const bar = e.currentTarget.getBoundingClientRect();
    const room = bar.width - thumb.w;
    sc.scrollLeft = ((e.clientX - bar.left - grab.current) / room) * (sc.scrollWidth - sc.clientWidth);
  });

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const inThumb = e.clientX - e.currentTarget.getBoundingClientRect().left - thumb.x;
    // hold the thumb where it was grabbed; pressing the rail centers it there
    grab.current = inThumb >= 0 && inThumb <= thumb.w ? inThumb : thumb.w / 2;
    drag.onPointerDown(e);
  };

  return (
    <div
      className="track-scrollbar"
      style={{ visibility: thumb.show ? 'visible' : 'hidden' }}
      {...drag}
      onPointerDown={onPointerDown}
    >
      <div className="track-scrollbar-thumb" style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }} />
    </div>
  );
}
