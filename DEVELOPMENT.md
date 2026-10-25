# 文献阅读助手 · 开发文档

> 本文档是项目实施的**唯一依据**。技术栈、数据模型、目录结构、实施步骤（Step）、验收标准（DoD）、风险对策均以此为准；如有变更，先改本文档再动代码。
>
> 视觉方向已定：**方案 A「书斋」**，基准原型 `design-proposals/proposal-a.html`（总览 `design-proposals/index.html`）。

---

## 1. 项目定位

本地运行的**文献阅读助手**（学生向）：上传 PDF 论文，浏览器内阅读，AI 提取研究问题 / 核心方法 / 实验结果 / 主要贡献（四要素），配合问答、引用定位、笔记、标签、公式与图表解释、文献对比等能力，产出精读卡片与 Markdown 笔记。

- **纯前端本地应用，无后端、无部署**：`npm run dev` 即用；论文数据只存本机（IndexedDB），仅与用户自配的 AI 服务通信。
- 包管理器：**npm**（不用 pnpm/yarn）。
- 节奏：MVP → V2 → V3 按顺序逐 Step 完成，不并行、不跳步；每步通过 DoD 后再进下一步。

## 2. 技术栈（已确认，不再讨论）

| 层 | 选型 | 说明 |
|---|---|---|
| 框架 | Vue 3 + `<script setup>` + TypeScript + Vite | Composition API；视图路由用 vue-router |
| 状态 | Pinia | stores/ 按域拆分 |
| 样式 | Tailwind CSS 4 + CSS 变量（design tokens） | 主题切换用 `[data-theme]` |
| PDF | pdfjs-dist | 渲染 + 文本层提取（引用定位与喂 AI 的原料） |
| 公式 | KaTeX | LaTeX 渲染 |
| 动效 | GSAP 3 | 少量、克制（刻度 3/10），必须走安全封装（§4.4） |
| 存储 | IndexedDB | PDF blob + 结构化数据；不用 localStorage 存大对象 |
| 图标 | Phosphor（`@phosphor-icons/web`） | npm 引入，不走 CDN |
| 验证 | Python Playwright（本地无头） | `verify_*.py` 模式，延续上一版项目经验 |

## 3. 视觉规范（方案 A「书斋」）

从 `proposal-a.html` 提炼，实现时以此为准；拿不准的地方回到原型对照。

### 3.1 Design tokens（CSS 变量，浅色为设计基准）

```css
:root {                                  /* 浅色（设计基准） */
  --bg:#EFEAE0;        /* 桌面底 */
  --surface:#F8F4EA;   /* 面板（书架/伴读） */
  --sheet:#FDFAF3;     /* 纸页 */
  --ink:#27221A;  --ink-2:#6E6353;  --ink-3:#A2957F;
  --line:#DCD2BC;  --line-2:#E8E0CE;
  --accent:#B23A24;    /* 朱砂：批注/强调/在读态 */
  --accent-deep:#8C2D1B;  --accent-wash:#F6E7E0;
  --hl:#F3E3B6;        /* 原文定位高亮（赭黄） */
  --shadow-card:0 1px 2px rgba(39,34,26,.06);
  --shadow-sheet:0 2px 14px rgba(39,34,26,.09),0 12px 40px rgba(39,34,26,.07);
}
[data-theme="dark"] {                    /* 暗色（派生基础版，V3 再打磨） */
  --bg:#1B1813; --surface:#23201A; --sheet:#2A2620;
  --ink:#EDE6D8; --ink-2:#AFA28C; --ink-3:#7C7260;
  --line:#3A352B; --line-2:#332F26;
  --accent:#D2583F; --accent-deep:#E07B62; --accent-wash:#3A2721; --hl:#4E4327;
}
```

### 3.2 字体 / 圆角 / 布局

- 字体：标题与章节名用衬线 `Georgia,"Times New Roman","STZhongsong","SimSun",serif`；正文 `"Segoe UI","Microsoft YaHei",sans-serif`。
- 圆角系统：**3px 全局唯一**（印刷感）。
- 布局：顶栏 56px（印章 logo + 搜索 + 设置/主题）｜左书架 262px｜中读纸区（纸页宽 `min(780px,100%)`，底部悬浮页码 HUD）｜右伴读面板 372px。原型按 ≥1180px 设计，正式实现补窄屏适配（书架/伴读可折叠为抽屉）。

### 3.3 组件语汇（延续原型）

