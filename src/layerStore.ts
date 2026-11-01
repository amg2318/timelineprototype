import type { Doc, Item, Layer } from './model';

// Pixel data lives outside React state: one offscreen canvas per layer id.
export const DOC_W = 1332;
export const DOC_H = 1044;
export const PAPER = '#fdf8f0';

const canvases = new Map<string, HTMLCanvasElement>();

export function createCanvas(w = DOC_W, h = DOC_H) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export const ctx2d = (c: HTMLCanvasElement) => c.getContext('2d', { willReadFrequently: false })!;

export function getLayerCanvas(id: string) {
  let c = canvases.get(id);
  if (!c) {
    c = createCanvas();
    canvases.set(id, c);
  }
  return c;
}

export function cloneLayerCanvas(srcId: string, dstId: string) {
  ctx2d(getLayerCanvas(dstId)).drawImage(getLayerCanvas(srcId), 0, 0);
}

export function clearLayerCanvas(id: string) {
  ctx2d(getLayerCanvas(id)).clearRect(0, 0, DOC_W, DOC_H);
}

export const readPixels = (id: string) => ctx2d(getLayerCanvas(id)).getImageData(0, 0, DOC_W, DOC_H);

export function writePixels(id: string, data: ImageData) {
  ctx2d(getLayerCanvas(id)).putImageData(data, 0, 0);
}

/** Draw a layer stack bottom to top, reading each layer's pixels from `source`. */
export function compositeStack(items: Item[], ctx: CanvasRenderingContext2D, source: (id: string) => HTMLCanvasElement) {
  const { width, height } = ctx.canvas;
  const draw = (l: Layer) => l.visible && ctx.drawImage(source(l.id), 0, 0, width, height);
  ctx.clearRect(0, 0, width, height);
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind === 'layer') draw(item);
    else if (item.visible) [...item.layers].reverse().forEach(draw);
  }
}

export const compositeDoc = (doc: Doc, ctx: CanvasRenderingContext2D) => compositeStack(doc.items, ctx, getLayerCanvas);

export function drawThumbnail(layerId: string, target: HTMLCanvasElement) {
  const ctx = ctx2d(target);
  const { width, height } = target;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);
  const scale = Math.min(width / DOC_W, height / DOC_H);
  const w = DOC_W * scale;
  const h = DOC_H * scale;
  ctx.drawImage(getLayerCanvas(layerId), (width - w) / 2, (height - h) / 2, w, h);
}

export function exportPng(doc: Doc) {
  const out = createCanvas();
  const ctx = ctx2d(out);
  compositeDoc(doc, ctx);
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, DOC_W, DOC_H);
  out.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rewind-final.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
}
