// Imported as a string (esbuild text loader) and injected into the shadow root,
// since React Flow renders inside the custom element's shadow DOM.
import reactFlowCss from '@xyflow/react/dist/style.css';

export const shadowCss = `
  :host { display: block; width: 100%; height: 100%; }
  .rf-root { width: 100%; height: 100%; }
  ${reactFlowCss}
`;
