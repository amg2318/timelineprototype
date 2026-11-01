import eraserIcon from '../assets/eraser.png';
import markerIcon from '../assets/marker.png';
import penIcon from '../assets/pen.png';
import pencilIcon from '../assets/pencil.png';
import softIcon from '../assets/soft.png';
import sprayIcon from '../assets/spray.png';
import type { Tool } from '../model';

export const TOOLS: { tool: Tool; label: string; icon: string }[] = [
  { tool: 'pen', label: 'Pen', icon: penIcon },
  { tool: 'pencil', label: 'Pencil', icon: pencilIcon },
  { tool: 'marker', label: 'Marker', icon: markerIcon },
  { tool: 'soft', label: 'Soft', icon: softIcon },
  { tool: 'spray', label: 'Spray', icon: sprayIcon },
  { tool: 'erase', label: 'Erase', icon: eraserIcon },
];

/** The icon art is used as a mask so it takes the button's text colour (e.g. cream when active). */
export function ToolIcon({ src }: { src: string }) {
  const mask = `url(${src}) center / contain no-repeat`;
  return <span className="tool-icon" style={{ mask, WebkitMask: mask }} />;
}
