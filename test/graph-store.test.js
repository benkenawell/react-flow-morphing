import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, NotFound } from '../src/server/graph-store.js';

const seed = () => ({
  nodes: [
    { id: 'a', x: 0, y: 0, type: 'card', data: { status: 'pending' } },
    { id: 'b', x: 100, y: 100, type: 'card', data: { status: 'ready' } },
  ],
  edges: [{ id: 'e1', source: 'a', target: 'b' }],
});

test('moveNode updates coordinates as numbers', () => {
  const store = createStore(seed());
  store.moveNode('a', '40', '55');
  const node = store.toViewModel().nodes.find((n) => n.id === 'a');
  assert.deepEqual([node.x, node.y], [40, 55]);
});

test('moveNode on missing node throws NotFound', () => {
  const store = createStore(seed());
  assert.throws(() => store.moveNode('nope', 1, 2), NotFound);
});

test('addEdge validates endpoints and assigns an id', () => {
  const store = createStore(seed());
  const edge = store.addEdge({ source: 'b', target: 'a' });
  assert.equal(edge.source, 'b');
  assert.ok(edge.id);
  assert.equal(store.toViewModel().edges.length, 2);
  assert.throws(() => store.addEdge({ source: 'a', target: 'ghost' }), NotFound);
});

test('deleteNode also removes incident edges', () => {
  const store = createStore(seed());
  store.deleteNode('a');
  const vm = store.toViewModel();
  assert.equal(vm.nodes.find((n) => n.id === 'a'), undefined);
  assert.equal(vm.edges.length, 0, 'edge e1 touched node a and should be gone');
});

test('setNodeData merges patch', () => {
  const store = createStore(seed());
  store.setNodeData('a', { status: 'approved' });
  const node = store.toViewModel().nodes.find((n) => n.id === 'a');
  assert.equal(node.data.status, 'approved');
});

test('toViewModel returns copies (no leaking internal refs)', () => {
  const store = createStore(seed());
  const vm = store.toViewModel();
  vm.nodes[0].data.status = 'mutated';
  assert.notEqual(store.toViewModel().nodes[0].data.status, 'mutated');
});
