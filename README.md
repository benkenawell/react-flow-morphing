# react-flow-morphing

Server-driven React Flow. The **server owns graph state** and drives the UI with HTML over the wire
(htmx + idiomorph). React Flow is wrapped in a `<react-flow>` web component whose **light-DOM children
are the declarative graph**; node bodies are server HTML projected through slots.

```
React Flow event (shadow DOM)
   → <flow-action> endpoint via htmx.ajax
   → Express mutates in-memory store
   → renders the WHOLE graph fragment
   → idiomorph morphs it into light DOM (diffs by id)
   → MutationObserver → React Flow reconciles
```

Light DOM = server truth + htmx. Shadow DOM = React Flow, which only *reads* the children and *emits*
events — it never writes light DOM, so morph and React never fight.

## Run

```bash
mise install        # Node + pnpm (see mise.toml)
pnpm install
pnpm start          # build + serve http://localhost:3000
pnpm run dev        # watch mode
pnpm test           # node --test
```

## Markup contract

```html
<react-flow id="graph">
  <!-- map React Flow events to endpoints -->
  <flow-action on="nodeDragStop" hx-post="/nodes/move"></flow-action>
  <flow-action on="connect"      hx-post="/edges/create"></flow-action>

  <!-- a node: attributes = React Flow data; inner HTML = server-rendered body (projected via slot) -->
  <flow-node id="order-42" type="card" x="40" y="80" slot="node-order-42">
    <div class="card">
      <strong>Order #42</strong>
      <button hx-post="/orders/order-42/approve" hx-target="#graph" hx-swap="morph:innerHTML">Approve</button>
    </div>
  </flow-node>

  <flow-edge id="e1" source="order-42" target="ship-7"></flow-edge>
</react-flow>
```

- `<flow-node>` must be a **direct child** of `<react-flow>` and carry `slot="node-{id}"` (named slots
  only project direct host children).
- `{id}` in a `<flow-action>` URL is substituted from the event's node/edge id.

See `CLAUDE.md` for architecture details and extension points.
