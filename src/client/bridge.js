// Pure: map a normalized React Flow event into the params an htmx request sends,
// and resolve the `{id}` token in a configured action URL. No browser globals.

/**
 * @param {string} eventName e.g. "nodeDragStop"
 * @param {object} data normalized payload from the React Flow handler
 * @returns {{idForUrl?:string, params:Record<string,string|number>}}
 */
export function eventToParams(eventName, data = {}) {
  switch (eventName) {
    case 'nodeDragStop':
      return { idForUrl: data.id, params: { id: data.id, x: data.x, y: data.y } };
    case 'connect': {
      const params = { source: data.source, target: data.target };
      if (data.sourceHandle) params.sourceHandle = data.sourceHandle;
      if (data.targetHandle) params.targetHandle = data.targetHandle;
      return { params };
    }
    case 'nodeClick':
    case 'edgeClick':
    case 'nodesDelete':
    case 'edgesDelete':
      return { idForUrl: data.id, params: { id: data.id } };
    default:
      return { idForUrl: data.id, params: { ...data } };
  }
}

/** Substitute the `{id}` token in an action URL. */
export function resolveUrl(template, idForUrl) {
  if (!template) return template;
  return template.replace('{id}', idForUrl == null ? '' : String(idForUrl));
}
