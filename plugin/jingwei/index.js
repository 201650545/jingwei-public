/**
 * 经纬 · Host 半边（v0.2）
 *
 * 职责：
 *   1) 把画布要的数据 / 产物以同源 HTTP 发给 Client；
 *   2) 接收画布上的动作：单点重跑、保存视图位置、删除节点。
 *
 * 路由（无鉴权，只监听本机回环；文件名与路径都有白名单）：
 *   GET  /jingwei/data/graph.json            画布图数据（节点/边/状态/产物指针）
 *   GET  /jingwei/data/view.json             节点位置（没有则 404）
 *   GET  /jingwei/data/index.json            manifest latest 指针（兼容）
 *   GET  /jingwei/data/run-<id>.json         manifest 快照（兼容）
 *   GET  /jingwei/assets/<file>              封面等图片
 *   GET  /jingwei/artifact/<runId>/<path>    某轮产物（json/html/png…）
 *   POST /jingwei/actions/rerun              {sessionId,nodeId} 只重跑这一路
 *   POST /jingwei/actions/remove-node         {nodeId}
 *   POST /jingwei/actions/save-view           {positions}
 *
 * 重跑：用宿主已有的 subagents 服务（spawn provider）在**当前 GUI 会话**下起一个
 * 子 Agent，只跑这一路；delivery=caller，结果不回灌主对话。耗时只认子会话日志里的
 * turn/start → turn/end（与 scripts/measure_subagent_run.mjs 同一口径）。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import zlib from 'node:zlib'

export const name = 'jingwei'

/** 重跑依赖宿主已有的 Agent / 子 Agent 服务；缺了就不激活。 */
export const inject = ['webServer', 'agents', 'subagents']

const ROOT = process.env.JINGWEI_HOME ?? '/workspace/jingwei'
const DATA_DIR = join(ROOT, 'app', 'data')
const ASSET_DIR = join(ROOT, 'app', 'assets')
const ARTIFACT_DIR = join(ROOT, 'artifacts')

const PROMPTS = JSON.parse(readFileSync(fileURLToPath(new URL('./prompts.json', import.meta.url)), 'utf8'))

const RUN_ID = /^[0-9A-Za-z][0-9A-Za-z_-]*$/
const RUN_FILE = /^run-[0-9A-Za-z_-]+\.json$/
const ASSET_FILE = /^[0-9A-Za-z_.-]+\.(?:png|jpe?g|webp|svg)$/
const NODE_ID = /^[0-9A-Za-z_-]+$/

