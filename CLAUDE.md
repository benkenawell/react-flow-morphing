# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **server-driven** graph editor. React Flow renders the canvas, but the **server owns all state**
and drives the UI with HTML over the wire (htmx + idiomorph). React Flow is wrapped in a `<react-flow>`
custom element whose **light-DOM children are the declarative graph**.

## Commands

- `npm install` — deps (Node 24 via mise; `mise install` first).
- `npm run build` — esbuild bundles the client to `public/flow-component.js` and copies vendor JS to `public/vendor/`.
- `npm run dev` — esbuild `--watch` + `node --watch` server.
- `npm start` — build then serve on http://localhost:3000.
- `npm test` / `node --test` — full suite. Single file: `node --test test/routes.test.js`. Single case: `node --test --test-name-pattern "moveNode"`.

## Architecture — the unidirectional loop

The whole design exists to stop htmx/morph and React from fighting over the DOM. They never touch the
same nodes:

- **Light DOM** = server truth + htmx. The `<flow-node>`/`<flow-edge>`/`<flow-action>` children of
  `<react-flow id="graph">`, plus any htmx controls *inside* node bodies, all live and run here.
- **Shadow DOM** = React Flow. It only *reads* the light-DOM children (via `MutationObserver`) and
  *emits* interaction events. **It never writes light DOM** — that's what prevents a morph/React loop.

Flow of one action (e.g. drag):
1. React Flow fires `onNodeDragStop` inside the shadow DOM.
2. `react-flow.element.jsx` `#emit()` finds the matching `<flow-action on="nodeDragStop">`, builds params
   via `bridge.js`, and calls `htmx.ajax(...)` to its configured endpoint.
3. Express mutates the in-memory `graph-store`, re-renders **the entire graph** (`_graph.njk`).
4. **idiomorph** morphs that whole fragment into `#graph`'s light DOM, matching `<flow-node>` by stable
   `id` so only changed nodes mutate (untouched DOM identity preserved).
5. The element's `MutationObserver` fires → `elementsToFlow()` re-derives the model → React reconciles.

Node bodies are **server HTML projected through a named `<slot>`**: each `<flow-node>` is a *direct*
child of `<react-flow>` carrying `slot="node-{id}"` (slots only project direct host children), and the
`CardNode` React component renders `<slot name="node-{id}">`. So React owns layout/handles; the server
owns every node's visible HTML, and htmx buttons inside nodes Just Work (they're light DOM).

## Where things live

- `src/server/graph-store.js` — **pure** in-memory model (`createStore`, `moveNode`, `addEdge`, …). No
  Express deps → unit-tested directly.
- `src/server/app.js` — Express factory. **Every action route returns the whole `_graph.njk` fragment**;
  idiomorph does the diffing. `createApp({store})` is exported separately from `server.js` so tests bind
  an ephemeral port.
- `src/server/actions.js` — the `<flow-action>` wiring (event name → endpoint), rendered into the graph.
- `src/server/views/` — `page.njk` (shell; card CSS lives here since slotted bodies are styled by
  *document* CSS, not shadow CSS), `_graph.njk`, `_node-body.njk`, `_inspector.njk`.
- `src/client/model.js` + `bridge.js` — **pure, browser-free** (tested with linkedom). model = light DOM →
  React Flow inputs; bridge = React Flow event → htmx params + `{id}` URL substitution.
- `src/client/react-flow.element.jsx` — the custom element (shadow root, React root, observer, `#emit`).
- `src/client/canvas.jsx` / `node-types.jsx` — controlled React Flow + the slot-rendering `CardNode`.

## Conventions / gotchas

- **Keep client logic pure where possible.** `model.js`/`bridge.js` have no DOM globals so `node:test`
  can cover them with linkedom. Put browser-only wiring in `react-flow.element.jsx`.
- A named `<slot>` projects **only direct children of the shadow host** — keep `slot="node-{id}"` on the
  `<flow-node>` element itself, never on a nested wrapper.
- Action routes must return the **full** graph, not a surgical fragment — idiomorph relies on stable
  `id`s to minimize the mutation. New node types: add a branch in `_node-body.njk` and register the
  React component in `node-types.jsx`.
- New interaction events: add a `<flow-action on="...">` (in `actions.js`) + a `case` in `bridge.js` +
  the React Flow handler in `canvas.jsx`.
- React Flow CSS is injected into the shadow root (`styles.js`, imported as text by esbuild's `.css` loader).

## Verification beyond tests

`node --test` covers the store, routes (full-graph responses), and the pure client modules. The
**in-browser loop** (slot projection, drag→morph→reconcile) is visual — verify manually via
`npm start` per the steps in `/Users/benjaminkenawell/.claude/plans/i-want-to-build-smooth-spring.md`.
