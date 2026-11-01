import { useRef } from 'react';
import { usePointerDrag } from '../hooks/usePointerDrag';
import { useStore } from '../store';

// Swatch colours from the Figma file, in row order.
const SWATCHES = [
  '#1D1B19', '#8B8580',
  '#00A08F', '#006149',
  '#7BCDE9', '#E1B576',
  '#F25A06', '#FB7077',
  '#C600A4', '#F5EEE2',
];

function VSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const drag = usePointerDrag((e) => {
    const r = track.current!.getBoundingClientRect();
    onChange(Math.min(1, Math.max(0.01, 1 - (e.clientY - r.top) / r.height)));
  });
  return (
    <div className="setting">
      <span className="setting-label">{label}</span>
      <span className="setting-value">{Math.round(value * 100)}%</span>
      <div
        ref={track}
        className="vslider"
        role="slider"
        aria-label={label}
        aria-valuenow={Math.round(value * 100)}
        aria-valuemin={1}
        aria-valuemax={100}
        {...drag}
      >
        <div className="vslider-handle" style={{ top: `calc(${(1 - value) * 100}% - ${(1 - value) * 9}px)` }} />
      </div>
    </div>
  );
}

export function BrushSettings() {
  const { brush, setBrush } = useStore();
  return (
    <div className="rail settings-rail">
      <div className="setting">
        <span className="setting-label">Color</span>
        <div className="swatches">
          {SWATCHES.map((c) => (
            <button
              key={c}
              className={`swatch ${brush.color === c ? 'is-active' : ''}`}
              style={{ background: c }}
              aria-label={c}
              aria-pressed={brush.color === c}
              onClick={() => setBrush({ color: c })}
            />
          ))}
        </div>
      </div>
      <VSlider label="Size" value={brush.size} onChange={(size) => setBrush({ size })} />
      <VSlider label="Opacity" value={brush.opacity} onChange={(opacity) => setBrush({ opacity })} />
    </div>
  );
}
