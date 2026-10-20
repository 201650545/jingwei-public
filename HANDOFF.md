# HANDOFF · canvas client review (v3.1)

> Snapshot: 2026-10-20. The visual language moved from "strictly no colour" to
> **black-and-white plus exactly one semantic colour** (completion green). Read
> `docs/canvas-spec.md` first — it is the authority; this file only states the
> task and the non-negotiable constraints.

Read these files first:

1. `plugin/jingwei/client.js` — the current canvas implementation.
2. `docs/canvas-spec.md` — the visual and interaction rules (v3.1).
3. `docs/architecture.md` — data contract and endpoints.
4. `docs/img/ui-canvas-420.png` and `docs/img/ui-canvas-menu.png` — current screenshots at a 420px panel width.

## Task

Rewrite **only** `plugin/jingwei/client.js` to raise the canvas's visual quality:
make it read as a finished object rather than a debug panel, while keeping every
behaviour and the new v3.1 semantics intact.

You have full freedom over:

- typography, spacing, hierarchy, card proportions, edge style, grid density
- hover / selected / running / failed / done micro-states and their timing
- menu layout and preview layout
- zoom/pan smoothing and drag feedback
- empty or edge-case presentation

## Hard constraints

- **Colour discipline (v3.1).** Base is `#000`, `#fff`, `rgba(255,255,255,alpha)`.
  **Exactly one colour is allowed: completion green `rgb(80,255,150)`.**
  Green means **"execution finished"** and nothing else — never "quality approved",
  never "selected", never "error". Failed states stay greyscale (no red).
  Green must hang off the **state** class, never off a **role** class: `verify` and
  `output` nodes are grey until they are `done`.
- **Endpoint identity by shape, not colour.** `intake` carries a 3px white left
  edge, `output` a 3px white right edge. Keep this readable in greyscale.
- **The model panel is the only permanent floating surface.** It already exists
  (left rail + panel, opened by a round FAB). Do not add any other permanent
  panel, and do not remove the model panel.
- **No external dependencies.** No imports, no JSX, no build step. The file must remain `window.__ModuleLoader__.load({ id: '@local/jingwei', factory(require) { ... } })` and may only `require('react')`.
- **Keep the plugin contract.** Shadow DOM; `Body(props)` receives `props.sessionId`; registration of the sidebar tab stays exactly as it is; the file must remain valid after `node --check`.
- **Keep every behaviour:** drag node, pan empty space, wheel zoom (cursor-anchored, 0.25–3), `F`/`0` fit, `R` reload, click select, `⋯` menu with the same four actions and disabled rules, `Enter` rerun, double-click preview, Escape unwind order, polling while a node is running, `view.json` position save after drag.
- **Keep every endpoint and data field** used by the current file: `jingwei/data/graph.json`, `jingwei/data/view.json`, `jingwei/actions/rerun`, `jingwei/actions/remove-node`, `jingwei/actions/save-view`, `jingwei/artifact/<runId>/<path>`. Do not invent new ones.
- **New fields you must render if present** (the orchestrator now emits them):
  - `node.review` — `pass` / `fail` / `unknown` / `pending`: the **machine** verdict of a
    verification. A `verify`/`audit` node whose `review` is `fail` or `unknown` must
    read as *unresolved* — a greyscale dashed state bar plus the text 「核查未通过」.
    Do **not** use red.
  - `node.humanReview` — `accepted` / `rejected` / `pending`: the **human** verdict,
    a separate axis. Never conflate it with `node.review`.
  - `graph.delivery` — `{ status: ready|blocked|failed, reason, failedNodes, failedReviews }`:
    the run-level "can this be delivered" verdict.
  - `node.artifactType` — `md` / `html` / `png` / `json`. An `html` artifact must be
    previewed in an iframe whose sandbox is **`allow-scripts` without
    `allow-same-origin`** (so scripts run but cannot reach the parent document).
  - `node.packedImages` — number of images inlined into an HTML artifact.
- **No new panels.** The only overlays allowed are the node menu and the artifact preview.
- Do not rewrite `index.js`, `package.json`, or anything else.

## Known visual problems (2026-10-20 snapshot) — please address these

The current screenshot (`docs/img/ui-canvas-420.png`, taken from the real Harness
right panel) shows two things that look unfinished:

1. **The node cluster is not centred.** `fit` leaves a large empty band above the
   graph and pushes the content into the lower half of the panel.
   For reference, the current `fit()` computes the content bounding box and then
   does `x: (vw - w*k)/2 - left*k`, `y: (vh - h*k)/2 - top*k - min(15, vh*.025)`
   with padding `px = clamp(vw*.055, 18, 42)` and `py = clamp(vh*.07, 24, 60)`,
   and the canvas has a status strip along the bottom edge. The horizontal padding
   and the bottom status strip are not accounted for in the vertical centring.
   Whatever the cause, a fitted graph should sit optically centred with balanced
   margins.
2. **The model panel reads as an avatar, not a panel.** Its entry point renders as
   a lone circle marked "M" in the top-left of the canvas, which looks like a
   user badge. The spec calls for a **44px vertical rail** on the left edge of the
   panel (labelled, with a model count) that opens a 344px panel. Make the rail
   read as a rail — a labelled, full-height affordance — not as a floating dot.

Feel free to solve these differently, but do not leave them as they are.

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
