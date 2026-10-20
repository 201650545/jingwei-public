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
 *   POST /jingwei/actions/open-external       {runId,path} 用系统默认浏览器打开本轮产物
 *
 * 重跑：用宿主已有的 subagents 服务（spawn provider）在**当前 GUI 会话**下起一个
 * 子 Agent，只跑这一路；delivery=caller，结果不回灌主对话。耗时只认子会话日志里的
 * turn/start → turn/end（与 scripts/measure_subagent_run.mjs 同一口径）。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, resolve, sep, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { spawn } from 'node:child_process'
import zlib from 'node:zlib'
import { runTask, runPlan, runSubgraph, publishRun, archiveRun, withGraphLock } from './orchestrator-v4.js'
import { getModelData } from './modelpanel-data3.js'
import { registerProbe } from './probe.js'

export const name = 'jingwei'

/** 重跑依赖宿主已有的 Agent / 子 Agent 服务；缺了就不激活。 */
export const inject = ['webServer', 'agents', 'subagents']

// Set JINGWEI_HOME to the directory that holds app/data, app/assets and artifacts.
const ROOT = process.env.JINGWEI_HOME ?? '<JINGWEI_HOME>'
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
let runningTask = false

/**
 * 编排默认路由。
 *
 * 2026-10-20 变更：planner 主路由从 local-gateway/high 换成 buddy2api/workbuddy/deepseek-v4.1-flash。
 * 依据：01:45~01:53 那次 planner 失败的取证显示，local-gateway(:3100) 的**外网聚合渠道整层挂**
 *（openrouter 超时 / modelscope has no provider supported / SSL 证书失败），而 worker 走的
 * buddy2api(:8787，本地凭据网关) 没受影响。规划器放在最不稳定的路由上 = 一有外网波动就断链。
 * 兜底仍保留 local-gateway/high；两条线都失败时把 stopReason/diagnostic 落盘再报错。
 */
const ORCHESTRATOR = {
  planner: {
    provider: process.env.JINGWEI_PLANNER_PROVIDER ?? 'buddy2api',
    model: process.env.JINGWEI_PLANNER_MODEL ?? 'workbuddy/deepseek-v4.1-flash',
  },
  // 规划器兜底：主路由失败（上游 error / 空输出）时换一条线
  plannerFallback: {
    provider: process.env.JINGWEI_PLANNER_FALLBACK_PROVIDER ?? 'local-gateway',
    model: process.env.JINGWEI_PLANNER_FALLBACK_MODEL ?? 'high',
  },
  worker: {
    // 2026-10-20 同样从 local-gateway/high 换成 buddy2api 线。
    // 依据：10:31 那轮实测 9 个节点全部走 local-gateway/high，结果整链 502
    // （modelscope "Model id deepseek-ai/DeepSeek-V4.1-Flash has no provider supported"
    //   | xiaohongshu capability_mismatch tools）——外网聚合层又挂了。
    // worker 是「每轮必跑、失败即全链断」的角色，不能挂在会随外网波动整层挂的网关上。
    provider: process.env.JINGWEI_WORKER_PROVIDER ?? 'buddy2api',
    model: process.env.JINGWEI_WORKER_MODEL ?? 'workbuddy/deepseek-v4.1-flash',
  },
}

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
    // layoutVersion（2026-10-20 GPT-6 Sol 第 3 轮 §⑦）：
    //   记录**这批坐标是按哪一版版式算出来的**。
    //   缺版本标记的旧文件只判「版本未知」，不能武断认定是旧版式；
    //   客户端据此决定要不要提示"检测到节点布局重叠，可按新版式重排"。
    const layoutVersion = String(body?.layoutVersion || '').slice(0, 16)
    await writeFile(
      join(DATA_DIR, 'view.json'),
      JSON.stringify({ positions, layoutVersion }, null, 2) + '\n',
      'utf8'
    )
  } catch {
    return sendJson(res, 500, { error: 'write failed' })
  }
  sendJson(res, 200, { saved: Object.keys(positions).length })
}

/**
 * 用系统默认浏览器打开某轮的产物（2026-10-20 GPT-6 评审 P1：画布里看缩略，浏览器里看完整交互）。
 * 安全边界：只允许打开 `artifacts/<runId>/` 目录下的文件，runId 走白名单正则、路径做穿越校验。
 */
