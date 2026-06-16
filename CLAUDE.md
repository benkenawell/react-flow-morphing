# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **server-driven** graph editor. React Flow renders the canvas, but the **server owns all state**
and drives the UI with HTML over the wire (htmx v4, which has built-in morph). React Flow is wrapped in a `<react-flow>`
custom element whose **light-DOM children are the declarative graph**.

## Commands

Package manager is **pnpm** (via mise). Run `mise install` first to get Node + pnpm.

- `pnpm install` — deps.
- `pnpm run build` — esbuild bundles the client to `public/flow-component.js` and copies vendor JS to `public/vendor/`.
- `pnpm run dev` — esbuild `--watch` + `node --watch` server.
- `pnpm start` — build then serve on http://localhost:3000.
- `pnpm test` / `node --test` — full suite. Single file: `node --test test/routes.test.js`. Single case: `node --test --test-name-pattern "moveNode"`.

## htmx 4 reference

htmx 4 ships skill/guidance files for LLMs at:
`node_modules/.pnpm/htmx.org@<version>/node_modules/htmx.org/dist/skills/`

Files: `htmx-guidance.md`, `htmx-upgrade-from-htmx2.md`, `htmx-migration.md`, `htmx-debugging.md`, `htmx-extension-authoring.md`.

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
4. **htmx's built-in morph** morphs that whole fragment into `#graph`'s light DOM, matching `<flow-node>` by stable
   `id` so only changed nodes mutate (untouched DOM identity preserved).
5. The morphed `<flow-*>` children fire a bubbling `flow:changed` → the host re-derives via
   `elementsToFlow()` → React reconciles.

Node bodies are **server HTML projected through a named `<slot>`**: each `<flow-node>` is a *direct*
child of `<react-flow>` carrying `slot="node-{id}"` (slots only project direct host children), and the
`CardNode` React component renders `<slot name="node-{id}">`. So React owns layout/handles; the server
owns every node's visible HTML, and htmx buttons inside nodes Just Work (they're light DOM).

## Where things live

- `src/server/graph-store.js` — **pure** in-memory model (`createStore`, `moveNode`, `addEdge`, …). No
  Express deps → unit-tested directly.
- `src/server/app.js` — Express factory. **Every action route returns the whole `_graph.njk` fragment**;
  htmx's morph does the diffing. `createApp({store})` is exported separately from `server.js` so tests bind
  an ephemeral port.
- `src/server/actions.js` — the `<flow-action>` wiring (event name → endpoint), rendered into the graph.
- `src/server/views/` — `page.njk` (shell + header toolbar whose "Add node" button is light-DOM htmx
  posting to `/nodes/create`; card CSS lives here since slotted bodies are styled by *document* CSS, not
  shadow CSS), `_graph.njk`, `_node-body.njk`, `_inspector.njk` (editable form), `_graph-oob-inspector.njk`
  (edit response: graph + `<hx-partial>` inspector refresh).
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
  badge no longer re-render the canvas). `index.js` defines
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
- Action routes must return the **full** graph, not a surgical fragment — morph relies on stable
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
  the response morphs `#graph` (so the node card updates) and refreshes `#inspector` via `<hx-partial>`. Add a
  new editable field by adding the input to `_inspector.njk` and the key to the route's allowlist in `app.js`.
- **Live cross-panel updates via `<hx-partial>`.** A drag starts on the canvas, but its `POST /nodes/move`
  response can also carry a `<hx-partial hx-target="#inspector-position-{id}" hx-swap="innerHTML">` (see
  `_graph-oob-position.njk`) to update the inspector's Position. If the target doesn't exist in the DOM
  (panel not open for that node), htmx silently skips it. The server still conditionally emits the partial
  only when the panel is open, to keep responses minimal. That "is it open?" signal is carried
  **declaratively, not in JS**: the inspector panel renders a hidden
  `<input id="inspector-open" name="inspectorNode" value="{id}">`, and
  `<react-flow hx-include="#inspector-open">` makes htmx pull it into every flow request (the bridge
  passes the host as the htmx `source`, so its `hx-include` is honored). The move
  route emits the partial only when `req.body.inspectorNode === movedId`. **No server state** (the
  open-node id lives in the DOM and rides along per-request) and **no per-action client JS**. Note: an
  `hx-include` selector that matches **zero** elements makes htmx log an error, so the marker must
  ALWAYS exist — `page.njk` seeds an empty `#inspector-open` in `#inspector` (replaced by the
  node-valued one when a panel opens), and the "Click a node" placeholder is server-rendered
  (`.inspector-placeholder`) rather than CSS `:empty` (the seed makes it non-empty). General pattern for
  "update another panel iff it's showing the affected entity": panel renders a hidden marker → host
  `hx-include` carries it → server compares and conditionally emits a `<hx-partial>`.
- **Node status** is an enum in `src/server/statuses.js` (`STATUSES` / `isStatus`) — the single source
  of truth for the inspector's `<select>` (exposed to all templates via `env.addGlobal('statuses', …)`),
  the route's validation, and the `.card--{status}` CSS in `page.njk`. Add a status in all three when
  extending it (the route rejects unknown values so cards stay styleable).
- **`<hx-partial>` for multi-region updates.** Instead of `hx-swap-oob`, responses include
  `<hx-partial hx-target="..." hx-swap="...">` tags. Each partial specifies its own target and swap
  strategy explicitly. htmx processes partials after the main content swap. See
  `_graph-oob-inspector.njk` and `_graph-oob-position.njk`.
- **New controls added by a morph are automatically processed by htmx v4.** Unlike the old idiomorph
  extension, htmx v4's built-in morph handles element processing natively — no manual `htmx.process()`
  call needed.

## Verification beyond tests

`node --test` covers the store, routes (full-graph responses), and the pure client modules. The
**in-browser loop** (slot projection, drag→morph→reconcile) is visual — verify manually via
`npm start` per the steps in `/Users/benjaminkenawell/.claude/plans/i-want-to-build-smooth-spring.md`.