印章 logo（朱砂方章「阅」）、章节序号「一二三四」、朱批卡（红色左边线 = AI 批注）、状态 chip（在读=朱砂描边 / 已读 / 未读=虚线）、标签块、定位高亮（赭黄下衬 + flash 动画）、纸页顶部朱砂装订线。AI 输出一律可溯源（带「P.x §y」出处，可点击跳转）。

### 3.4 GSAP 安全模式（强制）

历史教训：GSAP 入场动画在部分环境对元素中途冻结（inline opacity/transform 卡住，按钮不可见不可点）。**所有动效必须**：

1. 只用 `gsap.from(...)`（库加载失败时内容天然可见）；
2. timeline 传入 `defaults:{clearProps:'all'}` 且 `onComplete` 里统一 `gsap.set(targets,{clearProps:'all'})`；
3. 另加 **3 秒兜底 setTimeout** 再清一次；
4. 尊重 `prefers-reduced-motion`，命中则完全不动。

把该模式封装成 `src/utils/anim.ts`（如 `safeIntro(targets, vars)`），组件不得手写裸 timeline。

## 4. AI 集成

### 4.1 默认服务（TokenRhythm 基元律动）

- Base URL：`https://tokenrhythm.studio/v1`，接口 `POST /chat/completions`（OpenAI 协议，`messages`/`stream` 同 OpenAI）。
- 默认模型：`deepseek-v4.1-flash-1017`，**有视觉能力**（`image_url` 传 base64 data URL，用于图表/截图公式解释）。
- 认证：`Authorization: Bearer <KEY>`。

### 4.2 Key 管理（重要约定）

- API Key 已于 2026-10-25 由用户提供，存于仓库根 `.env`：
  ```env
  VITE_AI_BASE_URL=https://tokenrhythm.studio/v1
  VITE_AI_MODEL=deepseek-v4.1-flash-1017
  VITE_AI_API_KEY=<向用户索取后填入>
  ```
- `.env` 加入 `.gitignore`，**永不提交**；本应用纯本地无部署，`VITE_` 变量进 bundle 的风险已知且可接受（文档明示，不另做加密）。
- 设置页中输入的 key 运行时覆盖 .env 默认值，存 IndexedDB `settings`。
- UI 提示态：未配置 key 时 AI 入口显示占位提示（同上一版「占位 Key 提示态」），不阻塞阅读功能。

### 4.3 自定义模型（必须支持）

设置页允许自定义任何 **OpenAI 协议**服务：`baseUrl + model + apiKey` 三项即可接入（默认值预填 TokenRhythm）；提供**连接测试**按钮（发一条 1 token 级请求，回报成功/失败原因）。不做 Anthropic/Responses 等其它协议。

### 4.4 调用层实现要点

- 流式：`fetch` + `ReadableStream` 解析 SSE（`data:` 行 → `choices[0].delta.content`），提取卡与问答均流式渲染。
- **CORS 未知**：若浏览器直连 TokenRhythm 被拦，启用 Vite dev 代理兜底（`vite.config.ts` 把 `/ai` 转发到目标 baseUrl，属本地 dev server，不算部署）。设置页注明此开关。
- 结构化输出：四要素要求模型返回 JSON（提示词中给出 schema 与示例）；解析层做容错（剥 markdown 代码围栏、截断重试一次），失败降级为纯文本展示。
- **AI 结果缓存**：Extract/术语表等按 `paperId + 模型 + 提示词版本` 缓存进 IndexedDB，避免重复计费；提供「重新生成」。
- 视觉调用：图表解释把对应页面区域导出为 canvas PNG（压缩到长边 ≤1280）再走 `image_url`。
- 上下文管理：默认送「题录 + 摘要 + 用户选中段落 + 最近 N 轮对话」，长文不整篇直塞；问答提示词要求回答标注 `[P.页码]` 引用。

## 5. 数据模型（IndexedDB，库名 `paper-study`，版本 1）

```
papers    { id, title, titleZh?, authors[], year, venue?, doi?, fileName, size,
            addedAt, status:'unread'|'reading'|'done', rating?(1-5), tags:string[],
            lastPage, totalPages }          // pdfBlob 同库存 blob 字段
pageTexts { [paperId+page], text }          // 逐页文本层缓存，懒解析
extracts  { [paperId], model, promptVer, summary, question, method, experiment,
            contribution[], refs[{page,quote?}], createdAt }
chats     { [paperId], messages[{role, content, refs[], ts}] }
notes     { id, paperId, page, quote, content, createdAt, updatedAt }
settings  { key:'app', ai:{baseUrl, model, apiKey?, temperature}, theme, proxy:boolean }
```

