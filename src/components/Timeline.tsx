import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { GRID, posToTarget, timelineRows, type Row, type Version } from '../history';
import type { Tool } from '../model';
import { useStore } from '../store';
import { ToolIcon, TOOLS } from './ToolIcon';
import { TrackScrollbar } from './TrackScrollbar';

// Keep in step with --chip-w and --chip-gap in styles.css.
const CHIP_W = 44;
const CHIP_GAP = 4;
const PITCH = CHIP_W + CHIP_GAP;
const CHIP_H = 48;
const ROW_H = 56;
const ROW_GAP = 8;
const FOLLOW_MARGIN = 56; // room for a whole chip when following the playhead

const dominantTool = (v: Version) => {
  const top = (Object.entries(v.tools) as [Tool, number][]).sort((a, b) => b[1] - a[1])[0];
  return top && TOOLS.find((t) => t.tool === top[0])!.icon;
};

/** The line from where a fork splits off down into its row. */
function connectorPath({ branch, start, parent }: Row, r: number) {
  const rowY = (n: number) => n * (ROW_H + ROW_GAP);
  const chipTop = (ROW_H - CHIP_H) / 2;
  const y1 = rowY(parent) + chipTop + CHIP_H;
  const first = branch.versions[start];
  // a mid-version fork (or one from a blank canvas) sits right under its source
  if (!first || start === 0 || first.forkedFrom) {
    const x = start * PITCH + CHIP_W / 2;
    return `M${x} ${y1}V${rowY(r) + chipTop}`;
  }
  const x1 = (start - 1) * PITCH + CHIP_W / 2;
  const ym = rowY(r) + ROW_H / 2;
  return `M${x1} ${y1}V${ym - 10}Q${x1} ${ym} ${x1 + 10} ${ym}H${start * PITCH}`;
}

