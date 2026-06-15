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
  assert.match(html, /<react-flow id="graph" hx-include="#inspector-open">/);
  // the hx-include marker exists even with no panel open (empty), so htmx never
  // logs a "selector returned no matches" error
  assert.match(html, /<input id="inspector-open" type="hidden" name="inspectorNode" value=""/);
  assert.match(html, /flow-component\.js/);
  assert.match(html, /hx-ext="morph"/);
  assert.match(html, /<flow-node id="order-42"[^>]*slot="node-order-42"/);
  // whole card is the inspector trigger (htmx in light DOM); no Inspect button,
  // and node click is NOT a flow-action (onNodeClick can't cross the shadow boundary)
  assert.match(html, /<div class="card[^"]*"\s+hx-get="\/nodes\/order-42\/panel" hx-target="#inspector"/);
  assert.doesNotMatch(html, />\s*Inspect\s*</);
  assert.doesNotMatch(html, /<flow-action on="nodeClick"/);
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
  // inspector not open -> no OOB position update (avoids htmx no-target error)
  assert.doesNotMatch(html, /hx-swap-oob/);
});

test('POST /nodes/move OOB-updates Position when the open inspector is the moved node', async () => {
  const res = await fetch(`${base}/nodes/move`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form({ id: 'order-42', x: '10', y: '20', inspectorNode: 'order-42' }),
  });
  const html = await res.text();
  assert.match(html, /<span id="inspector-position-order-42" hx-swap-oob="morph">10, 20<\/span>/);
  // still the whole graph
  assert.match(html, /<flow-node id="ship-7"/);
});

test('POST /nodes/move does NOT OOB when the open inspector is a different node', async () => {
  const res = await fetch(`${base}/nodes/move`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form({ id: 'order-42', x: '30', y: '40', inspectorNode: 'ship-7' }),
  });
  const html = await res.text();
  assert.doesNotMatch(html, /hx-swap-oob/);
});

test('POST /nodes/create adds a node and returns the full graph', async () => {
  const before = (await (await fetch(`${base}/`)).text()).match(/<flow-node /g).length;
  const res = await fetch(`${base}/nodes/create`, { method: 'POST' });
  assert.equal(res.status, 200);
  const html = await res.text();
  const after = html.match(/<flow-node /g).length;
  assert.equal(after, before + 1);
  // new node is a projectable direct child (carries its slot) and existing nodes remain
  assert.match(html, /<flow-node id="node-\d+"[^>]*slot="node-node-\d+"/);
  assert.match(html, /<flow-node id="order-42"/);
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
  // out-of-band inspector refresh is included (morph OOB), pre-filled with the saved value
  assert.match(html, /<aside id="inspector" hx-swap-oob="morph">/);
  assert.match(html, /value="Order #42 \(edited\)"/);
});

test('POST /nodes/:id/data changes status; toggles the Approve button', async () => {
  // ship-7 starts 'ready' (no Approve button). Set it to 'pending'.
  let html = await (await fetch(`${base}/nodes/ship-7/data`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form({ status: 'pending' }),
  })).text();
  assert.match(html, /<flow-node id="ship-7"[\s\S]*?card--pending/);
  assert.match(html, /\/orders\/ship-7\/approve/, 'pending status shows the Approve button');
  // inspector select reflects the saved status
  assert.match(html, /<option value="pending" selected>/);

  // Move it to 'approved' — Approve button goes away.
  html = await (await fetch(`${base}/nodes/ship-7/data`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form({ status: 'approved' }),
  })).text();
  assert.match(html, /<flow-node id="ship-7"[\s\S]*?card--approved/);
  assert.doesNotMatch(html, /\/orders\/ship-7\/approve/);
});

test('POST /nodes/:id/data ignores an unknown status', async () => {
  const html = await (await fetch(`${base}/nodes/order-42/data`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form({ status: 'bogus' }),
  })).text();
  assert.doesNotMatch(html, /card--bogus/);
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
  // Position lives in a node-keyed span so a move's OOB swap can target it
  assert.match(html, /<span id="inspector-position-order-42">/);
  // hidden marker that hx-include carries into flow requests (which node is open)
  assert.match(html, /<input id="inspector-open" type="hidden" name="inspectorNode" value="order-42"/);
});

test('unknown node yields 404', async () => {
  const res = await fetch(`${base}/nodes/ghost/panel`);
  assert.equal(res.status, 404);
});