const TYPES = {
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

const RERUN_TIMEOUT_MS = 15 * 60 * 1000
let rerunningNode = null

/* ---------------- 基础 ---------------- */

function methodAllowed(req, res, allow = 'GET, HEAD') {
  if (req.method === 'GET' || req.method === 'HEAD') return true
  res.writeHead(405, { allow, 'cache-control': 'no-store' })
  res.end()
  return false
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function sendText(res, status, text) {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(text)
}

async function readBody(req, limit = 64 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('body too large')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function tailOf(req, prefix) {
  const url = new URL(req.url ?? '/', 'http://jingwei.invalid')
  const pathname = decodeURIComponent(url.pathname)
  if (!pathname.startsWith(prefix)) return undefined
  return pathname.slice(prefix.length)
}

async function serveAbsolute(req, res, abs, type) {
  if (!methodAllowed(req, res)) return
  try {
    const body = await readFile(abs)
    res.writeHead(200, {
      'content-type': type ?? 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    })
    res.end(req.method === 'HEAD' ? undefined : body)
  } catch (error) {
    const missing = error?.code === 'ENOENT' || error?.code === 'ENOTDIR'
    res.writeHead(missing ? 404 : 500, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    })
    res.end(missing ? 'not found\n' : 'read failed\n')
  }
}

async function serveFile(req, res, dir, file, type) {
  return serveAbsolute(req, res, join(dir, file), type)
}

/* ---------------- graph / view ---------------- */

async function readGraph() {
  return JSON.parse(await readFile(join(DATA_DIR, 'graph.json'), 'utf8'))
}

async function writeGraph(graph) {
  graph.updatedAt = new Date().toISOString()
  await writeFile(join(DATA_DIR, 'graph.json'), JSON.stringify(graph, null, 2) + '\n', 'utf8')
}

function recomputeMerge(graph) {
  const branches = graph.nodes.filter((node) => node.kind === 'branch')
  const merge = graph.nodes.find((node) => node.kind === 'merge')
  if (!merge) return
  const elapsed = branches.map((node) => (Number.isFinite(node.elapsedMs) ? node.elapsedMs : 0))
  merge.elapsedMs = Math.max(0, ...elapsed)
  merge.status = branches.some((node) => node.status === 'running')
    ? 'running'
    : branches.some((node) => node.status === 'failed')
      ? 'failed'
      : branches.every((node) => node.status === 'idle')
        ? 'idle'
        : 'done'
}

/* ---------------- 耗时：只认 turn/end ---------------- */

const SESSION_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

function measureChildSession(sessionId) {
  const sessionsRoot = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'sessions')
  let dir
  try {
    for (const workspace of readdirSync(sessionsRoot)) {
      const candidate = join(sessionsRoot, workspace, sessionId)
      if (existsSync(candidate) && statSync(candidate).isDirectory()) {
        dir = candidate
        break
      }
    }
  } catch {
    return undefined
  }
  if (!dir) return undefined
  let file
  try {
    file = readdirSync(dir).find((item) => item.startsWith('session.') && item.endsWith('.jsonl.zstd'))
  } catch {
    return undefined
  }
  if (!file) return undefined

  let buffer
  try {
    buffer = readFileSync(join(dir, file))
  } catch {
    return undefined
  }
  const starts = []
  for (let i = 0; i < buffer.length - 3; i++) {
    if (buffer[i] === 0x28 && buffer[i + 1] === 0xb5 && buffer[i + 2] === 0x2f && buffer[i + 3] === 0xfd) starts.push(i)
  }
  let turnStart
  let turnEnd
  for (let k = 0; k < starts.length; k++) {
    const start = starts[k]
    const end = k + 1 < starts.length ? starts[k + 1] : buffer.length
    let text
    try {
      text = zlib.zstdDecompressSync(buffer.subarray(start, end)).toString('utf8')
    } catch {
      continue
    }
    for (const line of text.split('\n').filter(Boolean)) {
      let event
      try {
        event = JSON.parse(line)
      } catch {
        continue
      }
      const time = Number(event?.time)
      if (!Number.isFinite(time)) continue
      if (event.type === 'turn/start' && turnStart === undefined) turnStart = time
      else if (event.type === 'turn/end') turnEnd = time
    }
  }
  if (turnStart === undefined || turnEnd === undefined || turnEnd < turnStart) return undefined
  return turnEnd - turnStart
}

/* ---------------- 重跑 ---------------- */

async function runRerun(ctx, graph, node, parent, outputPath, recipe) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RERUN_TIMEOUT_MS)
  const startedAt = Date.now()
  try {
    const text = String(recipe.prompt).split('{{out}}').join(outputPath)
    const activation = await ctx.subagents.startActivation({
      provider: 'spawn',
      label: `经纬·重跑·${node.title ?? node.id}`,
      request: {
        cwd: ROOT,
        prompt: [{ type: 'text', text }],
        parent,
        agentOptions: { provider: node.provider, model: node.model },
      },
      signal: controller.signal,
      delivery: 'caller',
    })
    const result = await activation.result
    const elapsed = measureChildSession(activation.childId) ?? (Date.now() - startedAt)
    const ok = result.stopReason === 'completed' && existsSync(outputPath)

    const fresh = await readGraph()
    const target = fresh.nodes.find((item) => item.id === node.id)
    if (target) {
      target.status = ok ? 'done' : 'failed'
      target.elapsedMs = elapsed
      target.finishedAt = new Date().toISOString()
      delete target.startedAt
      if (ok) {
        target.artifactBytes = statSync(outputPath).size
        delete target.error
      } else {
        target.error = String(result.diagnostic ?? result.stopReason ?? 'unknown')
      }
    }
    recomputeMerge(fresh)
    await writeGraph(fresh)
    await activation.dispose().catch(() => undefined)
  } catch (error) {
    try {
      const fresh = await readGraph()
      const target = fresh.nodes.find((item) => item.id === node.id)
      if (target) {
        target.status = 'failed'
        target.error = String(error?.message ?? error)
        target.finishedAt = new Date().toISOString()
        delete target.startedAt
      }
      recomputeMerge(fresh)
      await writeGraph(fresh)
    } catch {
      /* 写不进去也不能让进程挂 */
    }
  } finally {
    clearTimeout(timer)
    rerunningNode = null
  }
}

