// Express app factory. Exported separately from `listen` so node:test can import
// it and drive routes without binding a port (well — we bind an ephemeral one).
import express from 'express';
import nunjucks from 'nunjucks';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createStore, NotFound, defaultSeed } from './graph-store.js';
import { actions } from './actions.js';
import { STATUSES, isStatus } from './statuses.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

export function createApp({ store = createStore(defaultSeed()) } = {}) {
  const app = express();

  const env = nunjucks.configure(resolve(here, 'views'), {
    autoescape: true,
    noCache: process.env.NODE_ENV !== 'production',
  });
  // Available to every template (the inspector's status <select> renders these).
  env.addGlobal('statuses', STATUSES);

  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(resolve(root, 'public')));

  // Every action route renders the SAME whole-graph fragment; idiomorph diffs it.
  const renderGraph = () => env.render('_graph.njk', { ...store.toViewModel(), actions });

  app.get('/', (_req, res) => {
    res.type('html').send(env.render('page.njk', { ...store.toViewModel(), actions }));
  });

  app.post('/nodes/move', wrap((req, res) => {
    const { id, x, y } = req.body;
    store.moveNode(id, x, y);
    res.type('html').send(renderGraph());
  }));

  app.post('/nodes/create', wrap((req, res) => {
    store.addNode({ type: req.body.type || 'card' });
    res.type('html').send(renderGraph());
  }));

  app.post('/edges/create', wrap((req, res) => {
    store.addEdge({
      source: req.body.source,
      target: req.body.target,
      sourceHandle: req.body.sourceHandle || undefined,
      targetHandle: req.body.targetHandle || undefined,
    });
    res.type('html').send(renderGraph());
  }));

  app.post('/nodes/:id/delete', wrap((req, res) => {
    store.deleteNode(req.params.id);
    res.type('html').send(renderGraph());
  }));

  app.post('/edges/:id/delete', wrap((req, res) => {
    store.deleteEdge(req.params.id);
    res.type('html').send(renderGraph());
  }));

  // Example domain action: an htmx button INSIDE a node body posts here.
  app.post('/orders/:id/approve', wrap((req, res) => {
    store.setNodeData(req.params.id, { status: 'approved' });
    res.type('html').send(renderGraph());
  }));

  // Editable fields from the inspector panel. Mutate node data, then return the
  // whole graph (morphed into #graph) plus an OOB refresh of the inspector.
  app.post('/nodes/:id/data', wrap((req, res) => {
    const patch = {};
    for (const key of ['title', 'amount']) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    // Only accept a known status so the card classes stay meaningful.
    if (isStatus(req.body.status)) patch.status = req.body.status;
    const node = store.setNodeData(req.params.id, patch);
    res.type('html').send(
      env.render('_graph-oob-inspector.njk', { ...store.toViewModel(), actions, node }),
    );
  }));

  // Targeted (non-graph) partial: node inspector panel.
  app.get('/nodes/:id/panel', wrap((req, res) => {
    const node = store.toViewModel().nodes.find((n) => n.id === req.params.id);
    if (!node) throw new NotFound(`node ${req.params.id}`);
    res.type('html').send(env.render('_inspector.njk', { node }));
  }));

  app.use((err, _req, res, _next) => {
    const code = err instanceof NotFound ? 404 : 500;
    res.status(code).type('text/plain').send(`${err.name}: ${err.message}`);
  });

  return app;
}

// Async-safe route wrapper so thrown errors reach the error handler.
function wrap(handler) {
  return (req, res, next) => {
    try {
      Promise.resolve(handler(req, res)).catch(next);
    } catch (err) {
      next(err);
    }
  };
}
