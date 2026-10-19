# Repository overview

This snapshot exists for one purpose: an external reviewer should be able to understand the canvas and rewrite `plugin/jingwei/client.js` without seeing the private workspace.

## Component shape

```
DSH sidebar tab
  └─ client.js  (shadow DOM; React only hosts one div)
        ├─ fetches jingwei/data/graph.json
        ├─ fetches jingwei/data/view.json (optional)
        ├─ renders nodes + edges on a pan/zoom canvas
        └─ posts actions to jingwei/actions/*
```

Host routes (implemented in `index.js`, context only):

| Route | Purpose |
|---|---|
| `GET jingwei/data/graph.json` | graph nodes, edges, statuses, artifact pointers |
| `GET jingwei/data/view.json` | saved node positions |
| `GET jingwei/artifact/<runId>/<path>` | one artifact (json/html/image) |
| `POST jingwei/actions/rerun` | `{sessionId,nodeId}`; 202 accepted |
| `POST jingwei/actions/remove-node` | `{nodeId}` |
| `POST jingwei/actions/save-view` | `{positions}` |

`graph.json` node fields: `id`, `kind` (`branch`/`merge`), `title`, `provider`, `model`, `status` (`idle`/`running`/`done`/`failed`), `elapsedMs`, `startedAt`, `artifact`, `artifactType`, `error`.

## Design intent

- The canvas is an observation surface, not a form. Anything that can be said with line weight, spacing, and timing should not become a panel.
- Black and white is the product language, not a theme option.
- A node is a card, not a dashboard tile: title, time, model. Nothing else.