async function handleOpenExternal(req, res) {
  let body
  try {
    body = await readBody(req)
  } catch {
    return sendJson(res, 400, { error: 'bad body' })
  }
  const runId = String(body?.runId || '')
  const relPath = String(body?.path || '')
  if (!runId || !relPath) return sendJson(res, 400, { error: 'runId 与 path 必填' })
  if (!NODE_ID.test(runId)) return sendJson(res, 400, { error: 'runId 非法' })
  const root = resolve(ARTIFACT_DIR, runId)
  const target = resolve(root, relPath)
  if (target !== root && !target.startsWith(root + sep)) {
    return sendJson(res, 403, { error: '路径超出本轮产物目录' })
  }
  if (!existsSync(target)) return sendJson(res, 404, { error: '产物不存在' })
  try {
    // Windows：用系统默认程序打开（start 会把第一个引号后的内容当标题，故传空标题）
    spawn('cmd', ['/c', 'start', '', target], { detached: true, stdio: 'ignore' }).unref()
  } catch (error) {
    return sendJson(res, 500, { error: 'open failed: ' + (error?.message || error) })
  }
  sendJson(res, 200, { ok: true, path: relative(ROOT, target) })
}

async function handleDispatch(agents, subagents, req, res) {
  let body
  try {
    body = await readBody(req, 32 * 1024)
  } catch {
    return sendJson(res, 400, { error: 'bad body' })
  }
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!sessionId || !text) return sendJson(res, 400, { error: 'sessionId/text required' })
  if (text.length > 4000) return sendJson(res, 400, { error: 'text too long' })
  const parent = agents.get(sessionId)
  if (parent === undefined) return sendJson(res, 409, { error: 'session is not live' })
  if (runningTask) return sendJson(res, 409, { error: 'task already running' })

  runningTask = true
  sendJson(res, 202, { accepted: true })
  runTask({
    subagents,
    parent,
    text,
    style: String(body.style || ''),
    dataDir: DATA_DIR,
    artifactRoot: ARTIFACT_DIR,
    plannerDefaults: ORCHESTRATOR.planner,
    plannerFallbackDefaults: ORCHESTRATOR.plannerFallback,
    workerDefaults: ORCHESTRATOR.worker,
  })
    .catch(async (error) => {
      try {
        const graph = await readGraph()
        graph.error = String(error && error.message ? error.message : error)
        graph.updatedAt = new Date().toISOString()
        await writeGraph(graph)
      } catch {
        /* 写不进就算了 */
      }
    })
    .finally(() => {
      runningTask = false
    })
}


async function handleReview(req, res) {
  let body
  try { body = await readBody(req) } catch { return sendJson(res, 400, { error: 'bad body' }) }
  const nodeId = String(body.nodeId || '')
  const status = String(body.status || '')
  if (!NODE_ID.test(nodeId) || !['accepted', 'rejected', 'pending'].includes(status)) return sendJson(res, 400, { error: 'nodeId/status required' })
  // `review` 是**机器**判定（pass/fail/unknown，取核查产物首行）；
  // 人工评审另写 `humanReview`（accepted/rejected/pending）。两套语义不能挤在一个字段上。
  await withGraphLock(async () => {
    const graph = await readGraph()
    const node = graph.nodes.find((item) => item.id === nodeId)
    if (!node) return
    node.humanReview = status
    node.reviewNote = String(body.note || '')
    node.reviewedAt = new Date().toISOString()
    await writeGraph(graph)
  })
  sendJson(res, 200, { ok: true, nodeId, status })
}

async function handleRerunSubgraph(agents, subagents, req, res) {
  let body
  try { body = await readBody(req) } catch { return sendJson(res, 400, { error: 'bad body' }) }
  const sessionId = String(body.sessionId || '')
  const nodeId = String(body.nodeId || '')
  const parent = agents.get(sessionId)
  if (!parent) return sendJson(res, 409, { error: 'session is not live' })
  if (runningTask) return sendJson(res, 409, { error: 'task already running' })
  runningTask = true
  sendJson(res, 202, { accepted: true, nodeId })
  runSubgraph({ subagents, parent, dataDir: DATA_DIR, artifactRoot: ARTIFACT_DIR, nodeId, note: String(body.note || ''), workerDefaults: ORCHESTRATOR.worker })
    .catch(async (error) => {
      try { const graph = await readGraph(); graph.error = String(error && error.message ? error.message : error); await writeGraph(graph) } catch {}
    })
    .finally(() => { runningTask = false })
}

