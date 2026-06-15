// Pure: translate the <react-flow> light-DOM children into React Flow inputs.
// Kept free of browser globals so node:test can drive it with linkedom elements.

const HX_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/**
 * @param {Iterable<Element>} children light-DOM children of <react-flow>
 * @returns {{nodes:Array, edges:Array, actions:Array}}
 */
export function elementsToFlow(children) {
  const nodes = [];
  const edges = [];
  const actions = [];

  for (const el of children) {
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (tag === 'flow-node') nodes.push(toNode(el));
    else if (tag === 'flow-edge') edges.push(toEdge(el));
    else if (tag === 'flow-action') actions.push(toAction(el));
  }

  return { nodes, edges, actions };
}

function toNode(el) {
  const id = el.getAttribute('id');
  const node = {
    id,
    type: el.getAttribute('type') || 'card',
    position: { x: num(el.getAttribute('x')), y: num(el.getAttribute('y')) },
    // The custom node component renders <slot name={data.slot}> to project the body.
    data: { slot: `node-${id}` },
  };
  return node;
}

function toEdge(el) {
  const edge = {
    id: el.getAttribute('id'),
    source: el.getAttribute('source'),
    target: el.getAttribute('target'),
  };
  const sh = el.getAttribute('source-handle');
  const th = el.getAttribute('target-handle');
  if (sh) edge.sourceHandle = sh;
  if (th) edge.targetHandle = th;
  return edge;
}

function toAction(el) {
  const action = { on: el.getAttribute('on'), method: 'get', url: null };
  for (const method of HX_METHODS) {
    const url = el.getAttribute(`hx-${method}`);
    if (url) {
      action.method = method;
      action.url = url;
      break;
    }
  }
  action.target = el.getAttribute('hx-target') || '#graph';
  action.swap = el.getAttribute('hx-swap') || 'morph:innerHTML';
  return action;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
