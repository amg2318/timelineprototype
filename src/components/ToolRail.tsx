import redoIcon from '../assets/redo.png';
import undoIcon from '../assets/undo.png';
import { useStore } from '../store';
import { ToolIcon, TOOLS } from './ToolIcon';

export function ToolRail() {
  const { brush, setBrush, undo, redo, canUndo, canRedo } = useStore();
  return (
    <nav className="rail tool-rail">
      {TOOLS.map(({ tool, label, icon }) => (
        <button
          key={tool}
          className={`tool ${brush.tool === tool ? 'is-active' : ''}`}
          aria-pressed={brush.tool === tool}
          onClick={() => setBrush({ tool })}
        >
          <ToolIcon src={icon} />
          {label}
        </button>
      ))}
      <button className="tool" disabled={!canUndo} title="Undo (⌘Z)" onClick={undo}>
        <ToolIcon src={undoIcon} />
        Undo
      </button>
      <button className="tool" disabled={!canRedo} title="Redo (⇧⌘Z)" onClick={redo}>
        <ToolIcon src={redoIcon} />
        Redo
      </button>
    </nav>
  );
}
