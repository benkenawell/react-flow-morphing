import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { elementsToFlow } from '../src/client/model.js';

function children(html) {
  const { document } = parseHTML(`<react-flow>${html}</react-flow>`);
  return document.querySelector('react-flow').children;
}

test('flow-node -> node with position and slot data', () => {
  const { nodes } = elementsToFlow(children(
    `<flow-node id="order-42" type="card" x="40" y="80" slot="node-order-42"></flow-node>`,
  ));
  assert.equal(nodes.length, 1);
  assert.deepEqual(nodes[0], {
    id: 'order-42',
    type: 'card',
    position: { x: 40, y: 80 },
    data: { slot: 'node-order-42' },
  });
});

test('missing type defaults to card; bad coords default to 0', () => {
  const { nodes } = elementsToFlow(children(`<flow-node id="x"></flow-node>`));
  assert.equal(nodes[0].type, 'card');
  assert.deepEqual(nodes[0].position, { x: 0, y: 0 });
});

test('flow-edge -> edge, includes handles only when set', () => {
  const { edges } = elementsToFlow(children(
    `<flow-edge id="e1" source="a" target="b"></flow-edge>
     <flow-edge id="e2" source="a" target="b" source-handle="out" target-handle="in"></flow-edge>`,
  ));
  assert.deepEqual(edges[0], { id: 'e1', source: 'a', target: 'b' });
  assert.deepEqual(edges[1], { id: 'e2', source: 'a', target: 'b', sourceHandle: 'out', targetHandle: 'in' });
});

test('flow-action -> on/method/url with target+swap defaults', () => {
  const { actions } = elementsToFlow(children(
    `<flow-action on="nodeDragStop" hx-post="/nodes/move"></flow-action>
     <flow-action on="nodeClick" hx-get="/nodes/{id}/panel" hx-target="#inspector" hx-swap="innerHTML"></flow-action>`,
  ));
  assert.deepEqual(actions[0], { on: 'nodeDragStop', method: 'post', url: '/nodes/move', target: '#graph', swap: 'morph:innerHTML' });
  assert.deepEqual(actions[1], { on: 'nodeClick', method: 'get', url: '/nodes/{id}/panel', target: '#inspector', swap: 'innerHTML' });
});

test('mixed children partition into nodes/edges/actions', () => {
  const { nodes, edges, actions } = elementsToFlow(children(
    `<flow-action on="connect" hx-post="/edges/create"></flow-action>
     <flow-node id="a" x="0" y="0" slot="node-a"></flow-node>
     <flow-edge id="e1" source="a" target="a"></flow-edge>`,
  ));
  assert.equal(nodes.length, 1);
  assert.equal(edges.length, 1);
  assert.equal(actions.length, 1);
});
