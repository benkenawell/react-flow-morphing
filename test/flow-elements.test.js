import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { nodeIssues, edgeIssues, actionIssues } from '../src/client/model.js';

// The custom-element lifecycle (flow:changed, attributeChangedCallback) is
// browser-only; here we cover the pure validation logic with element stubs.
function el(html) {
  const { document } = parseHTML(`<react-flow>${html}</react-flow>`);
  return document.querySelector('react-flow').children[0];
}

test('nodeIssues flags a missing id', () => {
  assert.deepEqual(nodeIssues(el('<flow-node x="1" y="2"></flow-node>')), [
    'missing required attribute "id"',
  ]);
  assert.deepEqual(nodeIssues(el('<flow-node id="a" x="1" y="2"></flow-node>')), []);
});

test('edgeIssues flags each missing required attribute', () => {
  assert.deepEqual(edgeIssues(el('<flow-edge></flow-edge>')), [
    'missing required attribute "id"',
    'missing required attribute "source"',
    'missing required attribute "target"',
  ]);
  assert.deepEqual(edgeIssues(el('<flow-edge id="e" source="a" target="b"></flow-edge>')), []);
});

test('actionIssues requires on + an endpoint', () => {
  assert.deepEqual(actionIssues(el('<flow-action></flow-action>')), [
    'missing required attribute "on"',
    'missing an hx-get/hx-post/… endpoint',
  ]);
  assert.deepEqual(
    actionIssues(el('<flow-action on="connect" hx-post="/edges/create"></flow-action>')),
    [],
  );
});
