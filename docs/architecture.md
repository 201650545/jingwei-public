# Architecture and contracts

The canvas is one half of a two-part plugin. Only the client is under review; the host is listed for contract context.

## Host routes

| Route | Purpose |
|---|---|
| `GET jingwei/data/graph.json` | graph nodes, edges, statuses, artifact pointers |
| `GET jingwei/data/view.json` | saved node positions, `{ "positions": { "<id>": { "x": 0, "y": 0 } } }` |
| `GET jingwei/artifact/<runId>/<path>` | one artifact: json, html, png, jpg, webp, svg, txt |
| `POST jingwei/actions/rerun` | `{ sessionId, nodeId }` → `202 { accepted: true }`, `409` when busy |
| `POST jingwei/actions/remove-node` | `{ nodeId }` → `200` with the new graph, `400` when refused |
| `POST jingwei/actions/save-view` | `{ positions }` → `200` |

All routes are same-origin and relative to the page. The client must build artifact URLs as:

```
jingwei/artifact/<encodeURIComponent(runId)>/<path segments, each encoded>
```

## Graph contract

`jingwei/data/graph.json`:

```json
{
  "version": 1,
  "runId": "demo-run-001",
  "nodes": [
    {
      "id": "copy",
      "kind": "branch",
      "title": "文案",
      "provider": "provider",
      "model": "model-a",
      "status": "done",
      "elapsedMs": 169270,
      "startedAt": 0,
      "artifact": "copy/note.json",
      "artifactType": "json",
      "error": ""
    }
  ],
  "edges": [["copy", "merge"]]
}
```

- `kind`: `branch` or `merge`
- `status`: `idle` | `running` | `done` | `failed`
- `startedAt` is a millisecond epoch, only present while running
- `artifact` is a path relative to the run directory; `artifactType` is one of `json` / `html` / `image` / `text`
- The node set is not fixed: render whatever the graph contains. A merge node has no artifact and no menu.

## Client contract

- Registered as one sidebar tab via `sidebarRightTabs.register` + `slots.register({ name: 'sidebar.right.pane.tab', key: 'local.jingwei' })`.
- `Body(props)` receives `props.sessionId`; the rerun request must include it.
- Shadow DOM: all canvas CSS and DOM live inside `attachShadow({ mode: 'open' })`.
- React only hosts one div; the canvas itself is imperative.
- Module shape is fixed:

```js
window.__ModuleLoader__.load({
  id: '@local/jingwei',
  factory(require) {
    const React = require('react')
    // ...
    return { inject: ['slots', 'sidebarRightTabs'], apply(ctx) { /* ... */ } }
  },
})
```

- No imports, no JSX, no build step, no external assets.

## Data flow

```
graph.json ──fetch──> client renders nodes/edges
                        │
                        ├─ save-view (after node drag)
                        ├─ rerun  (menu / Enter)
                        ├─ remove-node
                        └─ artifact fetch (preview)
```
