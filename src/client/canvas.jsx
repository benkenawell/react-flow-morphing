import { useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  applyNodeChanges,
  applyEdgeChanges,
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
      onNodeDragStop={(_e, node) =>
        emit('nodeDragStop', { id: node.id, x: Math.round(node.position.x), y: Math.round(node.position.y) })
      }
      onConnect={(c) =>
        emit('connect', {
          source: c.source,
          target: c.target,
          sourceHandle: c.sourceHandle || '',
          targetHandle: c.targetHandle || '',
        })
      }
      onNodeClick={(_e, node) => emit('nodeClick', { id: node.id })}
      onEdgeClick={(_e, edge) => emit('edgeClick', { id: edge.id })}
      onNodesDelete={(deleted) => deleted.forEach((n) => emit('nodesDelete', { id: n.id }))}
      onEdgesDelete={(deleted) => deleted.forEach((e) => emit('edgesDelete', { id: e.id }))}
      fitView
    >
      <Background />
      <Controls />
    </ReactFlow>
  );
}
