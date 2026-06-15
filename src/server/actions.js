// Declarative wiring rendered as <flow-action> elements. Each maps a React Flow
// event name (`on`) to an htmx endpoint. `{id}` in a URL is substituted by the
// client bridge from the event's node/edge id. These are emitted into the graph
// fragment so the server fully owns which interactions are live.
export const actions = [
  { on: 'nodeDragStop', method: 'post', url: '/nodes/move' },
  { on: 'connect', method: 'post', url: '/edges/create' },
  { on: 'nodesDelete', method: 'post', url: '/nodes/{id}/delete' },
  { on: 'edgesDelete', method: 'post', url: '/edges/{id}/delete' },
  // NB: node *click* is NOT wired here. React Flow's onNodeClick is a React
  // synthetic event and can't see clicks on slotted (light-DOM) node bodies across
  // the shadow boundary, so the whole-card inspector trigger is plain htmx in
  // _node-body.njk instead. flow-actions only suit React Flow's native-listener
  // events (drag, connect, delete).
];
