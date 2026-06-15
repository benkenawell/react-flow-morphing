# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **server-driven** graph editor. React Flow renders the canvas, but the **server owns all state**
and drives the UI with HTML over the wire (htmx + idiomorph). React Flow is wrapped in a `<react-flow>`
custom element whose **light-DOM children are the declarative graph**.

## Commands

Package manager is **pnpm** (via mise). Run `mise install` first to get Node + pnpm.

- `pnpm install` — deps.
- `pnpm run build` — esbuild bundles the client to `public/flow-component.js` and copies vendor JS to `public/vendor/`.
- `pnpm run dev` — esbuild `--watch` + `node --watch` server.
- `pnpm start` — build then serve on http://localhost:3000.
- `pnpm test` / `node --test` — full suite. Single file: `node --test test/routes.test.js`. Single case: `node --test --test-name-pattern "moveNode"`.

**pnpm gotcha:** esbuild has a postinstall (fetches its platform binary); pnpm blocks build scripts by
default. It's allowlisted in `pnpm-workspace.yaml` (`allowBuilds: { esbuild: true }`). If install logs
`ERR_PNPM_IGNORED_BUILDS`, run `pnpm install --force` to run the approved build and clear the gate.

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
- `src/server/views/` — `page.njk` (shell + header toolbar whose "Add node" button is light-DOM htmx
  posting to `/nodes/create`; card CSS lives here since slotted bodies are styled by *document* CSS, not
  shadow CSS), `_graph.njk`, `_node-body.njk`, `_inspector.njk` (editable form), `_graph-oob-inspector.njk`
  (edit response: graph + OOB inspector refresh).
- `src/client/model.js` + `bridge.js` — **pure, browser-free** (tested with linkedom). model = light DOM →
  React Flow inputs; bridge = React Flow event → htmx params + `{id}` URL substitution.
- `src/client/react-flow.element.jsx` — the custom element (shadow root, React root, observer, `#emit`).
- `src/client/canvas.jsx` / `node-types.jsx` — controlled React Flow + the slot-rendering `CardNode`.
  Canvas also configures multi-select (`selectionOnDrag`; pan via middle/right mouse or scroll) and a
  `SelectionTools` panel (count + bulk delete). Selection is **client-side only** — it never hits the
  server; only the resulting deletes do, via the existing `nodesDelete` path. The panel renders in the
  shadow root, so its CSS lives in `styles.js` (`shadowCss`), not `page.njk`.

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
- **Editable fields** are plain htmx forms in the inspector (light DOM) that POST to `/nodes/:id/data`;
  the response morphs `#graph` (so the node card updates) and refreshes `#inspector` out-of-band. Add a
  new editable field by adding the input to `_inspector.njk` and the key to the route's allowlist in `app.js`.
- **OOB swaps must use a `morph` style.** Because `hx-ext="morph"` is on `<body>`, the idiomorph
  extension intercepts every OOB swap, and its `isInlineSwap()` throws on non-morph styles like
  `innerHTML` (`Cannot read properties of undefined (reading 'swapStyle')`). Use `hx-swap-oob="morph"`
  and make the OOB element's tag match the real element (it morphs *outerHTML* in place) — see
  `_graph-oob-inspector.njk`. Don't write `morph:innerHTML` in `hx-swap-oob`: the `:` collides with the
  OOB `style:selector` syntax.
- **New controls added by a morph need re-processing.** idiomorph preserves existing elements (their
  htmx bindings survive) but *added* nodes are fresh DOM htmx never saw, so their hx-* controls (e.g. a
  new node's Inspect button) won't fire until processed. `react-flow.element.jsx` `#render()` calls
  `window.htmx.process(this)` after every morph to bind them (idempotent on already-bound nodes).

## Verification beyond tests

`node --test` covers the store, routes (full-graph responses), and the pure client modules. The
**in-browser loop** (slot projection, drag→morph→reconcile) is visual — verify manually via
`npm start` per the steps in `/Users/benjaminkenawell/.claude/plans/i-want-to-build-smooth-spring.md`.
