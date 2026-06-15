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
  #observer = null;
  #version = 0;
  #actions = [];
  #scheduled = false;
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

    // Re-derive the model whenever the light DOM changes (htmx/idiomorph morphs).
    this.#observer = new MutationObserver(() => this.#scheduleRender());
    this.#observer.observe(this, { childList: true, subtree: true, attributes: true });

    this.#render();
  }

  disconnectedCallback() {
    this.#observer?.disconnect();
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
    // idiomorph PRESERVES existing elements (so their htmx bindings survive a
    // morph) but ADDED nodes are fresh DOM htmx has never seen — e.g. a new
    // node's Inspect button. Re-process the light DOM so those controls work
    // without a page reload. htmx.process is idempotent on already-bound nodes.
    window.htmx?.process(this);
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

if (!customElements.get('react-flow')) {
  customElements.define('react-flow', ReactFlowElement);
}