注意上一版踩坑：IndexedDB 封装必须正确区分 `IDBRequest`/`IDBTransaction`（曾把 request 当 transaction 用导致写入挂起）；统一走自写 `src/services/db.ts`，不裸用 API。

## 6. 目录结构

```
（仓库根 = 应用根，2026-10-25 变更：不建 paper-assistant/ 子目录）
├─ .env / .env.example / .gitignore
├─ index.html  vite.config.ts  package.json  tsconfig.json
├─ design-proposals/             # 视觉原型（只读参考，不参与构建）
├─ test/                         # 验收用 7 篇论文（只读）
├─ verify/                       # Playwright 脚本 + 截图
└─ src/
   ├─ App.vue                    # 三栏布局 + 主题 + 入场动效(安全封装)
   ├─ styles/tokens.css          # §3.1 变量 + Tailwind 入口
   ├─ stores/                    # library / reader / ai / settings / notes
   ├─ services/
   │  ├─ db.ts                   # IndexedDB 封装
   │  ├─ pdf.ts                  # pdfjs 加载/逐页文本/缩略
   │  ├─ ai.ts                   # chat(流式)/视觉/连接测试/缓存读写
   │  └─ export.ts               # Markdown/Anki/引文/备份 导入导出
   ├─ utils/anim.ts  utils/heuristics.ts(题录启发式)  utils/id.ts
   ├─ components/
   │  ├─ shelf/                  # 书架列表/状态chip/标签
   │  ├─ reader/                 # 纸页/PDF画布/文本层/HUD/选择菜单
   │  ├─ companion/              # 伴读面板：提取卡/问答/笔记/输入
   │  ├─ formula/                # KaTeX 渲染与解释入口
   │  └─ common/                 # 印章/图标按钮/chip/抽屉/弹层
   └─ views/ Library.vue  Reader.vue  Settings.vue  Compare.vue  Search.vue
```

## 7. 实施步骤（按序执行，每步有 DoD）

### Phase MVP

**Step 1 · 脚手架与设计系统**
`npm create vite`（vue-ts）→ 装 Pinia/Tailwind4/Phosphor；落地 tokens.css、主题切换（含 localStorage 记忆）、三栏布局骨架、印章顶栏、`anim.ts` 安全动效封装。
DoD：`npm run dev` 呈现原型 A 的空态三栏；亮暗切换正常；0 控制台错误；入场动效无冻结残留（Playwright 断言，下同）。

**Step 2 · 数据层与文献入库**
db.ts；PDF 上传（拖拽+按钮，仅 .pdf）；pdfjs 逐页文本提取入库；题录启发式（标题/作者/年份/venue/DOI 预填，可编辑）；书架列表 + 在读/已读/未读 + 标签增删 + 阅读进度记忆字段。
DoD：上传真实 PDF 后书架出现条目，题录自动预填可改，刷新后数据仍在；上传对话框/解析中/失败三态齐备。

**Step 3 · 阅读器**
pdfjs 渲染到纸页区（原型视觉）：单页模式、翻页 HUD、缩放（50%~200%）、适应宽度、文本可选择、页码进度写回 `lastPage`、文本选择弹出轻量菜单（解释/翻译/记笔记 占位）。
DoD：打开 Step 2 入库的论文可流畅翻页缩放选词；重进应用回到上次页码。

**Step 4 · 设置与 AI 接入层（key 已备于 .env）**
设置页（AI 三项 + 连接测试 + 代理开关 + 主题）；ai.ts：非流式/流式 chat、SSE 解析、错误分类提示（401/超时/CORS）；.env 默认值注入与运行时覆盖；用 .env 中的 key 实测连通。
DoD：连接测试通过（真实 key）；流式 demo 文本逐字出现；断网/错 key 有可读错误提示。

**Step 5 · 摘要与四要素提取**
提示词（schema 见 §4.4）→ 流式渲染到提取卡（研究问题/方法/实验/贡献 四卡，编号一二三四，每卡带 P.x 出处）；结果缓存 + 重新生成。
DoD：对 test/ 论文一键提取成功；JSON 容错路径可用；二次打开读缓存不再调用。

**Step 6 · 伴读问答**
聊天 UI（原型问答 tab 样式）；per-paper 会话历史持久化；上下文组装（题录+摘要+选中段落+近 N 轮）；提示词要求回答带 `[P.x]` 引用（本步先展示为可读文本，跳转交互在 Step 9）。
DoD：连续多轮问答上下文连贯；会话刷新不丢；流式输出。

