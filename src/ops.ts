import { cloneLayerCanvas } from './layerStore';
import { findGroup, findLayer, uid, type Doc, type Group, type Item, type Layer } from './model';

// Pure document transforms. The only side effect is copying pixels into
// freshly-minted layer ids, which is safe to repeat.

const mapGroup = (doc: Doc, groupId: string, fn: (g: Group) => Group): Doc => ({
  ...doc,
  items: doc.items.map((it) => (it.kind === 'group' && it.id === groupId ? fn(it) : it)),
});

const trailingNumber = (name: string) => Number(/(\d+)\s*$/.exec(name)?.[1] ?? 0);
const nextNumber = (names: string[]) => Math.max(0, ...names.map(trailingNumber)) + 1;

const allLayerNames = (doc: Doc) =>
  doc.items.flatMap((it) => (it.kind === 'layer' ? [it.name] : it.layers.map((l) => l.name)));

const newLayer = (doc: Doc): Layer => ({
  kind: 'layer',
  id: uid('l'),
  name: `Layer ${nextNumber(allLayerNames(doc))}`,
  visible: true,
});

const copyLayers = (layers: Layer[]) =>
  layers.map((l) => {
    const id = uid('l');
    cloneLayerCanvas(l.id, id);
    return { ...l, id };
  });

/** Apply `fn` to whichever list holds the layer: the top-level stack or a group. */
function editContainer(doc: Doc, layerId: string, fn: (list: Item[], index: number) => Item[]): Doc {
  const found = findLayer(doc, layerId);
  if (!found) return doc;
  if (!found.group) return { ...doc, items: fn(doc.items, doc.items.indexOf(found.layer)) };
  return mapGroup(doc, found.group.id, (g) => ({ ...g, layers: fn(g.layers, g.layers.indexOf(found.layer)) as Layer[] }));
}

export const firstLayerOf = (item: Item | undefined) =>
  item?.kind === 'layer' ? item.id : item ? item.layers[0]?.id ?? null : null;

/** Make a layer the drawing target; loose layers also become the sole selection. */
export function selectLayer(doc: Doc, layerId: string | null): Doc {
  const found = findLayer(doc, layerId);
  return { ...doc, activeLayerId: found ? layerId : null, selectedIds: found && !found.group ? [layerId!] : [] };
}

/** Swipe-right multi-select on loose layers, as in Procreate. */
export function toggleSelected(doc: Doc, layerId: string): Doc {
  const on = doc.selectedIds.includes(layerId);
  const selectedIds = on ? doc.selectedIds.filter((id) => id !== layerId) : [...doc.selectedIds, layerId];
  if (selectedIds.length === 0) return doc;
  const activeLayerId = selectedIds.includes(doc.activeLayerId ?? '') ? doc.activeLayerId : selectedIds[0];
  return { ...doc, selectedIds, activeLayerId };
}

export function addLayer(doc: Doc): Doc {
  const layer = newLayer(doc);
  const next = doc.activeLayerId
    ? editContainer(doc, doc.activeLayerId, (list, i) => [...list.slice(0, i), layer, ...list.slice(i)])
    : { ...doc, items: [layer, ...doc.items] };
  return selectLayer(next, layer.id);
}

/** Wrap loose layers into a new group at the position of the topmost one. */
export function groupLayers(doc: Doc, ids: string[]): Doc {
  const picked = doc.items.filter((it): it is Layer => it.kind === 'layer' && ids.includes(it.id));
  if (!picked.length) return doc;
  const group: Group = {
    kind: 'group',
    id: uid('g'),
    name: `Group ${nextNumber(doc.items.filter((it) => it.kind === 'group').map((g) => g.name))}`,
    visible: true,
    layers: picked,
  };
  const at = doc.items.indexOf(picked[0]);
  const rest = doc.items.filter((it) => !picked.includes(it as Layer));
  const items = [...rest.slice(0, at), group, ...rest.slice(at)];
  const active = picked.some((l) => l.id === doc.activeLayerId) ? doc.activeLayerId : picked[0].id;
  return selectLayer({ ...doc, items }, active);
}

/** Reorder within the top-level stack (groupId null) or a group. */
export function moveItem(doc: Doc, groupId: string | null, from: number, to: number): Doc {
  const move = <T,>(list: T[]) => {
    const next = [...list];
    next.splice(to, 0, ...next.splice(from, 1));
    return next;
  };
  if (!groupId) return { ...doc, items: move(doc.items) };
  return mapGroup(doc, groupId, (g) => ({ ...g, layers: move(g.layers) }));
}

/** Copy a group's stack into a new group above it. */
export function duplicateGroup(doc: Doc, groupId: string): Doc {
  const g = findGroup(doc, groupId)!;
  const copy: Group = { ...g, id: uid('g'), name: `${g.name} copy`, layers: copyLayers(g.layers) };
  const at = doc.items.indexOf(g);
  return { ...doc, items: [...doc.items.slice(0, at), copy, ...doc.items.slice(at)] };
}

export function deleteGroup(doc: Doc, groupId: string): Doc {
  if (doc.items.length < 2) return doc;
  const g = findGroup(doc, groupId)!;
  const at = doc.items.indexOf(g);
  const items = doc.items.filter((it) => it !== g);
  const next = { ...doc, items };
  if (findLayer(next, doc.activeLayerId)) return next;
  return selectLayer(next, firstLayerOf(items[Math.min(at, items.length - 1)]));
}

export const toggleGroupVisible = (doc: Doc, groupId: string): Doc =>
  mapGroup(doc, groupId, (g) => ({ ...g, visible: !g.visible }));

export function duplicateLayer(doc: Doc, layerId: string): Doc {
  const id = uid('l');
  cloneLayerCanvas(layerId, id);
  const next = editContainer(doc, layerId, (list, i) => {
    const copy = { ...(list[i] as Layer), id, name: `${list[i].name} copy` };
    return [...list.slice(0, i), copy, ...list.slice(i)];
  });
  return selectLayer(next, id);
}

export const toggleLayerVisible = (doc: Doc, layerId: string): Doc =>
  editContainer(doc, layerId, (list, i) => list.map((it, j) => (j === i ? { ...(it as Layer), visible: !it.visible } : it)));

/** Whether deleting this layer would leave its container empty. */
export function isLastInContainer(doc: Doc, layerId: string) {
  const found = findLayer(doc, layerId);
  return found?.group ? found.group.layers.length < 2 : doc.items.length < 2;
}

export function deleteLayer(doc: Doc, layerId: string): Doc {
  if (isLastInContainer(doc, layerId)) return doc;
  let neighbour: string | null = null;
  const next = editContainer(doc, layerId, (list, i) => {
    const rest = list.filter((_, j) => j !== i);
    neighbour = firstLayerOf(rest[Math.min(i, rest.length - 1)]);
    return rest;
  });
  const cleaned = { ...next, selectedIds: next.selectedIds.filter((id) => id !== layerId) };
  return doc.activeLayerId === layerId ? selectLayer(cleaned, neighbour) : cleaned;
}