function Tooltip({ v, rect, isOpen }: { v: Version; rect: DOMRect; isOpen: boolean }) {
  const dur = Math.max(0, Math.round(((v.strokes.length ? v.end : Date.now()) - v.start) / 1000));
  const pct = Math.round((v.cells.size / (GRID * GRID)) * 100);
  const tools = Object.entries(v.tools)
    .sort((a, b) => b[1] - a[1])
    .map(([t, c]) => `${t}×${c}`)
    .join(', ');
  const sizes = [...new Set(v.strokes.map((s) => `${Math.round(s.width)}px`))].join(', ');
  return (
    <div className="tooltip" style={{ left: rect.left + rect.width / 2, top: rect.top - 8 }}>
      <b>{isOpen ? 'now (recording)' : `v${v.n}`}</b> ·{' '}
      {new Date(v.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
      <br />
      {v.strokes.length} strokes · {Math.floor(dur / 60)}:{String(dur % 60).padStart(2, '0')} · {pct}% of canvas
      <br />
      tools: {tools || 'none yet'}
      {sizes && (
        <>
          <br />
          sizes: {sizes}
        </>
      )}
      {v.closedBy && (
        <>
          <br />
          closed by: <b>{v.closedBy}</b>
        </>
      )}
      {v.forkedFrom && (
        <>
          <br />
          first {v.strokes.length} of v{v.n}'s {v.forkedFrom.strokes.length} strokes
        </>
      )}
    </div>
  );
}

export function Timeline() {
  const store = useStore();
  const { versions, open, pos, branches, branchId, currentBranch, expanded, playing, showHint } = store;
  const chipsRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState<{ v: Version; rect: DOMRect } | null>(null);

  const rows: Row[] = expanded ? timelineRows(branches) : [{ branch: currentBranch, start: 0, parent: -1 }];
  const currentRow = rows.findIndex((r) => r.branch.id === branchId);
  const maxCells = Math.max(1, ...branches.flatMap((b) => b.versions.map((v) => v.cells.size)));
  const n = versions.length;
  const closed = versions.filter((v) => v.closedBy).length;
  const strokes = versions.reduce((a, v) => a + v.strokes.length, 0);

  const playheadX = !n ? 64 : pos === null ? n * PITCH - CHIP_GAP : Math.floor(pos) * PITCH + (pos - Math.floor(pos)) * CHIP_W;
  const viewing = pos !== null && n > 0;
  const cur = viewing ? posToTarget(versions, pos).i : -1;

  // past 3 rows the area scrolls; keep the current branch's row on screen
  useEffect(() => {
    const sc = scrollRef.current!;
    const top = currentRow * (ROW_H + ROW_GAP);
    if (top < sc.scrollTop || top + ROW_H > sc.scrollTop + sc.clientHeight) sc.scrollTop = top;
  }, [currentRow, rows.length]);

  // Follow the playhead during playback, and the "now" chip while live. Scrolling
  // by hand changes neither, so the scrollbar stays put until one of them moves.
  useEffect(() => {
    if (dragging || (!playing && pos !== null)) return;
    const sc = scrollRef.current!;
    const left = sc.scrollLeft + FOLLOW_MARGIN;
    const right = sc.scrollLeft + sc.clientWidth - FOLLOW_MARGIN;
    if (playheadX >= left && playheadX <= right) return;
    if (playing) sc.scrollLeft = playheadX - sc.clientWidth / 2;
    else sc.scrollLeft += playheadX < left ? playheadX - left : playheadX - right;
  }, [playing, pos === null, playheadX, strokes]);

  const at = (e: PointerEvent) => {
    const r = chipsRef.current!.getBoundingClientRect();
    const x = e.clientX - r.left;
    const i = Math.floor(x / PITCH);
    const f = Math.max(0, Math.min(1, (x - i * PITCH) / CHIP_W));
    const row = Math.floor((e.clientY - r.top) / (ROW_H + ROW_GAP));
    return { pos: Math.max(0, i + f), i, row };
  };

  const scrubTo = (e: PointerEvent) => {
    if (!store.versions.length) return;
    const { pos: p, i } = at(e);
    store.setPos(i >= store.versions.length ? null : p, { fromUser: true });
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const { pos: p, i, row } = at(e);
    const b = rows[row]?.branch;
    if (b && b.id !== branchId) {
      // tapping another branch's row moves to that branch, at the tapped version
      setHover(null);
      return store.switchBranch(b.id, i >= b.versions.length ? null : p);
    }
    if (!n) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setHover(null);
    scrubTo(e);
  };

  return (
    <footer className="timeline">
      <div className="transport">
        <button title="Jump to start" onClick={() => n && store.setPos(0, { fromUser: true })}>⏮</button>
        <button title="Previous version (←)" onClick={() => store.stepBoundary(-1)}>◀</button>
        <button className="play" title="Play process (space)" onClick={store.togglePlay}>{playing ? '❚❚' : '▶'}</button>
        <button title="Next version (→)" onClick={() => store.stepBoundary(1)}>▶︎|</button>
        <button title="Jump to now (esc)" onClick={() => store.setPos(null, { fromUser: true })}>⏭</button>
      </div>

      <div className="track-area">
      <div className="track-scroll" ref={scrollRef} onScroll={() => setHover(null)}>
        <div
          className={`track ${dragging ? 'is-dragging' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={(e) => dragging && scrubTo(e)}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
        >
          <svg className="connectors" width="100%" height={rows.length * (ROW_H + ROW_GAP) - ROW_GAP}>
            {rows.slice(1).map((row, j) => (
              <path key={row.branch.id} d={connectorPath(row, j + 1)} />
            ))}
          </svg>
          <div className="chips" ref={chipsRef}>
            {rows.map(({ branch, start }, r) => (
              <div
                key={branch.id}
                className={`row ${branch.id === branchId ? 'is-current' : ''}`}
                style={{ paddingLeft: start * PITCH }}
              >
                {rows.length > 1 && <span className="row-name">{branch.name}</span>}
                {!branch.versions.length && r === 0 && (
                  <div className="chip is-empty">
                    <span className="chip-label">now</span>
                  </div>
                )}
                {branch.versions.slice(start).map((v) => {
                  const i = versions.indexOf(v);
                  const icon = dominantTool(v);
                  const state = !viewing || i < 0 ? '' : i < cur ? 'is-past' : i === cur ? 'is-at' : 'is-future';
                  const landed = v.closedAt && Date.now() - v.closedAt < 600 ? 'is-landed' : '';
                  return (
                    <div
                      key={v.n + (v.forkedFrom ? 'p' : '')}
                      className={`chip ${v === open ? 'is-open' : ''} ${state} ${landed}`}
                      onMouseEnter={(e) => !dragging && setHover({ v, rect: e.currentTarget.getBoundingClientRect() })}
                      onMouseLeave={() => setHover(null)}
                    >
                      <div className="meter" style={{ height: `${Math.round((v.cells.size / maxCells) * 100)}%` }} />
                      {icon ? <ToolIcon src={icon} /> : <span className="tool-icon-blank" />}
                      <span className="chip-label">{v === open ? 'now' : `v${v.n}`}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="playhead" style={{ left: playheadX, top: Math.max(0, currentRow) * (ROW_H + ROW_GAP) }}>
            <div className="playhead-grip" />
          </div>
        </div>
        {showHint && closed === 0 && <div className="hint">Your process is being saved as you draw. Drag here later to rewind.</div>}
      </div>
      <TrackScrollbar target={scrollRef} />
      </div>

      <div className="timeline-side">
        {branches.length > 1 && (
          <button className="rows-toggle" aria-expanded={expanded} onClick={() => store.setOption({ expanded: !expanded })}>
            {expanded ? `▾ ${branches.length} branches` : `▸ ${currentBranch.name} only`}
          </button>
        )}
        <div className="timeline-meta">
          {rows.length > 1 && (
            <>
              {currentBranch.name}
              <br />
            </>
          )}
          {closed} version{closed === 1 ? '' : 's'}
          <br />
          {strokes} stroke{strokes === 1 ? '' : 's'}
          {open && (
            <>
              <br />
              <span className="recording">● recording</span>
            </>
          )}
        </div>
      </div>

      {hover && <Tooltip v={hover.v} rect={hover.rect} isOpen={hover.v === open} />}
    </footer>
  );
}
