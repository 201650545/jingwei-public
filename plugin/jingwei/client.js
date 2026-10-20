
window.__ModuleLoader__.load({
  id: '@local/jingwei',
  factory(require) {
    'use strict';

    const React = require('react');
    const SVG = 'http://www.w3.org/2000/svg';
    // v3.2 世界坐标（docs/03-画布规范.md §尺寸与间距 ＋ GPT-6 Sol《设计说明》§1.1 纵向主轴）
    //   节点自身尺寸由 CSS 定义、布局侧取 DOM 实测；这里只放**结构常量**。
    const MW = 176;        // merge 节点宽（CSS 模板里要用）
    const AXIS = 240;      // 纵向主轴 x（节点**中心**）
    const SUB = 252;       // 双列中心距（列间净间距 = 252 − 216 = 36）
    const ROW_GAP = 72;    // 上下层净间距
    const CORRIDOR = 18;   // 中央走线区半宽（两列之间 x = AXIS ± 18）
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
/* v3.2：**绿色不沿连线传播**。连线只回答"这条依赖走完了没有"，
   用亮度区分（.28 未走 → .62 已完成），不用色相——色相留给执行完成那根短线。 */
.wire.done path{stroke:rgba(255,255,255,.62)}
.wire.done circle{fill:rgba(255,255,255,.7)}
.wire.running path {
  stroke:rgba(255,255,255,.57);stroke-dasharray:3 6;
  animation:flow 2.8s linear infinite;
}
.wire.running.active path{stroke:#fff}
.nodes{position:absolute;left:0;top:0}
/* ───────────────────────────────────────────────────────────────
   v3.2 节点版式（依据 GPT-6 Sol 评审《docs/03-画布规范.md》v3.2）

   三层信息：
     ① 做什么     顶部角色标签（10px 等宽弱白）+ 标题（15~16px/600，最多两行）
     ② 执行到哪   状态行：12×2px 短线 + 状态文字 + 耗时
     ③ 结果与来源 分隔线（1px / 约 12% 白）以下：结论签 + 模型名/产物格式（最弱）

   颜色纪律：**绿色只属于 status==='done'**，且只出现在 .node-mark 这一条短线上。
   不染整卡、不绿边、不绿阴影、不沿连线传播。
   执行完成 / 核查通过 / 可交付 / 人工已验收 是四条独立的轴，
   核查未过 / 人工退回 / 交付受阻 用**白底黑字反相签**表达，不用红。
   ─────────────────────────────────────────────────────────────── */
.node {
  position:absolute;width:216px;min-height:124px;
  display:flex;flex-direction:column;
  padding:15px 18px;
  background:#000;border:1px solid rgba(255,255,255,.26);
  border-radius:2px;cursor:grab;
  transition:border-color .12s ease,outline-color .12s ease;
}
.node:hover{border-color:rgba(255,255,255,.62)}
.node.selected {
  border-color:#fff;outline:1px solid rgba(255,255,255,.65);
  outline-offset:3px;
}
.node.dragging{cursor:grabbing;border-color:#fff}
.node.running{border-style:dashed;border-color:rgba(255,255,255,.66)}
.node.running.selected{outline-color:#fff}
.node.failed{border-color:rgba(255,255,255,.22)}
.node.failed.selected{border-color:#fff}

/* ① 做什么 —— 角色标签：10px 等宽弱白 */
.node-role{
  flex:none;margin-bottom:7px;color:rgba(255,255,255,.4);
  font:10px/1.2 ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;
  letter-spacing:.14em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
/* ① 做什么 —— 标题：最多两行 */
.node-title{
  flex:none;min-width:0;color:#fff;
  font-size:15px;font-weight:600;line-height:1.42;letter-spacing:.025em;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
  overflow:hidden;overflow-wrap:break-word;
}
/* ② 执行到哪 —— 状态行：短线 + 状态文字 + 耗时 */
.node-status{
  flex:none;display:flex;align-items:center;gap:8px;margin-top:11px;
  min-height:13px;color:rgba(255,255,255,.58);
  font:10.5px/1.3 ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;
  letter-spacing:.02em;white-space:nowrap;
}
/* 12×2px 短线：**只有 status==='done' 才变绿**，其余状态是中性灰白 */
.node-mark{
  flex:none;width:12px;height:2px;border-radius:1px;
  background:rgba(255,255,255,.22);transition:background .12s ease;
}
.node.done .node-mark{background:rgb(80,255,150)}
/* 「执行完成」四个字也可以用同一支绿 —— 它和短线说的是同一件事 */
.node.done .node-status-text{color:rgb(80,255,150)}
.node.running .node-mark{background:rgba(255,255,255,.62)}
.node.failed .node-mark{background:rgba(255,255,255,.44)}
.node-status-text{flex:none}
.node-time{
  flex:none;margin-left:auto;color:rgba(255,255,255,.42);
  font:10px/1.35 ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;
  font-variant-numeric:tabular-nums;letter-spacing:-.02em;
}
/* ③ 结果与来源 —— 分隔线：约 12% 白 */
.node-sep{flex:none;height:1px;margin:11px 0 9px;background:rgba(255,255,255,.12)}
/* ③ 结论：反相签（白底黑字）= 核查未过 / 人工退回 / 交付受阻 */
.node-verdicts{flex:none;display:flex;flex-wrap:wrap;gap:5px;margin-bottom:9px}
.node-verdicts:empty{display:none}
.node-verdict{
  display:inline-block;padding:1px 7px;border-radius:1px;
  font:10px/1.9 ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;
  letter-spacing:.08em;white-space:nowrap;
}
.node-verdict.invert{background:#fff;color:#000}
.node-verdict.plain{
  background:transparent;color:rgba(255,255,255,.66);
  border:1px solid rgba(255,255,255,.22);
}
.node-verdict.weak{background:transparent;color:rgba(255,255,255,.36)}
/* ③ 来源：模型名 · 产物格式（10px、约 42% 白 —— 最弱一级） */
.node-meta{
  flex:none;min-width:0;margin-top:auto;margin-right:28px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  color:rgba(255,255,255,.42);
  font:10px/1.5 ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;
  letter-spacing:.03em;
}

/* ── 端点造型：靠**形状与位置**区分，不靠色相 ──────────────────
   intake = 一张委托卡（整张图的开端，不是另一个生产 Agent） */
.node.intake{
  width:228px;min-height:142px;
  border-left:3px solid rgba(255,255,255,.72);
}
.node.intake .node-title{font-size:16px}
.node.intake .node-sep{display:none}
.node.intake .node-meta{display:none}
.node.intake .node-verdicts{margin-bottom:0}

/* output = 一张最终作品的封签（画面的终点，**不是成功奖章**） */
.node.output{width:240px;min-height:152px;border-color:rgba(255,255,255,.3)}
.node.output .node-title{font-size:16px}
/* 双层细框的**局部**处理：内侧顶部一条短水平线，形成收束结构 */
.node-cap{
  flex:none;width:44px;height:1px;margin-bottom:11px;
  background:rgba(255,255,255,.28);
}

/* merge = 收口节点 */
.node.merge{
  width:${MW}px;min-height:92px;padding:14px 15px 12px;
  border-color:rgba(255,255,255,.24);
}
.node.merge .node-title{font-size:13.5px}

/* audit = 终审节点 */
.node.audit{width:200px;min-height:120px}

/* verify = 核查芯片：结论优先，压扁成一张薄片 */
.node.verify{
  width:200px;min-height:56px;padding:8px 10px;
  background:rgba(0,0,0,.96);border-style:solid;
}
.node.verify .node-role{margin-bottom:3px;font-size:9.5px}
.node.verify .node-title{font-size:11.5px;-webkit-line-clamp:1}
.node.verify .node-status{margin-top:7px;font-size:10px}
.node.verify .node-sep{display:none}
.node.verify .node-meta{display:none}
.node.verify .node-verdicts{margin:7px 0 0}

.more {
  position:absolute;right:7px;bottom:6px;
  display:grid;place-items:center;width:29px;height:28px;
  padding:0;border:0;border-radius:2px;
  background:rgba(255,255,255,0);color:rgba(255,255,255,.52);
  font:19px/1 ui-monospace,Consolas,monospace;
  opacity:.65;cursor:pointer;
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
/* 产物路径 · 类型：最弱一级，但让人一眼知道在看哪个文件 */
.preview-path {
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  color:rgba(255,255,255,.3);
  font:10px/1.4 ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;
  letter-spacing:.02em;
}
.preview-close {
  flex:none;width:31px;height:31px;border:1px solid rgba(255,255,255,.3);
  border-radius:2px;background:#000;color:rgba(255,255,255,.7);
  font:20px/1 ui-monospace,Consolas,monospace;cursor:pointer;
  transition:border-color .16s ease,color .16s ease;
}
.preview-actions{flex:none;display:flex;align-items:center;gap:9px}
.preview-open {
  height:31px;padding:0 13px;border:1px solid rgba(255,255,255,.3);
  border-radius:2px;background:#000;color:rgba(255,255,255,.72);
  font:11.5px/1 ui-monospace,Consolas,monospace;letter-spacing:.05em;cursor:pointer;
  transition:border-color .16s ease,color .16s ease;
}
.preview-open:hover,.preview-open:focus-visible {
  border-color:#fff;color:#fff;outline:none;
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
.preview-content .md {
  width:100%;max-width:760px;margin:0 auto;padding:0 2px 40px;
  color:rgba(255,255,255,.86);
  font:13px/1.9 "PingFang SC","Noto Sans SC",system-ui,sans-serif;
  user-select:text;-webkit-user-select:text;
}
.preview-content .md h1{font-size:19px;line-height:1.5;margin:0 0 14px;font-weight:600;letter-spacing:.02em}
.preview-content .md h2{font-size:16px;line-height:1.5;margin:26px 0 10px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,.16);font-weight:600}
.preview-content .md h3{font-size:14px;margin:20px 0 8px;font-weight:600}
.preview-content .md p{margin:0 0 10px;color:rgba(255,255,255,.78)}
.preview-content .md ul{margin:0 0 12px;padding-left:18px}
.preview-content .md li{margin:0 0 5px;color:rgba(255,255,255,.78)}
.preview-content .md blockquote{margin:0 0 12px;padding:8px 12px;border-left:2px solid rgba(255,255,255,.3);color:rgba(255,255,255,.55);background:rgba(255,255,255,.04)}
.preview-content .md hr{border:0;border-top:1px solid rgba(255,255,255,.16);margin:18px 0}
.preview-content .md strong{color:#fff;font-weight:600}
.preview-content .md code{padding:1px 5px;background:rgba(255,255,255,.1);border-radius:2px;font:11.5px/1.6 ui-monospace,Consolas,monospace}
.preview-content .md a{color:#fff;text-decoration:underline;text-underline-offset:2px}
.preview-content img{display:block;max-width:92%;max-height:92%;object-fit:contain}
.preview-content iframe {
  width:100%;height:100%;min-height:100px;border:1px solid rgba(255,255,255,.24);
  background:#fff;
}
/* v3.2 动效极简（《设计说明》§4）：
   只保留连线上的虚线流动（flow）、菜单/预览渐入（appear）。
   原 breathe（整卡呼吸）与 fade（文字闪烁）已删——GPT 要求「不要整张卡片呼吸，也不要让文字闪烁」。 */
@keyframes flow{to{stroke-dashoffset:-18}}
@keyframes appear {
  from{opacity:0;transform:translateY(4px)}
  to{opacity:1;transform:translateY(0)}
}
.dock {
  position:absolute;left:12px;right:12px;bottom:12px;z-index:15;
  display:flex;align-items:center;gap:8px;
  padding:7px 9px;background:rgba(0,0,0,.9);
  border:1px solid rgba(255,255,255,.3);border-radius:2px;
  backdrop-filter:blur(4px);
}
.dock input {
  flex:1;min-width:0;height:26px;border:0;background:transparent;
  color:#fff;font:12px/1.4 "PingFang SC","Noto Sans SC",system-ui,sans-serif;
  outline:none;
}
.dock input::placeholder{color:rgba(255,255,255,.32)}
.dock button {
  flex:none;width:28px;height:26px;border:0;background:transparent;
  color:rgba(255,255,255,.62);font:16px/1 ui-monospace,Consolas,monospace;
  cursor:pointer;border-radius:2px;
}
.dock button:hover{color:#fff;background:rgba(255,255,255,.1)}
.hint {
  position:absolute;left:14px;bottom:56px;z-index:14;
  color:rgba(255,255,255,.26);
  font:10px/1.4 ui-monospace,"SFMono-Regular",Consolas,monospace;
  letter-spacing:.02em;pointer-events:none;
}
/* 「重排版面」常驻入口：冲突提示只在**真的重叠**时出现（GPT §七 2），
   但旧版式留下的坐标即使不重叠也可能看着别扭 —— 所以再给一个随时能按的入口。 */
.hint .relayout {
  margin-left:10px;padding:0;border:0;background:transparent;
  color:rgba(255,255,255,.4);cursor:pointer;pointer-events:auto;
  font:inherit;letter-spacing:inherit;
  border-bottom:1px solid rgba(255,255,255,.22);
}
.hint .relayout:hover{color:#fff;border-bottom-color:#fff}
/* 布局冲突提示（GPT-6 Sol 第 3 轮 §⑦）：
   非阻断式的一次性提示 —— **默认保留用户已保存的坐标**，
   只在真的检测到节点矩形重叠时出现，并给出「按新版式重排」入口。 */
.jw-conflict {
  position:absolute;left:12px;right:12px;bottom:52px;z-index:16;
  display:none;align-items:center;gap:10px;
  padding:9px 11px;background:rgba(0,0,0,.94);
  border:1px solid rgba(255,255,255,.34);border-radius:2px;
  box-shadow:0 6px 22px rgba(0,0,0,.5);
}
.jw-conflict.on{display:flex}
.jw-conflict p{
  flex:1;min-width:0;margin:0;
  color:rgba(255,255,255,.72);font-size:11px;line-height:1.55;
}
.jw-conflict p b{
  display:block;margin-bottom:2px;color:#fff;
  font-size:12px;font-weight:600;
}
.jw-conflict button {
  flex:none;padding:5px 10px;border:1px solid rgba(255,255,255,.3);
  border-radius:2px;background:#000;color:rgba(255,255,255,.78);
  font:11px/1.4 "PingFang SC","Noto Sans SC",system-ui,sans-serif;
  cursor:pointer;transition:border-color .15s ease,color .15s ease,background .15s ease;
}
.jw-conflict button:hover{border-color:#fff;color:#fff}
.jw-conflict button.primary{background:#fff;color:#000;border-color:#fff}
.jw-conflict button.primary:hover{background:rgba(255,255,255,.88);color:#000}
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
  <div class="hint">拖动节点 · 拖空白平移 · 滚轮缩放 · F 适应<button type="button" class="relayout">重排版面</button></div>
  <div class="jw-conflict" role="status" aria-live="polite">
    <p><b>检测到节点布局重叠</b>已保留原有位置。可以按新版式重新排列，或继续使用当前布局。</p>
    <button type="button" class="keep">保留当前布局</button>
    <button type="button" class="redo primary">按新版式重排</button>
  </div>
  <div class="dock">
    <input class="task" type="text" placeholder="描述你要做的事…" aria-label="描述任务" />
    <button class="send" type="button" aria-label="发送任务">→</button>
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
          error: typeof n.error === 'string' ? n.error : undefined,
          role: typeof n.role === 'string' ? n.role : '',
          // ⚠️ 这两个字段**必须透传**（2026-10-20 修）：
          //    review = 核查结论（pass/fail/unknown/pending），humanReview = 人工验收（accepted/rejected/pending）。
          //    之前它们没被 normalize 保留 ⇒ 画布上「核查未通过」的表达从来没生效过。
          review: typeof n.review === 'string' ? n.review : 'pending',
          humanReview: typeof n.humanReview === 'string' ? n.humanReview : 'pending',
          deps: Array.isArray(n.deps) ? n.deps.map(String) : [],
          x: Number.isFinite(Number(n.x)) ? Number(n.x) : undefined,
          y: Number.isFinite(Number(n.y)) ? Number(n.y) : undefined
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
        edges,
        // ⚠️ delivery 是**运行级**的交付判定（ready/blocked/failed），
        //    之前没被保留 ⇒ 画布上拿不到"这一轮能不能交付"。
        delivery: (src.delivery && typeof src.delivery === 'object') ? {
          status: String(src.delivery.status || ''),
          reason: String(src.delivery.reason || ''),
          failedNodes: Array.isArray(src.delivery.failedNodes) ? src.delivery.failedNodes.map(String) : [],
          failedReviews: Array.isArray(src.delivery.failedReviews) ? src.delivery.failedReviews.map(String) : [],
        } : null,
      };
    }

    
    function createModelDock(shadow) {
      const style = document.createElement('style');
      style.textContent = `
.mp-fab{position:absolute;left:12px;top:12px;z-index:26;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:rgba(0,0,0,.92);border:1px solid rgba(255,255,255,.34);color:#fff;font:12px/1 ui-monospace,Consolas,monospace;cursor:pointer;user-select:none;transition:border-color .16s ease,background .16s ease}
.mp-fab:hover{border-color:#fff;background:#000}
.mp-fab-count{position:absolute;right:-5px;top:-5px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:#000;border:1px solid rgba(255,255,255,.5);color:#fff;font:9px/15px ui-monospace,Consolas,monospace;text-align:center}
.mp-dock{position:absolute;left:12px;top:12px;z-index:26;width:292px;max-height:calc(100% - 108px);display:flex;flex-direction:column;background:rgba(6,6,6,.96);border:1px solid rgba(255,255,255,.3);border-radius:3px;color:#fff;font-family:"PingFang SC","Noto Sans SC",system-ui,sans-serif;backdrop-filter:blur(8px);box-shadow:0 18px 48px rgba(0,0,0,.45)}
.mp-dock-head{flex:none;display:flex;align-items:center;gap:8px;padding:10px 11px 8px;border-bottom:1px solid rgba(255,255,255,.14)}
.mp-dock-title{flex:1;font-size:12.5px;font-weight:600;letter-spacing:.03em}
.mp-dock-sub{font:9.5px/1.4 ui-monospace,Consolas,monospace;color:rgba(255,255,255,.42)}
.mp-dock-close{flex:none;width:24px;height:24px;border:1px solid rgba(255,255,255,.26);border-radius:2px;background:transparent;color:rgba(255,255,255,.7);font:15px/1 ui-monospace,Consolas,monospace;cursor:pointer}
.mp-dock-close:hover{border-color:#fff;color:#fff}
.mp-dock-sum{flex:none;padding:8px 11px;border-bottom:1px solid rgba(255,255,255,.1);display:flex;flex-direction:column;gap:4px}
.mp-dock-row{display:flex;justify-content:space-between;gap:8px;font:10px/1.5 ui-monospace,Consolas,monospace;color:rgba(255,255,255,.55)}
.mp-dock-row b{color:rgba(255,255,255,.9);font-weight:500}
.mp-dock-list{flex:1;overflow:auto;padding:5px 0 8px;scrollbar-width:thin}
.mp-dock-model{border-bottom:1px solid rgba(255,255,255,.06)}
.mp-dock-name{display:flex;align-items:center;gap:7px;padding:7px 11px;cursor:pointer;font:11px/1.4 ui-monospace,Consolas,monospace}
.mp-dock-name:hover{background:rgba(255,255,255,.05)}
.mp-dock-name span:first-child{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mp-dock-badge{flex:none;font:9px/1 ui-monospace,Consolas,monospace;color:rgba(255,255,255,.45);border:1px solid rgba(255,255,255,.16);border-radius:2px;padding:2px 4px}
.mp-dock-prov{padding:1px 11px 7px 22px;display:flex;flex-direction:column;gap:3px}
.mp-dock-prov div{border-left:1px solid rgba(255,255,255,.16);padding-left:8px}
.mp-dock-prov .n{font-size:10.5px;color:rgba(255,255,255,.82)}
.mp-dock-prov .m{font:9px/1.5 ui-monospace,Consolas,monospace;color:rgba(255,255,255,.4)}
.mp-dock-empty{padding:14px 11px;font:10.5px/1.6 ui-monospace,Consolas,monospace;color:rgba(255,255,255,.4)}
.mp-dock-off{font:9px/1 ui-monospace,Consolas,monospace;color:rgba(255,255,255,.55);border:1px solid rgba(255,255,255,.32);border-radius:2px;padding:2px 4px;font-style:normal;margin-left:6px}
.mp-dock-note{padding:0 11px 7px 11px;font:9.5px/1.5 ui-monospace,Consolas,monospace;color:rgba(255,255,255,.5)}
.mp-dock-prov .off .n{color:rgba(255,255,255,.42);text-decoration:line-through}
`;
      shadow.appendChild(style);

      const fab = document.createElement('button');
      fab.type = 'button';
      fab.className = 'mp-fab';
      fab.title = '可用模型';
      fab.innerHTML = '<span>M</span><span class="mp-fab-count"></span>';
      shadow.appendChild(fab);

      let data = null;
      let open = '';
      let expanded = false;

      const load = async () => {
        try {
          const res = await fetch('jingwei/models', { cache: 'no-store' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          data = await res.json();
          render();
        } catch (error) {
          if (!expanded) return;
          data = { error: String(error && error.message ? error.message : error) };
          render();
        }
      };

      const metaOf = (provider) => {
        const parts = [];
        if (provider.channelName) parts.push(provider.channelName);
        if (provider.speed) parts.push('速度 ' + provider.speed);
        if (provider.balance) parts.push(provider.balance);
        else if (provider.billing) parts.push(provider.billing);
        if (provider.contextWindow) parts.push('上下 ' + Math.round(provider.contextWindow / 1000) + 'K');
        return parts.join(' · ');
      };

      const render = () => {
        fab.querySelector('.mp-fab-count').textContent = data && Array.isArray(data.models) ? String(data.models.length) : '';
        const old = shadow.querySelector('.mp-dock');
        if (old) old.remove();
        if (!expanded) return;

        const dock = document.createElement('div');
        dock.className = 'mp-dock';
        const models = data && Array.isArray(data.models) ? data.models : [];
        const accounts = data && data.buddy && Array.isArray(data.buddy.accountsSummary) ? data.buddy.accountsSummary : [];
        const credit = accounts.reduce((sum, row) => sum + (Number.isFinite(row.credit) ? row.credit : 0), 0);
        const active = accounts.reduce((sum, row) => sum + (row.active || 0), 0);
        const high = data && data.gateway && data.gateway.high ? data.gateway.high.length : 0;

        const head = document.createElement('div');
        head.className = 'mp-dock-head';
        head.innerHTML = '<div class="mp-dock-title">可用模型</div><div class="mp-dock-sub">' + models.length + ' 个</div>';
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'mp-dock-close';
        close.textContent = '×';
        close.title = '收起';
        close.addEventListener('click', (event) => { event.stopPropagation(); expanded = false; render(); });
        head.appendChild(close);
        dock.appendChild(head);

        const sum = document.createElement('div');
        sum.className = 'mp-dock-sum';
        sum.innerHTML = '<div class="mp-dock-row"><span>BUDDY 账号</span><b>' + active + ' 活跃 · 余额 ' + credit.toFixed(2) + '</b></div>' +
          '<div class="mp-dock-row"><span>嗨模型 high</span><b>' + high + ' 个渠道</b></div>';
        dock.appendChild(sum);
        if (data && data.notice) {
          const notice = document.createElement('div');
          notice.className = 'mp-dock-note';
          notice.textContent = data.notice;
          dock.appendChild(notice);
        }

        const list = document.createElement('div');
        list.className = 'mp-dock-list';
        if (data && data.error) {
          list.innerHTML = '<div class="mp-dock-empty">读取失败：' + data.error + '</div>';
        } else if (!models.length) {
          list.innerHTML = '<div class="mp-dock-empty">' + (data ? '没有可用模型' : '读取中…') + '</div>';
        } else {
          for (const model of models) {
            const row = document.createElement('div');
            row.className = 'mp-dock-model';
            const name = document.createElement('div');
            name.className = 'mp-dock-name';
            name.innerHTML = '<span>' + model.name + (model.available === false ? ' <em class="mp-dock-off">不可用</em>' : '') + '</span><span class="mp-dock-badge">' + (model.providers ? model.providers.length : 0) + ' 渠道</span>';
            name.addEventListener('click', (event) => {
              event.stopPropagation();
              open = open === model.name ? '' : model.name;
              render();
            });
            row.appendChild(name);
            if (model.available === false && model.note) {
              const note = document.createElement('div');
              note.className = 'mp-dock-note';
              note.textContent = model.note;
              row.appendChild(note);
            }
            if (open === model.name) {
              const prov = document.createElement('div');
              prov.className = 'mp-dock-prov';
              for (const p of model.providers || []) {
                const item = document.createElement('div');
                if (p.available === false) item.className = 'off';
                item.innerHTML = '<div class="n">' + (p.channelName || p.channel || p.source) + '</div><div class="m">' + (metaOf(p) || p.source) + (p.note ? ' · ' + p.note : '') + '</div>';
                prov.appendChild(item);
              }
              row.appendChild(prov);
            }
            list.appendChild(row);
          }
        }
        dock.appendChild(list);

        const stop = (event) => event.stopPropagation();
        dock.addEventListener('pointerdown', stop);
        dock.addEventListener('click', stop);
        shadow.appendChild(dock);
      };

      fab.addEventListener('click', (event) => {
        event.stopPropagation();
        expanded = !expanded;
        if (expanded && !data) load();
        render();
      });
      fab.addEventListener('pointerdown', (event) => event.stopPropagation());

      load();
      const timer = setInterval(load, 60000);
      return () => { clearInterval(timer); fab.remove(); const d = shadow.querySelector('.mp-dock'); if (d) d.remove(); };
    }

function createCanvas(host, shadow, sessionId) {
      // ⚠️ 声明必须**在第一次使用之前**（TDZ）：
      //    下面第 N 行就要用 conflictBar 去取 DOM 元素，
      //    声明放到函数中段会抛 "Cannot access 'conflictBar' before initialization"，
      //    整个画布挂不上（2026-10-20 实机踩到，右栏一片黑）。
      let conflictBar = null;
      let relayoutSnapshot = null;
      let nodeObserver = null;
      // LAYOUT_VERSION：当前版式的版本号，写进 view.json。
      // viewLayoutVersion：view.json 里记录的那批坐标是**哪一版**算出来的；
      //   缺失只判「版本未知」，**不武断认定是旧版式**（GPT §⑦ 硬要求）。
      const LAYOUT_VERSION = '3.2';
      let viewLayoutVersion = '';

      const stage = shadow.querySelector('.stage');
      const dockInput = shadow.querySelector('.dock .task');
      const dockSend = shadow.querySelector('.dock .send');
      const hint = shadow.querySelector('.hint');
      conflictBar = shadow.querySelector('.jw-conflict');
      createModelDock(shadow);
      const submitTask = async () => {
        const text = (dockInput.value || '').trim();
        if (!text) return;
        dockInput.value = '';
        hint.textContent = '规划中…';
        try {
          const res = await fetch('jingwei/actions/dispatch', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: sessionId || '', text: text })
          });
          if (res.status === 202) {
            hint.textContent = '已下任务，等规划…';
            autoFit = true;
          } else if (res.status === 409) {
            hint.textContent = '已有任务在跑';
          } else {
            hint.textContent = '下任务失败';
          }
        } catch (e) {
          hint.textContent = '下任务失败';
        }
      };
      dockInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); submitTask(); }
      });
      dockSend.addEventListener('click', e => { e.preventDefault(); submitTask(); });

      // 布局冲突提示条（GPT-6 Sol 第 3 轮 §⑦）：默认保留已保存坐标，
      // 只在真检测到重叠时出现，并提供「按新版式重排」入口（重排后还能撤销）。
      const showUndoBar = () => {
        if (!conflictBar) return;
        conflictBar.querySelector('p').innerHTML = '<b>已按新版式重排</b>新坐标已保存。';
        conflictBar.querySelector('.keep').textContent = '撤销';
        conflictBar.querySelector('.redo').style.display = 'none';
        conflictBar.classList.add('on');
        setTimeout(() => { if (!destroyed) conflictBar.classList.remove('on'); }, 6000);
      };

      const doRelayout = () => {
        relayoutAll();
        showUndoBar();
      };

      if (conflictBar) {
        conflictBar.querySelector('.keep').addEventListener('click', () => {
          if (relayoutSnapshot) {
            undoRelayout();
            conflictBar.querySelector('p').innerHTML = '<b>已恢复原布局</b>';
            conflictBar.querySelector('.keep').textContent = '保留当前布局';
            conflictBar.querySelector('.redo').style.display = '';
            setTimeout(() => { if (!destroyed) conflictBar.classList.remove('on'); }, 4000);
            return;
          }
          const ids = detectConflicts();
          rememberDismissed(
            (viewLayoutVersion || 'unknown') + '|' + ids.slice().sort().join(',')
          );
          conflictBar.classList.remove('on');
        });

        conflictBar.querySelector('.redo').addEventListener('click', doRelayout);
      }

      // 底部常驻的「重排版面」：旧版式留下的坐标即使不重叠也可能看着别扭，
      // 所以除了冲突提示，再给一个随时能按的入口（按完还能撤销）。
      const relayoutBtn = shadow.querySelector('.hint .relayout');
      if (relayoutBtn) {
        relayoutBtn.addEventListener('click', e => {
          e.stopPropagation();
          doRelayout();
        });
      }
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

      // ── 布局版本与冲突迁移（GPT-6 Sol 第 3 轮 §⑦）────────────
      //   LAYOUT_VERSION / viewLayoutVersion 已提到函数顶部（见上），
      //   避免声明在使用之后 —— 那会抛 TDZ，整个画布挂不上。

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

      /* ── v3.2 自动布局：DAG 分层 + 纵向主轴 ──────────────────────
         口径来自 GPT-6 Sol《设计说明》§1.1（docs/07-gpt6-设计说明.md）：
           - 纵向主轴：intake 在上、output 在下，merge/audit 收束回主轴；
             生产与核查阶段向左右展开（同一层级优先双列，双列中心距 252）。
           - 层级按**真实依赖关系**算（拓扑层级），不按节点数组顺序。
           - 核查节点紧跟它所核查的那一路生产者的正下方。
           - **只排布没有保存位置的节点**：view.json 里的坐标是用户的明确意图，始终优先。
         尺寸一律取 **DOM 实测**（节点会因长标题长高），不用写死的数。 */
      function layoutMissing() {
        const fresh = graph.nodes.filter(n => !positions[n.id]);
        if (!fresh.length) return;

        const byId = new Map(graph.nodes.map(n => [n.id, n]));
        const hOf = id => {
          const el = elements[id];
          return el && el.offsetHeight ? el.offsetHeight : 130;
        };
        const wOf = id => {
          const el = elements[id];
          return el && el.offsetWidth ? el.offsetWidth : 216;
        };

        const SUB_COLS = 2;

        const PRODUCER = n => roleOf(n) === 'produce' || roleOf(n) === 'image';
        const ON_AXIS = n => {
          const r = roleOf(n);
          return r === 'intake' || r === 'merge' || r === 'audit' || r === 'output';
        };

        // 1) 拓扑层级（最长路径）
        const dagRankCache = new Map();
        const dagRankOf = (id) => {
          if (dagRankCache.has(id)) return dagRankCache.get(id);
          const n = byId.get(id);
          const deps = (n && n.deps ? n.deps : []).filter(d => byId.has(d));
          const L = deps.length
            ? 1 + Math.max(...deps.map(d => dagRankOf(d)))
            : 0;
          dagRankCache.set(id, L);
          return L;
        };

        // 2) 单元 = 一个生产者 + 它下游**唯一**的核查节点。
        //    ⚠️ **单元是布局策略，不是 DAG 数据结构**（GPT-6 Sol 第 3 轮 §⑤ 第三硬条件）：
        //    只有明确的一对一 生产→核查 关系才拼单元。
        //    一个核查依赖**多个**生产者、或一个生产者挂了**多条**核查 ⇒ 核查单独成单元，
        //    回退通用拓扑排布，绝不把它硬挂到第一个生产者头上（那会画出并不存在的依赖）。
        const producerParents = new Map(); // verifyId -> [producer]
        for (const n of graph.nodes) {
          if (roleOf(n) !== 'verify') continue;
          producerParents.set(
            n.id,
            (n.deps || []).map(d => byId.get(d)).filter(x => x && PRODUCER(x))
          );
        }

        const kidsCount = new Map(); // producerId -> 挂在它下面的核查数
        for (const parents of producerParents.values()) {
          for (const p of parents) {
            kidsCount.set(p.id, (kidsCount.get(p.id) || 0) + 1);
          }
        }

        const kidsOf = new Map();
        for (const [vid, parents] of producerParents) {
          if (parents.length !== 1) continue;                 // 多个生产者 ⇒ 不配单元
          const p = parents[0];
          if ((kidsCount.get(p.id) || 0) !== 1) continue;      // 生产者有多条核查 ⇒ 不配单元
          if (!kidsOf.has(p.id)) kidsOf.set(p.id, []);
          kidsOf.get(p.id).push(byId.get(vid));
        }

        const units = [];
        const used = new Set();
        for (const n of graph.nodes) {
          if (!PRODUCER(n)) continue;
          const kids = kidsOf.get(n.id) || [];
          kids.forEach(k => used.add(k.id));
          units.push({ top: n, bottoms: kids });
        }
        // 没有配到单元的核查节点（共享核查 / 多父核查），自成单元，按通用拓扑排布
        for (const n of graph.nodes) {
          if (roleOf(n) === 'verify' && !used.has(n.id)) {
            units.push({ top: n, bottoms: [] });
            used.add(n.id);
          }
        }

        // 3) 按**逻辑层级 dagRank** 分组（最长依赖路径算出来的真实先后约束）
        const groups = new Map();
        for (const u of units) {
          const L = dagRankOf(u.top.id);
          if (!groups.has(L)) groups.set(L, []);
          groups.get(L).push(u);
        }

        const placed = new Map();
        const colCenter = c => AXIS + (c === 0 ? -SUB / 2 : SUB / 2);
        const put = (n, x, y) => placed.set(n.id, { x: x - wOf(n.id) / 2, y });

        // 4) **按层逐层往下放**：每一层里，主轴节点（intake/merge/audit/output）
        //    与生产单元组交替出现，谁先谁后由层级决定。
        //    （早先的写法是「先放全部单元、最后再放主轴节点」，
        //      结果 intake 会压在第一个 produce 上——已修。）
        const maxRank = graph.nodes.reduce((m, n) => Math.max(m, dagRankOf(n.id)), 0);
        let cursor = 0;

        for (let L = 0; L <= maxRank; L++) {
          const inLayer = graph.nodes.filter(n => dagRankOf(n.id) === L);
          const axisHere = inLayer.filter(n => ON_AXIS(n) && !placed.has(n.id));
          const unitHere = groups.get(L) || [];

          let bandTop = cursor;
          let bandH = 0;

          // 主轴节点
          for (const n of axisHere) {
            put(n, AXIS, cursor);
            bandH = Math.max(bandH, hOf(n.id));
          }

          // 生产单元组：**同一层级优先双列**，核查节点在各自生产者的正下方。
          // ⚠️ **dagRank（逻辑层级）≠ visualRow（视觉行）**（GPT-6 Sol 第 3 轮 §④）：
          //    4 路并行时 p1 与 p3 的 dagRank 相同，却落在**不同的 visualRow**——
          //    这是二维排版必须付出的代价，不是 DAG 变了。
          //    visualRow = 「波次」：每波最多放两个单元；
          //    下一波的顶部 = 上一波左右两个单元中**较低的那个底部** + 72px，
          //    这样 p3 与 p4 顶部对齐，两列不会随着卡片高度差逐渐错乱。
          if (unitHere.length) {
            const cols = Math.min(SUB_COLS, unitHere.length);
            const visualRows = Math.ceil(unitHere.length / cols);

            const rowY = [];
            const rowH = [];
            let y = cursor + bandH + (bandH ? ROW_GAP : 0);

            for (let r = 0; r < visualRows; r++) {
              const row = unitHere.slice(r * cols, (r + 1) * cols);
              let h = 0;

              for (const u of row) {
                let uh = hOf(u.top.id);
                for (const b of u.bottoms) uh += ROW_GAP + hOf(b.id);
                h = Math.max(h, uh);
              }

              rowY.push(y);
              rowH.push(h);
              y += h + ROW_GAP;
            }

            for (let r = 0; r < visualRows; r++) {
              const row = unitHere.slice(r * cols, (r + 1) * cols);

              // 整波只有 1 个单元时（并行数为奇数、或该层只有一路）**居中**，
              // 别让它孤零零贴在左列
              const lone = cols === 1 || row.length < cols;
              const rowSpan = (row.length - 1) * SUB + 216;
              const rowStart = AXIS - (rowSpan - 216) / 2;

              for (let c = 0; c < row.length; c++) {
                const u = row[c];
                const cx = lone ? rowStart + c * SUB : colCenter(c);
                put(u.top, cx, rowY[r]);

                let by = rowY[r] + hOf(u.top.id) + ROW_GAP;
                for (const b of u.bottoms) {
                  put(b, cx, by);
                  by += hOf(b.id) + ROW_GAP;
                }
              }
            }

            bandH = Math.max(bandH, rowY[visualRows - 1] + rowH[visualRows - 1] - bandTop);
          }

          if (bandH > 0) cursor = bandTop + bandH + ROW_GAP;
        }

        // 5) 只写回**没有保存过位置**的节点
        for (const n of fresh) {
          const p = placed.get(n.id);
          if (p) {
            positions[n.id] = p;
          } else {
            // 兜底：引擎没排到的节点（理论上不该有）也别让它消失，堆在画布下方
            positions[n.id] = { x: AXIS - wOf(n.id) / 2, y: cursor };
            cursor += hOf(n.id) + ROW_GAP;
          }
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

      /* ── v3.2 节点文案 ─────────────────────────────────────────
         四条**独立**的轴：执行状态 / 核查结论 / 人工验收 / 交付状态。
         绿色只属于「执行完成」；核查未过、人工退回、交付受阻一律**白底黑字反相签**。 */
      const ROLE_LABEL = {
        intake: 'INTAKE', produce: 'PRODUCE', verify: 'VERIFY',
        merge: 'MERGE', audit: 'AUDIT', output: 'OUTPUT', image: 'IMAGE'
      };

      // 普通节点的产物类型用短名：MD / HTML / PNG / JSON（《设计说明》§1.3）
      const TYPE_LABEL = {
        html: 'HTML', htm: 'HTML',
        md: 'MD', markdown: 'MD',
        png: 'PNG', jpg: 'JPG', jpeg: 'JPG',
        webp: 'WEBP', json: 'JSON'
      };

      // output 是作品的封签，用完整写法（§3「例如 HTML DOCUMENT」）
      const TYPE_LABEL_LONG = {
        html: 'HTML DOCUMENT', htm: 'HTML DOCUMENT',
        md: 'MARKDOWN', markdown: 'MARKDOWN',
        png: 'PNG IMAGE', jpg: 'JPEG IMAGE', jpeg: 'JPEG IMAGE',
        webp: 'WEBP IMAGE', json: 'JSON'
      };

      // 预览页顶部显示的产物类型（弱白一行）
      const PREVIEW_TYPE = {
        html: 'HTML', htm: 'HTML',
        md: 'MARKDOWN', markdown: 'MARKDOWN',
        json: 'JSON', pdf: 'PDF',
        image: 'IMAGE', png: 'PNG', jpg: 'JPEG', jpeg: 'JPEG',
        webp: 'WEBP', svg: 'SVG', gif: 'GIF', text: 'TEXT'
      };

      function roleOf(n) {
        return n.role || (branch(n) ? 'produce' : 'merge');
      }

      function roleLabel(n) {
        const role = roleOf(n);
        const name = ROLE_LABEL[role] || 'PRODUCE';
        if (role === 'intake') return '00 / ' + name;
        if (role === 'output') return name + ' / FINAL';
        const i = graph.nodes.findIndex(x => x.id === n.id);
        return name + ' / ' + String(Math.max(0, i)).padStart(2, '0');
      }

      function statusLabel(n) {
        if (n.status === 'running') return '运行中';
        if (n.status === 'done') return '执行完成';
        if (n.status === 'failed') return '执行失败';
        return '待执行';
      }

      /** 底部最弱行：模型名 · 产物格式 */
      function metaLine(n) {
        const role = roleOf(n);
        // intake 是一张委托卡，不显示无意义的模型名
        if (role === 'intake') return '';
        const k = n.artifactType ? String(n.artifactType).toLowerCase() : '';
        const type = role === 'output'
          ? (TYPE_LABEL_LONG[k] || (k ? k.toUpperCase() : ''))
          : (TYPE_LABEL[k] || (k ? k.toUpperCase() : ''));
        const model = n.model || '';
        if (role === 'output') return type || 'OUTPUT';
        if (role === 'merge') return model;
        return [model, type].filter(Boolean).join(' · ');
      }

      /** 结论签：invert = 白底黑字反相签（需要人读的结论） */
      function verdictChips(n) {
        const chips = [];
        const role = roleOf(n);

        // 核查结论：只有核查/终审节点本身有结论。
        // 其它节点的 review 恒为 pending —— 按规范「没有核查结论的节点，不要硬凑一行未知」。
        if (role === 'verify' || role === 'audit') {
          if (n.review === 'fail') chips.push(['invert', '核查未过']);
          else if (n.review === 'pass') chips.push(['plain', '核查通过']);
          else if (n.review === 'unknown') chips.push(['weak', '结论未知']);
          else chips.push(['weak', role === 'audit' ? '待终审' : '待核查']);
        }

        // 交付状态：运行级判定，落在终点 output 上
        if (role === 'output') {
          const d = String((graph.delivery && graph.delivery.status) || '');
          if (d === 'blocked') chips.push(['invert', '交付受阻']);
          else if (d === 'failed') chips.push(['invert', '交付失败']);
          else if (d === 'ready') chips.push(['plain', '可交付']);
        }

        // 人工验收：只放在具备人工验收意义的节点（尤其最终 output）
        if (role === 'output') {
          if (n.humanReview === 'rejected') chips.push(['invert', '人工退回']);
          else if (n.humanReview === 'accepted') chips.push(['plain', '人工已验收']);
          else if (n.humanReview === 'pending') chips.push(['weak', '待验收']);
        }

        return chips;
      }

      function updateNode(n) {
        const el = elements[n.id];
        if (!el) return;

        el.classList.toggle('selected', selected === n.id);
        el.classList.toggle('running', n.status === 'running');
        el.classList.toggle('failed', n.status === 'failed');
        el.classList.toggle('done', n.status === 'done');
        el.classList.toggle('verify', n.role === 'verify');
        el.classList.toggle('intake', n.role === 'intake');
        el.classList.toggle('output', n.role === 'output');
        el.classList.toggle('audit', n.role === 'audit');

        // ① 做什么
        const role = el.querySelector('.node-role');
        if (role) role.textContent = roleLabel(n);

        const title = el.querySelector('.node-title');
        if (title) {
          title.textContent = n.title;
          // 两行截断只影响**展示**：完整标题必须仍能通过悬停/聚焦拿到
          // （GPT-6 Sol 第 3 轮 §① 补充约束）
          title.title = n.title;
          title.setAttribute('aria-label', n.title);
        }

        // ② 执行到哪
        const statusText = el.querySelector('.node-status-text');
        if (statusText) statusText.textContent = statusLabel(n);

        const time = el.querySelector('.node-time');
        if (time) {
          time.textContent = timeLabel(n);
          time.title = n.error || '';
        }

        // ③ 结果与来源
        const box = el.querySelector('.node-verdicts');
        if (box) {
          box.textContent = '';

          for (const [kind, text] of verdictChips(n)) {
            const chip = document.createElement('span');
            chip.className = 'node-verdict ' + kind;
            chip.textContent = text;
            box.appendChild(chip);
          }
        }

        const meta = el.querySelector('.node-meta');
        if (meta) {
          meta.textContent = metaLine(n);
          meta.title = meta.textContent;
        }
      }

      function makeNode(n) {
        const el = document.createElement('div');
        el.className = 'node' + (branch(n) ? '' : ' merge');
        el.dataset.id = n.id;
        el.dataset.role = roleOf(n);

        // output = 作品封签：内侧顶部一条短水平线，形成收束结构
        if (roleOf(n) === 'output') {
          const cap = document.createElement('div');
          cap.className = 'node-cap';
          el.appendChild(cap);
        }

        const role = document.createElement('div');
        role.className = 'node-role';

        const title = document.createElement('div');
        title.className = 'node-title';

        const status = document.createElement('div');
        status.className = 'node-status';

        const mark = document.createElement('span');
        mark.className = 'node-mark';

        const statusText = document.createElement('span');
        statusText.className = 'node-status-text';

        const time = document.createElement('span');
        time.className = 'node-time';

        status.append(mark, statusText, time);

        const sep = document.createElement('div');
        sep.className = 'node-sep';

        const verdicts = document.createElement('div');
        verdicts.className = 'node-verdicts';

        const meta = document.createElement('div');
        meta.className = 'node-meta';

        el.append(role, title, status, sep, verdicts, meta);

        // ⚠️ 2026-10-20 修：**所有节点**都必须有操作入口。
        //   原来这里写的是 if (branch(n))，而 branch = kind !== 'merge' ⇒
        //   merge 节点根本没有 ⋯ 按钮；偏偏「导出发布包 / 归档本轮」当时
        //   只写在 merge 的菜单分支里 ⇒ 这两个功能从 UI 上永远点不到。
        //   用裸块保住 more 的块级作用域，行为与原来一致。
        {
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
          const src = getNode(w.from);
          const dst = getNode(w.to);

          w.g.classList.toggle(
            'active',
            selected === w.from || selected === w.to
          );

          w.g.classList.toggle(
            'running',
            !!src && src.status === 'running'
          );

          w.g.classList.toggle(
            'failed',
            !!src && src.status === 'failed'
          );

          // 边状态：**不能只看上游 done**（GPT §五 4）。
          // 没有边级事件时用保守规则「上游完成 **且** 下游已经开始或结束」。
          // 下游核查失败，线也**不变绿、不变成功样式** —— 亮度只表达流转。
          const flowed = !!src && !!dst &&
            src.status === 'done' &&
            (dst.status === 'running' || dst.status === 'done');

          w.g.classList.toggle('done', flowed);
        }
      }

      /* ── 连线路由（GPT-6 Sol 第 3 轮 §五）──────────────────────────
         1) **真实依赖才连线**：只画 graph.edges，绝不从"视觉上挨着"推导；
         2) **跨波次长边必须绕行**：四路并行时 v1→merge 不能从 v1 底部
            贯穿 p3/v3 —— 走**两列之间的中央走线区**；多根线小幅错位，
            但**不提前汇合成一条**（那会看起来像共享依赖）；
         3) **坐标系只有一个**：锚点一律用 positions + offsetWidth/Height
            算出的画布世界坐标，绝不与 getBoundingClientRect() 混用；
         4) **亮度表达流转，不表达核查结论**：下游核查失败，线也不变色。 */

      function rectOf(id) {
        const el = elements[id];
        const p = positions[id];
        if (!el || !p) return null;
        return {
          x: p.x, y: p.y,
          w: el.offsetWidth, h: el.offsetHeight,
          bottom: p.y + el.offsetHeight
        };
      }

      /** 同一节点的出入线在边上错开，避免所有线挤在同一个点上 */
      function computeAnchors() {
        const outs = new Map();
        const ins = new Map();

        for (const w of wires) {
          if (!outs.has(w.from)) outs.set(w.from, []);
          outs.get(w.from).push(w);
          if (!ins.has(w.to)) ins.set(w.to, []);
          ins.get(w.to).push(w);
        }

        for (const w of wires) {
          const ro = rectOf(w.from);
          const ri = rectOf(w.to);

          if (!ro || !ri) {
            w.sx = w.sy = w.tx = w.ty = null;
            continue;
          }

          const oList = outs.get(w.from);
          const iList = ins.get(w.to);
          const oi = oList.indexOf(w);
          const ii = iList.indexOf(w);

          w.sx = ro.x + ro.w * (oi + 1) / (oList.length + 1);
          w.sy = ro.bottom;
          w.tx = ri.x + ri.w * (ii + 1) / (iList.length + 1);
          w.ty = ri.y;
        }
      }

      /** 直线段是否穿过别的节点（要绕开的就是这些） */
      function segmentHits(x1, y1, x2, y2, boxes, from, to) {
        const steps = 24;

        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          const x = x1 + (x2 - x1) * t;
          const y = y1 + (y2 - y1) * t;

          for (const b of boxes) {
            if (b.id === from || b.id === to) continue;
            if (x > b.x - 5 && x < b.x + b.w + 5 && y > b.y - 5 && y < b.y + b.h + 5) return true;
          }
        }

        return false;
      }

      let edgeFrame = 0;

      /** 拖动中的路径更新合并到一帧（GPT §六 6） */
      function requestDrawEdges() {
        if (edgeFrame) return;
        edgeFrame = requestAnimationFrame(() => {
          edgeFrame = 0;
          drawEdges();
        });
      }

      function drawEdges() {
        const boxes = [];

        for (const n of graph.nodes) {
          const r = rectOf(n.id);
          if (r) boxes.push({ id: n.id, x: r.x, y: r.y, w: r.w, h: r.h });
        }

        computeAnchors();

        // ① 哪些边需要走中央走线区
        const corridor = [];

        for (const w of wires) {
          if (w.sx == null) { w.route = 'none'; continue; }
          const far = w.ty - w.sy > 140;
          const hit = far && segmentHits(w.sx, w.sy, w.tx, w.ty, boxes, w.from, w.to);
          w.route = hit ? 'corridor' : 'direct';
          if (hit) corridor.push(w);
        }

        // ② 走线区的车道：多根线**小幅错位**，但不提前汇合成一条
        const count = corridor.length;
        const spacing = count > 1
          ? Math.min(7, (CORRIDOR * 2 - 8) / (count - 1))
          : 0;

        corridor.forEach((w, i) => {
          w.lane = AXIS + (i - (count - 1) / 2) * spacing;
        });

        // ③ 画
        for (const w of wires) {
          if (w.sx == null) {
            w.g.style.display = 'none';
            continue;
          }

          w.g.style.display = '';
          w.path.setAttribute('d', w.route === 'corridor' ? corridorPath(w) : directPath(w));
          w.a.setAttribute('cx', w.sx);
          w.a.setAttribute('cy', w.sy);
          w.b.setAttribute('cx', w.tx);
          w.b.setAttribute('cy', w.ty);
        }

        updateWires();
      }

      function directPath(w) {
        const dy = w.ty - w.sy;
        const c = clamp(Math.abs(dy) * .47, 28, 115) * (dy < 0 ? -1 : 1);
        return `M ${w.sx} ${w.sy} C ${w.sx} ${w.sy + c} ${w.tx} ${w.ty - c} ${w.tx} ${w.ty}`;
      }

      /** 绕行路径：源底部 → 让位到中央走线区 → 沿通道直下 → 落回目标顶部 */
      function corridorPath(w) {
        const cx = w.lane;
        const e = 26;   // 源 / 目标的缓冲
        const k = 46;   // 转弯深度

        const yA = w.sy + k;
        const yB = w.ty - k;

        if (yB <= yA) {
          // 空间不够：退化成"带走廊的一次转折"
          return `M ${w.sx} ${w.sy}` +
                 ` C ${w.sx} ${w.sy + e} ${cx} ${w.sy + e} ${cx} ${w.sy + k}` +
                 ` C ${cx} ${w.ty - e} ${w.tx} ${w.ty - e} ${w.tx} ${w.ty}`;
        }

        return `M ${w.sx} ${w.sy}` +
               ` C ${w.sx} ${w.sy + e} ${cx} ${w.sy + e} ${cx} ${yA}` +
               ` L ${cx} ${yB}` +
               ` C ${cx} ${w.ty - e} ${w.tx} ${w.ty - e} ${w.tx} ${w.ty}`;
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

        nodeLayer.textContent = '';

        for (const id of Object.keys(elements)) {
          delete elements[id];
        }

        for (const n of graph.nodes) {
          const el = makeNode(n);

          elements[n.id] = el;
          nodeLayer.appendChild(el);
          if (nodeObserver) nodeObserver.observe(el);
        }

        if (selected && !elements[selected]) selected = null;

        // 顺序要紧：**先填内容**（此时高度才是最终值）→ **再排布**（要实测高度）→ **最后定位**
        for (const n of graph.nodes) {
          updateNode(n);
        }

        layoutMissing();

        for (const n of graph.nodes) {
          positionNode(n.id);
        }

        idsKey = nodeIds();
        makeWires();
        checkConflicts();
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

          // 状态变化可能让节点长高 ⇒ 复查一次有没有撞在一起
          checkConflicts();
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

      async function reviewNode(id, status, note) {
        try {
          const res = await fetch('jingwei/actions/review', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ nodeId: id, status, note })
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const n = getNode(id);
          if (n) { n.review = status; n.reviewNote = note; }
          console.info('[经纬] 评审已记录', id, status);
        } catch (e) {
          console.warn('[经纬] 评审失败', e);
        }
      }

      async function rerunNodeGraph(id, note) {
        try {
          const res = await fetch('jingwei/actions/rerun-subgraph', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: sessionId || '', nodeId: id, note: note || '' })
          });
          if (res.status !== 202) throw new Error('HTTP ' + res.status);
          const n = getNode(id);
          if (n) { n.status = 'running'; n.review = 'pending'; }
          startPolling();
        } catch (e) {
          console.warn('[经纬] 重跑失败', e);
        }
      }

      async function publishRun() {
        try {
          const res = await fetch('jingwei/actions/publish', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ runId: graph.runId })
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          console.info('[经纬] 发布包已导出');
        } catch (e) {
          console.warn('[经纬] 导出失败', e);
        }
      }

      async function archiveRun() {
        try {
          const res = await fetch('jingwei/actions/archive', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ runId: graph.runId })
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          console.info('[经纬] 本轮已归档');
        } catch (e) {
          console.warn('[经纬] 归档失败', e);
        }
      }

      function openMenu(id, anchor) {
        closeMenu();

        if (preview) return;

        const n = getNode(id);
        if (!n) return;

        const count = graph.nodes.filter(branch).length;

        const runAction = (label, disabled, action) => [label, disabled, action];

        // 「导出发布包 / 归档本轮」是**运行级**动作，语义上属于「把成果交出去」的终点，
        // 所以挂在 output 节点上（2026-10-20 修：原来只挂在 merge 里，而 merge 没有 ⋯ 入口）。
        // 没有 merge 节点的图（例如生图冒烟那种 intake → art → output）同样能用到。
        const runActions = [];
        if (roleOf(n) === 'output' && graph.runId) {
          runActions.push(
            runAction('导出发布包', false, () => publishRun()),
            runAction('归档本轮', false, () => archiveRun())
          );
        }

        const actions = branch(n)
          ? [
              runAction('重跑这一路', n.status === 'running' || pending.has(id), () => {
                const note = window.prompt('重跑意见（可留空）', '');
                if (note === null) return;
                rerunNodeGraph(id, note);
              }),
              runAction('查看产物', !n.artifact, () => openPreview(id)),
              runAction('通过', n.review === 'accepted', () => reviewNode(id, 'accepted', '')),
              runAction('打回…', false, () => {
                const note = window.prompt('打回意见', '');
                if (note === null) return;
                reviewNode(id, 'rejected', note);
              }),
              runAction('复制模型名', !n.model, () => copyText(n.model)),
              runAction('删除节点', n.status === 'running' || pending.has(id) || count <= 1, () => removeNode(id)),
              ...runActions
            ]
          : [
              runAction('查看产物', !n.artifact, () => openPreview(id)),
              runAction('通过本轮', n.review === 'accepted', () => reviewNode(id, 'accepted', '')),
              runAction('打回…', false, () => {
                const note = window.prompt('打回意见', '');
                if (note === null) return;
                reviewNode(id, 'rejected', note);
              }),
              ...runActions
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

      function markdownToHtml(md) {
  const esc = (value) => String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // 链接**只放行 http/https/mailto**（2026-10-20 安全加固）：
  // 产物是 AI 生成的文本，`javascript:` / `data:` 之类协议绝不能进 href ——
  // 预览页跑在插件自己的同源上下文里，漏一个就等于执行任意脚本。
  const safeHref = (url) => {
    const raw = String(url).trim();
    const probe = raw.replace(/[\u0000-\u0020]/g, '').toLowerCase();
    if (probe.startsWith('https://') || probe.startsWith('http://') || probe.startsWith('mailto:')) {
      return raw;
    }
    return null;
  };
  const inline = (value) => esc(value)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, url) => {
      const href = safeHref(url);
      // 协议不安全 ⇒ 只留文字，不生成可点链接
      return href
        ? '<a href="' + href + '" target="_blank" rel="noreferrer noopener">' + label + '</a>'
        : label;
    });
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let list = false;
  let para = [];
  const closeList = () => { if (list) { html += '</ul>'; list = false; } };
  const flush = () => { if (para.length) { html += '<p>' + inline(para.join(' ')) + '</p>'; para = []; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); closeList(); continue; }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) { flush(); closeList(); const level = heading[1].length; html += '<h' + level + '>' + inline(heading[2]) + '</h' + level + '>'; continue; }
    if (/^>\s?/.test(line)) { flush(); closeList(); html += '<blockquote>' + inline(line.replace(/^>\s?/, '')) + '</blockquote>'; continue; }
    if (/^[-*]\s+/.test(line)) { flush(); if (!list) { html += '<ul>'; list = true; } html += '<li>' + inline(line.replace(/^[-*]\s+/, '')) + '</li>'; continue; }
    if (/^---+$/.test(line.trim())) { flush(); closeList(); html += '<hr/>'; continue; }
    para.push(line.trim());
  }
  flush(); closeList();
  return html;
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

        // markdown 要按**文本类**渲染（走 markdownToHtml）；
        // 落到 text 分支就只剩一堆 # 和 ** 了（2026-10-20 第 4 段修）
        if (['md', 'markdown'].includes(ext)) {
          return 'md';
        }

        if (ext === 'pdf') {
          return 'pdf';
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

        const type = artifactType(n);

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

        // 产物路径 · 类型（最弱一级）
        const path = document.createElement('span');
        path.className = 'preview-path';
        path.textContent = n.artifact + '  ·  ' + (PREVIEW_TYPE[type] || 'TEXT');

        label.append(kicker, title, path);

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'preview-close';
        close.textContent = '×';
        close.setAttribute('aria-label', '关闭预览');
        close.addEventListener('click', closePreview);

        // 「在浏览器打开」：画布里看的是缩略，浏览器里才是完整交互（2026-10-20 GPT-6 评审 P1）
        const actions = document.createElement('div');
        actions.className = 'preview-actions';
        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'preview-open';
        openBtn.textContent = '在浏览器打开';
        openBtn.title = '用系统默认浏览器打开这个产物';
        openBtn.addEventListener('click', () => {
          runAction('在浏览器打开', false, async () => {
            const res = await fetch('jingwei/actions/open-external', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ runId: graph.runId, path: n.artifact }),
            });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              throw new Error(body.error || ('HTTP ' + res.status));
            }
          });
        });
        actions.append(openBtn, close);

        head.append(label, actions);

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
        } else if (type === 'pdf') {
          const frame = document.createElement('iframe');
          frame.setAttribute('title', n.title + '，PDF 预览');
          frame.src = url;
          content.appendChild(frame);
        } else if (type === 'html') {
          const iframe = document.createElement('iframe');

          // allow-scripts 但**不给** allow-same-origin（2026-10-20 GPT-6 评审 P0「限制产物脚本权限」）：
          //   · 空 sandbox='' 会把成果页里的 JS 全禁掉 —— 折叠、点击放大都失效；
          //   · allow-scripts 让交互能用，但 iframe 被视为**独立源**：
          //     读不到父页面 DOM、读不到 localStorage、发不了 cookie、导航不了父页。
          //   · 刻意不给 allow-popups / allow-forms / allow-top-navigation。
          iframe.setAttribute('sandbox', 'allow-scripts');
          iframe.setAttribute(
            'title',
            n.title + '，HTML 预览'
          );

          iframe.src = url;
          content.appendChild(iframe);
        } else if (type === 'md' || type === 'markdown') {
          content.classList.add('text');

          const article = document.createElement('article');
          article.className = 'md';
          article.textContent = '读取产物…';
          content.appendChild(article);

          fetch(url, { cache: 'no-store' })
            .then(res => {
              if (!res.ok) throw new Error('HTTP ' + res.status);
              return res.text();
            })
            .then(text => {
              if (destroyed || preview !== layer) return;
              article.innerHTML = markdownToHtml(text);
            })
            .catch(e => {
              if (!destroyed && preview === layer) article.textContent = '读取失败：' + e.message;
            });
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

          // 这批坐标是按哪一版版式算出来的；缺失只判「版本未知」，
          // **不武断认定是旧版式**（GPT-6 Sol 第 3 轮 §⑦ 硬要求）
          viewLayoutVersion = typeof data?.layoutVersion === 'string'
            ? data.layoutVersion : '';

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
              positions: data,
              // 记录这批坐标是按哪一版版式算出来的（GPT-6 Sol 第 3 轮 §⑦）
              layoutVersion: LAYOUT_VERSION
            })
          }).catch(() => {});
        }, 450);
      }

      /* ── 布局冲突检测与「按新版式重排」（GPT-6 Sol 第 3 轮 §⑦）──
         原则：**默认保留用户已保存的坐标**。
         只有真的检测到节点矩形重叠时，才给一个不阻断操作的提示条；
         绝不擅自平移或缩放旧坐标（"自动猜测旧版式来源比一次明确的重排更危险"）。 */
      function detectConflicts() {
        const boxes = [];

        for (const n of graph.nodes) {
          const p = positions[n.id];
          const el = elements[n.id];
          if (!p || !el) continue;
          boxes.push({
            id: n.id,
            x1: p.x, y1: p.y,
            x2: p.x + el.offsetWidth, y2: p.y + el.offsetHeight
          });
        }

        const hits = new Set();

        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i];
            const b = boxes[j];
            if (a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2) {
              hits.add(a.id);
              hits.add(b.id);
            }
          }
        }

        return [...hits];
      }

      function dismissedKeys() {
        try {
          const raw = localStorage.getItem('jingwei.layout.dismissed');
          const list = raw ? JSON.parse(raw) : [];
          return Array.isArray(list) ? list : [];
        } catch (e) {
          return [];
        }
      }

      function rememberDismissed(key) {
        try {
          const list = dismissedKeys();
          if (!list.includes(key)) list.push(key);
          localStorage.setItem('jingwei.layout.dismissed', JSON.stringify(list.slice(-20)));
        } catch (e) {}
      }

      function checkConflicts() {
        if (!conflictBar) return;

        const ids = detectConflicts();
        if (!ids.length) {
          conflictBar.classList.remove('on');
          return;
        }

        // 同一份布局 + 同一布局版本下，选过「保留当前布局」就不重复打扰
        const key = (viewLayoutVersion || 'unknown') + '|' + ids.slice().sort().join(',');

        conflictBar.classList.toggle('on', !dismissedKeys().includes(key));
      }

      function relayoutAll() {
        // 快照（供撤销）
        relayoutSnapshot = {};

        for (const [id, p] of Object.entries(positions)) {
          relayoutSnapshot[id] = { x: p.x, y: p.y };
        }

        // 清空已保存坐标 → 全部交给新版式引擎重排
        for (const id of Object.keys(positions)) delete positions[id];

        layoutMissing();

        for (const n of graph.nodes) positionNode(n.id);

        // 坐标变了 ⇒ 连线**路径**要重算（updateWires 只切 class，不够）
        requestDrawEdges();
        if (autoFit) fit();
        saveView();
        checkConflicts();
      }

      function undoRelayout() {
        if (!relayoutSnapshot) return;

        for (const id of Object.keys(positions)) delete positions[id];

        for (const [id, p] of Object.entries(relayoutSnapshot)) {
          positions[id] = { x: p.x, y: p.y };
        }

        relayoutSnapshot = null;

        for (const n of graph.nodes) positionNode(n.id);

        // 同上：撤销也要重算路径
        requestDrawEdges();
        if (autoFit) fit();
        saveView();
        checkConflicts();
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
        if (e.target.closest('.mp-fab,.mp-dock')) return;
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
          // 拖动中的路径更新合并到一帧（GPT §六 6），别每个 pointermove 都重算
          requestDrawEdges();
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

      // 节点真实尺寸变化（长标题换行、状态行增行）⇒ 重算连线与 fit 边界
      // （GPT §六 6：用 ResizeObserver 触发；观察器**不写尺寸**，所以不会自激重排）
      if (typeof ResizeObserver === 'function') {
        nodeObserver = new ResizeObserver(() => requestDrawEdges());
        listeners.push(() => { nodeObserver.disconnect(); nodeObserver = null; });
      }

      listen(window, 'resize', resize);

      (async () => {
        await loadView();

        if (destroyed) return;

        rebuild(false);

        // ⚠️ 2026-10-20 修（画布首屏停在 DEMO 假数据的真凶）：
        //   原来把 fit() 和 **首次真实数据加载** reload(false) 一起塞进
        //   requestAnimationFrame。但 rAF 只在页面**可见**时才触发 ——
        //   DSH 窗口被遮挡/隐藏时 document.hidden === true，rAF 永久不跑，
        //   于是 reload 永不执行，画布就停在 normalize(DEMO) 的假数据上
        //   （显示「文案 / 设计 / 汇总」，而 graph.json 里是另外的节点）。
        //   真实数据加载是**数据职责**，不能依赖动画帧。
        reload(false);

        // fit 仍要等一帧（要实测节点高度），但页面隐藏时 rAF 不触发 ⇒
        // 加一个 setTimeout 兜底，保证「隐藏着打开右栏」也能把画面摆正。
        let fitted = false;
        const fitOnce = () => {
          if (fitted || destroyed) return;
          fitted = true;
          fit();
        };
        requestAnimationFrame(fitOnce);
        setTimeout(fitOnce, 300);
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


    const MP_CSS = `
.mp-rail,.mp-panel{position:fixed;top:0;bottom:0;left:0;z-index:80;font-family:"PingFang SC","Noto Sans SC",system-ui,sans-serif;color:#fff}
.mp-rail{width:44px;display:flex;flex-direction:column;align-items:center;gap:14px;padding:12px 0;background:rgba(10,10,10,.94);border-right:1px solid rgba(255,255,255,.14);cursor:pointer;user-select:none;backdrop-filter:blur(6px)}
.mp-rail:hover{background:rgba(18,18,18,.98)}
.mp-rail-mark{width:22px;height:22px;border:1px solid rgba(255,255,255,.5);border-radius:2px;display:grid;place-items:center;font:11px/1 ui-monospace,Consolas,monospace}
.mp-rail-text{writing-mode:vertical-rl;letter-spacing:.18em;font-size:11px;color:rgba(255,255,255,.62)}
.mp-rail-count{font:10px/1 ui-monospace,Consolas,monospace;color:rgba(255,255,255,.4)}
.mp-panel{width:344px;display:flex;flex-direction:column;background:rgba(8,8,8,.97);border-right:1px solid rgba(255,255,255,.16);backdrop-filter:blur(8px)}
.mp-head{flex:none;display:flex;align-items:baseline;gap:10px;padding:14px 14px 10px;border-bottom:1px solid rgba(255,255,255,.12)}
.mp-title{flex:1;font-size:13px;font-weight:600;letter-spacing:.04em}
.mp-sub{font:10px/1.4 ui-monospace,Consolas,monospace;color:rgba(255,255,255,.4)}
.mp-close{flex:none;width:26px;height:26px;border:1px solid rgba(255,255,255,.22);border-radius:2px;background:transparent;color:rgba(255,255,255,.65);font:15px/1 ui-monospace,Consolas,monospace;cursor:pointer}
.mp-close:hover{border-color:#fff;color:#fff}
.mp-summary{flex:none;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.1);display:flex;flex-direction:column;gap:6px}
.mp-summary-row{display:flex;justify-content:space-between;gap:10px;font:10.5px/1.5 ui-monospace,Consolas,monospace;color:rgba(255,255,255,.55)}
.mp-summary-row b{color:rgba(255,255,255,.9);font-weight:500}
.mp-list{flex:1;overflow:auto;padding:6px 0 20px;scrollbar-width:thin}
.mp-model{border-bottom:1px solid rgba(255,255,255,.06)}
.mp-model-head{display:flex;align-items:center;gap:8px;padding:9px 14px;cursor:pointer}
.mp-model-head:hover{background:rgba(255,255,255,.05)}
.mp-model-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:11.5px/1.4 ui-monospace,Consolas,monospace}
.mp-badge{flex:none;font:9.5px/1 ui-monospace,Consolas,monospace;color:rgba(255,255,255,.45);border:1px solid rgba(255,255,255,.16);border-radius:2px;padding:3px 5px}
.mp-tier{flex:none;font:9.5px/1 ui-monospace,Consolas,monospace;color:rgba(255,255,255,.72);border:1px solid rgba(255,255,255,.32);border-radius:2px;padding:3px 5px}
.mp-providers{padding:2px 14px 10px 22px;display:flex;flex-direction:column;gap:6px}
.mp-provider{border-left:1px solid rgba(255,255,255,.16);padding-left:9px;display:flex;flex-direction:column;gap:2px}
.mp-provider-name{font-size:11px;color:rgba(255,255,255,.82)}
.mp-provider-meta{font:9.5px/1.5 ui-monospace,Consolas,monospace;color:rgba(255,255,255,.4)}
.mp-empty{padding:16px 14px;font:11px/1.6 ui-monospace,Consolas,monospace;color:rgba(255,255,255,.4)}
.mp-dot{flex:none;width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.3)}
.mp-dot.ok{background:rgba(255,255,255,.8)}
`;

    function mpStyle() {
      if (document.getElementById('jw-mp-style')) return;
      const tag = document.createElement('style');
      tag.id = 'jw-mp-style';
      tag.textContent = MP_CSS;
      document.head.appendChild(tag);
    }

    function mpMeta(provider) {
      const parts = [];
      if (provider.channelName) parts.push(provider.channelName);
      if (provider.intel) parts.push('智力 ' + provider.intel.label + ' · Elo ' + provider.intel.elo + ' · GPQA ' + provider.intel.gpqa);
      if (provider.speed) parts.push('速度 ' + provider.speed);
      if (provider.balance) parts.push(provider.balance);
      else if (provider.billing) parts.push(provider.billing);
      if (provider.contextWindow) parts.push('上下 ' + Math.round(provider.contextWindow / 1000) + 'K');
      return parts.join(' · ');
    }

    function ModelPanel() {
      mpStyle();
      const [collapsed, setCollapsed] = React.useState(true);
      const [data, setData] = React.useState(null);
      const [error, setError] = React.useState('');
      const [open, setOpen] = React.useState('');

      React.useEffect(() => {
        let alive = true;
        const load = () => {
          fetch('jingwei/models', { cache: 'no-store' })
            .then((res) => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
            .then((value) => { if (alive) { setData(value); setError(''); } })
            .catch((err) => { if (alive) setError(String(err && err.message ? err.message : err)); });
        };
        load();
        const timer = setInterval(load, 60000);
        return () => { alive = false; clearInterval(timer); };
      }, []);

      const models = data && Array.isArray(data.models) ? data.models : [];
      const accounts = data && data.buddy && Array.isArray(data.buddy.accountsSummary) ? data.buddy.accountsSummary : [];
      const credit = accounts.reduce((sum, row) => sum + (Number.isFinite(row.credit) ? row.credit : 0), 0);
      const active = accounts.reduce((sum, row) => sum + (row.active || 0), 0);
      const highCount = data && data.gateway && data.gateway.high ? data.gateway.high.length : 0;

      if (collapsed) {
        return React.createElement('div', { className: 'mp-rail', onClick: () => setCollapsed(false), title: '可用模型' },
          React.createElement('div', { className: 'mp-rail-mark' }, 'M'),
          React.createElement('div', { className: 'mp-rail-text' }, '可用模型'),
          React.createElement('div', { className: 'mp-rail-count' }, models.length ? String(models.length) : '—'));
      }

      return React.createElement('div', { className: 'mp-panel' },
        React.createElement('div', { className: 'mp-head' },
          React.createElement('div', { className: 'mp-title' }, '可用模型'),
          React.createElement('div', { className: 'mp-sub' }, models.length + ' 个'),
          React.createElement('button', { className: 'mp-close', onClick: () => setCollapsed(true), title: '收起' }, '×')),
        React.createElement('div', { className: 'mp-summary' },
          React.createElement('div', { className: 'mp-summary-row' },
            React.createElement('span', null, 'BUDDY 账号'),
            React.createElement('b', null, active + ' 活跃 · 余额 ' + credit.toFixed(2))),
          React.createElement('div', { className: 'mp-summary-row' },
            React.createElement('span', null, '嗨模型 high'),
            React.createElement('b', null, highCount + ' 个渠道'))),
        React.createElement('div', { className: 'mp-list' },
          error
            ? React.createElement('div', { className: 'mp-empty' }, '读取失败：' + error)
            : models.length === 0
              ? React.createElement('div', { className: 'mp-empty' }, data ? '没有可用模型' : '读取中…')
              : models.map((model) => {
                  const isOpen = open === model.name;
                  return React.createElement('div', { className: 'mp-model', key: model.name },
                    React.createElement('div', { className: 'mp-model-head', onClick: () => setOpen(isOpen ? '' : model.name) },
                      React.createElement('span', { className: 'mp-dot' + (model.providers && model.providers.length ? ' ok' : '') }),
                      React.createElement('span', { className: 'mp-model-name' }, model.name),
                      model.intel ? React.createElement('span', { className: 'mp-tier', title: '智力档 ' + model.intel.label + ' · Elo ' + model.intel.elo + ' · GPQA ' + model.intel.gpqa }, model.intel.label) : null,
                      React.createElement('span', { className: 'mp-badge' }, (model.providers ? model.providers.length : 0) + ' 渠道')),
                    isOpen ? React.createElement('div', { className: 'mp-providers' },
                      (model.providers || []).map((provider, index) => React.createElement('div', { className: 'mp-provider', key: provider.source + '-' + provider.channel + '-' + index },
                        React.createElement('div', { className: 'mp-provider-name' }, provider.channelName || provider.channel || provider.source),
                        React.createElement('div', { className: 'mp-provider-meta' }, mpMeta(provider) || provider.source)))) : null);
                })));
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
