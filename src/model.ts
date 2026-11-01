export type Tool = 'pen' | 'pencil' | 'marker' | 'soft' | 'spray' | 'erase';

export interface Layer {
  kind: 'layer';
  id: string;
  name: string;
  visible: boolean;
}

export interface Group {
  kind: 'group';
  id: string;
  name: string;
  visible: boolean;
  layers: Layer[]; // top → bottom
}

export type Item = Layer | Group;

export interface Doc {
  items: Item[]; // top → bottom
  /** The layer strokes go into. */
  activeLayerId: string | null;
  /** Loose layers picked for grouping (includes the active one when it's loose). */
  selectedIds: string[];
}

let counter = 0;
export const uid = (prefix: string) => `${prefix}${++counter}`;

export const groups = (doc: Doc) => doc.items.filter((it): it is Group => it.kind === 'group');

export const findGroup = (doc: Doc, groupId: string) => groups(doc).find((g) => g.id === groupId);

/** Locate a layer at the top level or within a group. */
export function findLayer(doc: Doc, layerId: string | null) {
  for (const item of doc.items) {
    if (item.kind === 'layer') {
      if (item.id === layerId) return { layer: item, group: undefined };
    } else {
      const layer = item.layers.find((l) => l.id === layerId);
      if (layer) return { layer, group: item };
    }
  }
  return null;
}

export const findActiveLayer = (doc: Doc) => findLayer(doc, doc.activeLayerId);

/** Every layer id in a stack, including those inside groups. */
export const layerIds = (items: Item[]) =>
  items.flatMap((it) => (it.kind === 'layer' ? [it.id] : it.layers.map((l) => l.id)));

export function seedDoc(): Doc {
  const layer: Layer = { kind: 'layer', id: uid('l'), name: 'Layer 1', visible: true };
  return { items: [layer], activeLayerId: layer.id, selectedIds: [layer.id] };
}
