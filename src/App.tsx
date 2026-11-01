import { useEffect, useState } from 'react';
import { BrushSettings } from './components/BrushSettings';
import { DrawingCanvas } from './components/DrawingCanvas';
import { LayersPanel } from './components/LayersPanel';
import { NavBar } from './components/NavBar';
import { PastBanner, Toast } from './components/PastBanner';
import { Timeline } from './components/Timeline';
import { ToolRail } from './components/ToolRail';
import { rewind } from './store';

export default function App() {
  const [layersOpen, setLayersOpen] = useState(true);
  useEffect(() => {
    window.addEventListener('keydown', rewind.onKey);
    return () => window.removeEventListener('keydown', rewind.onKey);
  }, []);
  return (
    <div className="app">
      <NavBar layersOpen={layersOpen} onToggleLayers={() => setLayersOpen((o) => !o)} />
      <div className="workspace">
        <div className="tools">
          <ToolRail />
          <BrushSettings />
        </div>
        <main className="stage">
          <PastBanner />
          <div className="canvas-area">
            <DrawingCanvas />
          </div>
          <Toast />
        </main>
        {layersOpen && <LayersPanel />}
      </div>
      <Timeline />
    </div>
  );
}
