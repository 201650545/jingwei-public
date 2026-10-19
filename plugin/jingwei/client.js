
window.__ModuleLoader__.load({
  id: '@local/jingwei',
  factory(require) {
    'use strict';

    const React = require('react');
    const SVG = 'http://www.w3.org/2000/svg';
    const W = 188, MW = 164, GAP = 226;
    const MIN = .25, MAX = 3;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const branch = n => n.kind !== 'merge';
    const seconds = v => (v / 1000).toFixed(2) + 's';

    const CSS = `
:host {
  display:block;position:relative;width:100%;height:100%;
  min-height:0;overflow:hidden;background:#000;color:#fff;
  font-family:"PingFang SC","Noto Sans SC","Microsoft YaHei",system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
}
*,*::before,*::after{box-sizing:border-box}
*{margin:0;padding:0}
button{font-family:inherit}
.stage {
  position:absolute;inset:0;overflow:hidden;isolation:isolate;
  background:#000;touch-action:none;cursor:grab;
  user-select:none;-webkit-user-select:none;
}
.stage.panning{cursor:grabbing}
.grid{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:.72}
.world {
  position:absolute;left:0;top:0;width:0;height:0;
  transform-origin:0 0;will-change:transform;
}
.edges {
  position:absolute;left:0;top:0;width:1px;height:1px;
  overflow:visible;pointer-events:none;
}
.wire path {
  fill:none;stroke:rgba(255,255,255,.28);stroke-width:1;
  stroke-linecap:round;vector-effect:non-scaling-stroke;
  transition:stroke .18s ease,opacity .18s ease;
}
.wire circle{fill:rgba(255,255,255,.37);transition:fill .18s ease}
.wire.active path{stroke:rgba(255,255,255,.83)}
.wire.active circle{fill:#fff}
.wire.failed path{stroke:rgba(255,255,255,.13)}
.wire.running path {
  stroke:rgba(255,255,255,.57);stroke-dasharray:3 6;
  animation:flow 2.5s linear infinite;
}
.wire.running.active path{stroke:#fff}
.nodes{position:absolute;left:0;top:0}
.node {
  position:absolute;width:${W}px;min-height:94px;
  display:flex;flex-direction:column;justify-content:space-between;
  gap:18px;padding:16px 16px 14px;
  background:#000;border:1px solid rgba(255,255,255,.32);
  border-radius:2px;cursor:grab;
  transition:border-color .17s ease,outline-color .17s ease;
}
.node:hover{border-color:rgba(255,255,255,.76)}
.node.selected {
  border-color:#fff;outline:1px solid rgba(255,255,255,.65);
  outline-offset:3px;
}
.node.dragging{cursor:grabbing;border-color:#fff}
.node.running {
  border-style:dashed;border-color:rgba(255,255,255,.66);
  animation:breathe 2.6s ease-in-out infinite;
}
.node.running.selected{outline-color:#fff}
.node.failed{border-color:rgba(255,255,255,.22)}
.node.failed.selected{border-color:#fff}
.node-head{display:flex;align-items:baseline;gap:9px;min-width:0}
.node-name {
  flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap;color:#fff;font-size:14px;font-weight:600;
  line-height:1.4;letter-spacing:.025em;
}
.node-time {
  flex:none;white-space:nowrap;color:rgba(255,255,255,.54);
  font:10px/1.35 ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;
  font-variant-numeric:tabular-nums;letter-spacing:-.02em;
}
.node-meta {
  max-width:calc(100% - 23px);min-width:0;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  color:rgba(255,255,255,.39);
  font:10px/1.5 ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;
  letter-spacing:.025em;
}
.node.failed .node-meta{color:rgba(255,255,255,.23)}
.node.failed .node-time{color:rgba(255,255,255,.76)}
.node.running .node-time{animation:fade 2.6s ease-in-out infinite}
.node.merge {
  width:${MW}px;min-height:76px;padding:14px 15px 12px;
  gap:12px;border-color:rgba(255,255,255,.24);
}
.node.merge .node-name{font-size:13px}
.node.merge .node-meta{color:rgba(255,255,255,.35)}
.more {
  position:absolute;right:7px;bottom:6px;
  display:grid;place-items:center;width:29px;height:28px;
  padding:0;border:0;border-radius:2px;
  background:rgba(255,255,255,0);color:rgba(255,255,255,.52);
  font:19px/1 ui-monospace,Consolas,monospace;
  opacity:0;cursor:pointer;
  transition:opacity .15s ease,color .15s ease,background .15s ease;
}
.node:hover .more,.node.selected .more,.more:focus-visible{opacity:1}
.more:hover,.more:focus-visible {
  color:#fff;background:rgba(255,255,255,.11);
}
.more:focus-visible{outline:1px solid rgba(255,255,255,.7)}
.menu {
  position:absolute;z-index:20;width:172px;padding:5px;
  background:#000;border:1px solid rgba(255,255,255,.69);
  border-radius:2px;animation:appear .15s ease-out both;
}
.menu button {
  display:flex;align-items:center;width:100%;min-height:38px;
  padding:0 12px;border:0;border-radius:1px;background:#000;
  color:rgba(255,255,255,.86);text-align:left;
  font-size:12px;font-weight:500;line-height:1.4;
  letter-spacing:.035em;white-space:nowrap;cursor:pointer;
  transition:background .12s ease,color .12s ease;
}
.menu button:hover:not(:disabled),.menu button:focus-visible:not(:disabled) {
  background:rgba(255,255,255,.12);color:#fff;outline:none;
}
.menu button:disabled{color:rgba(255,255,255,.27);cursor:default}
.menu button:last-child {
  margin-top:4px;padding-top:5px;min-height:43px;
  border-top:1px solid rgba(255,255,255,.18);border-radius:0;
}
.preview {
  position:absolute;inset:0;z-index:30;display:flex;
  flex-direction:column;min-width:0;min-height:0;
  padding:28px 27px 24px;background:#000;
  animation:appear .2s ease both;
}
.preview-head {
  flex:none;display:flex;align-items:flex-start;
  justify-content:space-between;gap:16px;
  padding-bottom:22px;border-bottom:1px solid rgba(255,255,255,.25);
}
.preview-label{min-width:0;display:flex;flex-direction:column;gap:9px}
.preview-kicker {
  color:rgba(255,255,255,.4);
  font:10px/1.3 ui-monospace,Consolas,monospace;
  letter-spacing:.12em;
}
.preview-title {
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-size:16px;font-weight:600;line-height:1.45;letter-spacing:.025em;
}
.preview-close {
  flex:none;width:31px;height:31px;border:1px solid rgba(255,255,255,.3);
  border-radius:2px;background:#000;color:rgba(255,255,255,.7);
  font:20px/1 ui-monospace,Consolas,monospace;cursor:pointer;
  transition:border-color .16s ease,color .16s ease;
}
.preview-close:hover,.preview-close:focus-visible {
  border-color:#fff;color:#fff;outline:none;
}
.preview-content {
  flex:1;min-width:0;min-height:0;overflow:auto;
  display:flex;align-items:center;justify-content:center;
  padding-top:25px;scrollbar-width:thin;
  scrollbar-color:rgba(255,255,255,.25) #000;
}
.preview-content.text{align-items:flex-start;justify-content:flex-start}
.preview-content pre {
  width:100%;padding-bottom:24px;white-space:pre-wrap;
  overflow-wrap:anywhere;color:rgba(255,255,255,.79);
  font:11px/1.85 ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;
  tab-size:2;user-select:text;-webkit-user-select:text;
}
.preview-content img{display:block;max-width:100%;max-height:100%;object-fit:contain}
.preview-content iframe {
  width:100%;height:100%;min-height:100px;border:1px solid rgba(255,255,255,.24);
  background:#fff;
}
@keyframes breathe {
  0%,100%{border-color:rgba(255,255,255,.67)}
  50%{border-color:rgba(255,255,255,.29)}
}
@keyframes fade{0%,100%{opacity:1}50%{opacity:.48}}
@keyframes flow{to{stroke-dashoffset:-18}}
@keyframes appear {
  from{opacity:0;transform:translateY(4px)}
  to{opacity:1;transform:translateY(0)}
}
@media(max-width:340px){.preview{padding:22px 19px}.menu{width:162px}}
@media(prefers-reduced-motion:reduce){
  .node,.node *,.wire *,.menu,.preview,.preview-close{
    animation:none!important;transition:none!important;
  }
}`;

    const HTML = `
<div class="stage" role="region" aria-label="经纬无限画布">
  <svg class="grid" aria-hidden="true">
    <defs>
      <pattern id="jw-grid-dots" width="32" height="32" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r=".75" fill="rgba(255,255,255,.24)"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#jw-grid-dots)"/>
  </svg>
  <div class="world">
    <svg class="edges" aria-hidden="true"><g></g></svg>
    <div class="nodes"></div>
  </div>
</div>`;

    const DEMO = {
      version: 1,
      runId: 'demo-run-001',
      nodes: [
        {
          id: 'copy',
          kind: 'branch',
          title: '文案',
          model: 'model-a',
          status: 'done',
          elapsedMs: 169270,
          artifact: 'copy/note.json',
          artifactType: 'json'
        },
        {
          id: 'design',
          kind: 'branch',
          title: '设计',
          model: 'model-b',
          status: 'done',
          elapsedMs: 222646,
          artifact: 'design/note.html',
          artifactType: 'html'
        },
        {
          id: 'merge',
          kind: 'merge',
          title: '汇总',
          status: 'done',
          elapsedMs: 222646
        }
      ],
      edges: [['copy', 'merge'], ['design', 'merge']]
    };

    function normalize(raw) {
      const src = raw && typeof raw === 'object' ? raw : {};
      const nodes = [];

      for (const n of Array.isArray(src.nodes) ? src.nodes : []) {
        if (!n || typeof n.id !== 'string' || !n.id) continue;

        const ms = Number(n.elapsedMs);

        nodes.push({
          id: n.id,
          kind: n.kind === 'merge' ? 'merge' : 'branch',
          title: String(n.title == null ? n.id : n.title),
          provider: String(n.provider || ''),
          model: String(n.model || ''),
          status: ['idle', 'running', 'done', 'failed'].includes(n.status)
            ? n.status : 'idle',
          elapsedMs: n.elapsedMs != null && Number.isFinite(ms) && ms >= 0
            ? ms : undefined,
          startedAt: Number.isFinite(Number(n.startedAt))
            ? Number(n.startedAt) : undefined,
          artifact: typeof n.artifact === 'string' && n.artifact
            ? n.artifact : undefined,
          artifactType: typeof n.artifactType === 'string'
            ? n.artifactType : undefined,
          error: typeof n.error === 'string' ? n.error : undefined
        });
      }

      if (!nodes.length) {
        return src === DEMO ? { ...DEMO } : normalize(DEMO);
      }

      const ids = new Set(nodes.map(n => n.id));
      const edges = (Array.isArray(src.edges) ? src.edges : []).filter(
        e => Array.isArray(e) && e.length === 2 &&
          ids.has(e[0]) && ids.has(e[1])
      );

      return {
        version: 1,
        runId: String(src.runId || ''),
        nodes,
        edges
      };
    }

    function createCanvas(host, shadow, sessionId) {
      const stage = shadow.querySelector('.stage');
      const world = shadow.querySelector('.world');
      const grid = shadow.querySelector('.grid');
      const pattern = shadow.querySelector('#jw-grid-dots');
      const nodeLayer = shadow.querySelector('.nodes');
      const edgeLayer = shadow.querySelector('.edges g');

      const positions = Object.create(null);
      const elements = Object.create(null);
      const view = { x: 0, y: 0, k: 1 };
      const listeners = [];
      const wires = [];
      const pending = new Set();

      let graph = normalize(DEMO);
      let idsKey = '', edgesKey = '';
      let selected = null, menu = null, preview = null, drag = null;
      let autoFit = true, firstFit = true, destroyed = false;
      let poll = 0, saveTimer = 0, frame = 0, sequence = 0;
      let pollingBusy = false;

      const listen = (el, type, fn, opts) => {
        el.addEventListener(type, fn, opts);
        listeners.push(() => el.removeEventListener(type, fn, opts));
      };

      const getNode = id => graph.nodes.find(n => n.id === id);
      const nodeIds = () => graph.nodes.map(n => n.id).join('\u0000');

      function drawView() {
        world.style.transform =
          `translate(${view.x}px,${view.y}px) scale(${view.k})`;

        pattern.setAttribute(
          'patternTransform',
          `translate(${view.x} ${view.y}) scale(${view.k})`
        );

        grid.style.opacity = String(clamp(view.k * .92, .25, .75));
      }

      function stopMotion() {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      }

      function moveView(target, animated) {
        stopMotion();

        const reduced = window.matchMedia &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (!animated || reduced) {
          Object.assign(view, target);
          drawView();
          return;
        }

        const start = performance.now();
        const from = { ...view };

        const tick = now => {
          if (destroyed) return;

          const p = clamp((now - start) / 380, 0, 1);
          const t = 1 - Math.pow(1 - p, 3);

          for (const key of ['x', 'y', 'k']) {
            view[key] = from[key] + (target[key] - from[key]) * t;
          }

          drawView();
          frame = p < 1 ? requestAnimationFrame(tick) : 0;
        };

        frame = requestAnimationFrame(tick);
      }

      function fit() {
        const vw = stage.clientWidth;
        const vh = stage.clientHeight;

        if (!vw || !vh) return;

        let left = Infinity;
        let top = Infinity;
        let right = -Infinity;
        let bottom = -Infinity;

        for (const [id, el] of Object.entries(elements)) {
          const p = positions[id];
          if (!p) continue;

          left = Math.min(left, p.x);
          top = Math.min(top, p.y);
          right = Math.max(right, p.x + el.offsetWidth);
          bottom = Math.max(bottom, p.y + el.offsetHeight);
        }

        if (!Number.isFinite(left)) return;

        const w = Math.max(1, right - left);
        const h = Math.max(1, bottom - top);
        const px = clamp(vw * .055, 18, 42);
        const py = clamp(vh * .07, 24, 60);

        const k = clamp(
          Math.min((vw - px * 2) / w, (vh - py * 2) / h),
          MIN,
          1.4
        );

        autoFit = true;

        moveView({
          k,
          x: (vw - w * k) / 2 - left * k,
          y: (vh - h * k) / 2 - top * k - Math.min(15, vh * .025)
        }, !firstFit);

        firstFit = false;
      }

      function layoutMissing() {
        const count = graph.nodes.filter(branch).length;
        const columns = Math.min(2, Math.max(1, count));
        const span = columns === 1 ? W : GAP + W;

        let i = 0;
        let j = 0;

        const rows = Math.ceil(count / columns);

        for (const n of graph.nodes) {
          if (!positions[n.id]) {
            if (branch(n)) {
              const row = Math.floor(i / columns);
              const col = i % columns;
              const oddLast = columns === 2 &&
                row === rows - 1 && count % 2 === 1;

              positions[n.id] = {
                x: oddLast ? (span - W) / 2 : col * GAP,
                y: row * 166
              };
            } else {
              positions[n.id] = {
                x: (span - MW) / 2 + j * (MW + 25),
                y: Math.max(1, rows) * 166 + 25
              };
            }
          }

          if (branch(n)) i++;
          else j++;
        }
      }

      function timeLabel(n) {
        if (n.status === 'failed') return '失败';
        if (n.status === 'idle') return '—';

        if (n.status === 'running') {
          if (!branch(n)) {
            const count = graph.nodes.filter(
              x => branch(x) && x.status === 'running'
            ).length;

            return '等 ' + count + ' 路';
          }

          return '运行中';
        }

        return Number.isFinite(n.elapsedMs)
          ? seconds(n.elapsedMs) : '—';
      }

      function updateNode(n) {
        const el = elements[n.id];
        if (!el) return;

        el.classList.toggle('selected', selected === n.id);
        el.classList.toggle('running', n.status === 'running');
        el.classList.toggle('failed', n.status === 'failed');

        el.querySelector('.node-name').textContent = n.title;

        const time = el.querySelector('.node-time');
        time.textContent = timeLabel(n);
        time.title = n.error || '';

        const meta = el.querySelector('.node-meta');
        meta.textContent = branch(n)
          ? (n.model || '—')
          : graph.nodes.filter(branch).length + ' 路';

        meta.title = meta.textContent;
      }

      function makeNode(n) {
        const el = document.createElement('div');
        el.className = 'node' + (branch(n) ? '' : ' merge');
        el.dataset.id = n.id;

        const head = document.createElement('div');
        head.className = 'node-head';

        const name = document.createElement('span');
        name.className = 'node-name';

        const time = document.createElement('span');
        time.className = 'node-time';

        head.append(name, time);

        const meta = document.createElement('div');
        meta.className = 'node-meta';

        el.append(head, meta);

        if (branch(n)) {
          const more = document.createElement('button');

          more.type = 'button';
          more.className = 'more';
          more.textContent = '⋯';
          more.title = '节点操作';

          more.setAttribute(
            'aria-label',
            n.title + '，节点操作'
          );

          more.setAttribute('aria-haspopup', 'menu');

          more.addEventListener('pointerdown', e => {
            e.stopPropagation();
          });

          more.addEventListener('click', e => {
            e.stopPropagation();
            openMenu(n.id, more);
          });

          el.appendChild(more);
        }

        el.addEventListener('dblclick', e => {
          e.stopPropagation();
          if (e.target.closest('.more')) return;
          openPreview(n.id);
        });

        return el;
      }

      function positionNode(id) {
        const p = positions[id];
        const el = elements[id];

        if (!p || !el) return;

        el.style.left = p.x + 'px';
        el.style.top = p.y + 'px';
      }

      function makeWires() {
        edgesKey = JSON.stringify(graph.edges);
        wires.length = 0;
        edgeLayer.textContent = '';

        for (const [from, to] of graph.edges) {
          const g = document.createElementNS(SVG, 'g');
          g.setAttribute('class', 'wire');

          const path = document.createElementNS(SVG, 'path');
          const a = document.createElementNS(SVG, 'circle');
          const b = document.createElementNS(SVG, 'circle');

          a.setAttribute('r', '1.8');
          b.setAttribute('r', '1.8');

          g.append(path, a, b);
          edgeLayer.appendChild(g);

          wires.push({ from, to, g, path, a, b });
        }

        drawEdges();
      }

      function updateWires() {
        for (const w of wires) {
          const n = getNode(w.from);

          w.g.classList.toggle(
            'active',
            selected === w.from || selected === w.to
          );

          w.g.classList.toggle(
            'running',
            !!n && n.status === 'running'
          );

          w.g.classList.toggle(
            'failed',
            !!n && n.status === 'failed'
          );
        }
      }

      function drawEdges() {
        for (const w of wires) {
          const a = elements[w.from];
          const b = elements[w.to];
          const pa = positions[w.from];
          const pb = positions[w.to];

          if (!a || !b || !pa || !pb) {
            w.g.style.display = 'none';
            continue;
          }

          w.g.style.display = '';

          const x1 = pa.x + a.offsetWidth / 2;
          const y1 = pa.y + a.offsetHeight;
          const x2 = pb.x + b.offsetWidth / 2;
          const y2 = pb.y;
          const dy = y2 - y1;

          const c = clamp(
            Math.abs(dy) * .47,
            28,
            115
          ) * (dy < 0 ? -1 : 1);

          w.path.setAttribute(
            'd',
            `M ${x1} ${y1} C ${x1} ${y1 + c} ${x2} ${y2 - c} ${x2} ${y2}`
          );

          w.a.setAttribute('cx', x1);
          w.a.setAttribute('cy', y1);
          w.b.setAttribute('cx', x2);
          w.b.setAttribute('cy', y2);
        }

        updateWires();
      }

      function select(id) {
        selected = id;

        for (const [key, el] of Object.entries(elements)) {
          el.classList.toggle('selected', key === id);
        }

        updateWires();
      }

      function rebuild(prune) {
        endDrag();
        closeMenu();

        if (prune) {
          const valid = new Set(graph.nodes.map(n => n.id));

          for (const id of Object.keys(positions)) {
            if (!valid.has(id)) delete positions[id];
          }
        }

        layoutMissing();
        nodeLayer.textContent = '';

        for (const id of Object.keys(elements)) {
          delete elements[id];
        }

        for (const n of graph.nodes) {
          const el = makeNode(n);

          elements[n.id] = el;
          nodeLayer.appendChild(el);
          positionNode(n.id);
        }

        if (selected && !elements[selected]) selected = null;

        for (const n of graph.nodes) {
          updateNode(n);
        }

        idsKey = nodeIds();
        makeWires();
      }

      function applyGraph(data) {
        graph = normalize(data);

        if (nodeIds() !== idsKey) {
          rebuild(true);
          if (autoFit) fit();
        } else {
          for (const n of graph.nodes) {
            updateNode(n);
          }

          if (JSON.stringify(graph.edges) !== edgesKey) {
            makeWires();
          } else {
            updateWires();
          }
        }

        if (graph.nodes.some(n => n.status === 'running')) {
          startPolling();
        } else {
          stopPolling();
        }
      }

      function closeMenu() {
        if (!menu) return;

        menu.remove();
        menu = null;
      }

      function copyText(value) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(value).catch(() => {});
          return;
        }

        try {
          const area = document.createElement('textarea');

          area.value = value;
          area.style.cssText = 'position:fixed;opacity:0';

          document.body.appendChild(area);
          area.select();

          document.execCommand('copy');
          area.remove();
        } catch (e) {
          console.warn('[经纬] 复制失败', e);
        }
      }

      function openMenu(id, anchor) {
        closeMenu();

        if (preview) return;

        const n = getNode(id);
        if (!n || !branch(n)) return;

        const count = graph.nodes.filter(branch).length;

        const actions = [
          [
            '重跑这一路',
            n.status === 'running' || pending.has(id),
            () => rerun(id)
          ],
          [
            '查看产物',
            !n.artifact,
            () => openPreview(id)
          ],
          [
            '复制模型名',
            !n.model,
            () => copyText(n.model)
          ],
          [
            '删除节点',
            n.status === 'running' || pending.has(id) || count <= 1,
            () => removeNode(id)
          ]
        ];

        const box = document.createElement('div');
        box.className = 'menu';

        box.setAttribute('role', 'menu');
        box.setAttribute(
          'aria-label',
          n.title + '，节点操作'
        );

        for (const [label, disabled, action] of actions) {
          const btn = document.createElement('button');

          btn.type = 'button';
          btn.setAttribute('role', 'menuitem');
          btn.textContent = label;
          btn.disabled = !!disabled;

          btn.addEventListener('click', e => {
            e.stopPropagation();

            if (disabled) return;

            closeMenu();
            action();
          });

          box.appendChild(btn);
        }

        box.addEventListener('pointerdown', e => {
          e.stopPropagation();
        });

        stage.appendChild(box);

        const r = anchor.getBoundingClientRect();
        const s = stage.getBoundingClientRect();
        const gutter = 12;

        const x = clamp(
          r.right - s.left - box.offsetWidth + 3,
          gutter,
          Math.max(gutter, s.width - box.offsetWidth - gutter)
        );

        const below = r.bottom - s.top + 9;
        const above = r.top - s.top - box.offsetHeight - 9;

        const y = below + box.offsetHeight <= s.height - gutter
          ? below
          : above >= gutter
            ? above
            : clamp(
              below,
              gutter,
              Math.max(gutter, s.height - box.offsetHeight - gutter)
            );

        box.style.left = x + 'px';
        box.style.top = y + 'px';

        menu = box;
      }

      async function rerun(id) {
        const n = getNode(id);

        if (
          !n ||
          !branch(n) ||
          n.status === 'running' ||
          pending.has(id)
        ) return;

        pending.add(id);

        try {
          const res = await fetch('jingwei/actions/rerun', {
            method: 'POST',
            headers: {
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              sessionId: sessionId || '',
              nodeId: id
            })
          });

          if (destroyed) return;

          if (res.status !== 202) {
            console.warn('[经纬] 重跑未接受', res.status);
            return;
          }

          sequence++;

          const current = getNode(id);

          if (current) {
            current.status = 'running';
            current.startedAt = Date.now();
            current.elapsedMs = undefined;

            updateNode(current);
            updateWires();
          }

          startPolling();
        } catch (e) {
          console.warn('[经纬] 重跑失败', e);
        } finally {
          pending.delete(id);
        }
      }

      async function removeNode(id) {
        const n = getNode(id);

        if (
          !n ||
          !branch(n) ||
          n.status === 'running' ||
          graph.nodes.filter(branch).length <= 1
        ) return;

        try {
          const res = await fetch('jingwei/actions/remove-node', {
            method: 'POST',
            headers: {
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              nodeId: id
            })
          });

          if (!res.ok) {
            throw new Error('HTTP ' + res.status);
          }

          const data = await res.json();

          if (destroyed) return;

          sequence++;

          closePreview();
          applyGraph(data);
        } catch (e) {
          console.warn('[经纬] 删除失败', e);
        }
      }

      function artifactType(n) {
        if (n.artifactType) {
          return n.artifactType.toLowerCase();
        }

        const ext = String(n.artifact || '')
          .split('.')
          .pop()
          .toLowerCase();

        if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(ext)) {
          return 'image';
        }

        if (['html', 'htm'].includes(ext)) {
          return 'html';
        }

        return ext === 'json' ? 'json' : 'text';
      }

      function artifactUrl(n) {
        const path = String(n.artifact || '')
          .split('/')
          .map(x => encodeURIComponent(x))
          .join('/');

        return 'jingwei/artifact/' +
          encodeURIComponent(graph.runId) +
          '/' +
          path;
      }

      function closePreview() {
        if (!preview) return;

        preview.remove();
        preview = null;
      }

      function openPreview(id) {
        const n = getNode(id);
        if (!n || !n.artifact) return;

        closeMenu();
        closePreview();

        const layer = document.createElement('div');
        layer.className = 'preview';

        layer.setAttribute('role', 'dialog');
        layer.setAttribute(
          'aria-label',
          n.title + '，产物预览'
        );

        const head = document.createElement('div');
        head.className = 'preview-head';

        const label = document.createElement('div');
        label.className = 'preview-label';

        const kicker = document.createElement('span');
        kicker.className = 'preview-kicker';
        kicker.textContent = '产物预览  /  ESC 关闭';

        const title = document.createElement('span');
        title.className = 'preview-title';
        title.textContent = n.title;

        label.append(kicker, title);

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'preview-close';
        close.textContent = '×';
        close.setAttribute('aria-label', '关闭预览');
        close.addEventListener('click', closePreview);

        head.append(label, close);

        const content = document.createElement('div');
        content.className = 'preview-content';

        layer.append(head, content);

        layer.addEventListener('pointerdown', e => {
          e.stopPropagation();
        });

        layer.addEventListener('click', e => {
          if (e.target === layer || e.target === content) {
            closePreview();
          }
        });

        stage.appendChild(layer);
        preview = layer;

        const url = artifactUrl(n);
        const type = artifactType(n);

        if (
          type === 'image' ||
          ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(type)
        ) {
          const img = document.createElement('img');

          img.src = url;
          img.alt = n.title;

          img.onerror = () => {
            if (preview !== layer) return;

            content.classList.add('text');

            const pre = document.createElement('pre');
            pre.textContent = '图片读取失败';

            img.replaceWith(pre);
          };

          content.appendChild(img);
        } else if (type === 'html') {
          const iframe = document.createElement('iframe');

          iframe.setAttribute('sandbox', '');
          iframe.setAttribute(
            'title',
            n.title + '，HTML 预览'
          );

          iframe.src = url;
          content.appendChild(iframe);
        } else {
          content.classList.add('text');

          const pre = document.createElement('pre');
          pre.textContent = '读取产物…';

          content.appendChild(pre);

          fetch(url, { cache: 'no-store' })
            .then(res => {
              if (!res.ok) {
                throw new Error('HTTP ' + res.status);
              }

              return res.text();
            })
            .then(text => {
              if (destroyed || preview !== layer) return;

              if (type === 'json') {
                try {
                  text = JSON.stringify(JSON.parse(text), null, 2);
                } catch (e) {}
              }

              pre.textContent = text;
            })
            .catch(e => {
              if (!destroyed && preview === layer) {
                pre.textContent = '读取失败：' + e.message;
              }
            });
        }
      }

      async function getJSON(url) {
        const res = await fetch(url, {
          cache: 'no-store'
        });

        if (!res.ok) {
          throw new Error(url + ' HTTP ' + res.status);
        }

        return res.json();
      }

      async function loadView() {
        try {
          const data = await getJSON('jingwei/data/view.json');

          if (destroyed) return;

          const saved = data &&
            data.positions &&
            typeof data.positions === 'object'
              ? data.positions
              : {};

          for (const [id, p] of Object.entries(saved)) {
            if (!p) continue;

            const x = Number(p.x);
            const y = Number(p.y);

            if (Number.isFinite(x) && Number.isFinite(y)) {
              positions[id] = { x, y };
            }
          }
        } catch (e) {}
      }

      async function reload(silent) {
        const current = ++sequence;

        try {
          const data = await getJSON('jingwei/data/graph.json');

          if (!destroyed && current === sequence) {
            applyGraph(data);
          }
        } catch (e) {
          if (!silent && !destroyed) {
            console.warn('[经纬] 读取失败', e);
          }
        }
      }

      function stopPolling() {
        if (poll) clearInterval(poll);
        poll = 0;
      }

      function startPolling() {
        if (poll || destroyed) return;

        poll = setInterval(() => {
          if (pollingBusy) return;

          pollingBusy = true;

          reload(true).finally(() => {
            pollingBusy = false;
          });
        }, 1200);
      }

      function saveView() {
        if (saveTimer) clearTimeout(saveTimer);

        saveTimer = setTimeout(() => {
          saveTimer = 0;
          if (destroyed) return;

          const data = {};

          for (const [id, p] of Object.entries(positions)) {
            data[id] = { x: p.x, y: p.y };
          }

          fetch('jingwei/actions/save-view', {
            method: 'POST',
            headers: {
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              positions: data
            })
          }).catch(() => {});
        }, 450);
      }

      function endDrag(e) {
        if (!drag || (e && e.pointerId !== drag.pointerId)) return;

        const d = drag;

        if (d.el) d.el.classList.remove('dragging');

        stage.classList.remove('panning');
        drag = null;

        if (d.mode === 'node' && d.moved) {
          saveView();
        }
      }

      listen(stage, 'pointerdown', e => {
        if (e.button !== 0 || preview) return;
        if (e.target.closest('.menu,.more')) return;

        closeMenu();
        stopMotion();

        const el = e.target.closest('.node');

        if (el && positions[el.dataset.id]) {
          const id = el.dataset.id;

          select(id);

          drag = {
            pointerId: e.pointerId,
            mode: 'node',
            id,
            el,
            sx: e.clientX,
            sy: e.clientY,
            ox: positions[id].x,
            oy: positions[id].y,
            moved: false
          };
        } else {
          select(null);

          drag = {
            pointerId: e.pointerId,
            mode: 'pan',
            sx: e.clientX,
            sy: e.clientY,
            ox: view.x,
            oy: view.y,
            moved: false
          };
        }
      });

      listen(stage, 'pointermove', e => {
        if (!drag || e.pointerId !== drag.pointerId) return;

        const dx = e.clientX - drag.sx;
        const dy = e.clientY - drag.sy;

        if (!drag.moved && Math.abs(dx) + Math.abs(dy) <= 3) {
          return;
        }

        if (!drag.moved) {
          drag.moved = true;

          try {
            stage.setPointerCapture(e.pointerId);
          } catch (error) {}

          if (drag.el) {
            drag.el.classList.add('dragging');
          } else {
            stage.classList.add('panning');
          }
        }

        if (drag.mode === 'node') {
          const p = positions[drag.id];
          if (!p) return;

          autoFit = false;

          p.x = drag.ox + dx / view.k;
          p.y = drag.oy + dy / view.k;

          positionNode(drag.id);
          drawEdges();
        } else {
          autoFit = false;

          view.x = drag.ox + dx;
          view.y = drag.oy + dy;

          drawView();
        }
      });

      listen(stage, 'pointerup', endDrag);
      listen(stage, 'pointercancel', endDrag);
      listen(stage, 'lostpointercapture', endDrag);

      listen(stage, 'wheel', e => {
        e.preventDefault();

        if (preview) return;

        closeMenu();
        stopMotion();

        const r = stage.getBoundingClientRect();
        const mx = e.clientX - r.left;
        const my = e.clientY - r.top;

        const wx = (mx - view.x) / view.k;
        const wy = (my - view.y) / view.k;

        const unit = e.deltaMode === 1
          ? 16
          : e.deltaMode === 2
            ? stage.clientHeight
            : 1;

        const k = clamp(
          view.k * Math.exp(-e.deltaY * unit * .0015),
          MIN,
          MAX
        );

        if (k === view.k) return;

        autoFit = false;

        view.k = k;
        view.x = mx - wx * k;
        view.y = my - wy * k;

        drawView();
      }, { passive: false });

      listen(stage, 'dblclick', e => {
        if (preview || menu || e.target.closest('.node')) return;
        fit();
      });

      function visible() {
        if (
          destroyed ||
          !host.isConnected ||
          !stage.clientWidth ||
          !stage.clientHeight
        ) return false;

        let el = host;

        while (el && el.nodeType === 1) {
          if (
            el.hidden ||
            el.inert ||
            el.getAttribute('aria-hidden') === 'true'
          ) return false;

          const style = getComputedStyle(el);

          if (
            style.display === 'none' ||
            style.visibility === 'hidden'
          ) return false;

          el = el.parentElement;
        }

        return true;
      }

      listen(window, 'keydown', e => {
        const t = e.target;

        if (
          t &&
          (
            ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) ||
            t.isContentEditable
          )
        ) return;

        if (
          e.ctrlKey ||
          e.metaKey ||
          e.altKey ||
          !visible()
        ) return;

        if (e.key === 'Escape') {
          if (preview) {
            closePreview();
            e.preventDefault();
          } else if (menu) {
            closeMenu();
            e.preventDefault();
          } else if (selected) {
            select(null);
            e.preventDefault();
          }

          return;
        }

        if (preview) return;

        if (
          e.key === 'f' ||
          e.key === 'F' ||
          e.key === '0'
        ) {
          e.preventDefault();
          closeMenu();
          fit();
        } else if (
          e.key === 'r' ||
          e.key === 'R'
        ) {
          e.preventDefault();
          closeMenu();
          reload(false);
        } else if (e.key === 'Enter' && !menu) {
          const n = getNode(selected);

          if (
            n &&
            branch(n) &&
            n.status !== 'running'
          ) {
            e.preventDefault();
            rerun(n.id);
          }
        }
      });

      const resize = () => {
        if (destroyed) return;

        if (autoFit) {
          fit();
        } else {
          drawEdges();
        }
      };

      if (typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(resize);

        observer.observe(stage);
        listeners.push(() => observer.disconnect());
      }

      listen(window, 'resize', resize);

      (async () => {
        await loadView();

        if (destroyed) return;

        rebuild(false);

        requestAnimationFrame(() => {
          if (destroyed) return;

          fit();
          reload(false);
        });
      })();

      return () => {
        destroyed = true;

        stopMotion();
        endDrag();
        closeMenu();
        closePreview();
        stopPolling();

        sequence++;

        if (saveTimer) clearTimeout(saveTimer);

        for (const off of listeners) {
          try {
            off();
          } catch (e) {}
        }

        listeners.length = 0;
      };
    }

    function Body(props) {
      const ref = React.useRef(null);
      const sessionId = props && props.sessionId
        ? String(props.sessionId)
        : '';

      React.useEffect(() => {
        const host = ref.current;
        if (!host) return undefined;

        const shadow = host.shadowRoot ||
          host.attachShadow({ mode: 'open' });

        shadow.innerHTML = '<style>' + CSS + '</style>' + HTML;

        const cleanup = createCanvas(host, shadow, sessionId);

        return () => {
          cleanup();
          shadow.innerHTML = '';
        };
      }, [sessionId]);

      return React.createElement('div', {
        ref,
        'data-jingwei-host': '',
        style: {
          display: 'block',
          width: '100%',
          height: '100%',
          minWidth: 0,
          minHeight: 0,
          overflow: 'hidden'
        }
      });
    }

    return {
      inject: ['slots', 'sidebarRightTabs'],

      apply(ctx) {
        ctx.effect(
          () => ctx.sidebarRightTabs.register({
            id: 'local.jingwei',
            kind: 'jingwei',
            priority: 'extension',
            title: () => '经纬',
            guide: [{
              id: 'canvas',
              order: 20,
              title: () => '经纬画布',
              description: () => '黑白无限画布'
            }]
          }),
          'jingwei: sidebar-right tab type'
        );

        ctx.effect(
          () => ctx.slots.inject(
            'sidebar.right.pane.tab',
            () => ctx.slots.register({
              name: 'sidebar.right.pane.tab',
              key: 'local.jingwei'
            }, Body)
          ),
          'jingwei: sidebar-right tab body'
        );
      }
    };
  }
});
