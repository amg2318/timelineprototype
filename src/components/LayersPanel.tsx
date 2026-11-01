import { useEffect, useRef, useState } from 'react';
import checkboxIcon from '../assets/checkbox.svg';
import plusIcon from '../assets/plus.svg';
import { useReorder } from '../hooks/useReorder';
import { drawThumbnail } from '../layerStore';
import type { Group, Layer } from '../model';
import * as ops from '../ops';
import { useStore } from '../store';
import { Swipeable } from './Swipeable';

function LayerThumb({ layerId }: { layerId: string }) {
  const { pixelVersion } = useStore();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => drawThumbnail(layerId, ref.current!), [layerId, pixelVersion]);
  return <canvas ref={ref} className="layer-thumb" width={100} height={94} />;
}

function VisibilityToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <button
      className="visibility"
      aria-label={visible ? 'Hide' : 'Show'}
      aria-pressed={visible}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      {visible ? <img src={checkboxIcon} width={16} height={16} alt="" /> : <span className="checkbox-empty" />}
    </button>
  );
}

interface SwipeProps {
  openId: string | null;
  setOpenId: (id: string | null) => void;
}

const swipeState = (id: string, { openId, setOpenId }: SwipeProps) => ({
  open: openId === id,
  setOpen: (o: boolean) => setOpenId(o ? id : null),
});

/** A layer either at the top level (its own card) or inside a group card. */
function LayerRow({ layer, group, ...swipe }: { layer: Layer; group?: Group } & SwipeProps) {
  const { doc, commit, arrange, navigate, viewing, toast } = useStore();
  const selected = group ? doc.activeLayerId === layer.id : doc.selectedIds.includes(layer.id);
  const actions = [
    ...(group ? [] : [{ label: 'Group', onSelect: () => arrange((d) => ops.groupLayers(d, [layer.id])) }]),
    { label: 'Duplicate', onSelect: () => commit((d) => ops.duplicateLayer(d, layer.id), 'layer duplicated', { copies: true }) },
    {
      label: 'Delete',
      disabled: ops.isLastInContainer(doc, layer.id),
      onSelect: () => {
        commit((d) => ops.deleteLayer(d, layer.id), 'layer deleted');
        if (!viewing) toast(`Deleted "${layer.name}". It's still in the history`);
      },
    },
  ];
  return (
    <Swipeable
      {...swipeState(layer.id, swipe)}
      className={`${group ? 'layer-in-group' : 'layer-card'} ${selected ? 'is-selected' : ''}`}
      actions={actions}
      onSwipeRight={group ? undefined : () => navigate((d) => ops.toggleSelected(d, layer.id))}
    >
      <div
        role="button"
        tabIndex={0}
        className={`layer-row ${layer.visible ? '' : 'is-hidden'}`}
        onClick={() => navigate((d) => ops.selectLayer(d, layer.id))}
      >
        <LayerThumb layerId={layer.id} />
        <span className="layer-name">{layer.name}</span>
        <VisibilityToggle visible={layer.visible} onToggle={() => arrange((d) => ops.toggleLayerVisible(d, layer.id))} />
      </div>
    </Swipeable>
  );
}

function GroupCard({ group, ...swipe }: { group: Group } & SwipeProps) {
  const { doc, commit, arrange, navigate } = useStore();
  const reorder = useReorder(
    group.layers.map((l) => l.id),
    (from, to) => arrange((d) => ops.moveItem(d, group.id, from, to)),
    (id) => navigate((d) => ops.selectLayer(d, id)),
  );
  const actions = [
    { label: 'Duplicate', onSelect: () => commit((d) => ops.duplicateGroup(d, group.id), 'group duplicated', { copies: true }) },
    { label: 'Delete', disabled: doc.items.length < 2, onSelect: () => commit((d) => ops.deleteGroup(d, group.id), 'group deleted') },
  ];
  return (
    <section className={`group-card ${group.visible ? '' : 'is-hidden'}`}>
      <Swipeable {...swipeState(group.id, swipe)} actions={actions}>
        <div
          role="button"
          tabIndex={0}
          className="group-head"
          onClick={() => navigate((d) => ops.selectLayer(d, group.layers[0]?.id ?? null))}
        >
          <span className="group-title">{group.name}</span>
          <VisibilityToggle visible={group.visible} onToggle={() => arrange((d) => ops.toggleGroupVisible(d, group.id))} />
        </div>
      </Swipeable>
      {group.layers.map((layer) => (
        <div key={layer.id} {...reorder.bind(layer.id)}>
          <LayerRow layer={layer} group={group} {...swipe} />
        </div>
      ))}
      <div className="group-foot" />
    </section>
  );
}

export function LayersPanel() {
  const { doc, commit, arrange, navigate } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const swipe = { openId, setOpenId };
  const reorder = useReorder(
    doc.items.map((it) => it.id),
    (from, to) => arrange((d) => ops.moveItem(d, null, from, to)),
    // Holding a loose layer adds it to (or removes it from) the selection for grouping.
    (id) => navigate((d) => (d.items.find((it) => it.id === id)?.kind === 'layer' ? ops.toggleSelected(d, id) : d)),
  );
  return (
    <aside className="layers-panel">
      <div className="layers-head">
        <h2>Layers</h2>
        <button className="btn-plain" aria-label="New layer" title="Adding a layer closes the current version" onClick={() => commit(ops.addLayer, 'layer added')}>
          <img src={plusIcon} width={24} height={24} alt="" />
        </button>
      </div>
      <div className="layers-list">
        {doc.items.map((item) => (
          <div key={item.id} {...reorder.bind(item.id)}>
            {item.kind === 'group' ? <GroupCard group={item} {...swipe} /> : <LayerRow layer={item} {...swipe} />}
          </div>
        ))}
      </div>
      {doc.selectedIds.length > 1 && (
        <div className="layers-foot">
          <button className="btn btn-text" onClick={() => arrange((d) => ops.groupLayers(d, d.selectedIds))}>
            Group layers
          </button>
        </div>
      )}
    </aside>
  );
}
