import { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  SelectionMode,
  applyNodeChanges,
  applyEdgeChanges,
  useOnSelectionChange,
  useReactFlow,
} from '@xyflow/react';
import { nodeTypes } from './node-types.jsx';

// Controlled React Flow. Props are the server truth (re-derived from light DOM on
// every morph, keyed by `version`). Local change handlers keep drag/select fluid;
// committed interactions are reported via `emit(eventName, data)` -> htmx request.
export function FlowCanvas({ version, nodes: propNodes, edges: propEdges, emit }) {
  const [nodes, setNodes] = useState(propNodes);
  const [edges, setEdges] = useState(propEdges);

  // Re-sync to server truth whenever the morphed model changes.
  useEffect(() => {
    setNodes(propNodes);
    setEdges(propEdges);
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={(changes) => setNodes((ns) => applyNodeChanges(changes, ns))}
      onEdgesChange={(changes) => setEdges((es) => applyEdgeChanges(changes, es))}
      // Third arg is every node dragged together, so a multi-selection move
      // commits each node's new position (not just the one under the cursor).
      onNodeDragStop={(_e, _node, dragged) =>
        dragged.forEach((n) =>
          emit('nodeDragStop', { id: n.id, x: Math.round(n.position.x), y: Math.round(n.position.y) }),
        )
      }
      onConnect={(c) =>
        emit('connect', {
          source: c.source,
          target: c.target,
          sourceHandle: c.sourceHandle || '',
          targetHandle: c.targetHandle || '',
        })
      }
      // No onNodeClick: it's a React synthetic event and never fires for clicks on
      // slotted (light-DOM) node bodies across the shadow boundary. The whole-card
      // inspector trigger is plain htmx in _node-body.njk. (Edges ARE React-rendered
      // in the shadow tree, so onEdgeClick works.)
      onEdgeClick={(_e, edge) => emit('edgeClick', { id: edge.id })}
      onNodesDelete={(deleted) => deleted.forEach((n) => emit('nodesDelete', { id: n.id }))}
      onEdgesDelete={(deleted) => deleted.forEach((e) => emit('edgesDelete', { id: e.id }))}
      // Multi-select: left-drag on the canvas rubber-bands a selection; pan with
      // middle/right mouse or scroll. Shift/Cmd-click still adds to a selection.
      selectionOnDrag
      selectionMode={SelectionMode.Partial}
      panOnDrag={[1, 2]}
      panOnScroll
      fitView
    >
      <SelectionTools />
      <Background />
      <Controls />
    </ReactFlow>
  );
}

// Floating panel summarizing the current selection with a bulk delete. Delete
// routes through React Flow's deleteElements, which fires onNodesDelete -> the
// same per-node server delete path, so the graph stays server-authoritative.
function SelectionTools() {
  const { deleteElements } = useReactFlow();
  const [ids, setIds] = useState([]);
  const onChange = useCallback(({ nodes }) => setIds(nodes.map((n) => n.id)), []);
  useOnSelectionChange({ onChange });

  if (ids.length === 0) return null;
  return (
    <Panel position="top-right">
      <div className="selection-tools">
        <span>{ids.length} selected</span>
        <button type="button" onClick={() => deleteElements({ nodes: ids.map((id) => ({ id })) })}>
          Delete selected
        </button>
      </div>
    </Panel>
  );
}
