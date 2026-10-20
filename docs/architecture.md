# 02 · 架构与数据流

> 最后更新：2026-10-19 22:10 ｜ 代码真源：`plugin/jingwei/`

## 全链路

```
用户需求
  │
  ├─ 主 AI（对话里，不在插件里）
  │    同一轮发两个 subagent
  │      copy   → buddy2api/workbuddy/step-5-preview     → artifacts/<runId>/copy/note.json
  │      design → buddy2api/workbuddy-intl/hy4-preview   → artifacts/<runId>/design/note.html
  │
  ├─ 脚本（数字与产物，全回算）
  │    measure_subagent_run.mjs   只认 turn/start→turn/end
  │    accept2.mjs / tool_stats.mjs
  │    render_note.mjs / visual_check.mjs
  │    build_manifest.mjs <runId> --index
  │
  ├─ 文件
  │    artifacts/<runId>/run.json          本轮元数据
  │    app/data/run-<runId>.json          界面 manifest
  │    app/data/index.json                latest 指针
  │
  └─ 插件
       Host 半边  index.js   webServer 路由 /jingwei/**
       Client 半边 client.js 右栏 tab「经纬」= 黑白无限画布
           fetch jingwei/data/index.json → run-<latest>.json → 画节点与连线
```

## 插件两个半边

### Host（`plugin/jingwei/index.js`）

只做数据出口，不碰 UI：

| 路由 | 文件 |
|---|---|
| `GET /jingwei/data/index.json` | `app/data/index.json` |
| `GET /jingwei/data/run-<id>.json` | `app/data/run-<id>.json` |
| `GET /jingwei/assets/<file>` | `app/assets/<file>` |

- 根目录默认 `<JINGWEI_HOME>`，可用 `JINGWEI_HOME` 覆盖
- 文件名白名单 + 固定目录，不做路径拼接，路径穿越一律 404
- 同源、只监听本机回环；不走 8900，也不需要额外进程

### Client（`plugin/jingwei/client.js`）

- 两段式注册：`ctx.sidebarRightTabs.register({ id:'local.jingwei', kind:'jingwei', ... })`
  + `ctx.slots.register({ name:'sidebar.right.pane.tab', key:'local.jingwei' }, Body)`
- Shadow DOM 隔离，React 只挂宿主 div，内部是命令式画布
- 启动即用内嵌兜底数据画出 3 个节点，manifest 到达后静默替换
- `R` 重新读数据；请求带序号，防止旧响应覆盖新数据

## manifest 契约

`app/data/index.json`
```json
{ "latest": "<runId>", "runs": ["<runId>", "<旧runId>"] }
```

`app/data/run-<runId>.json`（画布只读其中一部分）
```json
{
  "runId": "20261019-212601-a41f",
  "at": "2026-10-19 21:26",
  "wallMs": 222646,
  "loadRatio": 1.32,
  "startDeltaMs": 22,
  "branches": {
    "copy":   { "label": "文案", "model": "workbuddy/step-5-preview",
                "provider": "buddy2api", "zeroRate": true,
                "elapsedMs": 169270, "steps": 3, "stepList": [ … ], "note": "…" },
    "design": { … }
  },
  "copy": { "title": "…", "chars": 370, "tags": 6, "quiz": 3, "body": "…", "tagList": [ … ] },
  "acceptance": [ { "name": "标题 ≤ 20 字", "pass": true, "v": "18 字" }, … ],
  "assets": { "fixed": "assets/cover_<runId>.png" },
  "meta": { "copySubagentId": "…", "toolStats": { … }, "measureCommand": "…" }
}
```

> v0.2 起画布改为读 `graph.json`（见下节「画布 graph 与动作」）；manifest 仍保留作可复核的验收快照，字段不再被画布直接依赖。

## 真源与派生

| 层 | 位置 | 能否重建 |
|---|---|---|
| 会话日志 | `~/.dsh/sessions/**` | 否（真源） |
| 产物 | `artifacts/<runId>/` | 否（真源） |
| manifest | `app/data/run-<runId>.json` | ✅ 可由 `build_manifest.mjs` 从上面两层重建 |
| index 指针 | `app/data/index.json` | ✅ `--index` 重写 |
| 画布 | 内存 | ✅ 每次挂载重建 |

**改数字一律改脚本重算，不手改 manifest。**

## 画布 graph 与动作（v0.2）

画布不再直接读 manifest，读 `app/data/graph.json`（由 `build_manifest.mjs` 同时生成；重跑时由 Host 写回）：

```json
{
  "version": 1,
  "runId": "20261019-212601-a41f",
  "nodes": [
    {"id":"copy","kind":"branch","title":"文案","provider":"buddy2api","model":"workbuddy/step-5-preview",
     "status":"done","elapsedMs":169270,"artifact":"copy/note.json","artifactType":"json"},
    {"id":"design","kind":"branch", "...": "..."},
    {"id":"merge","kind":"merge","title":"汇总","status":"done","elapsedMs":222646}
  ],
  "edges": [["copy","merge"],["design","merge"]]
}
```

节点位置单独存 `app/data/view.json`：`{"positions":{"copy":{"x":0,"y":0}}}`。客户端只写这一份。

动作路由（POST，JSON）：

| 路由 | 作用 |
|---|---|
| `/jingwei/actions/rerun` | `{sessionId,nodeId}`：把节点置 running → 用当前会话起一个 spawn 子 Agent → 等 `turn/end` → 写回状态/耗时 |
| `/jingwei/actions/remove-node` | `{nodeId}`：从 graph 删分支节点与相关边（不允许删最后一路） |
| `/jingwei/actions/save-view` | `{positions}`：保存节点位置 |

产物路由：`GET /jingwei/artifact/<runId>/<path>`，只服务 graph.runId 那一轮、只允许目录内路径。

**真源分层**：会话日志 + `artifacts/` 是真源 → `graph.json`/manifest 是派生 → 画布是视图。节点位置不是语义，单独放 `view.json`。

## 安装与更新


- 安装：`plugin_manager install_bundle`，target = `plugin/jingwei` 目录
- profile 里是 **symlink**：`~/.dsh/profiles/desktop/node_modules/@local/jingwei → <JINGWEI_HOME>\plugin\jingwei`
- 改 `client.js` → **刷新页面**加载新 bundle
- 改 `index.js` → `plugin_manager set_plugin include:jingwei enabled=false` 再 `true`（或重启 DSH）
- 首次安装会热生效，不需要重启；`pnpm run dev:web` 不在跑时，客户端改动不会自动热替换
