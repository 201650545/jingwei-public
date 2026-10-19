# HANDOFF · canvas client review

Read these files first:

1. `plugin/jingwei/client.js` — the current canvas implementation.
2. `docs/canvas-spec.md` — the visual and interaction rules.
3. `docs/architecture.md` — data contract and endpoints.
4. `docs/img/ui-canvas-420.png` and `docs/img/ui-canvas-menu.png` — current screenshots at a 420px panel width.

## Task

Rewrite **only** `plugin/jingwei/client.js` to make the canvas look and feel considerably better.

You have full freedom over:

- typography, spacing, hierarchy, card proportions, edge style, grid density
- hover / selected / running / failed micro-states and their timing
- menu layout and preview layout
- zoom/pan smoothing and drag feedback
- empty or edge-case presentation

## Hard constraints

- **Black and white only.** Allowed colors: `#000`, `#fff`, and `rgba(255,255,255,alpha)`. No hue, no gradients that introduce color, no emoji, no icon fonts.
- **No external dependencies.** No imports, no JSX, no build step. The file must remain `window.__ModuleLoader__.load({ id: '@local/jingwei', factory(require) { ... } })` and may only `require('react')`.
- **Keep the plugin contract.** Shadow DOM; `Body(props)` receives `props.sessionId`; registration of the sidebar tab stays exactly as it is; the file must remain valid after `node --check`.
- **Keep every behavior:** drag node, pan empty space, wheel zoom (cursor-anchored, 0.25–3), `F`/`0` fit, `R` reload, click select, `⋯` menu with the same four actions and disabled rules, `Enter` rerun, double-click preview, Escape unwind order, polling while a node is running, `view.json` position save after drag.
- **Keep every endpoint and data field** used by the current file: `jingwei/data/graph.json`, `jingwei/data/view.json`, `jingwei/actions/rerun`, `jingwei/actions/remove-node`, `jingwei/actions/save-view`, `jingwei/artifact/<runId>/<path>`. Do not invent new ones.
- **No new panels.** The only overlays allowed are the node menu and the artifact preview.
- Do not rewrite `index.js`, `package.json`, or anything else.

## Output protocol (strict)

Output the complete file between these two markers and nothing else:

```
<<<FILE:plugin/jingwei/client.js NONCE=<nonce>>>>
<raw file content, starting with the first character of the file>
<<<END>>>
```

Rules:

- No prose before, between, or after the markers. No headings. No summary. No explanation.
- The opening marker line must contain the nonce provided in the request.
- The content between markers must be the raw file, not wrapped in a Markdown code fence.
- If you must emit more than one file, repeat the marker pair for each file; never emit a file without markers.
- If a constraint is impossible, emit `<<<FAIL reason>>>` and stop; do not silently break a constraint.
