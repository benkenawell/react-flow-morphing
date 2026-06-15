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

  connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' });

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
    htmx.ajax(action.method.toUpperCase(), url, {
      source: this,
      target: action.target,
      swap: action.swap,
      values: params,
    });
  }
}

if (!customElements.get('react-flow')) {
  customElements.define('react-flow', ReactFlowElement);
}