**Step 7 · 笔记**
选中文本 →「记笔记」→ 预填引文 + 页码锚点；笔记面板（列表/编辑/删除）；点击笔记跳回原页并 flash 高亮引文。
DoD：笔记增删改查 + 跳转定位全通；无选中也可建全局笔记。

**Step 8 · MVP 收尾**
书架筛选（状态/标签）、评分、空状态与加载骨架、基础快捷键（←/→ 翻页、Ctrl K 聚焦搜索）、全量 Playwright 回归。
DoD：MVP 全功能回归通过；**用 test/ 文件夹 2~3 篇（含中文那篇）人工冒烟**。

### Phase V2

**Step 9 · 引用定位跳转**：解析 AI 回答中的 `[P.x]` → 点击跳页 + 文本层匹配高亮 flash（匹配失败降级为仅跳页）。DoD：问答与提取卡出处均可一键跳转。
**Step 10 · 公式解释**：选中含公式文本 → KaTeX 尝试渲染 + AI 逐符号解释；公式旁「请 AI 解释」入口（原型 √dk 模式）。DoD：test 论文中公式可渲染并出解释。
**Step 11 · 图表解释**：框选页面区域 → canvas 截图 → image_url 视觉调用 → 解读卡片（图注 + 数据要点）。DoD：对含图表页实测出结构化解读。
**Step 12 · 精读卡片导出 + 全文搜索**：四要素+摘要+笔记合成 Markdown 精读卡片（用户示例格式）下载/复制；跨文献关键词检索 → 结果列表 → 跳转定位。DoD：导出文件格式正确；搜索能命中并跳转。

### Phase V3

**Step 13 · 文献对比矩阵**：选 2~4 篇 → 问题/方法/数据集/指标/结论 维度表（AI 辅助填格子，可手改），导出 Markdown 表格。
**Step 14 · 术语表与符号表**：AI 提取术语/符号+释义，卡片列表，点击回原文。
**Step 15 · Anki 导出**：精读卡/术语 → Anki（正面问题/背面要点）TSV/牌组文本导出。
**Step 16 · 引用格式 + 备份 + 暗色打磨**：APA / GB-T 7714 引文生成（复制）；全量数据 JSON 导出/导入；暗色模式细节校对。
DoD：各功能实测通过 + 全量回归。

**最终验收（所有 Step 完成后）**
用 `test/` 文件夹实测：**7 篇中选取若干篇，其中中文论文《基于扩散过程的生成对抗网络图像修复算法》必须入选，其余随意**；覆盖上传→提取→问答→定位→笔记→公式/图表解释→导出全链路，中文论文重点验证文本提取与定位质量。

## 8. 风险与对策

| 风险 | 对策 |
|---|---|
| TokenRhythm CORS 拦截 | dev proxy `/ai` 兜底（§4.4），设置页可切换 |
| AI 结构化输出不稳 | JSON 容错解析 + 一次重试 + 纯文本降级 |
| 大 PDF（几百页）卡顿 | 逐页懒解析文本、按需渲染、分片缓存 pageTexts |
| 扫描版 PDF 无文本层 | 检测空文本层并明确提示「不支持 OCR」；阅读不受影响 |
| 中文论文文本层质量差（断词/空格/换行） | 文本归一化（去多余空白、连字）；中文篇为最终验收必测项 |
| GSAP 动画冻结 | §3.4 安全封装强制执行 + Playwright 断言 |
| IndexedDB 误用挂起 | 统一 db.ts 封装（区分 request/transaction） |
| key 泄露 | .env 进 .gitignore；设置页 key 存本机 IndexedDB；不入任何导出文件 |
| pdfjs worker 加载失败 | 用 npm worker 资产 + Vite 显式配置，不走 CDN |

## 9. 工作方式约定

1. 严格按 Step 顺序；每步完成即自检该步 DoD（Playwright 断言 + 人工核对），通过后直接进下一步；全部完成后向用户统一总结（2026-10-25 用户授权，不再逐步简报）。
2. 代码直接写在仓库根（2026-10-25 变更：不建 paper-assistant/ 子目录），与 `design-proposals/`、`test/` 平级。
3. `test/` 文件夹**只读**：7 篇论文仅用于最终验收测试，开发期间不移动不改名。
4. AI key 已于 2026-10-25 由用户提供（存仓库根 `.env`，已在 .gitignore，永不提交）。
5. 视觉实现以 `design-proposals/proposal-a.html` 为基准；偏差由开发者自主决定（2026-10-25 用户授权），无需征得同意。
6. 每完成一个 Step 做一次 git 提交（仓库已由用户初始化），提交信息注明 Step 号与要点。
