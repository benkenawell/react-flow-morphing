// Domain node kinds (order/shipping/invoice) — the single source of truth for the
// Add-node picker, the inspector inputs, the node-body display, the create defaults,
// and the edit-field allowlist. NOTE: this is distinct from React Flow's render
// `type` (always 'card' → the slot-rendering CardNode); `kind` is server-only, which
// is why adding domain types needs no client/bundle changes. Add a kind here only.
export const NODE_KINDS = {
  order: {
    label: 'Order',
    fields: [
      { name: 'amount', label: 'Amount', type: 'number' },
      { name: 'estimatedDelivery', label: 'Estimated delivery', type: 'text' },
    ],
  },
  shipping: {
    label: 'Shipping',
    fields: [{ name: 'address', label: 'Address', type: 'text' }],
  },
  invoice: {
    label: 'Invoice',
    fields: [
      { name: 'amount', label: 'Amount', type: 'number' },
      { name: 'phone', label: 'Phone', type: 'text' },
    ],
  },
};

export function isNodeKind(kind) {
  return Object.hasOwn(NODE_KINDS, kind);
}

/** Blank field values for a new node of `kind` (number → 0, text → ''). */
export function defaultFields(kind) {
  const out = {};
  for (const f of NODE_KINDS[kind].fields) out[f.name] = f.type === 'number' ? 0 : '';
  return out;
}
