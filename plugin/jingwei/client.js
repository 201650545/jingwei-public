/**
 * 经纬 · Client 半边（v0.2：黑白无限画布 + 选中/菜单/预览/单点重跑）
 *
 * 视觉红线：只有 #000、#fff、rgba(255,255,255,x)，不出现任何色相。
 * 画布上只有节点、连线；唯一的临时浮层是节点菜单与产物预览。
 *
 * 数据：Host 路由 jingwei/data/graph.json；动作：jingwei/actions/*。
 */
window.__ModuleLoader__.load({
  id: '@local/jingwei',
  factory(require) {
    'use strict'

    const React = require('react')

    const NODE_W = 188
    const GRID = 24
    const MIN_K = 0.25
    const MAX_K = 3

    const CSS = `
:host {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: #000;
  color: #fff;
  font-family: "微软雅黑", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
.jw-viewport {
  position: absolute; inset: 0; overflow: hidden;
  background: #000; touch-action: none; cursor: default;
  user-select: none; -webkit-user-select: none;
}
.jw-viewport.panning { cursor: grabbing; }
.jw-grid {
  position: absolute; inset: 0;
  background-image: radial-gradient(circle, rgba(255,255,255,.12) 1px, transparent 1.2px);
  background-size: ${GRID}px ${GRID}px;
  background-position: 0 0;
}
.jw-world { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.jw-edge {
  position: absolute; inset: 0; width: 100%; height: 100%;
  overflow: visible; pointer-events: none;
}
.jw-edge path { fill: none; stroke: rgba(255,255,255,.26); stroke-width: 1; }
.jw-node {
  position: absolute; width: ${NODE_W}px; padding: 12px 13px 11px;
  background: #000; border: 1px solid rgba(255,255,255,.26); border-radius: 3px;
  cursor: grab;
}
.jw-node:hover { border-color: rgba(255,255,255,.62); }
.jw-node.dragging { cursor: grabbing; border-color: #fff; }
.jw-node.selected { border-color: #fff; outline: 1px solid #fff; }
.jw-node.running { border-style: dashed; border-color: rgba(255,255,255,.6); animation: jw-breathe 2.2s ease-in-out infinite; }
.jw-node.failed .jw-node-sub { color: rgba(255,255,255,.2); }
.jw-node-top { display: flex; align-items: baseline; gap: 6px; }
.jw-node-title { flex: 1; min-width: 0; font-size: 13px; font-weight: 600; letter-spacing: .5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #fff; }
.jw-node-time { flex: 0 0 auto; font: 11px/1 ui-monospace, Consolas, monospace; color: rgba(255,255,255,.55); white-space: nowrap; }
.jw-more {
  flex: 0 0 auto; background: none; border: 0; padding: 0 1px;
  font: 12px/1 ui-monospace, Consolas, monospace; color: rgba(255,255,255,.35);
  cursor: pointer; opacity: 0; transition: opacity .15s;
}
.jw-node:hover .jw-more, .jw-node.selected .jw-more { opacity: 1; }
.jw-more:hover { color: #fff; }
.jw-node-merge { width: 156px; border-color: rgba(255,255,255,.18); }
.jw-node-merge .jw-node-sub { color: rgba(255,255,255,.26); }
.jw-node-sub {
  margin-top: 7px; font: 10px/1.4 ui-monospace, Consolas, monospace;
  color: rgba(255,255,255,.34); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.jw-menu {
  position: absolute; z-index: 20; min-width: 132px;
  background: #000; border: 1px solid rgba(255,255,255,.3); padding: 4px 0;
}
.jw-menu button {
  display: block; width: 100%; text-align: left; background: none; border: 0;
  color: #fff; font: 12px/1.2 "微软雅黑", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif;
  padding: 8px 12px; cursor: pointer; white-space: nowrap;
}
.jw-menu button:hover:not(:disabled) { background: rgba(255,255,255,.1); }
.jw-menu button:disabled { color: rgba(255,255,255,.25); cursor: default; }
.jw-preview {
  position: absolute; inset: 0; z-index: 30; background: #000;
  padding: 40px 48px; display: flex; flex-direction: column; gap: 14px;
}
.jw-preview-top {
  display: flex; justify-content: space-between; align-items: center;
  font: 11px/1 ui-monospace, Consolas, monospace; color: rgba(255,255,255,.45);
}
.jw-preview-close {
  background: none; border: 0; color: rgba(255,255,255,.55);
  font: 16px/1 ui-monospace, Consolas, monospace; cursor: pointer; padding: 0 2px;
}
.jw-preview-close:hover { color: #fff; }
.jw-preview-body {
  flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center;
  overflow: auto;
}
.jw-preview-body pre {
  max-width: 100%; max-height: 100%; overflow: auto;
  font: 12px/1.65 ui-monospace, Consolas, monospace;
  color: rgba(255,255,255,.88); white-space: pre-wrap; word-break: break-word;
}
.jw-preview-body img { max-width: 92%; max-height: 92%; display: block; }
.jw-preview-body iframe {
  width: min(900px, 92%); height: 100%;
  border: 1px solid rgba(255,255,255,.2); background: #fff;
}
@keyframes jw-breathe {
  0%, 100% { border-color: rgba(255,255,255,.6); }
  50% { border-color: rgba(255,255,255,.2); }
}
`

    const HTML = `
<div class="jw-viewport" role="region" aria-label="经纬无限画布">
  <div class="jw-grid"></div>
  <svg class="jw-edge" aria-hidden="true"><g class="jw-edge-g"></g></svg>
  <div class="jw-world"></div>
</div>`

    const FALLBACK_GRAPH = {
      version: 1,
      runId: 'demo-run-001',
      nodes: [
        { id: 'copy', kind: 'branch', title: '文案', provider: 'provider', model: 'model-a', status: 'done', elapsedMs: 169270, artifact: 'copy/note.json', artifactType: 'json' },
        { id: 'design', kind: 'branch', title: '设计', provider: 'provider', model: 'model-b', status: 'done', elapsedMs: 222646, artifact: 'design/note.html', artifactType: 'html' },
        { id: 'merge', kind: 'merge', title: '汇总', status: 'done', elapsedMs: 222646 },
      ],
      edges: [['copy', 'merge'], ['design', 'merge']],
    }

    const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value))
    const fmtMs = (ms) => (ms / 1000).toFixed(2) + 's'
    const isBranch = (node) => node.kind === 'branch'

    function normalizeGraph(raw) {
      const src = raw && typeof raw === 'object' ? raw : {}
      const list = Array.isArray(src.nodes) ? src.nodes : []
      const nodes = []
      for (const item of list) {
        if (!item || typeof item.id !== 'string' || item.id.length === 0) continue
        const status = ['idle', 'running', 'done', 'failed'].includes(item.status) ? item.status : 'idle'
        const elapsed = Number(item.elapsedMs)
        nodes.push({
          id: item.id,
          kind: item.kind === 'merge' ? 'merge' : 'branch',
          title: String(item.title != null ? item.title : item.id),
          provider: String(item.provider != null ? item.provider : ''),
          model: String(item.model != null ? item.model : ''),
          status,
          elapsedMs: Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : undefined,
          startedAt: Number.isFinite(Number(item.startedAt)) ? Number(item.startedAt) : undefined,
          artifact: typeof item.artifact === 'string' && item.artifact.length > 0 ? item.artifact : undefined,
          artifactType: typeof item.artifactType === 'string' ? item.artifactType : undefined,
          error: typeof item.error === 'string' ? item.error : undefined,
        })
      }
      if (nodes.length === 0) return normalizeGraph(FALLBACK_GRAPH)
      const ids = new Set(nodes.map((node) => node.id))
      const edges = []
      if (Array.isArray(src.edges)) {
        for (const edge of src.edges) {
          if (!Array.isArray(edge) || edge.length !== 2) continue
          if (!ids.has(edge[0]) || !ids.has(edge[1])) continue
          edges.push([edge[0], edge[1]])
        }
      }
      return { version: 1, runId: String(src.runId != null ? src.runId : ''), nodes, edges }
    }

    function artifactKind(node) {
      if (node.artifactType) return node.artifactType
      const name = String(node.artifact || '')
      const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
      if (['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext)) return 'image'
      if (ext === 'html' || ext === 'htm') return 'html'
      if (ext === 'json') return 'json'
      return 'text'
    }

    function createController(host, shadow, sessionId) {
      const viewport = shadow.querySelector('.jw-viewport')
      const grid = shadow.querySelector('.jw-grid')
      const world = shadow.querySelector('.jw-world')
      const edgeG = shadow.querySelector('.jw-edge-g')

      const view = { x: 0, y: 0, k: 1 }
      const positions = Object.create(null)
      const nodes = Object.create(null)
      let graph = normalizeGraph(FALLBACK_GRAPH)
      let renderedIds = ''
      let selectedId = null
      let menuEl = null
      let previewEl = null
      let drag = null
      let autoFit = true
      let destroyed = false
      let pollTimer = 0
      let saveTimer = 0
      const disposers = []
      const on = (target, type, handler) => {
        target.addEventListener(type, handler)
        disposers.push(() => target.removeEventListener(type, handler))
      }

      /* ---------------- 视图 ---------------- */
      function applyView() {
        world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`
        grid.style.backgroundSize = `${GRID * view.k}px ${GRID * view.k}px`
        grid.style.backgroundPosition = `${view.x}px ${view.y}px`
        drawEdges()
      }

      function place(id) {
        const el = nodes[id]
        const point = positions[id]
        if (el && point) {
          el.style.left = point.x + 'px'
          el.style.top = point.y + 'px'
        }
      }

      function drawEdges() {
        edgeG.textContent = ''
        for (const [from, to] of graph.edges) {
          const a = nodes[from]
          const b = nodes[to]
          const pa = positions[from]
          const pb = positions[to]
          if (!a || !b || !pa || !pb) continue
          const x1 = view.x + (pa.x + a.offsetWidth / 2) * view.k
          const y1 = view.y + (pa.y + a.offsetHeight) * view.k
          const x2 = view.x + (pb.x + b.offsetWidth / 2) * view.k
          const y2 = view.y + pb.y * view.k
          const mid = (y1 + y2) / 2
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
          path.setAttribute('d', `M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`)
          edgeG.appendChild(path)
        }
      }

      function fit() {
        const vw = viewport.clientWidth
        const vh = viewport.clientHeight
        if (!vw || !vh || Object.keys(nodes).length === 0) return
        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity
        for (const [id, el] of Object.entries(nodes)) {
          const point = positions[id]
          if (!point) continue
          minX = Math.min(minX, point.x)
          minY = Math.min(minY, point.y)
          maxX = Math.max(maxX, point.x + el.offsetWidth)
          maxY = Math.max(maxY, point.y + el.offsetHeight)
        }
        const width = Math.max(1, maxX - minX)
        const height = Math.max(1, maxY - minY)
        const pad = Math.min(48, Math.max(16, Math.min(vw, vh) * 0.06))
        view.k = clamp(Math.min((vw - pad * 2) / width, (vh - pad * 2) / height), MIN_K, 1.5)
        view.x = (vw - width * view.k) / 2 - minX * view.k
        view.y = (vh - height * view.k) / 2 - minY * view.k
        autoFit = true
        applyView()
      }

      /* ---------------- 节点 ---------------- */
      function defaultPosition(node, index, count) {
        if (!isBranch(node)) {
          const span = count > 1 ? (count - 1) * 220 : 0
          return { x: span / 2 + (NODE_W - 156) / 2, y: 188 }
        }
        return { x: index * 220, y: 0 }
      }

      function layoutMissing() {
        const branches = graph.nodes.filter(isBranch)
        let index = 0
        for (const node of graph.nodes) {
          if (isBranch(node)) {
            if (!positions[node.id]) positions[node.id] = defaultPosition(node, index, branches.length)
            index += 1
          } else if (!positions[node.id]) {
            positions[node.id] = defaultPosition(node, 0, branches.length)
          }
        }
      }

      function timeText(node) {
        if (node.kind === 'merge') {
          if (node.status === 'running') {
            const running = graph.nodes.filter((item) => isBranch(item) && item.status === 'running').length
            return '等 ' + running + ' 路'
          }
          if (node.status === 'failed') return '失败'
          if (node.status === 'idle') return '—'
          return Number.isFinite(node.elapsedMs) ? fmtMs(node.elapsedMs) : '—'
        }
        if (node.status === 'running') return '运行中'
        if (node.status === 'failed') return '失败'
        if (node.status === 'idle') return '—'
        return Number.isFinite(node.elapsedMs) ? fmtMs(node.elapsedMs) : '—'
      }

      function subText(node) {
        if (node.kind === 'merge') return graph.nodes.filter(isBranch).length + ' 路'
        return node.model || '—'
      }

      function updateNode(node) {
        const el = nodes[node.id]
        if (!el) return
        el.classList.toggle('running', node.status === 'running')
        el.classList.toggle('failed', node.status === 'failed')
        el.classList.toggle('selected', node.id === selectedId)
        const title = el.querySelector('.jw-node-title')
        const time = el.querySelector('.jw-node-time')
        const sub = el.querySelector('.jw-node-sub')
        if (title) title.textContent = node.title
        if (time) time.textContent = timeText(node)
        if (sub) {
          sub.textContent = subText(node)
          sub.title = sub.textContent
        }
      }

      function makeNode(node) {
        const el = document.createElement('div')
        el.className = node.kind === 'merge' ? 'jw-node jw-node-merge' : 'jw-node'
        el.dataset.id = node.id
        const top = document.createElement('div')
        top.className = 'jw-node-top'
        const title = document.createElement('span')
        title.className = 'jw-node-title'
        title.textContent = node.title
        const time = document.createElement('span')
        time.className = 'jw-node-time'
        time.textContent = timeText(node)
        top.append(title, time)
        if (isBranch(node)) {
          const more = document.createElement('button')
          more.className = 'jw-more'
          more.type = 'button'
          more.textContent = '⋯'
          more.title = '节点操作'
          more.addEventListener('pointerdown', (event) => event.stopPropagation())
          more.addEventListener('click', (event) => {
            event.stopPropagation()
            openMenu(node.id, more)
          })
          top.appendChild(more)
        }
        const sub = document.createElement('div')
        sub.className = 'jw-node-sub'
        sub.textContent = subText(node)
        sub.title = sub.textContent
        el.append(top, sub)
        el.addEventListener('dblclick', (event) => {
          event.stopPropagation()
          if (node.artifact) openPreview(node.id)
        })
        return el
      }

      function buildCanvas(keepPositions) {
        if (!keepPositions) for (const key of Object.keys(positions)) delete positions[key]
        world.textContent = ''
        for (const key of Object.keys(nodes)) delete nodes[key]
        if (!keepPositions) layoutMissing()
        else {
          for (const node of graph.nodes) {
            if (!positions[node.id]) positions[node.id] = defaultPosition(node, 0, graph.nodes.filter(isBranch).length)
          }
        }
        for (const node of graph.nodes) {
          const el = makeNode(node)
          nodes[node.id] = el
          world.appendChild(el)
          place(node.id)
        }
        renderedIds = graph.nodes.map((node) => node.id).join(',')
        if (selectedId && !nodes[selectedId]) selectedId = null
        for (const node of graph.nodes) updateNode(node)
        requestAnimationFrame(() => {
          if (destroyed) return
          drawEdges()
        })
      }

      function applyGraph() {
        const ids = graph.nodes.map((node) => node.id).join(',')
        if (ids !== renderedIds) {
          buildCanvas(true)
          if (autoFit) fit()
        } else {
          for (const node of graph.nodes) updateNode(node)
          drawEdges()
        }
      }

      /* ---------------- 选择 / 菜单 ---------------- */
      function select(id) {
        selectedId = id
        for (const [key, el] of Object.entries(nodes)) el.classList.toggle('selected', key === id)
      }

      function closeMenu() {
        if (menuEl) {
          menuEl.remove()
          menuEl = null
        }
      }

      function openMenu(nodeId, anchor) {
        closeMenu()
        const node = graph.nodes.find((item) => item.id === nodeId)
        if (!node || !isBranch(node)) return
        const branchCount = graph.nodes.filter(isBranch).length
        const items = [
          { label: '重跑这一路', disabled: node.status === 'running', run: () => rerun(node) },
          { label: '查看产物', disabled: !node.artifact, run: () => openPreview(node.id) },
          { label: '复制模型名', disabled: !node.model, run: () => copyText(node.model) },
          { label: '删除节点', disabled: node.status === 'running' || branchCount <= 1, run: () => removeNode(node.id) },
        ]
        const menu = document.createElement('div')
        menu.className = 'jw-menu'
        for (const item of items) {
          const button = document.createElement('button')
          button.type = 'button'
          button.textContent = item.label
          button.disabled = item.disabled
          button.addEventListener('click', (event) => {
            event.stopPropagation()
            closeMenu()
            if (!item.disabled) item.run()
          })
          menu.appendChild(button)
        }
        menu.addEventListener('pointerdown', (event) => event.stopPropagation())
        viewport.appendChild(menu)
        const anchorRect = anchor.getBoundingClientRect()
        const viewportRect = viewport.getBoundingClientRect()
        const left = clamp(anchorRect.left - viewportRect.left - 104, 8, Math.max(8, viewportRect.width - menu.offsetWidth - 8))
        const top = clamp(anchorRect.bottom - viewportRect.top + 6, 8, Math.max(8, viewportRect.height - menu.offsetHeight - 8))
        menu.style.left = left + 'px'
        menu.style.top = top + 'px'
        menuEl = menu
      }

      /* ---------------- 动作 ---------------- */
      function copyText(text) {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(() => undefined)
            return
          }
        } catch {
          /* 忽略 */
        }
        try {
          const area = document.createElement('textarea')
          area.value = text
          area.style.position = 'fixed'
          area.style.opacity = '0'
          document.body.appendChild(area)
          area.select()
          document.execCommand('copy')
          area.remove()
        } catch {
          console.warn('[经纬] 复制失败')
        }
      }

      async function rerun(node) {
        if (node.status === 'running') return
        try {
          const response = await fetch('jingwei/actions/rerun', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: sessionId || '', nodeId: node.id }),
          })
          if (response.status !== 202) {
            const detail = await response.text().catch(() => '')
            console.warn('[经纬] 重跑未接受：' + response.status + ' ' + detail)
            return
          }
          node.status = 'running'
          node.startedAt = Date.now()
          node.elapsedMs = undefined
          updateNode(node)
          startPolling()
        } catch (error) {
          console.warn('[经纬] 重跑请求失败：' + (error && error.message))
        }
      }

      async function removeNode(nodeId) {
        try {
          const response = await fetch('jingwei/actions/remove-node', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ nodeId }),
          })
          if (!response.ok) {
            console.warn('[经纬] 删除未接受：' + response.status)
            return
          }
          graph = normalizeGraph(await response.json())
          applyGraph()
          if (autoFit) fit()
        } catch (error) {
          console.warn('[经纬] 删除失败：' + (error && error.message))
        }
      }

      /* ---------------- 产物预览 ---------------- */
      function artifactUrl(node) {
        const rel = String(node.artifact || '')
          .split('/')
          .map((part) => encodeURIComponent(part))
          .join('/')
        return 'jingwei/artifact/' + encodeURIComponent(graph.runId) + '/' + rel
      }

      function closePreview() {
        if (previewEl) {
          previewEl.remove()
          previewEl = null
        }
      }

      function openPreview(nodeId) {
        const node = graph.nodes.find((item) => item.id === nodeId)
        if (!node || !node.artifact) return
        closePreview()
        closeMenu()
        const overlay = document.createElement('div')
        overlay.className = 'jw-preview'
        const top = document.createElement('div')
        top.className = 'jw-preview-top'
        const label = document.createElement('span')
        label.textContent = node.title + ' · Esc'
        const close = document.createElement('button')
        close.className = 'jw-preview-close'
        close.type = 'button'
        close.textContent = '×'
        close.addEventListener('click', closePreview)
        top.append(label, close)
        const body = document.createElement('div')
        body.className = 'jw-preview-body'
        overlay.append(top, body)
        overlay.addEventListener('pointerdown', (event) => event.stopPropagation())
        overlay.addEventListener('click', (event) => {
          if (event.target === overlay || event.target === body) closePreview()
        })
        viewport.appendChild(overlay)
        previewEl = overlay

        const url = artifactUrl(node)
        const kind = artifactKind(node)
        if (kind === 'image') {
          const img = document.createElement('img')
          img.src = url
          img.alt = node.title
          body.appendChild(img)
        } else if (kind === 'html') {
          const frame = document.createElement('iframe')
          frame.setAttribute('sandbox', '')
          frame.src = url
          body.appendChild(frame)
        } else {
          const pre = document.createElement('pre')
          pre.textContent = '读取产物…'
          body.appendChild(pre)
          fetch(url, { cache: 'no-store' })
            .then((response) => {
              if (!response.ok) throw new Error('HTTP ' + response.status)
              return response.text()
            })
            .then((text) => {
              if (kind === 'json') {
                try {
                  text = JSON.stringify(JSON.parse(text), null, 2)
                } catch {
                  /* 保留原文 */
                }
              }
              pre.textContent = text
            })
            .catch((error) => {
              pre.textContent = '读取失败：' + (error && error.message)
            })
        }
      }

      /* ---------------- 轮询 ---------------- */
      function stopPolling() {
        if (pollTimer) {
          clearInterval(pollTimer)
          pollTimer = 0
        }
      }

      function startPolling() {
        if (pollTimer) return
        pollTimer = setInterval(async () => {
          try {
            const response = await fetch('jingwei/data/graph.json', { cache: 'no-store' })
            if (!response.ok) return
            graph = normalizeGraph(await response.json())
            applyGraph()
            if (!graph.nodes.some((node) => node.status === 'running')) stopPolling()
          } catch {
            /* 下一轮再试 */
          }
        }, 1200)
      }

      /* ---------------- 载入 ---------------- */
      async function getJson(url) {
        const response = await fetch(url, { cache: 'no-store' })
        if (!response.ok) throw new Error(url + ' HTTP ' + response.status)
        return response.json()
      }

      async function loadView() {
        try {
          const data = await getJson('jingwei/data/view.json')
          const saved = data && typeof data.positions === 'object' ? data.positions : {}
          for (const [id, point] of Object.entries(saved)) {
            const x = Number(point?.x)
            const y = Number(point?.y)
            if (Number.isFinite(x) && Number.isFinite(y)) positions[id] = { x, y }
          }
        } catch {
          /* 没存过位置 */
        }
      }

      async function reloadGraph() {
        try {
          graph = normalizeGraph(await getJson('jingwei/data/graph.json'))
          applyGraph()
          if (autoFit) fit()
          if (graph.nodes.some((node) => node.status === 'running')) startPolling()
        } catch (error) {
          console.warn('[经纬] 刷新失败，保留当前画布：' + (error && error.message))
        }
      }

      function saveView() {
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(() => {
          const payload = {}
          for (const [id, point] of Object.entries(positions)) payload[id] = point
          fetch('jingwei/actions/save-view', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ positions: payload }),
          }).catch(() => undefined)
        }, 450)
      }

      /* ---------------- 指针 ---------------- */
      function endDrag() {
        if (!drag) return
        if (drag.el) drag.el.classList.remove('dragging')
        viewport.classList.remove('panning')
        if (drag.mode === 'node' && drag.moved) saveView()
        drag = null
      }

      on(viewport, 'pointerdown', (event) => {
        if (event.button !== 0) return
        if (previewEl) return
        closeMenu()
        const nodeEl = event.target.closest && event.target.closest('.jw-node')
        try {
          viewport.setPointerCapture(event.pointerId)
        } catch {
          /* 旧浏览器 */
        }
        if (nodeEl && nodeEl.dataset.id) {
          const id = nodeEl.dataset.id
          select(id)
          drag = {
            mode: 'node',
            id,
            el: nodeEl,
            sx: event.clientX,
            sy: event.clientY,
            ox: positions[id].x,
            oy: positions[id].y,
            moved: false,
          }
          nodeEl.classList.add('dragging')
        } else {
          select(null)
          drag = { mode: 'pan', sx: event.clientX, sy: event.clientY, ox: view.x, oy: view.y, moved: false }
          viewport.classList.add('panning')
        }
      })

      on(viewport, 'pointermove', (event) => {
        if (!drag) return
        const dx = event.clientX - drag.sx
        const dy = event.clientY - drag.sy
        if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true
        if (drag.mode === 'pan') {
          view.x = drag.ox + dx
          view.y = drag.oy + dy
          autoFit = false
          applyView()
        } else {
          positions[drag.id].x = drag.ox + dx / view.k
          positions[drag.id].y = drag.oy + dy / view.k
          place(drag.id)
          drawEdges()
        }
      })

      on(viewport, 'pointerup', endDrag)
      on(viewport, 'pointercancel', endDrag)

      on(viewport, 'wheel', (event) => {
        event.preventDefault()
        if (previewEl) return
        closeMenu()
        const rect = viewport.getBoundingClientRect()
        const mx = event.clientX - rect.left
        const my = event.clientY - rect.top
        const wx = (mx - view.x) / view.k
        const wy = (my - view.y) / view.k
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1
        const next = clamp(view.k * Math.exp(-event.deltaY * unit * 0.0015), MIN_K, MAX_K)
        if (next === view.k) return
        autoFit = false
        view.k = next
        view.x = mx - wx * next
        view.y = my - wy * next
        applyView()
      }, { passive: false })

      on(viewport, 'dblclick', (event) => {
        if (previewEl) return
        if (event.target.closest && event.target.closest('.jw-node')) return
        fit()
      })

      /* ---------------- 键盘 ---------------- */
      function isVisible() {
        if (destroyed || !host.isConnected) return false
        if (!viewport.clientWidth || !viewport.clientHeight) return false
        if (viewport.closest('[hidden], [inert]')) return false
        if (viewport.closest('[aria-hidden="true"]')) return false
        const style = window.getComputedStyle(viewport)
        return style.display !== 'none' && style.visibility !== 'hidden'
      }

      on(window, 'keydown', (event) => {
        const target = event.target
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' || target.isContentEditable === true)) return
        if (event.ctrlKey || event.metaKey || event.altKey) return
        if (!isVisible()) return
        if (event.key === 'Escape') {
          if (previewEl) {
            closePreview()
            event.preventDefault()
          } else if (menuEl) {
            closeMenu()
            event.preventDefault()
          } else if (selectedId) {
            select(null)
            event.preventDefault()
          }
          return
        }
        if (previewEl) return
        if (event.key === 'r' || event.key === 'R') {
          event.preventDefault()
          reloadGraph()
        } else if (event.key === 'f' || event.key === 'F' || event.key === '0') {
          event.preventDefault()
          fit()
        } else if (event.key === 'Enter') {
          const node = graph.nodes.find((item) => item.id === selectedId)
          if (node && isBranch(node) && node.status !== 'running') {
            event.preventDefault()
            rerun(node)
          }
        }
      })

      /* ---------------- 尺寸 ---------------- */
      function onResize() {
        if (destroyed) return
        if (autoFit) fit()
        else drawEdges()
      }
      if (typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(onResize)
        observer.observe(viewport)
        disposers.push(() => observer.disconnect())
      }
      on(window, 'resize', onResize)

      /* ---------------- 启动 ---------------- */
      ;(async () => {
        await loadView()
        if (destroyed) return
        buildCanvas(false)
        requestAnimationFrame(() => {
          if (destroyed) return
          fit()
          reloadGraph()
          if (graph.nodes.some((node) => node.status === 'running')) startPolling()
        })
      })()

      return function teardown() {
        destroyed = true
        endDrag()
        closeMenu()
        closePreview()
        stopPolling()
        if (saveTimer) clearTimeout(saveTimer)
        disposers.forEach((fn) => {
          try {
            fn()
          } catch {
            /* 忽略 */
          }
        })
        disposers.length = 0
      }
    }

    /* ---------------- React 宿主 ---------------- */
    function Body(props) {
      const hostRef = React.useRef(null)
      const sessionId = props && props.sessionId ? String(props.sessionId) : ''
      React.useEffect(() => {
        const host = hostRef.current
        if (!host) return undefined
        const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' })
        shadow.innerHTML = '<style>' + CSS + '</style>' + HTML
        const teardown = createController(host, shadow, sessionId)
        return () => {
          try {
            teardown()
          } catch (error) {
            console.warn('[经纬] 清理失败', error)
          }
          shadow.innerHTML = ''
        }
      }, [sessionId])
      return React.createElement('div', {
        'data-jingwei-host': '',
        ref: hostRef,
        style: {
          display: 'block',
          width: '100%',
          height: '100%',
          minWidth: 0,
          minHeight: 0,
          overflow: 'hidden',
        },
      })
    }

    /* ---------------- 插件入口 ---------------- */
    return {
      inject: ['slots', 'sidebarRightTabs'],
      apply(ctx) {
        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: 'local.jingwei',
          kind: 'jingwei',
          priority: 'extension',
          title: () => '经纬',
          guide: [{
            id: 'canvas',
            order: 20,
            title: () => '经纬画布',
            description: () => '黑白无限画布',
          }],
        }), 'jingwei: sidebar-right tab type')

        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: 'local.jingwei',
        }, Body)), 'jingwei: sidebar-right tab body')
      },
    }
  },
})
