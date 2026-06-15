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
5. The morphed `<flow-*>` children fire a bubbling `flow:changed` → the host re-derives via
   `elementsToFlow()` → React reconciles. (And `htmx:afterSwap` on the host → `htmx.process(this)` to
   bind any idiomorph-added controls.)

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
  React Flow inputs (`elementsToFlow` prefers `el.toModel()`, falls back to attribute parsing) + the pure
  `*Issues` validators; bridge = React Flow event → htmx params + `{id}` URL substitution.
- `src/client/flow-elements.js` — `<flow-node>`/`<flow-edge>`/`<flow-action>` as **custom elements**:
  typed/reflected attributes, validation (`console.warn` on a bad/missing attr — non-throwing), and a
  bubbling-to-host `flow:changed` on connect/disconnect/observed-attr-change. They're **data carriers
  only** — they never touch React; the host reads them. Parsing/validation is delegated to `model.js`
  (one schema; importable in node:test without DOM globals, since these classes `extends HTMLElement`).
- `src/client/react-flow.element.jsx` — the host custom element (shadow root, React root, `#emit`,
  request `#queue`). Listens for `flow:changed` (re-derive/re-render — so in-body morphs like a status
  badge no longer re-render the canvas) and `htmx:afterSwap` (→ `htmx.process(this)`). `index.js` defines
  the data carriers **before** the host so the first render sees upgraded children.
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
  `id`s to minimize the mutation.
- **Node "kind" (domain type) is server-only.** Because bodies are server HTML projected through a slot,
  React Flow's node component is type-agnostic, so domain types (order/shipping/invoice) need **no
  client changes**. Every `<flow-node>` keeps React Flow render `type="card"` (→ `CardNode`); the
  separate `kind` field drives everything via the registry in `src/server/node-kinds.js` (`NODE_KINDS`):
  the Add-node dialog buttons, the inspector inputs (`_inspector.njk` loops `nodeKinds[kind].fields`),
  the body display (`_node-body.njk`), `addNode` defaults, and the `/nodes/:id/data` edit allowlist
  (derived from the node's kind so a request can't write another kind's fields). **Add a new domain type
  by adding one entry to `NODE_KINDS` — nothing else.** Don't overload React Flow's `type` for this (that
  would need a `nodeTypes` registration in `canvas.jsx`, i.e. a client change). The Add-node picker is a
  `<dialog>` opened/closed by the Invoker Commands API (`command`/`commandfor`, no JS); each type button
  also fires its htmx create on the same click.
- New interaction events: add a `<flow-action on="...">` (in `actions.js`) + a `case` in `bridge.js` +
  the React Flow handler in `canvas.jsx`. **Caveat:** this only works for React Flow events backed by
  *native* listeners (drag, connect, delete) — they cross the shadow/slot boundary. React *synthetic*
  events like `onNodeClick` do **not** fire for clicks on slotted (light-DOM) node bodies, because React
  resolves the target fiber via the real `parentNode` chain, which for projected content never enters
  React's shadow tree. So **interactions on a node's body must be plain htmx in light DOM** (see the
  whole-card inspector trigger in `_node-body.njk`), not a flow-action.
- Nested htmx triggers: a click on a control inside the card (e.g. Approve) also bubbles to the card's
  own `hx-get`. Add `hx-trigger="click consume"` to the inner control to stop that.
- React Flow CSS is injected into the shadow root (`styles.js`, imported as text by esbuild's `.css` loader).
- **Editable fields** are plain htmx forms in the inspector (light DOM) that POST to `/nodes/:id/data`;
  the response morphs `#graph` (so the node card updates) and refreshes `#inspector` out-of-band. Add a
  new editable field by adding the input to `_inspector.njk` and the key to the route's allowlist in `app.js`.
- **Live cross-panel updates via id-targeted OOB.** A drag starts on the canvas, but its `POST /nodes/move`
  response can also carry an OOB `<span id="inspector-position-{id}" hx-swap-oob="morph">` (see
  `_graph-oob-position.njk`) to update the inspector's Position. **Gotcha:** an OOB whose id has no match
  in the DOM makes htmx log an `htmx:oobErrorNoTarget` **console.error** — and it's unsuppressable (htmx
  logs in `triggerEvent` *before* dispatching the event, so no listener can stop it). So you can't just
  "always emit the OOB and let id-matching decide" — the server must omit the OOB unless the panel is
  open for that node. That "is it open?" signal is carried **declaratively, not in JS**: the inspector
  panel renders a hidden `<input id="inspector-open" name="inspectorNode" value="{id}">`, and
  `<react-flow hx-include="#inspector-open">` makes htmx pull it into every flow request (the bridge
  passes the host as the htmx `source`, so its `hx-include` is honored — htmx.js:3638/4074). The move
  route OOB-updates Position only when `req.body.inspectorNode === movedId`. **No server state** (the
  open-node id lives in the DOM and rides along per-request) and **no per-action client JS**. Note: an
  `hx-include` selector that matches **zero** elements makes htmx `logError` ("returned no matches!",
  htmx.js:1372), so the marker must ALWAYS exist — `page.njk` seeds an empty `#inspector-open` in
  `#inspector` (replaced by the node-valued one when a panel opens), and the "Click a node" placeholder
  is server-rendered (`.inspector-placeholder`) rather than CSS `:empty` (the seed makes it non-empty).
  General pattern for
  "update another panel iff it's showing the affected entity": panel renders a hidden marker → host
  `hx-include` carries it → server compares and conditionally OOBs. Use a `<span>` (not `<dd>`/`<td>`
  etc.) for the OOB target so the standalone fragment isn't dropped by context-sensitive HTML parsing.
- **Node status** is an enum in `src/server/statuses.js` (`STATUSES` / `isStatus`) — the single source
  of truth for the inspector's `<select>` (exposed to all templates via `env.addGlobal('statuses', …)`),
  the route's validation, and the `.card--{status}` CSS in `page.njk`. Add a status in all three when
  extending it (the route rejects unknown values so cards stay styleable).
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
