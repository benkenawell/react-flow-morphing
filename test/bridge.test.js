import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventToParams, resolveUrl } from '../src/client/bridge.js';

test('nodeDragStop -> id + position params', () => {
  const { idForUrl, params } = eventToParams('nodeDragStop', { id: 'a', x: 40, y: 55 });
  assert.equal(idForUrl, 'a');
  assert.deepEqual(params, { id: 'a', x: 40, y: 55 });
});

test('connect -> source/target, omits empty handles', () => {
  const { params } = eventToParams('connect', { source: 'a', target: 'b', sourceHandle: '', targetHandle: '' });
  assert.deepEqual(params, { source: 'a', target: 'b' });
});

test('connect -> includes handles when present', () => {
  const { params } = eventToParams('connect', { source: 'a', target: 'b', sourceHandle: 'out', targetHandle: 'in' });
  assert.deepEqual(params, { source: 'a', target: 'b', sourceHandle: 'out', targetHandle: 'in' });
});

test('delete/click events -> id only', () => {
  for (const ev of ['nodeClick', 'edgeClick', 'nodesDelete', 'edgesDelete']) {
    const { idForUrl, params } = eventToParams(ev, { id: 'x' });
    assert.equal(idForUrl, 'x');
    assert.deepEqual(params, { id: 'x' });
  }
});

test('resolveUrl substitutes {id}', () => {
  assert.equal(resolveUrl('/nodes/{id}/delete', 'a'), '/nodes/a/delete');
  assert.equal(resolveUrl('/edges/create', undefined), '/edges/create');
});
