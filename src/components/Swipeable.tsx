import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useSwipeReveal } from '../hooks/useSwipeReveal';

export interface SwipeAction {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

interface Props {
  actions: SwipeAction[];
  open: boolean;
  setOpen: (open: boolean) => void;
  onSwipeRight?: () => void;
  className?: string;
  children: ReactNode;
}

export function Swipeable({ actions, open, setOpen, onSwipeRight, className = '', children }: Props) {
  const actionsRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => setWidth(actionsRef.current!.offsetWidth));
  const { offset, dragging, bind } = useSwipeReveal(width, open, setOpen, onSwipeRight);
  return (
    <div className={`swipe ${className}`}>
      <div className="swipe-actions" ref={actionsRef} aria-hidden={!open}>
        {actions.map((a) => (
          <button
            key={a.label}
            className="swipe-action"
            disabled={a.disabled}
            tabIndex={open ? 0 : -1}
            onClick={() => {
              setOpen(false);
              a.onSelect();
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
      <div
        className="swipe-content"
        style={{ transform: `translateX(${offset}px)`, transition: dragging ? 'none' : undefined }}
        {...bind}
      >
        {children}
      </div>
    </div>
  );
}
