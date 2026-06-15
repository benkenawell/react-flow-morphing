// Imported as a string (esbuild text loader) and injected into the shadow root,
// since React Flow renders inside the custom element's shadow DOM.
import reactFlowCss from '@xyflow/react/dist/style.css';

export const shadowCss = `
  :host { display: block; width: 100%; height: 100%; }
  .rf-root { width: 100%; height: 100%; }
  ${reactFlowCss}

  /* Selection toolbar renders inside the shadow root, so it is styled here. */
  .selection-tools {
    display: flex; align-items: center; gap: 10px;
    padding: 6px 10px; font: 13px system-ui, sans-serif;
    background: #111827; color: #fff; border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,.25);
  }
  .selection-tools button {
    font: inherit; padding: 4px 10px; border: 0; border-radius: 6px;
    background: #ef4444; color: #fff; cursor: pointer;
  }
`;
