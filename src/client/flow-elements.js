// The declarative graph as real custom elements. They are *data carriers*: they
// validate + reflect their attributes and announce changes with a bubbling-to-host
// `flow:changed` event, but they never touch React — <react-flow> still owns all
// state and reads them via model.js. Parsing is delegated to the same model.js
// helpers the host uses, so there's one schema and no drift.
// Parsing + validation are pure and live in model.js (one schema, and importable
// in node:test without the DOM globals these custom-element classes need).
import { toNode, toEdge, toAction, nodeIssues, edgeIssues, actionIssues } from './model.js';

function warn(tag, issues) {
  for (const issue of issues) console.warn(`[${tag}] ${issue}`);
}

// --- Base: lifecycle → validate + notify the host ---------------------------------
class FlowDataElement extends HTMLElement {
  #host = null;

  connectedCallback() {
    this.#host = this.closest('react-flow');
    this.validate();
    this.#signal();
  }

  attributeChangedCallback() {
    if (!this.isConnected) return;
    this.validate();
    this.#signal();
  }

  disconnectedCallback() {
    this.#signal(); // tell the (cached) host this child went away
    this.#host = null;
  }

  // Dispatch directly on the host so removal still notifies (a detached element
  // can't bubble to its former parent).
  #signal() {
    if (this.#host?.isConnected) this.#host.dispatchEvent(new CustomEvent('flow:changed'));
  }

  validate() {}
}

// --- The three carriers -----------------------------------------------------------
export class FlowNode extends FlowDataElement {
  static get observedAttributes() {
    return ['id', 'type', 'x', 'y', 'slot'];
  }

  get x() { return Number(this.getAttribute('x')) || 0; }
  set x(v) { this.setAttribute('x', String(v)); }
  get y() { return Number(this.getAttribute('y')) || 0; }
  set y(v) { this.setAttribute('y', String(v)); }
  get type() { return this.getAttribute('type') || 'card'; }
  set type(v) { this.setAttribute('type', v); }

  toModel() { return toNode(this); }
  validate() { warn('flow-node', nodeIssues(this)); }
}

export class FlowEdge extends FlowDataElement {
  static get observedAttributes() {
    return ['id', 'source', 'target', 'source-handle', 'target-handle', 'label'];
  }

  get source() { return this.getAttribute('source'); }
  set source(v) { this.setAttribute('source', v); }
  get target() { return this.getAttribute('target'); }
  set target(v) { this.setAttribute('target', v); }
  get sourceHandle() { return this.getAttribute('source-handle'); }
  set sourceHandle(v) { this.setAttribute('source-handle', v); }
  get targetHandle() { return this.getAttribute('target-handle'); }
  set targetHandle(v) { this.setAttribute('target-handle', v); }

  toModel() { return toEdge(this); }
  validate() { warn('flow-edge', edgeIssues(this)); }
}

export class FlowAction extends FlowDataElement {
  static get observedAttributes() {
    return ['on', 'hx-get', 'hx-post', 'hx-put', 'hx-patch', 'hx-delete', 'hx-target', 'hx-swap'];
  }

  get on() { return this.getAttribute('on'); }
  set on(v) { this.setAttribute('on', v); }

  toModel() { return toAction(this); }
  validate() { warn('flow-action', actionIssues(this)); }
}

export function defineFlowElements() {
  if (!customElements.get('flow-node')) customElements.define('flow-node', FlowNode);
  if (!customElements.get('flow-edge')) customElements.define('flow-edge', FlowEdge);
  if (!customElements.get('flow-action')) customElements.define('flow-action', FlowAction);
}
