// Pure in-memory graph model. No Express / HTTP deps so it is trivially unit-testable.
// The server holds ONE canonical store; every action mutates it and re-renders the whole graph.

/** @typedef {{id:string,x:number,y:number,type:string,data:Record<string,any>}} Node */
/** @typedef {{id:string,source:string,target:string,sourceHandle?:string,targetHandle?:string,label?:string}} Edge */

export function createStore(seed = defaultSeed()) {
  /** @type {Map<string, Node>} */
  const nodes = new Map(seed.nodes.map((n) => [n.id, normalizeNode(n)]));
  /** @type {Map<string, Edge>} */
  const edges = new Map(seed.edges.map((e) => [e.id, { ...e }]));
  let edgeSeq = edges.size;

  function moveNode(id, x, y) {
    const node = nodes.get(id);
    if (!node) throw new NotFound(`node ${id}`);
    node.x = Number(x);
    node.y = Number(y);
    return node;
  }

  function addEdge({ source, target, sourceHandle, targetHandle, id } = {}) {
    if (!nodes.has(source)) throw new NotFound(`source node ${source}`);
    if (!nodes.has(target)) throw new NotFound(`target node ${target}`);
    const edgeId = id || `e-${source}-${target}-${++edgeSeq}`;
    const edge = { id: edgeId, source, target };
    if (sourceHandle) edge.sourceHandle = sourceHandle;
    if (targetHandle) edge.targetHandle = targetHandle;
    edges.set(edgeId, edge);
    return edge;
  }

  function setNodeData(id, patch) {
    const node = nodes.get(id);
    if (!node) throw new NotFound(`node ${id}`);
    node.data = { ...node.data, ...patch };
    return node;
  }

  function deleteNode(id) {
    const existed = nodes.delete(id);
    // Drop any edges touching the removed node.
    for (const [eid, e] of edges) {
      if (e.source === id || e.target === id) edges.delete(eid);
    }
    return existed;
  }

  function deleteEdge(id) {
    return edges.delete(id);
  }

  /** Snapshot used by the templates. Stable ordering keeps morph diffs minimal. */
  function toViewModel() {
    return {
      nodes: [...nodes.values()].map((n) => ({ ...n, data: { ...n.data } })),
      edges: [...edges.values()].map((e) => ({ ...e })),
    };
  }

  return {
    nodes,
    edges,
    moveNode,
    addEdge,
    setNodeData,
    deleteNode,
    deleteEdge,
    toViewModel,
  };
}

export class NotFound extends Error {}

function normalizeNode(n) {
  return {
    id: n.id,
    x: Number(n.x) || 0,
    y: Number(n.y) || 0,
    type: n.type || 'card',
    data: { ...(n.data || {}) },
  };
}

export function defaultSeed() {
  return {
    nodes: [
      { id: 'order-42', x: 40, y: 80, type: 'card', data: { title: 'Order #42', status: 'pending', amount: '$129.00' } },
      { id: 'ship-7', x: 360, y: 40, type: 'card', data: { title: 'Shipment #7', status: 'ready', amount: '2.4kg' } },
      { id: 'invoice-9', x: 360, y: 220, type: 'card', data: { title: 'Invoice #9', status: 'draft', amount: '$129.00' } },
    ],
    edges: [
      { id: 'e-order-ship', source: 'order-42', target: 'ship-7' },
      { id: 'e-order-invoice', source: 'order-42', target: 'invoice-9' },
    ],
  };
}
