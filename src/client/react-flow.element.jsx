import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import { FlowCanvas } from './canvas.jsx';
import { elementsToFlow } from './model.js';
import { eventToParams, resolveUrl } from './bridge.js';
import { shadowCss } from './styles.js';

// <react-flow>: hosts React Flow in shadow DOM. Its light-DOM children are the
// declarative graph (the server's truth). It only READS those children and EMITS
// interaction events as htmx requests — it never writes light DOM, so morphs and
// React never fight.
class ReactFlowElement extends HTMLElement {
  #root = null;
  #version = 0;
  #actions = [];
  #scheduled = false;
  #onFlowChanged = () => this.#scheduleRender();
  // idiomorph adds fresh DOM htmx hasn't bound (a new node's Inspect trigger, a
  // newly-shown Approve button). Every graph morph is an htmx swap targeting
  // #graph (= this), so re-process this subtree after each swap. Idempotent.
  #onAfterSwap = () => window.htmx?.process(this);
  // Serializes outgoing requests so their whole-graph responses morph IN ORDER.
  // Without this, concurrent actions (multi-delete, drag-while-saving, the edge
  // deletes React Flow fires alongside a node delete) race and the last response
  // to land wins — which can resurrect already-deleted state.
  #queue = Promise.resolve();

  connectedCallback() {
    // connectedCallback can fire again after a disconnect/reconnect; attachShadow
    // throws if a root already exists, so reuse it. Rebuild the style + mount each
    // time so React's createRoot always gets a clean container (the prior root, if
    // any, was unmounted in disconnectedCallback).
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    shadow.replaceChildren();

    const style = document.createElement('style');
    style.textContent = shadowCss;
    shadow.append(style);

    const mount = document.createElement('div');
    mount.className = 'rf-root';
    shadow.append(mount);

    this.#root = createRoot(mount);

    // Precise signals instead of a catch-all observer: the <flow-*> children fire
    // `flow:changed` when the graph model changes (so an in-body morph like a status
    // badge does NOT re-render the canvas), and htmx's own afterSwap drives binding.
    this.addEventListener('flow:changed', this.#onFlowChanged);
    this.addEventListener('htmx:afterSwap', this.#onAfterSwap);

    this.#render();
  }

  disconnectedCallback() {
    this.removeEventListener('flow:changed', this.#onFlowChanged);
    this.removeEventListener('htmx:afterSwap', this.#onAfterSwap);
    // Defer unmount out of React's commit phase.
    const root = this.#root;
    this.#root = null;
    queueMicrotask(() => root?.unmount());
  }

  // Coalesce bursts of mutations from a single morph into one render.
  #scheduleRender() {
    if (this.#scheduled) return;
    this.#scheduled = true;
    queueMicrotask(() => {
      this.#scheduled = false;
      this.#render();
    });
  }

  #render() {
    if (!this.#root) return;
    const { nodes, edges, actions } = elementsToFlow(this.children);
    this.#actions = actions;
    this.#version += 1;
    this.#root.render(
      <StrictMode>
        <ReactFlowProvider>
          <FlowCanvas
            version={this.#version}
            nodes={nodes}
            edges={edges}
            emit={(name, data) => this.#emit(name, data)}
          />
        </ReactFlowProvider>
      </StrictMode>,
    );
  }

  // Bridge a React Flow event to its configured <flow-action> endpoint via htmx.
  #emit(eventName, data) {
    const action = this.#actions.find((a) => a.on === eventName);
    if (!action || !action.url) return;
    const { idForUrl, params } = eventToParams(eventName, data);
    const url = resolveUrl(action.url, idForUrl);
    const htmx = window.htmx;
    if (!htmx) {
      console.warn('[react-flow] htmx not loaded; cannot emit', eventName);
      return;
    }
    // Chain onto the queue so each whole-graph response morphs before the next
    // request fires — responses then apply in the order the actions happened.
    // `source: this` lets htmx honor the host's hx-include (e.g. the open
    // inspector's node id) declaratively — no per-action JS here.
    this.#queue = this.#queue
      .then(() =>
        htmx.ajax(action.method.toUpperCase(), url, {
          source: this,
          target: action.target,
          swap: action.swap,
          values: params,
        }),
      )
      .catch((err) => console.warn('[react-flow] emit failed', eventName, err));
  }
}

export function defineReactFlow() {
  if (!customElements.get('react-flow')) customElements.define('react-flow', ReactFlowElement);
}
