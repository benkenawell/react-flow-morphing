import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NODE_KINDS, isNodeKind, defaultFields } from '../src/server/node-kinds.js';

test('the three domain kinds exist with labels and fields', () => {
  assert.deepEqual(Object.keys(NODE_KINDS).sort(), ['invoice', 'order', 'shipping']);
  for (const k of Object.values(NODE_KINDS)) {
    assert.ok(k.label);
    assert.ok(Array.isArray(k.fields) && k.fields.length > 0);
  }
});

test('amount is a number field; the rest are text', () => {
  assert.equal(NODE_KINDS.order.fields.find((f) => f.name === 'amount').type, 'number');
  assert.equal(NODE_KINDS.invoice.fields.find((f) => f.name === 'amount').type, 'number');
  assert.equal(NODE_KINDS.shipping.fields.find((f) => f.name === 'address').type, 'text');
});

test('isNodeKind guards unknown kinds', () => {
  assert.ok(isNodeKind('order'));
  assert.ok(!isNodeKind('bogus'));
  assert.ok(!isNodeKind('card'));
});

test('defaultFields blanks number→0, text→""', () => {
  assert.deepEqual(defaultFields('invoice'), { amount: 0, phone: '' });
  assert.deepEqual(defaultFields('shipping'), { address: '' });
});
