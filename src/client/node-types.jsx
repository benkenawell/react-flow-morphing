import { Handle, Position } from '@xyflow/react';

// React Flow custom node. It draws the connection handles and a named <slot>;
// the browser projects the matching light-DOM <flow-node> body into that slot.
// So React owns layout/handles while the SERVER owns the node's visible HTML.
export function CardNode({ data }) {
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <slot name={data.slot} />
      <Handle type="source" position={Position.Right} />
    </>
  );
}

export const nodeTypes = { card: CardNode };
