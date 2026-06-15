// Bundle entry: registers the custom elements. Define the data carriers BEFORE the
// host so the host's first render already sees upgraded children (with toModel()).
import { defineFlowElements } from './flow-elements.js';
import { defineReactFlow } from './react-flow.element.jsx';

defineFlowElements();
defineReactFlow();
