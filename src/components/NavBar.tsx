import { useState } from 'react';
import arrowLeft from '../assets/arrow-left.svg';
import layersIcon from '../assets/layers.svg';
import { exportPng } from '../layerStore';
import { useStore } from '../store';

interface Props {
  layersOpen: boolean;
  onToggleLayers: () => void;
}

export function NavBar({ layersOpen, onToggleLayers }: Props) {
  const { doc, demo, showHint, setOption } = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <header className="nav">
      <button className="btn btn-back" title="Projects page (not built yet)">
        <img src={arrowLeft} width={24} height={24} alt="" />
        Projects
      </button>
      <span className="nav-title">untitled-sketch-01</span>
      <div className="nav-spacer" />
      <button className="btn btn-text" onClick={() => exportPng(doc)}>
        Export PNG
      </button>
      <div className="settings">
        <button className="btn btn-text" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((o) => !o)}>
          Settings
        </button>
        {settingsOpen && (
          <div className="settings-menu">
            <label>
              <input type="checkbox" checked={demo} onChange={(e) => setOption({ demo: e.target.checked })} />
              Demo timing (pause 4s, cap 30s)
            </label>
            <label>
              <input type="checkbox" checked={showHint} onChange={(e) => setOption({ showHint: e.target.checked })} />
              Show empty-state hint
            </label>
            <p>Real rules: a version closes after a 90s pause, 10 min of drawing, or a layer change.</p>
          </div>
        )}
      </div>
      <button
        className={`btn btn-icon ${layersOpen ? 'is-on' : ''}`}
        aria-pressed={layersOpen}
        aria-label="Toggle layers"
        onClick={onToggleLayers}
      >
        <img src={layersIcon} width={24} height={24} alt="" />
      </button>
    </header>
  );
}