async function handleRerun(ctx, req, res) {
  let body
  try {
    body = await readBody(req)
  } catch {
    return sendJson(res, 400, { error: 'bad body' })
  }
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
  const nodeId = typeof body.nodeId === 'string' ? body.nodeId : ''
  if (!sessionId || !NODE_ID.test(nodeId)) return sendJson(res, 400, { error: 'sessionId/nodeId required' })
  if (rerunningNode !== null) return sendJson(res, 409, { error: 'busy', nodeId: rerunningNode })

  let graph
  try {
    graph = await readGraph()
  } catch {
    return sendJson(res, 500, { error: 'graph unavailable' })
  }
  const node = graph.nodes.find((item) => item.id === nodeId)
  if (!node || node.kind !== 'branch') return sendJson(res, 400, { error: 'unknown branch node' })
  if (node.status === 'running') return sendJson(res, 409, { error: 'node already running' })

  const recipe = PROMPTS[nodeId]
  if (!recipe) return sendJson(res, 400, { error: 'no rerun recipe for ' + nodeId })
  if (recipe.provider !== node.provider || recipe.model !== node.model) {
    return sendJson(res, 400, { error: 'model route mismatch; refusing rerun' })
  }
  if (!node.artifact) return sendJson(res, 400, { error: 'node has no artifact target' })

  const parent = ctx.agents.get(sessionId)
  if (parent === undefined) return sendJson(res, 409, { error: 'session is not live' })

  const outputPath = join(ARTIFACT_DIR, graph.runId, node.artifact)
  try {
    await mkdir(dirname(outputPath), { recursive: true })
  } catch {
    /* 目录已存在或不可建，后面会以失败收场 */
  }

  node.status = 'running'
  node.startedAt = Date.now()
  delete node.elapsedMs
  delete node.error
  graph.updatedAt = new Date().toISOString()
  try {
    await writeGraph(graph)
  } catch {
    return sendJson(res, 500, { error: 'cannot mark running' })
  }

  rerunningNode = nodeId
  sendJson(res, 202, { accepted: true, nodeId, runId: graph.runId })
  runRerun(ctx, graph, node, parent, outputPath, recipe).catch(() => undefined)
}

async function handleRemoveNode(req, res) {
  let body
  try {
    body = await readBody(req)
  } catch {
    return sendJson(res, 400, { error: 'bad body' })
  }
  const nodeId = typeof body.nodeId === 'string' ? body.nodeId : ''
  if (!NODE_ID.test(nodeId)) return sendJson(res, 400, { error: 'nodeId required' })
  if (rerunningNode !== null) return sendJson(res, 409, { error: 'busy' })

  let graph
  try {
    graph = await readGraph()
  } catch {
    return sendJson(res, 500, { error: 'graph unavailable' })
  }
  const node = graph.nodes.find((item) => item.id === nodeId)
  if (!node || node.kind !== 'branch') return sendJson(res, 400, { error: 'only branch nodes can be removed' })
  const branches = graph.nodes.filter((item) => item.kind === 'branch')
  if (branches.length <= 1) return sendJson(res, 400, { error: 'cannot remove the last branch' })

  graph.nodes = graph.nodes.filter((item) => item.id !== nodeId)
  graph.edges = graph.edges.filter((edge) => edge[0] !== nodeId && edge[1] !== nodeId)
  recomputeMerge(graph)
  await writeGraph(graph)
  sendJson(res, 200, graph)
}

async function handleSaveView(req, res) {
  let body
  try {
    body = await readBody(req)
  } catch {
    return sendJson(res, 400, { error: 'bad body' })
  }
  const positions = {}
  const source = body && typeof body.positions === 'object' && body.positions !== null ? body.positions : {}
  for (const [id, point] of Object.entries(source)) {
    if (!NODE_ID.test(id)) continue
    const x = Number(point?.x)
    const y = Number(point?.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    positions[id] = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }
  }
  try {
    await writeFile(join(DATA_DIR, 'view.json'), JSON.stringify({ positions }, null, 2) + '\n', 'utf8')
  } catch {
    return sendJson(res, 500, { error: 'write failed' })
  }
  sendJson(res, 200, { saved: Object.keys(positions).length })
}

