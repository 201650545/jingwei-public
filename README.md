# Jingwei · infinite canvas (black-and-white, one semantic colour)

This repository is a **read-only public snapshot** of the `@local/jingwei` plugin for the DeepSeek Harness, published only to give an external reviewer enough context to improve the canvas client.

The source of truth lives in a private workspace. Nothing here is canonical, and no write access to the original project is granted through this repository.

> **Snapshot updated 2026-10-20 (v3.2).** The visual language moved from "strictly no colour" to **black-and-white plus exactly one semantic colour** (completion green `rgb(80,255,150)`), and the canvas gained a dynamic-workflow layer: semantic node roles, a model panel, and an `output` node whose artifact is a self-contained HTML result page.
>
> **v3.2 (latest)** replaced the earlier **left→right column layout** with a **vertical main axis + DAG topological layering**: the main axis sits at `x = 240`, double columns are 252px apart centre-to-centre, and the layout is computed from measured DOM rectangles. The orchestrator no longer emits coordinates at all — `client.js` owns layout exclusively. It also split the node card into three layers (role tag / title / status row + divider + verdict sign + source row), made green a short 12×2px line plus the words "执行完成" instead of a glowing card, and routed cross-wave edges through a central corridor so they never cross a node. See `docs/canvas-spec.md` for the current rules.

## What it is

- A right-sidebar tab inside the DeepSeek Harness.
- An infinite canvas on a black background with a grayscale dot grid and white-outlined node cards, 1px edges.
- Each node shows a role tag, title, status row, verdict sign and source row; nodes are laid out along a **vertical main axis with DAG-topological layering** (`intake → produce/verify → merge → audit → output`).
- Interactions: drag nodes, drag empty space to pan, wheel to zoom, `F`/`0` to fit, `R` to reload, plus a "重排版面" (re-layout) action that re-runs the layout algorithm.
- Click a node to select it; `⋯` opens a four-item menu (rerun this branch, view artifact, copy model name, delete node).
- Artifact preview: JSON/text, HTML (sandboxed iframe), images, Markdown — plus an "open in browser" action on the preview header. Markdown rendering sanitises links against a protocol allowlist.
- A model panel (the only permanent floating surface) listing available models with channel, quota, measured speed, and an intelligence tier.

## Colour discipline (v3.2)

- The canvas is black, white, and grayscale.
- **Exactly one colour is allowed: completion green `rgb(80,255,150)`.**
- Green means **"execution finished"** — nothing else. It never means "quality approved"; that verdict lives in the result page as explicit PASS / FAIL / 待修订.
- Green hangs **only** off `status === 'done'`, and it is rendered as a **12×2px short line plus the words "执行完成"** — never as a glowing card, never as tinted text. A passed review, a deliverable result and a human-accepted result are all plain grey/white.
- Green must hang off the *state* class, never off a *role* class: `verify` and `output` nodes are grey until they are `done`.
- The chain's endpoints are distinguished by **shape**, not colour: `intake` is a delegation card, `output` a result seal.
- A failed verification is shown as a **white-background, black-text inverted sign** (核查未通过 / 人工退回 / 交付受阻) — never red.
- **Edges never carry green.** An edge is "active" only when its upstream is done *and* its downstream has started or finished.

## Layout rules (v3.2)

- **One source of truth for coordinates: the client's `layoutMissing()`.** The orchestrator emits no `x`/`y`.
- `dagRank` (logical level) is not `visualRow` (visual row); the unit is a **layout strategy**, not a DAG data structure.
- Cross-wave long edges route through a **central corridor** (`x = AXIS ± 18`); lanes are offset so they never merge, and the detour path never crosses an intermediate node.
- Node sizes are taken from **measured DOM rectangles**, not hard-coded guesses.
- Old saved positions carry a `layoutVersion`; when they conflict with the new rules the canvas offers a non-blocking "[保留当前布局] [按新版式重排]" choice instead of silently moving things.

## What it is not

- Not a general DAG editor: no manual node creation, no edge editing, no property panel.
- Not a task dashboard: no header, no timeline, no inspector, no artifact panel, no acceptance table.
- Not a scheduler: the canvas shows what the orchestrator did; it does not decide what to run.
- No colour beyond the single completion green described above.

## Repository map

```
plugin/jingwei/client.js     the canvas client (the file under review)
plugin/jingwei/index.js      host routes and actions (context only; do not rewrite)
plugin/jingwei/package.json  plugin manifest
plugin/jingwei/prompts.json  rerun prompts (context only)
docs/canvas-spec.md          visual and interaction rules (v3.2)
docs/architecture.md         data contract and endpoints
docs/img/                    current screenshots (420px panel width)
sample/graph.json            synthetic graph data for local experiments
HANDOFF.md                   the review task and output protocol
```

## Known gaps in this snapshot

- The screenshot in `docs/img/` predates the v3.2 vertical-axis layout; it still shows the older column arrangement. The code is ahead of the picture.
- The preview page, `publish` and `archive` actions have unit-level coverage but have not been exercised end-to-end inside the Harness.

## License

MIT. See `LICENSE`.