async function handlePublish(req, res) {
  let body
  try { body = await readBody(req) } catch { return sendJson(res, 400, { error: 'bad body' }) }
  const runId = String(body.runId || '')
  if (!RUN_ID.test(runId)) return sendJson(res, 400, { error: 'runId required' })
  try {
    const result = await publishRun({ dataDir: DATA_DIR, artifactRoot: ARTIFACT_DIR, publishRoot: join(ROOT, 'publish'), runId })
    sendJson(res, 200, result)
  } catch (error) {
    sendJson(res, 500, { error: String(error && error.message ? error.message : error) })
  }
}

async function handleArchive(req, res) {
  let body
  try { body = await readBody(req) } catch { return sendJson(res, 400, { error: 'bad body' }) }
  const runId = String(body.runId || '')
  if (!RUN_ID.test(runId)) return sendJson(res, 400, { error: 'runId required' })
  try {
    sendJson(res, 200, await archiveRun({ dataDir: DATA_DIR, runId }))
  } catch (error) {
    sendJson(res, 500, { error: String(error && error.message ? error.message : error) })
  }
}

/* ---------------- 插件入口 ---------------- */

export function apply(ctx) {
  const agents = ctx.get('agents')
  const subagents = ctx.get('subagents')
  registerProbe(ctx, agents, subagents)
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
        path: '/jingwei/models',
        handler: async (req, res) => {
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405, { allow: 'GET, HEAD', 'cache-control': 'no-store' })
            res.end()
            return
          }
          try {
            const body = JSON.stringify(await getModelData())
            res.writeHead(200, {
              'content-type': 'application/json; charset=utf-8',
              'content-length': Buffer.byteLength(body),
              'cache-control': 'no-store',
            })
            res.end(req.method === 'HEAD' ? undefined : body)
          } catch (error) {
            const body = JSON.stringify({ error: String(error && error.message ? error.message : error) })
            res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
            res.end(body)
          }
        },
      }),
    'jingwei: models panel data',
  )



  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: '/jingwei/actions/review', handler: (req, res) => req.method !== 'POST' ? (res.writeHead(405), res.end()) : handleReview(req, res) }),
    'jingwei: review action',
  )
  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: '/jingwei/actions/rerun-subgraph', handler: (req, res) => req.method !== 'POST' ? (res.writeHead(405), res.end()) : handleRerunSubgraph(agents, subagents, req, res) }),
    'jingwei: rerun subgraph action',
  )
  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: '/jingwei/actions/publish', handler: (req, res) => req.method !== 'POST' ? (res.writeHead(405), res.end()) : handlePublish(req, res) }),
    'jingwei: publish action',
  )
  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: '/jingwei/actions/archive', handler: (req, res) => req.method !== 'POST' ? (res.writeHead(405), res.end()) : handleArchive(req, res) }),
    'jingwei: archive action',
  )
  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: '/jingwei/actions/open-external', handler: (req, res) => req.method !== 'POST' ? (res.writeHead(405), res.end()) : handleOpenExternal(req, res) }),
    'jingwei: open external action',
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/jingwei/actions/run-plan',
        handler: async (req, res) => {
          if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST' }); res.end(); return }
          let body = {}
          try {
            const chunks = []
            for await (const chunk of req) chunks.push(chunk)
            body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
          } catch {
            return sendJson(res, 400, { error: 'bad body' })
          }
          const sessionId = String(body.sessionId || '')
          const parent = agents.get(sessionId)
          if (!parent) return sendJson(res, 409, { error: 'session is not live' })
          if (runningTask) return sendJson(res, 409, { error: 'task already running' })
          runningTask = true
          sendJson(res, 202, { accepted: true })
          runPlan({ subagents, parent, plan: body.plan, style: String(body.style || ''), dataDir: DATA_DIR, artifactRoot: ARTIFACT_DIR, workerDefaults: ORCHESTRATOR.worker })
            .catch(async (error) => {
              try { const graph = await readGraph(); graph.error = String(error && error.message ? error.message : error); await writeGraph(graph) } catch {}
            })
            .finally(() => { runningTask = false })
        },
      }),
    'jingwei: run-plan action',
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/jingwei/actions/dispatch',
        handler: (req, res) => {
          if (req.method !== 'POST') {
            res.writeHead(405, { allow: 'POST', 'cache-control': 'no-store' })
            res.end()
            return
          }
          return handleDispatch(agents, subagents, req, res)
        },
      }),
    'jingwei: dispatch action',
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


