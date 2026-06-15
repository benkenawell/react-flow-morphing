import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server/app.js';
import { createStore } from '../src/server/graph-store.js';

let server;
let base;
let store;

before(async () => {
  store = createStore({
    nodes: [
      { id: 'order-42', x: 40, y: 80, type: 'card', data: { title: 'Order #42', status: 'pending', amount: '$5' } },
      { id: 'ship-7', x: 300, y: 40, type: 'card', data: { title: 'Shipment #7', status: 'ready', amount: '1kg' } },
    ],
    edges: [{ id: 'e1', source: 'order-42', target: 'ship-7' }],
  });
  server = createApp({ store }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const form = (obj) => new URLSearchParams(obj);

test('GET / renders the full page with the web component and graph', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<react-flow id="graph">/);
  assert.match(html, /flow-component\.js/);
  assert.match(html, /hx-ext="morph"/);
  assert.match(html, /<flow-node id="order-42"[^>]*slot="node-order-42"/);
});

test('POST /nodes/move returns the WHOLE graph with updated coords', async () => {
  const res = await fetch(`${base}/nodes/move`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form({ id: 'order-42', x: '123', y: '222' }),
  });
  assert.equal(res.status, 200);
  const html = await res.text();
  // updated node...
  assert.match(html, /<flow-node id="order-42"[^>]*x="123"[^>]*y="222"/);
  // ...and the full list is returned (other node + actions present)
  assert.match(html, /<flow-node id="ship-7"/);
  assert.match(html, /<flow-action on="nodeDragStop"/);
});

test('POST /edges/create adds an edge and echoes the full graph', async () => {
  const res = await fetch(`${base}/edges/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form({ source: 'ship-7', target: 'order-42' }),
  });
  const html = await res.text();
  assert.match(html, /<flow-edge id="[^"]+" source="ship-7" target="order-42"/);
});

test('POST /orders/:id/approve mutates the node body (status badge)', async () => {
  const res = await fetch(`${base}/orders/order-42/approve`, { method: 'POST' });
  const html = await res.text();
  assert.match(html, /card--approved/);
  // approved node no longer offers the Approve button
  assert.doesNotMatch(html, /\/orders\/order-42\/approve/);
});

test('POST /nodes/:id/data edits fields; updates card + OOB inspector', async () => {
  const res = await fetch(`${base}/nodes/order-42/data`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form({ title: 'Order #42 (edited)', amount: '$9.99' }),
  });
  assert.equal(res.status, 200);
  const html = await res.text();
  // node card (in the morphed graph) reflects the new title/amount
  assert.match(html, /Order #42 \(edited\)/);
  assert.match(html, /\$9\.99/);
  // out-of-band inspector refresh is included, pre-filled with the saved value
  assert.match(html, /id="inspector" hx-swap-oob="innerHTML"/);
  assert.match(html, /value="Order #42 \(edited\)"/);
});

test('POST /nodes/:id/delete drops the node and returns full graph', async () => {
  const res = await fetch(`${base}/nodes/ship-7/delete`, { method: 'POST' });
  const html = await res.text();
  assert.doesNotMatch(html, /<flow-node id="ship-7"/);
  assert.match(html, /<flow-node id="order-42"/);
});

test('GET /nodes/:id/panel returns the inspector partial', async () => {
  const res = await fetch(`${base}/nodes/order-42/panel`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Order #42/);
  assert.match(html, /order-42/);
});

test('unknown node yields 404', async () => {
  const res = await fetch(`${base}/nodes/ghost/panel`);
  assert.equal(res.status, 404);
});
