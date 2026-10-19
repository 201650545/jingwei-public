# Jingwei · black-and-white infinite canvas

This repository is a **read-only public snapshot** of the `@local/jingwei` plugin for the DeepSeek Harness, published only to give an external reviewer enough context to improve the canvas client.

The source of truth lives in a private workspace. Nothing here is canonical, and no write access to the original project is granted through this repository.

## What it is

- A right-sidebar tab inside the DeepSeek Harness.
- A pure black-and-white infinite canvas: black background, grayscale dot grid, white-outlined node cards, 1px edges.
- Each node shows a title, elapsed time, and model name.
- Interactions: drag nodes, drag empty space to pan, wheel to zoom, `F`/`0` to fit, `R` to reload.
- Click a node to select it; `⋯` opens a four-item menu (rerun this branch, view artifact, copy model name, delete node).
- Status is expressed with line style only: idle (26% white), running (dashed, breathing), done, failed.
- Artifact preview: JSON/text, HTML (sandboxed iframe), images.

## What it is not

- Not a general DAG editor: no manual node creation, no edge editing, no property panel.
- Not a task dashboard: no header, no timeline, no inspector, no artifact panel, no acceptance table.
- No color. Period.

## Repository map

```
plugin/jingwei/client.js     the canvas client (the file under review)
plugin/jingwei/index.js      host routes and actions (context only; do not rewrite)
plugin/jingwei/package.json  plugin manifest
plugin/jingwei/prompts.json  rerun prompts (context only)
docs/canvas-spec.md          visual and interaction rules
docs/architecture.md         data contract and endpoints
docs/img/                    current screenshots (420px panel width)
sample/graph.json            synthetic graph data for local experiments
HANDOFF.md                   the review task and output protocol
```

## License

MIT. See `LICENSE`.