/* ---------------- 插件入口 ---------------- */

export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/jingwei/data/graph.json',
        handler: (req, res) => serveFile(req, res, DATA_DIR, 'graph.json', TYPES['.json']),
      }),
    'jingwei: graph route',
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/jingwei/data/view.json',
        handler: (req, res) => serveFile(req, res, DATA_DIR, 'view.json', TYPES['.json']),
      }),
    'jingwei: view route',
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/jingwei/data/index.json',
        handler: (req, res) => serveFile(req, res, DATA_DIR, 'index.json', TYPES['.json']),
      }),
    'jingwei: manifest index route',
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: '/jingwei/data',
        handler: (req, res) => {
          const file = tailOf(req, '/jingwei/data/')
          if (!file || !RUN_FILE.test(file)) {
            if (!methodAllowed(req, res)) return
            res.writeHead(404, { 'cache-control': 'no-store' })
            res.end('not found\n')
            return
          }
          return serveFile(req, res, DATA_DIR, file, TYPES['.json'])
        },
      }),
    'jingwei: manifest run routes',
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: '/jingwei/assets',
        handler: (req, res) => {
          const file = tailOf(req, '/jingwei/assets/')
          if (!file || !ASSET_FILE.test(file)) {
            if (!methodAllowed(req, res)) return
            res.writeHead(404, { 'cache-control': 'no-store' })
            res.end('not found\n')
            return
          }
          const ext = file.slice(file.lastIndexOf('.')).toLowerCase()
          return serveFile(req, res, ASSET_DIR, file, TYPES[ext])
        },
      }),
    'jingwei: cover asset routes',
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: '/jingwei/artifact',
        handler: async (req, res) => {
          if (!methodAllowed(req, res)) return
          const tail = tailOf(req, '/jingwei/artifact/')
          if (!tail) return sendText(res, 404, 'not found\n')
          const slash = tail.indexOf('/')
          if (slash <= 0) return sendText(res, 404, 'not found\n')
          const runId = tail.slice(0, slash)
          const relative = tail.slice(slash + 1)
          if (!RUN_ID.test(runId) || !relative) return sendText(res, 404, 'not found\n')
          if (relative.includes('..') || relative.startsWith('/') || relative.includes('\\')) {
            return sendText(res, 404, 'not found\n')
          }
          let graph
          try {
            graph = await readGraph()
          } catch {
            return sendText(res, 404, 'not found\n')
          }
          if (graph.runId !== runId) return sendText(res, 404, 'not found\n')
          const base = resolve(ARTIFACT_DIR, runId)
          const absolute = resolve(base, relative)
          if (absolute !== base && !absolute.startsWith(base + sep)) return sendText(res, 404, 'not found\n')
          const ext = relative.slice(relative.lastIndexOf('.')).toLowerCase()
          return serveAbsolute(req, res, absolute, TYPES[ext])
        },
      }),
    'jingwei: artifact route',
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/jingwei/actions/rerun',
        handler: (req, res) => {
          if (req.method !== 'POST') {
            res.writeHead(405, { allow: 'POST', 'cache-control': 'no-store' })
            res.end()
            return
          }
          return handleRerun(ctx, req, res)
        },
      }),
    'jingwei: rerun action',
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/jingwei/actions/remove-node',
        handler: (req, res) => {
          if (req.method !== 'POST') {
            res.writeHead(405, { allow: 'POST', 'cache-control': 'no-store' })
            res.end()
            return
          }
          return handleRemoveNode(req, res)
        },
      }),
    'jingwei: remove node action',
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/jingwei/actions/save-view',
        handler: (req, res) => {
          if (req.method !== 'POST') {
            res.writeHead(405, { allow: 'POST', 'cache-control': 'no-store' })
            res.end()
            return
          }
          return handleSaveView(req, res)
        },
      }),
    'jingwei: save view action',
  )
}
