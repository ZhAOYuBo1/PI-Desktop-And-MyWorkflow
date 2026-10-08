# CodePIddy 客户端 UI 改版：任务记录

> **这个文件是唯一的进度真相。** 上下文被压缩或换新会话后，按下面「如何续接」走一遍再动手。

## 如何续接（压缩后先读这里）

1. 读 [PRODUCT.md](../../PRODUCT.md)（定位、边界、反参考）→ [DESIGN.md](../../DESIGN.md)（配色、字体、层次、组件规则）→ [ui-component-rules.md](./ui-component-rules.md)（统一组件规则）→ [reference-pi-desktop.md](./reference-pi-desktop.md)（主参考项目拆解）→ [reference-dsh-effort-dial.md](./reference-dsh-effort-dial.md)（思考强度波场拆解）→ [reference-dsh-workbench.md](./reference-dsh-workbench.md)（工作区文件管理参考拆解）→ [pi-1.0.1-feature-audit.md](./pi-1.0.1-feature-audit.md)（Pi 1.0.1 功能审计和后续清单）。
2. 翻到本文件底部「进度日志」，读最后一条，确认上一批做到哪、验证到什么程度。
3. 恢复环境：
   - 依赖已装过，需要时 `npm install --ignore-scripts`
   - 构建 `npm run build:codepiddy`
   - 静态检查 `npm run check`，renderer 类型检查 `npm run typecheck --workspace=@codepiddy/desktop`
   - 视觉验证：在 `packages/codepiddy-desktop` 下跑 `npx vite --host 127.0.0.1 --port 5173`，浏览器打开 `http://127.0.0.1:5173/?demo=1`（必须带 `?demo=1` 才有演示数据）
   - 截图：Playwright + 已安装的 chromium（`npx playwright install chromium` 装过一次即可）
   - 真实客户端：`Start-Process node_modules\electron\dist\electron.exe -ArgumentList "." -WorkingDirectory packages\codepiddy-desktop`
4. 改完必须跑 `npm run check` + `npm run build:codepiddy`，需要时截图比对。
5. UI 改完 build 通过后**直接重启客户端**（关掉现有 electron 进程，再 `Start-Process node_modules\electron\dist\electron.exe -ArgumentList "." -WorkingDirectory packages/codepiddy-desktop`），不用再问用户。

截图和 `node_modules` 一样在 `.artifacts/` 里，**已被 gitignore**，只在当前机器上存在，重新克隆后需要重跑一遍才能复现。

### 历史恢复提示词（已被下方最新提示词替代，不要直接使用）

```text
继续 CodePIddy 客户端开发。先读 docs/design/redesign-plan.md（尤其「如何续接」「当前状态」「进度日志」最后三条和「待办清单」），
再读 PRODUCT.md、DESIGN.md、docs/design/ui-component-rules.md、docs/design/pi-1.0.1-feature-audit.md、docs/design/reference-dsh-workbench.md。
批次 1-67 已提交到本地 `main`；批次 63 代码提交 `8a9231079`，支线 64 代码提交 `293c6a5e2`，
批次 65 工作区文件工作台增强代码提交 `66f6bbe18`，支线 66 文件操作撤销栈代码提交 `a1a2c0870`，
批次 67 代码提交 `3db8f6a37`。当前 HEAD 以 `git log -1` 为准，文档整理提交紧随代码提交之后。
`origin/main` 仍为 `29feb195e`，尚未推送。
批次 58 Cache Warming 提交 `c17b64abf`，批次 59 缓存预热云朵图标提交 `6640bc795`，
批次 60 上下文压缩提交 `db4e91195`，批次 61 Codemode 与 Provider 模型刷新提交 `ec4dde669`，
批次 62 工具设置与 MCP 自动刷新提交 `6815fc026`，批次 63 Prompt 模板提交 `8a9231079`。
批次 63 新增设置页「Agent > Prompt 模板」；支线 64-66 已完成工作区文件工作台、语法高亮、
标签排序、文件拖入输入框、`@` 菜单键盘导航、文件操作撤销栈和隐藏回收目录。不要重做。
阶段 3 已全部完成；阶段 4 第 24-29 项 Cache Warming、上下文压缩、Codemode、Tool Search / Tool Exposure、
Prompt Templates、Pi Packages 都已实现。批次 67 已新增设置页「Agent > Pi Packages」，
通过 runtime bundle 导出的 `DefaultPackageManager` helper 完成列表、安装、更新、移除、更新检查和错误诊断；
`pi list` 没有 JSON，不作为唯一数据源；客户端不调用裸 `pi update` 更新 Pi 自身。
内置 Pi runtime 现在是完整 canonical package root，更新 Pi 时使用官方完整 npm 包结构；
`npm run update:pi-runtime -- <version>` 可同步更新内置 runtime。命令菜单读取真实
`dist/core/slash-commands.js` 描述；package skills / prompts 已合并进 Agent Skills / Prompt 模板页。
Pi Packages 和 runtime 更新仍待验收；批次 68 已完成客户端边界清理。
Pi Packages 可包含 extensions / skills / prompts / themes。当前 Agent 启动继续使用
`--no-extensions`，显式加载 builtin:mcp / builtin:codemode / builtin:tool-search 和 CodePIddy
自己的 review / retry / cache-warming 扩展；第三方 package extension 默认隔离，
但 Pi Package 页面可按包显式开启。开启后 Agent 启动会解析对应 package extension 并作为
`--extension` 加载；skills / prompts / themes 的资源状态单独显示。
统一组件规则：临时消息只走 `SettingsToast`；持久内联状态只走 `StateBlock`；复选框只走 `SettingsCheckbox`；弹层只走 `ModalShell`。不要再新增第二套实现，详见 docs/design/ui-component-rules.md。
字体、圆角、输入区叠层、app icon、空态/错误态/加载态、运行反馈、用户选定流星、思考强度波场、
会话树、工作区面板、变更历史、内部终端、设置分区、MCP / Provider 配置、Agent 会话新建 / 切换 / 删除、
会话 Fork、快速定位条、诊断包、上下文压缩、Codemode、Prompt 模板、工作区文件工作台和统一组件规则
都已实现，不要重做。文件搜索和终端多标签已取消，不再推进。
Pi core 可更新，禁止改 packages/coding-agent；外壳增强走 Pi 的扩展点（tool_call / tool_result / agent_before_settle）或 packages/codepiddy-desktop 自己的 main / renderer。
UI 改完 build 通过后自动重启客户端，不用询问用户。
当前 HEAD 以 `git log -1` 为准。

仓库在 E:\mypi，依赖已装好。改完必须跑：
  npm run check
  npm run typecheck --workspace=@codepiddy/desktop
  npm run build:codepiddy

要看效果：cd packages/codepiddy-desktop && npx vite --host 127.0.0.1 --port 5173，
浏览器开 http://127.0.0.1:5173/?demo=1（必须带 ?demo=1），用 Playwright 截图自查。
真实客户端：先 build，再 Start-Process node_modules\electron\dist\electron.exe -ArgumentList "." -WorkingDirectory packages\codepiddy-desktop。
```

### 最新恢复提示词（压缩后直接发这一段）

```text
继续 CodePIddy 客户端开发。先读 docs/design/redesign-plan.md（尤其「如何续接」「当前状态」
里的「客户端边界清理」「Provider 配置正确性与无损保存」「进度日志」最后三条和「待办清单」），
再读 PRODUCT.md、DESIGN.md、
docs/design/ui-component-rules.md、docs/design/pi-1.0.1-feature-audit.md、docs/design/reference-dsh-workbench.md。

批次 1-71 已实现并验收；批次 68 提交为 `65607e721`，批次 69 Shell aliases 代码提交为
`cab6fa4ff`，批次 70 Telemetry 代码提交为 `cc55936ec`，批次 71 Provider 配置正确性与
无损保存代码提交为 `e46d0010e`。交接文档提交紧随其后。
当前 HEAD 以 `git log -1` 为准；`origin/main` 仍为 `29feb195e`，
本地领先数量以 `git rev-list --count origin/main..HEAD` 为准（交接提交后应为 24），尚未推送。工作树应干净；
不要恢复已删除的 permission / Tavily 专用实现。

批次 68 已完成客户端边界清理：
1. 删除 `@codepiddy/permission-extension`、Tavily `web_search` 自建 MCP、
   `@codepiddy/provider-extension` 和 `@codepiddy/role-guard-extension`。
2. Agent 启动显式扩展列表只保留 `review` / `retry` / `cache-warming`。
3. 保留内置 Agent Skills、角色提示词注入和角色 Skill 分配。
4. `llama.cpp` 桌面管理器和 `/share` helper 已完成审计：Pi 1.0.1 的公开 SDK 导出里没有
   `LlamaClient`、`shareSession` 或对应 RPC；GUI 暂时保留，不继续扩展，也不搬 core 源码。

阶段 3 已全部完成；阶段 4 第 24-33 项 Cache Warming、上下文压缩、Codemode、
Tool Search / Tool Exposure、Prompt Templates、Pi Packages、Shell command prefix、
Telemetry 和静态自定义 Provider 无损配置都已实现。
Pi Packages 和 runtime 更新仍待验收；批次 68 边界清理已验收提交。
批次 69 已实现 Shell aliases（审计文档第 31 项；旧计划里的第 30 项）：
1. 客户端 UI / IPC 只读写 Pi 原生 `settings.json` 的 `shellCommandPrefix`，
   不另建 alias 列表或第二套 shell 系统。
2. 设置在「常规 > Shell」，使用多行文本；空字符串表示清除字段，错误走 `StateBlock`，
   保存反馈走 `SettingsToast`。
3. 合并写 settings.json；空闲 Agent 自动重连，运行中 Agent 延后生效。
4. 单测覆盖合并写入、清除字段、保留其他 settings 和 NUL 输入。

批次 70 已实现 Telemetry 设置：设置页「常规 > Telemetry」控制 Pi 原生
`enableInstallTelemetry`，显示 `PI_TELEMETRY` 覆盖后的实际生效状态；默认开启，不提供
`enableAnalytics` / `trackingId` 假开关。保存后空闲 Agent 自动重连，单测 5 项通过。

批次 71 已完成并提交：
1. Provider / Model / ModelOverride 类型对齐 Pi 1.0.1 `models.json` schema，保留未知字段。
2. `AppSettingsStore` 改为按字段补丁写回，不再用 UI 已知字段重建 Provider / models 数组。
3. 支持 Provider 级 `headers / authHeader / compat / modelOverrides`，以及模型级
   `api / baseUrl / thinkingLevelMap / inputLimits / cost / promptCache / samplingParams /
   headers / compat`。
4. 复杂嵌套字段使用受控高级 JSON；已知基础字段单独编辑，模型改 ID 时按 `originalId`
   找回原对象并保留未知字段。
5. API 类型统一使用 `SelectMenu`；支持 Pi 其他静态 API，并提供明确的“自定义 API”输入路径。
6. 单测覆盖未知字段保留、嵌套合并、字段删除、非法输入和模型重命名；`npm run check`、
   desktop typecheck、`npm run build:codepiddy` 和 demo 截图均已通过。

下一轮实现批次 72：特殊模型只读目录。不要让客户端继续猜 `models.json` 类型：
1. 由 Agent 进程 extension 读取 `modelRegistry.getAllModels()`，生成客户端可读快照。
2. 只读展示 chat / virtual / classifier / image、来源和可用性；RPC `get_available_models`
   不返回 classifier / image，不能作为唯一数据源。
3. 不恢复已删除的 `@codepiddy/provider-extension`，不自动加载第三方 extension。
4. 不给 `models.json` 添加无效的 image / classifier 类型开关，不做无代码虚拟模型路由编排器。
5. 复用 `StateBlock` / `SettingsToast` / `SelectMenu`，不新增第二套状态或下拉组件。

统一组件规则：临时消息只走 `SettingsToast`；持久内联状态只走 `StateBlock`；
复选框只走 `SettingsCheckbox`；弹层只走 `ModalShell`。不要再新增第二套实现。
字体、圆角、输入区叠层、app icon、空态/错误态/加载态、运行反馈、用户选定流星、
思考强度波场、会话树、工作区面板、变更历史、内部终端、设置分区、MCP / Provider 配置、
Agent 会话新建 / 切换 / 删除、会话 Fork、快速定位条、诊断包、上下文压缩、Codemode、
Prompt 模板、工作区文件工作台和统一组件规则都已实现，不要重做。
文件搜索和终端多标签已取消，不再推进。

Pi core 可更新，禁止改 `packages/coding-agent`；外壳增强走 Pi 扩展点或
`packages/codepiddy-desktop` 的 main / renderer / preload。
UI 改完 build 通过后自动重启 Electron，不用询问用户。

仓库在 E:\mypi，依赖已装好。改完必须跑：
  npm run check
  npm run typecheck --workspace=@codepiddy/desktop
  npm run build:codepiddy

要看效果：cd packages/codepiddy-desktop && npx vite --host 127.0.0.1 --port 5173，
浏览器开 http://127.0.0.1:5173/?demo=1（必须带 ?demo=1），用 Playwright 截图自查。
真实客户端：先 build，再自动重启 Electron。
```

**容易踩的坑**

- `npm run check` 内部会跑 `biome check --write`，它会重排格式，diff 变大是正常的，不是改错了。
- renderer 的类型检查**不在**根 `tsgo` 范围内，必须单独跑 `npm run typecheck --workspace=@codepiddy/desktop`。
- demo 模式没有 IPC，文件树只会显示「目录读取失败」；要看文件面板必须开真实项目。
- `.artifacts/` 是 gitignored，截图和中间产物只在本机存在；字体和 app icon 的生成流程已经写入本文件。
- 会话 UI 历史必须读 Pi `get_entries`；`get_messages` 是 compact 后的 LLM 上下文，不能用来展示历史。

## 目标

把 CodePIddy 桌面客户端从「一眼 AI 生成」改成**克制、有层次、浅色的专业桌面工具**，设计语言参考 PI-Desktop（见 [reference-pi-desktop.md](./reference-pi-desktop.md)）。

## 范围

- 主体改 `packages/codepiddy-desktop/src/renderer/`（样式、图标、组件呈现）。
- 需要时改外壳自己的 `packages/codepiddy-desktop/src/main` / `preload`、`packages/codepiddy-shared`、`packages/codepiddy-core`，以及独立的 `packages/codepiddy-*-extension`。
- **不改 Pi core（`packages/coding-agent`）**。Pi 可以更新，所有增强必须走它提供的扩展点（`tool_call` / `tool_result` / `tool_execution_*` 等）。
- 不引入 Tailwind 或第二套框架，沿用现有 Vite + React + 单个 `styles.css` 的组织方式，必要时拆成多个 CSS 分片。

## 当前状态（2026-10-08 批次 71 已验收，下一项特殊模型只读目录）

### 客户端边界清理（批次 68 已验收并提交 `65607e721`）

- 保留的自研扩展功能：`review` 变更 diff、`retry` 网关并发错误兜底、
  `cache-warming` 决策状态桥、内置 Agent Skills、角色提示词注入和角色 Skill 分配。
- 删除的非原生功能：`@codepiddy/permission-extension`、Tavily `web_search` 自建 MCP、
  `@codepiddy/tavily-search-mcp`、未加载的 `@codepiddy/provider-extension` 和
  `@codepiddy/role-guard-extension`。
- 删除范围包括 Tavily 专用设置、自动写入 `mcp.json` 的 `web_search` 条目、
  `TAVILY_API_KEY` 注入和角色提示词里的 Web Search Contract；web search 若仍需要，
  由用户在通用 MCP 页面自行配置。
- `llama.cpp` 桌面管理器和 `/share` helper 目前重复实现了 Pi core 已有能力。
  审计结论是 Pi 1.0.1 公开导出和 RPC 都没有可复用入口，因此本轮只保留现有 GUI / 配置适配，
  不继续复制 core 内部实现；后续 Pi 暴露 SDK / RPC 时再迁移。
- Agent 启动的 `--no-extensions` 仍用于隔离第三方扩展；显式列表在清理后只保留
  `review`、`retry`、`cache-warming`。清理 permission 后不要恢复第二套权限协议，
  也不要再特判 `pi-subagents`。
- 上一轮尝试加入的 `subagents.defaultExtensions` / permission forwarding 兼容补丁已被否决并撤销，
  不要再恢复。
- 批次 68 已删除四个客户端包及 `permission` / Tavily 专用 IPC、设置、构建入口和环境变量。

- 批次 69 已实现并提交「常规 > Shell」的 `shellCommandPrefix`：使用多行文本框读写 Pi 原生
  `settings.json`，保留其他设置字段，空值删除字段，拒绝 NUL 输入；保存后空闲 Agent
  自动重连，运行中 Agent 延后生效。Shell 页面现在同时包含 bash 可执行文件和命令前缀。

- 批次 70 已实现并提交 Telemetry 设置 `cc55936ec`：设置页「常规 > Telemetry」控制 Pi 原生
  `enableInstallTelemetry`，显示 `PI_TELEMETRY` 覆盖后的实际生效状态；默认开启，
  `enableAnalytics` / `trackingId` 没有实际消费方，不提供假开关。单测 5 项通过。

- 批次 71 已完成 Provider 配置正确性与无损保存，代码提交 `e46d0010e`：
  - Provider / Model / ModelOverride 类型对齐 Pi 1.0.1 `models.json` schema，未知字段保留。
  - `AppSettingsStore` 按字段补丁写回，不再用 UI 已知字段重建 Provider / `models` 数组；
    模型改 ID 时按 `originalId` 找回原对象。
  - 支持 Provider 级 `headers / authHeader / compat / modelOverrides`，以及模型级
    `api / baseUrl / thinkingLevelMap / inputLimits / cost / promptCache / samplingParams /
    headers / compat`。
  - 复杂字段使用受控高级 JSON；API 下拉统一使用 `SelectMenu`，同时支持明确的“自定义 API”
    输入路径，不再限制为四种 API。
  - 单测覆盖未知字段保留、嵌套合并、字段删除、非法输入和模型重命名；`npm run check`、
    desktop typecheck、`npm run build:codepiddy`、demo 截图和真实 Electron 重启均通过。
- 特殊模型目录尚未实现，作为批次 72：
  - 自定义认证、协议、动态发现和流式实现仍必须使用 Provider extension。
  - 虚拟模型只能通过 extension / SDK `registerVirtualModel()` 注册，不能写进 `models.json`。
  - 内置 classifier / image 通过 Codemode 使用；自定义 classifier / image 必须由 Provider
    extension 注册。`models.json` 中的 `type: "image"` 实测会被忽略。
  - RPC `get_available_models` 只返回 chat catalog；虚拟模型会出现，classifier / image 不出现。
  - 批次 72 由 Agent 进程 extension 读取 `modelRegistry.getAllModels()`，生成只读目录快照。

- 阶段 4 第 29 项 Pi Packages 已实现：设置页新增「Agent > Pi Packages」，读取用户级和项目级
  `packages`，显示来源、作用域、版本、安装路径、资源摘要和扩展开关；支持安装、移除、
  单包更新、刷新和更新检查。安装、移除、更新只调用 Pi package manager，不更新 Pi 运行时。
- Pi Package helper 使用固定 runtime bundle 的 `DefaultPackageManager` / `SettingsManager`，
  `pi list` 不参与数据读取。项目级操作要求项目已打开且受信任；项目未受信任时只显示用户级包。
- 第三方 package extension 默认不加载；每个含 extension 的包提供独立开关。开启时写入 Pi
  原生 package 过滤字段 `extensions: ["*"]`，关闭时写入 `extensions: []`。Agent 启动仍使用
  `--no-extensions`，只把已开启包的 extension 作为显式 `--extension` 传入。
- Agent Skills 页面会把 Pi package manager 解析出的 package skills 合并进目录，来源显示为
  `package`；它们可以像内置 / 用户 / 项目 Skill 一样按 Agent 角色分配。
- Prompt 模板页面会合并 package prompts，显示为只读“包模板”，支持插入输入框，但不允许在
  客户端编辑或删除；`/council`、`/parallel-review` 等模板现在可以在设置页看到。
- `packages/coding-agent-runtime` 现在是完整的 1.0.1 canonical package root，不再只有
  `dist/bundle`：根 `dist/index.js` 提供 SDK 入口，完整 1.0.1 SDK 提供
  `dist/core/slash-commands.js`，`node_modules` 提供 peer packages 和 `quickjs-wasi`。
- `npm run update:pi-runtime -- <version>` 可更新内置 runtime：自动替换 bundle、同步依赖和
  SDK alias、hydrate `node_modules` 并做完整性校验。桌面端 Pi 更新器仍安装官方完整 npm 包，
  并校验 SDK 入口、commands、host peers 和 `quickjs-wasi`；不完整时拒绝启用并保留当前版本。
- 内置命令菜单现在从真实 `dist/core/slash-commands.js` 读取 `/name`、`/session`、`/fork`、
  `/clone` 等说明，不再统一回退为“Pi 内置命令”。
- 验证：`npm run check`、desktop typecheck、`npm run build:codepiddy`、Pi Package helper 单测
  6 项（列表、校验、无副作用、用户级本地包安装 / 移除、开启 extension 后解析路径、
  package prompt 来源读取）、
  真实用户级包列表读取和 `?demo=1` 桌面 / 安装弹窗 / 窄窗截图检查通过；真实 Electron 已重启。
- 支线 64 已适配 `E:\mypi-refs\reference-dsh-plugin-workbench` 的文件工作台能力，详细拆解见 [reference-dsh-workbench.md](./reference-dsh-workbench.md)。
- 右侧「文件」视图从只读树和单文件预览升级为完整文件工作台：右键新建 / 重命名 / 删除 / 复制 / 剪切 / 粘贴、多选、拖拽移动、自动刷新、资源管理器定位、多标签编辑保存、Markdown / 图片预览、行号 / 换行、外部磁盘变更同步和 `@相对路径` 插入。
- 文件操作新增 core / main / preload 接口：读取元数据、写入、创建、重命名、删除、复制和资源管理器定位。所有写操作限制在项目根内，并对最近存在的祖先执行 `realpath` 校验；写操作会检查 Agent write lease。
- 文件标签和展开目录按项目保存在本地 `localStorage`；外部变更用 2.5 秒轮询元数据同步，有未保存草稿时只显示“磁盘内容已变化”，不自动覆盖。
- 批次 65 增加常见语言语法高亮、标签拖拽排序、文件树拖进聊天输入框、编辑器 Tab 插入制表符，并把 `@` 文件菜单的上下键选择 / 自动滚动 / 滚轮接管与 `/` 命令菜单对齐。
- 项目栏、对话区边界、右侧工作区和文件树 / 文件预览共用统一拖拽手柄；文件树宽度按项目保存，左侧项目栏手柄覆盖在毛玻璃边界上，不额外占布局宽度，蓝色悬停短条保留。
- 支线 66 已按参考项目补齐操作撤销栈：每个项目独立保存最近 30 条操作；删除、新建、重命名、复制、移动都记录为可撤销操作；删除使用隐藏 `.codepiddy-trash` 回收目录，撤销通过重命名恢复；回收目录从文件树和文件搜索中隐藏。
- 文件工作台工具栏新增撤销入口，文件树支持 `Ctrl/Cmd+Z`；撤销失败时恢复栈顶操作并用 `SettingsToast` 显示原因。未照搬参考项目的深色主题、emoji 图标、自定义滚动条和宿主布局补丁。
- 验证：`npm run check`、desktop typecheck、`npm run build:codepiddy`、工作区文件操作单测 5 项、Playwright mock 文件树 / 右键菜单 / 重命名弹窗 / Markdown 编辑保存和撤销流程检查通过；批次 65 另验证语法高亮、标签重排、文件拖入输入框、`@` 菜单滚动、编辑器 Tab 和三处手柄光标；真实 Electron 已重启。
- 批次 65 代码提交：`66f6bbe18 feat(desktop): polish workspace file workbench`；文档整理提交紧随其后。
- 批次 63 代码提交：`8a9231079 feat(desktop): add prompt template management`；文档整理提交紧随其后。
- 设置页新增「Agent > Prompt 模板」：管理用户模板 `~/.pi/agent/prompts/` 和项目模板 `.pi/prompts/`；支持新增、编辑、重命名、删除、打开目录，以及 `description`、`argument-hint` 和模板正文编辑。
- 模板名称即命令名：`review.md` 对应 `/review`。设置页的“使用”和“保存并插入”会把 `/模板名 ` 插入当前 Agent 输入框，已有草稿会作为参数接在模板命令后面。
- 模板文件保存或删除后，空闲 Agent 自动重连并重新拉取 `/` 命令菜单；运行中或等待授权的 Agent 不强制中断，只提示停止或重连后生效。
- `/name` 仍然是 Pi Session 重命名命令，和 Prompt 模板名称不是同一功能；不要把模板管理接到 `/name`。
- Prompt 模板完全由外壳文件接口实现，未修改 Pi core。验证：`npm run check`、desktop typecheck、`npm run build:codepiddy`、模板单测 4 项、`?demo=1` 桌面 / 窄窗 / 保存 / 插入检查通过；真实 Electron 已重启。
- 批次 62 代码提交：`6815fc026 feat(desktop): add tool settings and MCP refresh`；另一个 session 的 bugfix 提交：`c7174fadc fix(desktop): 修复会话名称重启覆盖与删除交互`。
- 设置页新增「常规 > 工具」：支持 Pi 原生 `settings.json` 的 `defaultTools`；默认集合为 `read / bash / edit / write`，勾选后切换为自定义集合，也可恢复 Pi 默认或清空内置工具。
- 未勾选的内置工具在 Agent 启动时额外通过 `--exclude-tools` 从工具注册表排除，Codemode 也不能调用；扩展工具和 MCP 工具不受影响。这一条修复了“界面显示未启用，但 Codemode 仍能调用”的假生效问题。
- 「工具发现与曝光」只读汇总 MCP 服务级 `exposure` 和工具级 `toolExposure`，说明 `direct / deferred / codemode / hidden`；真正配置入口在「集成 > MCP 服务」，工具页不复制第二套设置。
- 工具设置保存后，空闲的当前 Agent 自动重连；MCP 服务保存、删除、项目覆盖、登录和退出后也会自动重连空闲 Agent；运行中或等待授权的 Agent 只提示停止或手动重连后生效。
- 验证：`npm run check`、desktop typecheck、`npm run build:codepiddy`、工具设置单测 5 项、`?demo=1` 桌面 / 窄窗截图与交互检查通过；真实 Electron 已重启。另一个 session 的会话名称 / 删除交互 bugfix 已随 `c7174fadc` 提交。
- 批次 61 提交：`ec4dde669 feat(desktop): add codemode settings and model refresh`。设置页新增「常规 > Codemode」，支持 Pi 原生 `settings.json` 的 `codemode.mode`（`on / only`）和 `codemode.inlineBudget`；转录流新增 Codemode 运行结果视图，显示脚本、工具调用、状态/耗时、错误、完整输出路径和结果。
- 批次 61 同时补齐 Provider 变更后的模型刷新：新增/删除自定义 Provider 后，空闲 Agent 自动重连并重新读取 `models.json`，同步常用模型范围和模型选择器；运行中 Agent 不强制中断，只提示停止或重连后生效。
- 另一个 session 已提交 `b3693adba fix(desktop): 修复失效 Session 导致 Pi 启动失败`、`7abba1aa1 feat(desktop): 新建会话支持预设名称和模型`，不要重做。
- 批次 60 提交：`db4e91195 feat(desktop): add context compaction settings`。设置页新增「常规 > 上下文压缩」，支持自动压缩开关、全局 `reserveTokens` / `keepRecentTokens`、分支摘要 `reserveTokens` / `skipPrompt`，以及按精确 `provider/modelId` 的 `modelOverrides`；写入 Pi 原生 `settings.json`，手动 `/compact` 保留。
- 批次 60 的单模型覆盖是全局压缩参数的补充：未覆盖模型继续使用全局值；搜索框复用统一 `SelectMenu`，空态复用 `StateBlock`。当前模型选择器的选中项是浅蓝底、蓝字、蓝色内描边，不要改成实心蓝。
- 批次 60 验证：`npm run check`、desktop typecheck、`npm run build:codepiddy`、设置读写单测 3 项、demo `?demo=1` 截图检查通过；真实 Electron 已重启。
- 另一个 session 已提交四个 bugfix：`fe973c826` 常用模型设置刷新保留草稿并修复整页跳动、`032505627` 消息按实际模型显示并区分定位条窗口内外、`4909d90dd` 定位条颜色区分刚滚入的刻度、`6592f46d0` 滚入刻度亮黄后回归蓝色。不要重做。
- 批次 59 提交：`6640bc795 fix(desktop): use cloud icon for cache warming`。缓存预热图标从 lucide `Zap` 换成 `Cloud`，设置导航和会话统计两处统一；同时修复 Provider 登录弹窗的嵌套滚动条，`.auth-modal .select-menu-list` 改为静态定位，避免外层滚动和列表底部被裁。
- 批次 58 新增客户端 Cache Warming 设置：设置页「常规 > 缓存预热」读写 Pi 原生 `settings.json` 的 `cacheWarming`（`off / streaming / idle`）和 `showCacheMissNotices`。修改写入配置文件，对新启动或重置后的 Agent 生效。
- 批次 58 新增 `@codepiddy/cache-warming-extension`：Pi 1.0.1 的 RPC 不返回 `session.cacheWarmingStatus`，扩展订阅 `cache_warming_decision`，把最近一次决策（warmCost / missCost / continuationProbability / expectedSavings / action）写入 `runtimeRoot/cache-warming/<agent>.json`。桌面端在会话统计里读取并显示模式、cache miss penalty、refresh cost、expected savings 和最近决策；没有决策时显示「尚无预热决策」。
- 缓存预热的状态是 Agent 级、不是 Session 级；Pi 未暴露实时 state / nextWarmAt / reason，客户端只展示最近一次决策的经济数据，不假装有完整实时状态。
- 批次 58 验证：`npm run check`、desktop typecheck、`npm run build:codepiddy`、设置读写单测 3 项、扩展状态文件单测 1 项、RPC smoke（加载 cache-warming 扩展）通过；demo `?demo=1` 截图检查设置卡片和会话统计面板。
- 批次 55 提交：`501be668a fix(desktop): 会话滚动定位与 compact 历史缺失修复`，随本次文档整理一起推送到 `origin/main`。提交包含常驻 Agent 转录面板、`get_entries` 完整历史、compact 前缀恢复、定位条用户消息标记和完整时间显示。
- Agent 切换现在是常驻 pane 显隐，不再把一个 `.transcript` 重指到不同 Agent；每个访问过的 Agent 自己保留滚动位置、DOM 和折叠状态，切走再切回不会回到中间位置。
- 界面历史改用 Pi `get_entries` 的完整 message 条目；`get_messages` 返回 compact 后的 LLM 上下文，压缩后会丢失前缀消息，不能作为 UI 历史源。
- Agent 激活、Session 切换、Fork、克隆、导入和进程启动都统一通过 `historyMessages()` 读取完整历史，compact 后前缀不会消失。
- 快速定位条只把用户消息作为定位节点，时间显示完整年月日时分，不再用压缩后的 assistant 上下文冒充历史。
- 批次 56 修复 `ModalShell` 输入框聚焦环下侧被裁切：`.modal-shell-body` 增加底部内边距，重命名会话等弹窗的蓝色焦点环完整显示；这是滚动容器的局部样式修复，不改变弹窗交互。
- 批次 57 提交：`52a05d8e0 fix(desktop): 定位条改为窗口式 20 条并支持滚轮翻页`。定位条仍保留全部用户消息索引，但一次最多渲染 20 条；滚轮上下翻窗口，当前高亮跑出窗口时自动平移，避免超长会话把左侧堆满。
- 批次 53 提交：`52a1da50f feat(desktop): add native session sharing and share settings`；批次 54 的代码和文档已提交。
- 批次 54 新增客户端原生诊断包导出：设置页“诊断”与 `/debug` 共用同一入口；导出前隐私确认；收集版本、系统环境、Agent / Session / Provider / MCP / trust 摘要、最近错误和日志；可选脱敏 Session JSONL；生成本地 ZIP，不上传。
- 统一组件规则已落盘：临时消息走 `SettingsToast`，持久状态走 `StateBlock`，复选框走 `SettingsCheckbox`，弹层走 `ModalShell`；完整规则见 [ui-component-rules.md](./ui-component-rules.md)。
- 所有复选框使用点已收口到 `SettingsCheckbox`；所有 App modal 使用点已收口到 `ModalShell`；App 临时 toast 已迁入 `SettingsToast`，全局错误和主要内联错误/加载状态已迁入 `StateBlock`。
- 阶段 3 前六项已客户端化：`/scoped-models` 变成“常用模型范围”，`/import` 使用原生文件选择器导入 JSONL，`/trust` 使用原生弹窗和 `trust.json`，`/session` 使用完整统计面板，`/name` 支持无参查询和会话树重命名，`/llama` 改为客户端原生 llama.cpp 管理页；均不新增必须手输的 `/` 命令。
- `/share`：会话树操作区和命令菜单都打开客户端原生分享弹窗；先显示隐私确认，再由主进程导出当前 Session HTML，优先尝试 Radius，未配置时通过本机 GitHub CLI 创建 secret gist，成功后可复制 viewer 链接或打开 Gist。
- 分享设置已从 Provider 页面拆出：设置页新增“集成 > 分享”，Radius 在此登录/退出并继续复用 Pi `auth.json`；GitHub CLI 在此检测路径、登录状态和版本，支持手动选择 `gh.exe` 并持久化到 CodePIddy `share.json`，不保存 GitHub Token。helper 优先使用用户配置的路径，其次检查 `CODEPIDDY_GH_PATH`、PATH 和标准安装目录。Radius 仍保留 Pi Provider 认证层，但不再出现在“Provider 与模型”的凭据列表和登录入口中。
- 分享设置使用正式品牌图标：`codepiddy-icons/radius.svg` 和 `codepiddy-icons/github-cli.svg`；根目录原始素材已移入设计源目录，不再保留重复文件。GitHub CLI 检测已删除 `D:\GitHubCLI` 机器特定路径。
- 分享会话弹窗移除了 `.modal` 与 `.session-tree-heading` 叠加造成的外层 padding，宽度从 560px 收到 520px，关闭按钮回到右侧 24px 安全边距；成功态高度也随内容收紧。
- llama.cpp：设置页新增专用管理分区，配置写入 Pi 原生 `auth.json`；通过 router HTTP API 读取状态和模型，支持加载、卸载、下载、Hugging Face GGUF 搜索、量化选择、进度事件和重新连接当前 Agent。未修改 Pi core，真实 router 端到端验证留待有本地服务时执行。
- 常用模型范围：设置页可启停、按 Provider 批量启停、排序；`enabledModelIds = null` 表示全部都是常用，模型选择器显示“常用模型”，部分选择时显示“常用模型 / 其他模型”，明确清空时才显示“全部模型”。底层继续写 Pi 原生 `settings.json` 的 `enabledModels`。
- JSONL 导入：会话树提供“导入会话”，校验 session 文件头、复制到当前 Agent 会话目录、处理同名冲突、切换并持久化选中 Session；取消导入不改变当前会话。
- 项目信任：打开/切换项目时读取 Pi 原生 trust 状态；只有项目存在需要信任的资源且没有已保存/继承决定时弹窗。可选择信任当前项目、信任父目录、不信任或稍后。决定写 `~/.pi/agent/trust.json`；设置页“项目信任”可查看和修改。
- Agent 启动不再无条件传 `--approve`，项目级 settings / extensions / skills / packages 现在真正由 `trust.json` 决定是否加载；CodePIddy 自己的显式扩展仍由 `--no-extensions` + 显式 `--extension` 加载。
- Session 统计：会话树和输入区上下文圆环可打开统计面板，显示 Session ID / 文件、消息数、工具调用与结果、Token 输入/输出/缓存、费用和上下文占用；数据来自 Pi RPC `get_session_stats`。
- Provider 登录搜索框和常用模型搜索框统一输入样式：内层 input 无边框/阴影，焦点环只画在外层容器，文字和占位符保持同一行。

- `styles.css` 4253 行，顶部是完整的 `--cp-*` 令牌层；旧玻璃层的死规则已删除，`rgb(255 255 255 / N%)` 只剩侧栏 sheen 两处。
- 间距令牌已建立：`--cp-space-micro` 到 `--cp-space-5xl`（2/4/6/8/12/16/24/32/40/48/64px）；组件间距声明已全部改用令牌。
- 字体：`Monaspace Argon` 负责拉丁/符号，`Maple Mono NF CN` 负责中文；只随包保留 Regular 400 和 SemiBold 600 两档 WOFF2。
- app icon：正式源是透明 SVG，PNG/ICO 由 `packages/codepiddy-desktop/scripts/render-icon.mjs` 从 SVG 生成；旧的彩色和图片底模已清理。
- 常规图标全部走 `lucide-react@1.48.0`；自定义矢量例外只保留品牌/用户素材：`codepiddy-icons/meteor.svg`、`codepiddy-icons/radius.svg`、`codepiddy-icons/github-cli.svg`。
- 外壳：边到边分区，没有圆角外框、没有描边、没有浮动卡片；层次靠四层底色（`#ffffff` / `#f8f8f9` / `#f2f2f4` / `#e8e8eb`）和材质，而不是靠框。
- 侧栏毛玻璃：Windows 用系统材质 `backgroundMaterial: "acrylic"`（build ≥ 22621）+ 45% tint + 上下 sheen；浏览器 demo 用渐变兜底。实现细节见批次 7。
- 配色分工：中性 chrome 打底 + 蓝色强调 `#2563eb`（只用于交互与选中）+ 三色语义（成功/警告/错误，淡底 + 同色文字，实心只给圆点与角标）。
- 字号：基线 13px，侧栏行 13px，内容区标题 14px，正文 14px，元信息 11-11.5px。
- 结构：`.transcript` 与输入框同属新的 `.conversation-column`，两者同宽（760px）同轴。
- 输入区：最小 46px，随内容自动增高，超过 240px 转内部滚动。
- 状态组件：空态、文件错误/不可预览、目录树与文件预览加载态、Provider 空态、全局错误横幅、流式等待态已统一到 `state-mark` / 状态说明体系。
- 运行状态：Agent 运行中反馈已从输入区移到转录流末尾，使用三点错峰缩放动画，不再用浮起胶囊或转圈。
- 流式统计：`⚡` 字体字符已移除，改为 12×12 内联 SVG，避免字体缺字时出现豆腐块。
- 思考强度：滑块改为轻量 canvas 波场，低档慢而疏、高档快而密，最高档有短促落点扫光；拖拽加入轻微磁吸。
- 会话树弹窗：标题与摘要合并成安静头部，节点按深度使用 token 缩进；当前节点使用蓝色淡底和半像素强调环，Fork 按钮在悬停/聚焦时出现；空态补齐状态标识和说明。
- 消息操作：用户消息的灰色气泡只包裹正文，`复制` 放在气泡外；每轮最终 AI 回复的 `复制` 旁边显示 `Fork`，从该轮对应用户消息的 Pi entryId 创建分支并把原消息填回输入框。
- 工作区面板：右侧从单一文件树升级为 `文件 / 更改 / 终端` 三视图；文件预览改为全宽切换；更改按文件分组并纵向堆叠为默认折叠的卡片，点开后原地显示该文件完整 diff，patch 由 `@codepiddy/review-extension` 在 Write / Edit 前后抓快照生成并写回 tool result，历史按项目 + 工作项持久化；终端通过最小 IPC 接入项目根目录 PowerShell，输出可选择复制并同步真实 `cwd`。
- 结构：旧玻璃层（`--cp-glass-*`、白色叠加、backdrop-filter 卡片）已整段删除，最终值合并进文件末尾的设计系统层；不再靠“后面再覆盖”维持外观。
- `.impeccable/design.json`：`DESIGN.md` 的 schemaVersion 2 sidecar，含 OKLCH tonal ramps、阴影/动效/断点、9 个可渲染组件和叙事规则。
- 内置终端：`xterm.js + node-pty` 真 PTY。右侧面板里是原生 shell，PSReadLine / Tab / Ctrl+C / vim / 选择复制全部由 shell 自己处理；shell、参数、字体、光标形状来自本机 Windows Terminal 的 `settings.json` 默认 profile（标准路径，不写死机器），ANSI 调色板按浅色背景重新取值。行式输入框、`TabExpansion2` helper、cwd marker 都已删除。
- README 已重写并补回截图（`docs/images/`）；截图由 `packages/codepiddy-desktop/scripts/capture-screenshots.mts` 生成，脚本自己造临时项目，不依赖本机真实项目。
- Pi 版本现状：当前机器实际运行 `1.0.1`，仓库内置运行时也已固定为 `1.0.1` bundle（`packages/coding-agent-runtime`）；build 只复制该固定目录，不联网、不自动升级。
- Pi 1.0.1 原生 MCP：`@earendil-works/pi-mcp` 已内置；客户端基础 MCP 已读写原生 `mcp.json`。`web_search` 已迁移为客户端维护的原生 MCP 条目，保留独立 Tavily 设置和加密 Key；旧的 `CODEPIDDY_TAVILY_MCP_ENTRY` 注入通道和 `codepiddy-tavily-tool-extension` 已删除。
- MCP 设置页已补齐原生行为字段：项目级 `.pi/mcp.json` override、`enabled`、`exposure`、`toolExposure`、`description`、`timeout`、OAuth 字段和 `auth.provider`；登录/退出走 Pi 原生 `mcp` 子命令，重连复用当前 Agent 进程重启。
- 客户端命令菜单支持 `/mcp`，打开设置页的 MCP 管理入口；运行状态通过 `pi mcp list --json` 包装读取，展示连接状态、工具数量和错误。
- Agent 启动保留 `--no-extensions` 隔离用户第三方 extension，同时显式加载 `builtin:mcp`、`builtin:codemode`、`builtin:tool-search` 和 CodePIddy 自己的 permission/review/retry 扩展。
- MCP、Provider、权限设置统一使用全局 `SettingsToast` 消息栈；成功和错误消息不再常驻或互相覆盖。
- 权限下拉改为统一浮层样式，选中项使用浅蓝底和勾选图标。
- Tavily Search 改为掩码密码字段，眼睛按钮按需解密显示；进入设置分区会刷新配置状态，重启后仍显示已配置。
- 完整功能审计、MCP 方案、缺失功能矩阵和分阶段任务清单见 [pi-1.0.1-feature-audit.md](./pi-1.0.1-feature-audit.md)。
- 客户端设置页 Provider 登录/退出已完成实现和隔离验证；不接入 `/login`、`/logout` 命令。Provider 设置页现在显示凭据来源（`auth.json` / `models.json` / 环境变量），只有 `auth.json` 来源显示退出登录；同一 Provider 被 `models.json` 覆盖时两边都有标记。
- 设置页和登录弹窗的所有下拉列表已统一为自定义 `SelectMenu`，列表最大高度受控，不再使用系统原生超长弹层。

### 本轮改动清单

- 已提交：`45c39bc feat(desktop): refresh client UI and remove stale test/docs`
- 已提交：`edcde8e feat(desktop): refine spacing typography and composer overlays`
- 已提交：`247abae fix(desktop): replace app icon with transparent vector assets`
- 已提交：`78ca5c0 feat(desktop): refine state feedback and effort dial`
- 已提交：`25a6023 docs(desktop): record effort dial acceptance`
- 已提交：`c34c20a feat(desktop): use selected lightning asset`
- 已提交：`4e4341c docs(desktop): record lightning asset acceptance`
- 已提交：`4473a98 feat(desktop): refine session tree modal`
- 已提交：`b2644f5 feat(desktop): add per-turn changes and terminal`（批次 19-20）
- 已提交：`b5e30b2 feat(desktop): use meteor stream icon`（批次 21）
- 已提交：`deb8d69 feat(desktop): mirror meteor stream icon`（批次 21）
- 已提交：`6b6b95b feat(desktop): consolidate stylesheet layers and add design sidecar`（批次 22）
- 已提交：`0c1f84c feat(desktop): embed a real PTY terminal`（批次 23-25）
- 已提交：`dd2c0fc docs: rewrite README and refresh screenshots`（批次 26）
- 已提交：`dc6c403 docs: record README push`（批次 26 文档）
- 已提交：`396006e feat(desktop): add review diffs, lazy terminal and collapsed work panel`（批次 27-29）
- 已提交：`f4a86c9 feat(desktop): move gateway retry policy out of Pi core`（批次 30）
- 已提交：`b6bb6c5 docs(desktop): record newest-Pi development stance`
- 已提交：批次 36 更改 diff 卡片堆叠
- 已提交：批次 37 用户消息级快捷 Fork
- 已提交：批次 38 Pi 1.0.1 固定内置版本、客户端 Provider 登录与统一 SelectMenu
- 已提交：批次 60 上下文压缩设置 `db4e91195`
- 已提交：批次 61 Codemode 设置与 Provider 模型刷新 `ec4dde669`
- 已提交：批次 62 工具设置与 MCP 自动刷新 `6815fc026`
- 已提交：批次 63 Prompt 模板管理 `8a9231079`
- 已提交：另一个 session 的会话名称重启覆盖与删除交互 bugfix `c7174fadc`
- 已提交：另一个 session 的定位条 / 常用模型 / 消息模型显示 bugfix：`fe973c826`、`032505627`、`4909d90dd`、`6592f46d0`

批次 1-71 已提交到本地 `main`，`origin/main` 尚未同步。详细过程见下方进度日志和 [pi-1.0.1-feature-audit.md](./pi-1.0.1-feature-audit.md)。

### 下一步

阶段 3 的 16-23 项已实现；阶段 4 第 24-33 项 Cache Warming、上下文压缩、Codemode、Tool Search / Tool Exposure、Prompt Templates、Pi Packages、Shell command prefix、Telemetry 和静态自定义 Provider 无损配置均已完成。支线 64-66 已完成工作区文件工作台。下一步进入 [pi-1.0.1-feature-audit.md](./pi-1.0.1-feature-audit.md) 阶段 4 第 34 项：

1. 由 Agent 进程 extension 读取 `modelRegistry.getAllModels()`。
2. 只读展示 chat / virtual / classifier / image、来源和可用性。
3. 不给 `models.json` 添加假 image / classifier 类型，不做无代码虚拟模型路由编排器。

继续遵守客户端优先原则：能通过 RPC、SDK、配置文件或外壳 helper 实现的功能，不强行做成 slash command；TUI-only 功能不复刻。

### 改版前的基线（历史记录，仅作对照）

- `styles.css` 2206 行；只有 9 个 `--cp-glass-*` 变量，其余是 261 个不同的裸 hex 值。
- 主色调「白色玻璃 + 灰绿」，层次靠玻璃拟态。
- 图标两套来源，线宽与视觉重量不统一。

## 阶段与清单

### 阶段 0：上下文与文档（进行中）

- [x] 拆解参考项目设计语言 → `reference-pi-desktop.md`
- [x] 建立本任务记录文件
- [x] 写 `PRODUCT.md`（2026-10-02：用户确认用户=普通开发者、个性=克制/精密/可信/简约、反参考=AI 味、无硬性无障碍要求按 AA 执行）
- [x] 写 `DESIGN.md`（2026-10-02：token 体系、配色、字体、圆角、动效全部落盘）
- [x] 确认视觉方向（2026-10-02：北极星=精密仪器台；中性底+强调蓝 `#2563eb`；色调分层；紧凑精密）

### 阶段 1：设计令牌

- [x] 建立灰阶 / 语义色 / 圆角 / 字号 / 行高 / 字重 / 动效时长 token（2026-10-02：`styles.css` 顶部 `--cp-*` 全量建立）
- [x] 9 个 `--cp-glass-*` 重映射为中性色调别名（去掉绿色调、内高光、模糊），引用点逐个迁移中
- [x] 把剩下的裸 hex 收敛到 token（2026-10-02 批次 5：501 处 → 59 处，261 个不同值 → 19 个）
- [x] 建立间距梯级并把 `gap / margin / padding / inset / 定位偏移` 全部改为 `--cp-space-*`（2026-10-02 批次 8）

### 阶段 2：图标系统

- [x] 选定统一图标源（2026-10-02：`lucide-react@1.48.0`，与应用依赖精确锁定）
- [x] 统一线宽 / 尺寸 / 视觉重量（24 网格、2px 描边、圆角端点，去掉手写的实心点缀）
- [x] 替换 `App.tsx` 内手写 path（33 个应用图标抽到 `components/app-icon.tsx`）
- [x] 替换工具卡图标（`components/tool-icons.tsx` 改为 lucide 映射）
- [x] 替换文件面板的手写 SVG 与 `›` 文本折叠符（`WorkPanel.tsx`）
- [x] 删除已无人引用的 `src/renderer/assets/icons/`（17 个 SVG，设计源保留在 `codepiddy-icons/`）
- [x] 恢复图标源文件（2026-10-02：`codepiddy-icons/` 32 个 SVG 已从 git 历史取回）

### 阶段 3：层次与质感

- [x] 侧栏 / 内容区底色分开（2026-10-02：侧栏 `#f2f2f4`、内容 `#ffffff`，选中项白底抬起）
- [x] 浮层去掉玻璃拟态（2026-10-02：modal / 菜单 / 卡片 / 输入区改实色 + 半像素描边 + 单层阴影）
- [x] 半像素描边铺到剩余组件（2026-10-02 批次 5：取色统一时一并完成）

### 阶段 4：组件逐个过

- [x] 会话列表 / 项目树（2026-10-02 批次 1+4：侧栏 rail 底色、选中行白底抬起、状态色走语义色）
- [x] 输入区与工具栏（2026-10-02：实色面板，控件无边框，发送键改强调色，停止键改中性底 + 红图标）
- [x] 消息气泡与工具卡（2026-10-02：气泡/代码块/终端/diff 改色调分层，正文 16px→14px）
- [x] 右侧工作区面板（2026-10-02 批次 19：文件 / 更改 / 终端三视图，已在真实 Electron 项目验证）
- [x] 设置页（2026-10-02：标题 24px→16px，卡片标题→14px，正文 12.5px，权限行压到 54px）
- [x] 空态 / 错误态 / 加载态（2026-10-02 批次 12：统一状态标识、说明文字、错误横幅与骨架加载）

### 阶段 5：验收

- [x] `npm run check` 通过（2026-10-02 批次 8 复跑）
- [x] `npm run typecheck --workspace=@codepiddy/desktop` 通过（2026-10-02 批次 8）
- [x] `npm run build:codepiddy` 通过（2026-10-02 批次 8 复跑）
- [x] 截图对比（2026-10-02：`.artifacts/ui-*.png`、`conv-*.png`、`spacing-*.png`，含 900px 窄窗）
- [x] 用户持续确认（批次 1-27 已验收）

## 进度日志

### 2026-10-02 批次 1：令牌层 + 外壳 + 会话区

改了 `packages/codepiddy-desktop/src/renderer/styles.css` 和 `src/main/index.ts`（后者同步窗口底色与标题栏 overlay 到 `#f2f2f4`）。

落地内容：

- 新增 `--cp-*` 令牌层（墨色阶、四层底色、描边、强调色、状态色、圆角、控件尺寸、两层阴影、动效）。
- 9 个 `--cp-glass-*` 改为中性色调别名，一次性去掉全站绿色调与内高光。
- 侧栏 `#f2f2f4` 与内容区 `#ffffff` 分离；选中行改白底 + 微投影（从侧栏抬起）。
- 按钮统一 28px/8px 圆角，取消悬停位移；主按钮改强调蓝。
- 输入框统一内嵌底 + 聚焦强调环，占位符统一 `#6e7075`。
- 浮层（modal / 各类菜单 / 设置卡 / 助手选择卡）去玻璃，改实色 + 单层浮起阴影。
- 输入区改实色面板；控件无边框；发送键强调色；停止键中性底 + 红图标。
- 消息气泡、代码块、终端、diff、thinking 块改色调分层；正文 16px → 14px。

验证：`npm run check` 通过，`npm run build:codepiddy` 通过，Electron 已用新构建重启。

待办：`DESIGN.md` 配套的 `.impeccable/design.json` sidecar 还没写（live 面板会回退到通用样式）。

### 2026-10-02 批次 2：图标系统 + 排版梯级 + 设置页

改了 `components/app-icon.tsx`（新）、`components/tool-icons.tsx`、`components/WorkPanel.tsx`、`App.tsx`、`styles.css`、`package.json`（新增 `lucide-react`）。

- 33 个应用图标 + 17 个工具图标全部换成 lucide，删除手写 path 表（App.tsx 少 288 行）。
- 文件面板的手写文件夹/文件 SVG 和 `›` 文本折叠符一并换掉，全仓已无手写 `<svg>`。
- JS bundle 从 342.23 kB 降到 339.80 kB（lucide 按需 tree-shake）。
- 排版收口：设置页标题 24px→16px、卡片标题→14px、正文→12.5px、元信息→11px；权限行从 62px→54px。
- 设置卡从「白底 + 浮起阴影」改成「白底 + 半像素描边」：它是随内容排布的分区，不是浮层。
- 右侧文件面板改安静内嵌底色，选中行白底抬起、图标转强调色。

验证：`npm run check`、`npm run typecheck --workspace=@codepiddy/desktop`、`npm run build:codepiddy` 全部通过；
截图 `.artifacts/ui-icons-v1.png`、`.artifacts/ui-settings-v2.png`。

已知未验证：文件树的行样式需要真实项目才能看到，demo 模式下 IPC 缺失，只显示「目录读取失败」。

### 2026-10-02 批次 3：输入框居中修复 + 强调色改蓝

用户反馈：输入框偏左；不喜欢绿色，偏好蓝色；希望小细节上有更显眼的强调色。

- **输入框偏左是批次 1 引入的回归。** 原规则是 `width: min(840px, calc(100% - 38px)); margin: 0 auto`，被我在迁移层覆盖成 `margin: 0 18px`，于是居中的 `auto` 没了、直接贴左边。
- 顺带修掉一个结构问题：`.transcript-stage` 是「转录 + 文件面板」的横向 flex，输入框是它的兄弟节点，所以在文件面板打开时输入框的轴心跟随整个 pane，而消息列的轴心跟随转录列——两者天然错位。现在把 `.transcript` 和输入框一起放进新的 `.conversation-column`（flex column），文件面板留在它右边，输入框和消息列同宽（760px）同轴。
- 实测：`.turn-group` 与 `.composer` 都是 left=318 / width=760 / center=698，完全对齐。
- 强调色从青绿 `#0f766e` 换成蓝 `#2563eb`（白底 5.2:1，配白字 5.2:1），悬停 `#1d4ed8`，浅底 `rgb(37 99 235 / 10%)`，聚焦环 26%。
- `DESIGN.md` 的 Colors 一节和 `The Ink-Not-Blue Rule` 同步改写为 `The Blue-Is-Action Rule`（蓝色只用于可交互与选中，不做装饰）。

验证：`npm run check`、desktop typecheck、`npm run build:codepiddy` 全绿；截图 `.artifacts/ui-composer-fix.png`。

### 2026-10-02 批次 4：语义色体系 + 字号基线

用户指出不要把界面做成全蓝，要按参考项目的**色彩分工**来，只是换成浅色。读参考项目后确认它的规则是：

1. 中性 chrome 承担绝大部分面积（四层底色 + 墨色阶）；
2. 一个强调色只负责交互与选中——参考里是墨色，我们按用户偏好用蓝 `#2563eb`；
3. 语义色只有三个（成功/警告/错误），统一用「`color-mix(色 14%, transparent)` 淡底 + 同色文字」的小徽章形式；
4. 实心语义色只给极小面积：圆点、未读角标；
5. 紫色只留给一种特殊语义（参考里是 planning 模式的图标脉冲）。

按这套改的内容（`styles.css` 迁移层）：

- 新增 vivid 变体令牌（`--cp-success-vivid` / `--cp-warning-vivid` / `--cp-danger-vivid`），只用于圆点与图标；文字一律用深色值保证对比度。
- 消息状态徽章、工具卡状态、活动指示（compaction/retry/waiting/reconnecting）、diff、系统消息、工具恢复提示、Pi 运行时警告/确认、权限错误、错误引导全部改成「淡底 + 同色文字」。
- 会话树当前项改用强调蓝淡底；会话摘要的高亮徽章改用琥珀。
- 未读角标、流式占位点、Pi 响应点用强调蓝实心（面积最小）。
- 字号基线：`body` 定为 13px。之前根字号是浏览器默认 16px，凡是没写 `font-size` 的（侧栏行、内容区标题）都跟着变 16px。实测侧栏行 16px→13px，内容区标题→14px，正文 14px，基线 13px。

验证：`npm run check`、`npm run build:codepiddy` 全绿；截图 `.artifacts/ui-semantic-v1.png`、`.artifacts/ui-type-v1.png`、`.artifacts/ui-narrow-900.png`。
窄窗（900px）实测消息列与输入框同为 578px、中心 583，对齐成立。

### 2026-10-02 批次 5：旧色值全量收敛到令牌

先按明度和彩度给 `styles.css` 里的 261 个不同色值分桶，再分两步机械替换（脚本跑完即删）：

1. **中性色按明度归令牌**：`lum ≤ 0.06 → --cp-ink`、`≤ 0.16 → --cp-ink-secondary`、`≤ 0.30 → --cp-ink-muted`、`≤ 0.55 → --cp-ink-faint`、`≤ 0.78 → --cp-surface-inset`、其余 `--cp-surface-secondary`。跳过 `--cp-*` 令牌定义行本身。替换 333 处。
2. **有彩度的按语义族归位**：旧绿系（文字/淡底/描边三组）分别归到 `--cp-accent` / `--cp-accent-soft` / `--cp-accent-ring`；旧红系归 `--cp-danger`，淡底归 `color-mix(--cp-danger 10%)`；旧琥珀系归 `--cp-warning`，淡底归 `color-mix(--cp-warning 12%)`。替换 107 处。
3. 旧绿调的阴影/悬停 `rgb()` 字面量（`rgb(118 126 118 / x%)` 一类共 27 处）统一转成 `rgb(23 24 26 / x%)`。

结果：

| 指标 | 改前 | 改后 |
| --- | --- | --- |
| 硬编码 hex 出现次数 | 501 | 59 |
| 不同 hex 值 | 261 | 19 |

剩下的 59 处基本就是 `:root` 里的令牌定义本身，加上 3 处强调色引用。

验证：`npm run check`、`npm run build:codepiddy` 全绿；截图 `.artifacts/conv-1-agent.png`、`conv-2-settings.png` 确认替换没有破坏界面。

遗留：`rgb(255 255 255 / N%)` 这类白色叠加还有约 100 处，是玻璃拟态时代的残留，目前大多已被迁移层覆盖成死代码。彻底删掉需要把被覆盖的旧规则整条移除，属于后续的结构清理，不影响当前观感。

### 2026-10-02 批次 6：拆掉圆角外框 + 侧栏毛玻璃 + 输入框自适应高度

用户插进来的三条反馈：每个区域都套着一个圆角框；左右两侧应该用同色系异化出层次、左侧要毛玻璃；输入框太矮、而且是固定高度，输入多行后上面的字看不见。

**圆角框的来源**：`styles.css` 里有一层玻璃布局（约 1645-1760 行）——`.app-shell` 带 `gap: 10px; padding: 10px` 和一层放射渐变底，`.sidebar` 与 `.main-pane` 各自是「1px 描边 + 16px 圆角 + 投影 + backdrop-filter」的卡片，`.sidebar-footer` 还补了 `border-radius: 0 0 16px 16px`。所以每个区域都浮成一个圆角卡片。

改法（迁移层）：

- `.app-shell` 去掉 padding 和 gap，改边到边；背景换成一层 200° 的冷灰渐变。
- `.sidebar` 去描边、去圆角、去投影，改成 `color-mix(rail 74%, transparent)` + `backdrop-filter: blur(26px) saturate(1.4)`——毛玻璃；`.app-shell` 那层渐变就是它能被感知到的底色。
- `.main-pane`、`.content-header` 全部改不透明底、无边框、无圆角。
- `.sidebar-footer` 对齐到 0。
- 设置卡、助手卡从「白底 + 半像素描边」改成纯色调分区，进一步减少框。
- `DESIGN.md` 新增 **The No-Frame Rule**，并把原来的 No-Glass 禁令改为 **Material-Not-Decoration Rule**（毛玻璃只允许出现在左侧导航一处，作为材质分区手段）。
- Windows overlay 的让位从 `padding-top: 42px` 改为 `34px`，与 34px 的标题栏对齐。

**输入框自适应**：`App.tsx` 新增 `composerInputRef` 和一段 `useLayoutEffect`——先把 `height` 归零再读 `scrollHeight`，最低 46px（约两行），超过 240px 转内部滚动；草稿为空时复位。

踩到一个坑：`.composer textarea` 基础规则里有 `flex: 1`，在 column flex 容器里解析成 `flex-basis: 0%`，会**直接盖掉内联的 height**，表现是内联样式写着 137px、实际渲染 46px、文字被裁掉。必须给 `.composer textarea` 加 `flex: none`。

实测：空草稿 46px；输入 5 行后 textarea 117px、输入区整体 165px，五行全部可见。

验证：`npm run check`、desktop typecheck、`npm run build:codepiddy` 全绿；实测外壳 `padding: 0 / gap: 0`、侧栏 `left: 0 / radius: 0 / backdrop-filter: blur(26px) saturate(1.4)`。
截图 `.artifacts/frame-1-agent.png`、`frame-2-grown.png`、`frame-3-final.png`。

### 2026-10-02 批次 7：侧栏毛玻璃改成真正的系统材质

用户反馈批次 6 的毛玻璃"没有透明、没有模糊"。原因是根因判断错了：`backdrop-filter` 只能模糊它**背后**的东西，而侧栏背后只有一层平滑渐变——模糊平滑渐变等于没模糊，所以视觉上完全看不出来。

读了参考项目后确认：**它的毛玻璃是 macOS 原生材质**（`apps/desktop/electron/main/bootstrap/window.ts:185` 的 `vibrancy: "sidebar"`），CSS 只在 `:root[data-platform="darwin"]` 下叠一层 tint + sheen（`chrome.css:433-445`）。**Windows/Linux 下参考项目用的是不透明底色，根本没有玻璃**。所以这不是 CSS 能补出来的，必须用系统材质。

实现（Windows 11 22H2+ 的 `backgroundMaterial: "acrylic"`）：

- `src/main/index.ts` 新增 `supportsWindowsBackgroundMaterial()`，按 `process.getSystemVersion()` 的 build 号判断（≥ 22621），不满足就完全走原来的不透明路径，不会把老系统搞黑。
- 支持时：`backgroundColor: "#00000000"` + `backgroundMaterial: "acrylic"`。
- `styles.css`：`.app-shell.windows-overlay` 和 `:root:has(.app-shell.windows-overlay)` 都要设成 `background: transparent`——**任何一层不透明底色都会把系统材质整个盖住**，这是最容易漏的一步。
- 侧栏按参考项目的配方重写：`background-color: color-mix(in oklab, var(--cp-surface-rail) 45%, transparent)`（参考是 55%，按用户要求再透一档）+ 上下两道 sheen（顶部白色 45% 渐隐到 220px、底部白色 30% 渐隐到 160px）+ `backdrop-filter: blur(30px) saturate(1.6)`。
- 浏览器 demo 没有 `windows-overlay` 类，保留渐变兜底，不受影响。

环境：本机 `CurrentBuild 26200`（满足 ≥22621），系统"透明效果"开关为开。

验证：用户确认毛玻璃效果正常。`npm run check`、desktop typecheck、`npm run build:codepiddy` 全绿。

注意：`CopyFromScreen` 这类 GDI 截屏抓不到 DWM 合成的材质，用截屏验证这个效果不可靠，只能靠肉眼。

### 2026-10-02 批次 8：间距节奏收敛

改了 `packages/codepiddy-desktop/src/renderer/styles.css` 和 `DESIGN.md`。

问题不是缺少间距，而是同一组件有两套几何值：例如 `.composer` 先写 `18px / 13px / 15px`，末尾迁移层再覆盖成 `56px / 12px / 10px`；`.sidebar`、`.settings-page`、`.settings-card` 也有同类历史叠加。直接改几个随手值只会继续叠补丁，所以先建立间距令牌，再做全文件收敛。

落地内容：

- 新增 `--cp-space-micro` 到 `--cp-space-5xl`：`2 / 4 / 6 / 8 / 12 / 16 / 24 / 32 / 40 / 48 / 64px`。`2px` 只用于光学微调，不作为常规布局间距。
- 用 codemod 替换全部间距声明：`gap / row-gap / column-gap / margin / padding / inset / top / right / bottom / left` 共替换 507 处裸 px 值。
- 归一规则：`7/9 -> 8`、`10/11/13/14 -> 12`、`15/18 -> 16`、`20/22/28 -> 24`、`31/34 -> 32`、`42 -> 40`、`52 -> 48`、`58 -> 64`；负值改成 `calc(-1 * var(--cp-space-*))`。
- `DESIGN.md` 新增 Spacing 一节和 **The Space-Ladder Rule**：组件 CSS 不得出现梯级之外的裸 px 间距。

扫描结果：间距声明里已无梯级外裸值；唯一命中的 `760px` 是消息列内容宽度，不是间距。impeccable 的 `detect.mjs --scope layout` 返回空集。

视觉验证：

- 1440x900：无横向溢出；侧栏 266px、内容头 56px、输入区 638px 宽并保持同轴。
- 输入 5 行后：输入区从 96px 增至 167px，自动增高没有回归。
- 900x700：无横向溢出；文件面板隐藏；输入区宽 578px、中心与转录列一致。
- 设置页和 grown composer 截图正常。

验证：`npm run check`、`npm run typecheck --workspace=@codepiddy/desktop`、`npm run build:codepiddy` 全绿。截图：`.artifacts/spacing-desktop.png`、`.artifacts/spacing-composer-grown.png`、`.artifacts/spacing-settings.png`、`.artifacts/spacing-narrow.png`。

### 2026-10-02 批次 9：修复「跳到最新消息」遮挡输入区

用户反馈：`跳到最新消息` 落到会话列底部，和输入区重合，盖住了右侧的思考强度控件。

根因：按钮是 `.conversation-column` 的直接子元素，但定位祖先实际是 `.transcript-stage`。`bottom: 12px` 因此按整个会话列计算，而输入区也在该列内，按钮自然落进输入区。

改法：

- `App.tsx` 新增 `.composer-shell`，把按钮和 `.composer` 包在同一容器。
- `.composer-shell` 设为 `position: relative`，按钮改成相对输入区定位。
- `.jump-to-latest` 用 `bottom: calc(100% + var(--cp-space-md))` 固定在输入区上方 12px；输入区随内容增高时按钮自动上移。
- 按钮右边缘与输入区对齐。

验证：默认输入区时按钮底边 780、输入区顶边 792；输入 5 行后按钮底边 709、输入区顶边 720；均保持约 12px 间距且不重叠。`npm run check`、desktop typecheck、`npm run build:codepiddy` 全绿。截图：`.artifacts/jump-fix-default.png`、`.artifacts/jump-fix-grown.png`。

### 2026-10-02 批次 10：字体配对 + 圆角统一

用户反馈：发送按钮在空输入和可发送状态之间会从圆形变成圆角方形；整体圆角偏方；当前系统字体不好看。素材目录是 `E:\mypi\maple` 和 `E:\mypi\monaspace`。

字体结论：

- `MonaspaceArgon` 只有 2,460 个字符，不含中文，适合作为拉丁/符号层。
- `MapleMono-NF-CN` 有 33,091 个字符，包含中文、中文标点和扩展字符，适合作为 CJK 层。
- 接入 `Monaspace Argon -> Maple Mono NF CN -> 系统回退`。只保留 Regular 400 和 SemiBold 600 两档，转成 WOFF2 后分别约 199 KB / 201 KB，以及 6.25 MB / 6.41 MB。
- 字体和 OFL 许可放在 `src/renderer/assets/fonts/`。原始 `maple/`、`monaspace/` 暂时保留，等用户检查确认后再删除未用文件。

圆角结论：

- 新梯级为 `6 / 8 / 10 / 12 / 18 / 24px / full`，所有组件硬编码圆角收敛到令牌。
- 发送、停止按钮统一为 `28px` 全圆；不再随 disabled/enabled 改变形状。
- 输入区圆角 18px，卡片 12px，小控件 6-10px。

浏览器验证：`document.fonts` 中 Monaspace 和 Maple 均为 `loaded`；发送与停止按钮的尺寸都是 28x28、圆角都是 9999px。`npm run check`、desktop typecheck、`npm run build:codepiddy` 全绿。截图：`.artifacts/font-radius-agent.png`、`.artifacts/font-radius-settings.png`。

### 2026-10-02 批次 11：app icon 透明矢量化

用户反馈：当前黑白 app icon 是图片直接放进 SVG 的，白色底板被烘进 PNG，出现明显的白色方块分层。

处理：

- 从黑白原图提取连通区域，保留主体外轮廓和中间的透明孔位，重新生成真正透明的 SVG path。
- 正式 SVG 使用 `#17181a` 作为图形色，不包含背景 rect，也不包含 base64 图片。
- `render-icon.mjs` 改为用 Playwright 渲染 SVG，生成 `1024/512/256/128/64/48/32/16` PNG，并直接写出多尺寸 ICO；不再依赖 Electron 的 nativeImage。
- `public/codepiddy-icon.png` 换成 256px 透明版本。
- 删除旧的彩色 v1/v2/v3、`codepiddy-icon-original.png` 和 `codepiddy-icon-generated-backup.png`。
- 空态里的 `.empty-mark.app-icon-mark` 去掉灰色底托、圆角和阴影，避免图标再被框成一块。

验证：新 SVG 通过 `svg_cli.py validate`；PNG 和 ICO 角落像素均为 `alpha=0`；没有白底方块。`npm run check`、desktop typecheck、`npm run build:codepiddy` 全绿。截图：`.artifacts/icon-appearance.png`、`.artifacts/codepiddy-icon-transparent-preview.png`。

### 2026-10-02 批次 12：空态 / 错误态 / 加载态

改了 `App.tsx`、`SlashCommandMenu.tsx`、`WorkPanel.tsx`、`styles.css`，并在 `DESIGN.md` 新增 Empty / Error / Loading States 规则。

落地内容：

- 新增统一 `state-mark`：40px 方形、12px 圆角、无外边框，用内底色和图标色区分中性、会话与错误状态。原有透明 app icon 不套底托。
- 项目未选择工作项、Agent Slot 未创建、会话无消息、设置页未发现 Skill 都增加对应状态标识和说明；会话空态使用蓝色轻底，表示下一步是输入。
- 文件树加载改为可被读屏识别的 `output` 状态行；目录空/错误分别使用中性点与错误红点。
- 文件预览加载改为四行骨架，不再显示一行“加载中”；文件读取失败与过大/二进制不可预览使用状态标识、标题和恢复说明。
- 全局错误横幅从实心红改为红色 9% 淡底 + 20% 半像素内描边 + 警告图标，正文保持可读性，错误色只落在图标、标题和关闭按钮附近。
- 常驻流式等待点补上“正在生成”说明；斜杠命令加载态补状态点与 `aria-live`。
- 所有新增状态动效都有 `prefers-reduced-motion` 降级。

视觉验证：

- 1440x900 无项目首页、项目无选中工作项、Agent 未创建空态。
- 1440x900 设置页 Skill 空态和文件管理器目录读取失败态。
- 900x700 窄窗无横向溢出。
- 截图：`.artifacts/state-before.png`、`state-empty-after.png`、`state-welcome.png`、`state-transcript-no-agent.png`、`state-provider-empty.png`、`state-narrow.png`。

验证：`npm run check`、`npm run typecheck --workspace=@codepiddy/desktop`、`npm run build:codepiddy` 全绿。

### 2026-10-02 批次 13：运行反馈移到转录流末尾

用户反馈：参考项目的回复运行状态直接贴在回复后面并有轻量动效；CodePIddy 当前是在输入区上方凸出一块，里面放转圈，视觉突兀。

读参考实现后确认差异：

- PI-Desktop 把 `WorkingIndicator` / `RunActivityIndicator` 放在转录内容的尾部 `transcript-runtime-status` 中，不在输入区。
- 它的动效是三个 4px 圆点，每个延迟 120ms，做 `scale(.8) → scale(1)` 和透明度变化；外层是普通状态文本行，不是胶囊、卡片或 spinner。

落地内容：

- `agent-activity` 从 `.composer-shell` 移到 `.transcript` 末尾，新增 `.transcript-runtime-status` 状态行。
- 删除旧 `.activity-spinner` 和旋转 keyframes，改为 `.activity-dots` 三点错峰缩放动画。
- 状态行与消息正文同宽、同轴，普通运行使用次墨色；压缩、重试、等待、重连仍保留各自的语义色。
- 排队数文案从 `queued` 改成“N 条排队”。
- 流式回复里的占位点复用同一套动画，两个运行状态不再像两套组件。
- demo 的 Coding Agent 增加运行中状态数据，方便后续视觉检查一直能看到该组件。
- `DESIGN.md` 新增 Running Indicator 规则。

验证：DOM 检查确认 `.agent-activity` 的 `insideTranscript=true`、`insideComposer=false`；截图 `.artifacts/activity-tail.png`、`activity-tail-frame-2.png` 显示两帧圆点动画不同，状态行位于回复末尾且与输入区分离。

### 2026-10-02 批次 14：流式统计闪电矢量化

用户反馈：token 速率前的 `⚡` 在当前字体中显示不出来，需要自己绘制。

处理：

- 用 `svg-precision-skill` 生成 12×12 实心闪电路径，输出设计源 `codepiddy-icons/lightning.svg`，并通过 `svg_cli.py validate`。此自绘版本已在批次 17 被用户选定素材替换。
- `stream-stats.ts` 只返回数值文本，不再拼接 `⚡`。
- `StreamStats.tsx` 新增内联 `StreamStatsGlyph`，使用 `currentColor` 和 `aria-hidden`；视觉图标与数值文本分离，读屏只读数值。
- 统计行改为右对齐 flex，闪电与文字间隔 4px；图标颜色使用次墨色，保证小尺寸下可见。
- demo 的 Coding Agent 补了终值统计，方便持续检查该组件。

验证：浏览器实测统计文本为 `25.0 tok/s · 150 tok / 6.0s`，闪电在 DOM 中为独立 SVG，实际尺寸 12×12，颜色 `rgb(74, 76, 80)`；截图 `.artifacts/lightning-ui.png`、`lightning-stats-crop.png`。

### 2026-10-02 批次 15：思考强度波场

用户要求参考 `https://github.com/WONGIII/dsh-effort-dial` 的思考强度滑块，但保持 CodePIddy 的浅色、克制风格。本地只读克隆在 `E:\mypi-refs\dsh-effort-dial`，审查版本 `39620be1a819f247078b83bfb88052a8f8d7d7fc`。拆解结论见 `docs/design/reference-dsh-effort-dial.md`，参考仓库验收后可删除。

落地内容：

- 新增 `ThinkingDialField.tsx`：弹层打开时 canvas 持续绘制从滑块向左行进的非对称波锋，并叠加少量流星。
- 场强随档位提高而增加；普通档位保持蓝灰色低强度，最高档混入少量紫色并触发一次约 1.9 秒的落点扫光。
- 轨道从 6px 提高到 14px，保持 16px 圆形滑块；蓝色填充只做场的底色，亮纹、颗粒和扫光由 canvas 负责。
- 拖拽改为连续位置状态，并加入 `magnetize`：经过档位时轻微拖住，离开后释放，`onChange` 仍只在落点提交。
- `prefers-reduced-motion` 下只绘制静态场；页面隐藏时停止 RAF。

验证：

- canvas 在 196×14 CSS 像素下正常绘制，非空 alpha 采样为 2253 个像素点。
- 中档为低亮蓝色纹理；最高档出现清晰的像素波场和落点光晕。
- 交互实测将档位拖到最右后成功提交为“极高”。
- `npm run check`、renderer 类型检查、`npm run build:codepiddy` 全绿。
- 截图：`.artifacts/thinking-dial-medium.png`、`thinking-dial-medium-track.png`、`thinking-dial-top.png`、`thinking-dial-top-track.png`。

### 2026-10-02 批次 16：思考强度轨道加大一档

用户反馈：滑块效果可以，但轨道太矮，不够圆润，需要适当加大。

- 轨道高度从 14px 调到 18px，滑块直径从 16px 调到 20px。
- 滑块继续只比轨道高出 2px，保持“落在轨道上”的关系，不变成一颗大球。
- 滑块位置、填充宽度和刻度锚点共用 `--thinking-thumb` / `--thinking-inset`，避免尺寸调整后不同轴。

用户已验收，轨道尺寸保留 18px / 20px。

### 2026-10-02 批次 17：替换用户选定闪电

用户提供根目录 `闪电.svg`，要求替换批次 14 的自绘闪电。

- `codepiddy-icons/lightning.svg` 已替换为用户的黄黑闪电源文件，保留原始 1024 viewBox、五条路径和配色。
- `StreamStatsGlyph` 同步改为内联同一组路径，缩放到 12×12px；统计文本仍保持纯数值。
- 浏览器实测闪电在 12px 下轮廓清晰，未出现糊边或缺字。

用户已验收，闪电替换随 `c34c20a feat(desktop): use selected lightning asset` 提交。

### 2026-10-02 批次 18：会话树弹窗收敛

改了 `App.tsx` 和 `styles.css`，没有改 IPC、数据模型或 Fork 行为。

- 标题、摘要和树列表改成同一个安静浮层头部：去掉两段独立底色带，摘要改为弱墨色元信息，运行/压缩状态保留小面积语义色。
- 节点缩进从内联 `marginLeft` 改为 `--session-depth` CSS 变量；桌面每级 16px，窄窗每级 12px。
- 节点图标改为 24px 轻量 rail；当前节点使用 `--cp-accent-soft` 淡底和 `--cp-accent-ring` 半像素内环，层级和选中关系更清楚。
- `user` / `assistant` 标签显示为“你” / “Pi”；Fork 按钮在 hover / focus-within 时出现，触屏下常显，按钮尺寸统一为 28px。
- 空态补齐 `state-mark`、标题和下一步说明；长文本保持两行截断，节点和 Fork 不横向溢出。

视觉验证：

- 1440x900：弹窗 780px，节点、当前态和 Fork 对齐，无横向溢出。
- 560x760：弹窗左右各留 24px，无横向溢出；时间戳在窄窗换行，不压住 Fork。
- 长文本：两行截断，Fork 不挤压正文。
- 空态：状态标识、标题和说明居中显示。

验证：`npm run check`、`npm run typecheck --workspace=@codepiddy/desktop`、`npm run build:codepiddy` 全绿。截图：`.artifacts/session-tree-hover.png`、`session-tree-long-text.png`、`session-tree-narrow.png`、`session-tree-empty.png`。

用户已验收，随 `4473a98 feat(desktop): refine session tree modal` 提交。

### 2026-10-02 批次 19：工作区面板多视图（待验收）

参考 `PI-Desktop` 的 `WorkPanel / FilesTab / ReviewTab`，但只落地宿主自有的三个视图，不复制插件体系，不新增 IPC 或数据模型。

改了：

- `WorkPanel.tsx`：顶部新增 `文件 / 更改 / 终端` 标签，文件预览从左右分栏改为整块面板切换；更改改为文件列表 + 完整 diff；终端改为内嵌 PowerShell 会话。
- `work-panel.ts`：复用并扩展既有 tool 投影，补齐路径推断、ANSI 清理、diff 行解析和 `+ / −` 统计。
- `styles.css`：工作面板改成 token 化标签、树行、全宽预览、文件级 diff 和终端；删除旧的重复迁移规则。
- `main/index.ts`、`preload/index.ts`、`shared/index.ts`：新增终端会话 IPC，工作目录固定为当前项目根，窗口销毁/关闭项目/退出应用时回收子进程。
- 变更历史：按项目 + 工作项写入客户端 localStorage，最近 80 条；兼容读取旧的 Agent 实例键。重启客户端或更新 Pi 核心后先显示持久化结果，再与当前会话的 live tool 事件按 ID 合并。
- 更改视图只取最新一轮（一条用户消息到该轮最后一条 AI 回复）；持久化键继续细分到 Agent 角色和轮次，旧的项目级记录会按轮次开始时间做一次迁移筛选。
- `App.tsx`：demo 数据补入 read/edit/bash 工具项，修复 demo 中滚动保存 UI 状态时的 IPC 缺失报错。
- `DESIGN.md` / `reference-pi-desktop.md`：记录工作区视图规则和参考项目拆解。

验证：

- 浏览器 demo：文件、更改、终端三视图切换正常；桌面 1440 无横向溢出，1160 窄窗仍可用。
- 真实 Electron：文件树可展开，`design.md` Markdown 预览正常；更改视图显示文件列表和绿色/红色行级 diff；终端启动 PowerShell 并成功执行 `Get-Location`，输出可选择复制，`cd` 后工作目录同步。
- `npm run check`、`npm run typecheck --workspace=@codepiddy/desktop`、`npm run build:codepiddy` 全绿。
- 截图：`.artifacts/work-panel-files.png`、`work-panel-changes.png`、`work-panel-terminal.png`、`work-panel-narrow.png`、`electron-work-panel-files.png`、`electron-work-panel-file-preview.png`、`electron-work-panel-changes.png`、`electron-work-panel-terminal.png`。

### 2026-10-03 批次 20：修正更改历史与终端交互

用户反馈：重启后更改历史仍可能丢失；某些 `edit` 记录显示为没有路径的“文件变更”；终端不能正常选择和复制，`cd` 后目录显示不同步。

根因与修改：

- Pi 当前 `edit` 参数使用 `file_path + edits[]`，旧投影只识别 `filePath/path + oldText/newText`，于是路径为空，并把成功提示误当成 diff。
- 现在优先从 `edits[].oldText/newText` 生成行级 diff；路径优先读 `file_path`，其次从成功提示的 `in <path>` 恢复。
- 读取历史 toolResult 时优先使用 `details.patch` / `details.diff`，因此升级前已经发生的编辑也能在重新加载会话后恢复真实 diff。
- 无法识别路径的记录不再进入“更改”列表；旧的无路径持久化记录会在加载时尝试恢复路径。
- 变更历史改为按`项目路径 + 工作项 ID`存储在客户端 localStorage，最近 80 条；旧的 Agent 实例键只作为迁移回退。Pi 核心和会话数据格式都没有被修改。
- 内部终端输出改为可选择复制的只读文本区；每次命令后用壳子侧的标记读取真实 `PowerShell` 工作目录并更新提示。增加上下键命令历史、`Ctrl+L` 清空和 `Ctrl+C` 清空当前输入。

验证：`npm run check`、renderer typecheck、`npm run build:codepiddy` 全绿；真实 Electron 关闭重启后，项目 + 工作项键仍能恢复 `a.txt` 历史，旧的无路径记录已归并回真实文件。

### 2026-10-03 批次 21：流星图标与目录整理

- 将根目录用户素材移到正式设计源目录：`codepiddy-icons/meteor.svg`；最终采用 `流星2.svg` 的水平镜像版本。
- 删除不再使用的 `codepiddy-icons/lightning.svg`，避免同一图标存在多个来源。
- `StreamStats.tsx` 改为通过 Vite `?url` 引用 `codepiddy-icons/meteor.svg`，token 速率前显示流星，文本仍只读数值。
- 批次 19-20 已随 `b2644f5 feat(desktop): add per-turn changes and terminal` 提交；批次 21 已随 `b5e30b2 feat(desktop): use meteor stream icon` 提交。

验证：`svg_cli.py validate` 无错误；`npm run check`、renderer typecheck、`npm run build:codepiddy` 全绿；浏览器实测资源加载为 205×200 源图并渲染为 12×12。

### 2026-10-03 批次 22：styles.css 结构清理 + impeccable sidecar

目标是把“历史玻璃层 + 末尾迁移覆盖层”收敛成一层，而不是继续往上叠规则。

改了 `packages/codepiddy-desktop/src/renderer/styles.css`（4477 → 4253 行），并新增 `.impeccable/design.json`。

删除与合并：

- 整段删除 1912-2318 的玻璃层规则：`.app-shell` / `.sidebar` / `.main-pane` / `.content-header` 的圆角卡片、`.composer` 的白色玻璃块与 `::before` 高光、`.message-user` / `.tool-block` / `.thinking-block` / `.inline-code` / `.message-code-block` 的玻璃属性、`.settings-card` / `.role-skill-card` / `.permission-picker-*` / `.modal` / `.slash-menu` / `.model-list` 的白色叠加。
- 删除 `:root` 里的 `--cp-glass-*` / `--cp-shadow-*` 别名；全文件已无引用。
- 删除 `codepiddy-glass-enter` 关键帧（带 `blur(5px)`），改成无模糊的 `codepiddy-dialog-enter`。
- 删除重复的 `.tool-error-guidance`、重复的 `@media (max-width: 1000px)`、空的 `@media (max-width: 720px)`；`@media (max-width: 980px)` 只保留 `.transcript-minimap` 隐藏。
- 删除末尾的实心红 `.error-banner` 覆盖，恢复 `DESIGN.md` 记录的“错误红 9% 淡底 + 同色文字 + 半像素内描边”。

把最终值并入设计系统层（不是再加覆盖）：

- 侧栏：`overflow-x: hidden`、footer padding、footer hover 5% ink、搜索框 `:focus-within` 蓝色聚焦环。
- `.new-action`：白底 + raised 投影；hover 5% ink。
- `.composer`：`:focus-within` 用 float 投影 + 2px 强调环；textarea 聚焦抑制内部 outline；`.send-button` 保留 `display:grid / place-items:center / padding:0`。
- `.agent-choice-list > button:hover`：白底换成 secondary 底 + raised 投影，不再位移。

顺带修掉的 specificity 回归（删旧规则后暴露）：

- 旧 `.composer button.model-seat:not(:disabled)` / `.composer button.thinking-control-trigger:not(:disabled)` 被删后，基础规则 `.composer button:not(:disabled)`（`background: ink; color: #fff`）赢了，模型按钮和思考按钮一度变成黑底白字。
- 修法：把设计系统层的选择器提高到同等特异性（`.composer button.model-seat` / `.composer button.thinking-control-trigger`），并把思考触发按钮从浮层组移回 composer 控件组。
- 现在 composer 的附件、模型、思考三个控件统一为透明底 + 次墨色，hover 6% ink。

剩余 off-palette 字面量收敛：

- `.message-table-scroll` 白 58% → `--cp-surface`；表头 `rgb(240 243 238)` / 斑马纹 `rgb(246 247 243)` → `--cp-surface-secondary` / 3% ink。
- `.message-code-toolbar` 白 55% → surface/secondary 混合；`.message-code-actions .is-active` 旧蓝灰 → `--cp-accent-soft` + `--cp-accent`；focus ring → `--cp-accent-ring`；`.message-code-expand` 渐变 → surface-secondary。
- `.active-project-contents` / `.tool-details` / `.role-skill-heading` 的灰绿描边 → `--cp-line-subtle`。

验证：

- `npm run check`、`npm run typecheck --workspace=@codepiddy/desktop`、`npm run build:codepiddy` 全绿。
- 新增一次性校验脚本（在 `.artifacts/css-audit/`，gitignored）：对 agent / settings / changes / terminal / slash / model-picker / thinking / agent-actions 八个状态，逐元素对比 HEAD CSS 与新 CSS 的 computed style。剩余 diff 全部是“去玻璃 / 去绿色 / 统一 hover / 控件 30→28px”等预期变化；`.permission-setting-list` 的 `display: grid` 已补回。
- 浏览器 demo 1440x900 与 900x700 截图：无横向溢出，composer 居中，模型/思考按钮为安静的透明控件。
- `.impeccable/design.json` 通过 `JSON.parse`；schemaVersion 2，含 14 个 colorMeta（OKLCH ramp）、4 个 typographyMeta、2 个 shadow、3 个 motion、3 个 breakpoint、9 个组件。

用户已验收，随 `6b6b95b feat(desktop): consolidate stylesheet layers and add design sidecar` 提交。

### 2026-10-03 批次 23：内置终端 Tab 补全（待验收）

用户反馈：内置终端没有 Tab 补全 / 切换，要求补齐。

根因：终端是行式 PowerShell（`-Command -` 从 stdin 读命令），Tab 键既不会传给子进程，壳子也没有补全通道。要在壳子这一层补，不能改 Pi 核心。

实现：

- shared 新增 `TerminalCompleteInput` / `TerminalCompletionItem` / `TerminalCompleteResult`，`CodePIddyClientApi` 增加 `completeTerminal`。
- main 新增 `codepiddy:terminal:complete`，以及 `parseTerminalCompleteInput`（允许空行、保留原始空格、校验 cursor 在 `[0, line.length]`）。
- 每个终端会话懒加载一个常驻补全 helper：`pwsh -NoLogo -NoProfile -NonInteractive -EncodedCommand <script>`。脚本循环读 stdin 的 base64 JSON 请求，用 `TabExpansion2 -inputScript -cursorColumn` 取 `CompletionMatches`，按行回 JSON；helper 随终端会话回收。
- 请求带 `cwd`，helper 每次先 `Set-Location -LiteralPath`，所以 `cd` 之后的路径补全跟随真实目录。
- `findCompletionTokenStart` 处理未闭合引号（`"C:\Program Files\...`）和分隔符（`; | & ( , {`），把 token 起点一起返回给渲染层。
- renderer 输入框捕获 Tab：首次请求补全并应用第一个候选；连续 Tab 在候选间循环，Shift+Tab 反向，Esc 回到补全前的整行；多候选时在输出区打印一行候选（最多 16 个 + 剩余数量）。
- 非 PowerShell 的 shell 目前返回空候选（不做半成品补全），Tab 不改变输入。

验证：

- main helper 原型（真实 pwsh）：`Get-Ch` → `Get-ChildItem`；`Get-ChildItem .\pack` → `.\package.json` 等；`Get-ChildItem -Pa` → `-Path`。首次请求约 0.9s（PowerShell 启动），后续约 3ms。
- renderer 循环（Playwright + stub client）：单候选替换、双候选 Tab/Shift+Tab 循环、Esc 还原都正确。
- 真实 Electron e2e（fixture 项目）：`Get-Ch` + Tab → `Get-ChildItem`；`Get-ChildItem .\` + Tab → `Get-ChildItem .\.codepiddy`。
- `npm run check`、`npm run typecheck --workspace=@codepiddy/desktop`、`npm run build:codepiddy` 全绿。

### 2026-10-03 批次 24：内置终端换成真 PTY（待验收）

用户反馈批次 23 的 Tab 补全没修好，要求不要自己实现终端，直接用原生终端能力（参考 Codex 右侧面板里嵌的 Windows Terminal）。

调查结论：参考项目 PI-Desktop 在 ADR `0108` 里已经删掉内置交互终端和 PTY/xterm 依赖，把交互 shell 交给外部终端，没有现成实现可抄。要复刻 Codex 的效果，只能自己上 `xterm.js + node-pty`。

实现：

- 新增依赖（exact）：`@xterm/xterm@6.0.0`、`@xterm/addon-fit@0.11.0`、`node-pty@1.1.0`。node-pty 走包内 N-API prebuild（`prebuilds/win32-x64`），不需要 node-gyp 编译。本机 VS 缺 Spectre 缓解库，`electron-rebuild` 会失败；已验证 prebuild 在 Electron 44 下可直接加载并跑通 ConPTY。
- main：`TerminalSession` 从行式子进程换成 `IPty`；`startTerminal` 用 `pty.spawn`，不传 `-NoProfile`，和 Windows Terminal 默认 PowerShell profile 一致，PSReadLine / 别名 / 提示符 / 用户函数全部按原样生效；新增 `resizeTerminal`；`writeTerminal` 直接写原始字节。
- 删除批次 23 的 `completeTerminal` IPC、TabExpansion2 helper、token 起点推断，以及 renderer 的候选循环 / 命令历史 / cwd marker。
- 修掉一个关键 bug：`writeTerminal` 原来复用 `rawText` 校验，trim 后会拒绝纯控制字符，导致 Tab(`\t`) 和 Enter(`\r`) 被静默丢弃；改成允许原始字节流的 `terminalData`。
- renderer：`WorkPanel` 的终端换成 xterm 实例 + FitAddon；`onData` 写 PTY，`onTerminalEvent` 写 xterm；ResizeObserver 做 fit + resize；Ctrl+C 有选区时复制、否则透传给 shell；清空按钮用 `terminal.clear()`。
- 样式：删除旧 `.terminal-output` / `.terminal-input-row` / `.terminal-prompt` / `.terminal-cwd`，新增 `.terminal-host`；`main.tsx` 引入 `@xterm/xterm/css/xterm.css`。
- 打包：`build-main.mjs` 把 `node-pty` 标为 external；`package.json` 增加 `npmRebuild: false`（用 prebuild，避免 Spectre 编译失败）和 `asarUnpack: ["node_modules/node-pty/**/*"]`。

验证：

- PTY 原型（真 pwsh）：`Get-Ch` + Tab → `Get-ChildItem`，逐字符写入同样生效；PSReadLine 2.4.5 已加载。
- 真实 Electron e2e（fixture 项目）：终端显示真实 PowerShell 7.6.5 banner 和 prompt；`Get-Ch` + Tab → `Get-ChildItem`；Enter 执行后打印目录；`Get-Location` 打印项目路径。
- `npm run check`、`npm run typecheck --workspace=@codepiddy/desktop`、`npm run build:codepiddy` 全绿。Vite 有一条 chunk >500kB 的 advisory（xterm 进主包，702kB / 197kB gzip），未处理。

### 2026-10-03 批次 25：终端跟随 Windows Terminal 配置 + 浅色配色修正（待验收）

用户反馈三点：`cd .\test\` 后面的文字是浅灰、白底看不清；不要显示 PowerShell 的“有新版本可用”提示；实现必须通用，不能按当前这台机器写死。

实现：

- 新增 `packages/codepiddy-desktop/src/main/windows-terminal.ts`，只读 Windows Terminal 的标准配置路径（稳定版、预览版、非打包版三种 `settings.json`），解析 `defaultProfile` 并取对应 profile 的 `commandline` / `source` / `font` / `cursorShape`。没有 WT 配置时回退到 PATH 上的 pwsh / `powershell.exe`。
- 支持常见 profile 来源：显式 `commandline`（做 `%VAR%` 展开和引号拆分）、`Windows.Terminal.PowershellCore`（用 `Get-AppxPackage` 定位商店版 pwsh 的真实安装路径，因为 app execution alias 不能被 `CreateProcess` 直接启动）、`Windows.Terminal.Powershell`、`Windows.Terminal.Wsl`。
- 终端启动环境加 `POWERSHELL_UPDATECHECK=Off`，关闭启动时的版本提示。
- 浅色 ANSI 调色板重取：`white` / `brightWhite` 从近白改成 `#4a4c50` / `#17181a`，`yellow` 改深琥珀 `#8a5a00`，`brightGreen` / `brightMagenta` / `brightCyan` 换成白底对比度 ≥4.5:1 的值。PSReadLine 的默认文字和参数颜色因此可读。
- `TerminalSessionInfo` 增加 `profileName` / `fontFamily` / `fontSize` / `cursorStyle`；渲染层应用 WT profile 的字体和光标形状。

验证：

- `readWindowsTerminalProfile()` 在本机解析出 `PowerShell` profile → 商店版 `pwsh.exe`（7.6.6），与用户本地 Windows Terminal 默认 profile 一致。
- 真实 Electron e2e：终端显示 PowerShell 7.6.6、无更新提示、Tab 补全和命令执行正常；截图确认命令文字在白底上清晰可读。
- `npm run check`、`npm run typecheck --workspace=@codepiddy/desktop`、`npm run build:codepiddy` 全绿。

### 2026-10-03 批次 26：README 重写 + 截图重生成

旧 `README.md` 已经过期：引用的 `docs/images/*` 在之前的清理里被删掉，正文还写着「需求批准门」「半透明 + 背景模糊 + 内高光」，右侧面板还叫「文件管理器」。旧的截图脚本 `capture-screenshots.mts` 也引用了已经不存在的「批准需求」按钮，跑不起来。

- 重写 `README.md` 为常规 GitHub 结构：徽章、hero 图、定位说明、界面分节（会话与工作区 / 更改 / 终端 / 设置）、两条工作流、内置 Skill、下载与运行、本地开发、验证、截图重生成、目录结构、更新 Pi 内核、安全、上游与 License。
- 正文按当前事实更新：`文件 / 更改 / 终端` 三视图、按轮折叠（运行中的最新一轮展开，其余默认收起）、按轮持久化的文件级 diff、内嵌真 PTY 终端（跟随 Windows Terminal 默认 profile）、浅色中性 + 蓝色强调。
- 重写 `packages/codepiddy-desktop/scripts/capture-screenshots.mts`：浏览器 demo（`?demo=1`）负责会话 + 更改 diff 和设置页，Electron + `shot-pi-rpc` 假实现负责文件预览和内置终端；脚本自己造临时项目，结束时清理 Vite / Electron / 临时目录。
- 生成 `docs/images/codepiddy-overview.png`、`codepiddy-files.png`、`codepiddy-terminal.png`、`codepiddy-settings.png`。

验证：截图脚本跑通（无 DeprecationWarning）；`npm run check` 全绿。

### 2026-10-03 批次 27：收尾清理（待验收）

设计改版待办清空后的三件遗留清理。

- `.gitignore` 新增 Impeccable 本地安装目录（`.github/agents/`、`.github/hooks/`、`.github/skills/`、`.pi/skills/impeccable/`），`git status` 不再出现约 38MB 的未跟踪文件；本地安装保留，需要空间时可直接删除后重装。
- 终端改为按需加载：新增 `terminal-pane.tsx`，把 xterm / FitAddon / xterm.css / ANSI 主题从 `WorkPanel.tsx` 拆出；`WorkPanel` 用 `lazy` + `Suspense` 在第一次切到“终端”标签时加载，加载期间显示一行轻量提示。原先常驻挂载的行为不变，切走再切回不会重启 PTY。
- `panel-icon-button.tsx`：把工作面板的图标按钮从 `WorkPanel.tsx` 抽成共用组件，供文件视图和终端视图复用。
- `DESIGN.md`：Work Panel 的 Terminal 一节改成真 PTY 事实（Windows Terminal 默认 profile、PSReadLine / Tab / 选择复制原生行为）；删除 “Don't 用蓝色作为品牌强调色” 这条与 Blue-Is-Action Rule 冲突的旧禁令。
- 验证：`npm run check`、`npm run typecheck --workspace=@codepiddy/desktop`、`npm run build:codepiddy` 全绿。构建产物主包 367.9kB（gzip 112.3kB），xterm 独立为 `terminal-pane` chunk 335.8kB（gzip 85.0kB），500kB 告警消失；Playwright demo 验证首次进入页面 0 个 `terminal-pane` 请求，切到“终端”后 1 个，面板正常挂载（浏览器无 IPC，按预期显示桌面端提示）。

### 2026-10-03 批次 28：变更 diff 走扩展快照 + Agent 操作菜单（待验收）

用户反馈两件事：更改视图的 diff 不对（Markdown 列表行被当成删除、正文新增不是绿色）；右上角“...”点了没反应。

根因：

- diff 不对：`write` 的 tool result 没有 patch，面板拿到的是 write 的正文；`panelDiffLines` 用“行首是 + / -”判断是不是 diff，Markdown 的 `- 朝代：唐` 被当成删除行，其余行成了 context。
- 菜单：`.agent-actions-menu-wrap` 是 `position: static`，菜单的定位祖先是 `.agent-pane`，`top: 100%` 把它放到整个面板底部（被 `.main-pane` 的 `overflow: hidden` 裁掉），看起来像没反应。

按参考项目 PI-Desktop 的 message-owned review 思路实现（它在 host-core 里于 Write / Edit 执行前抓快照，把结构化 hunks 挂到 `details.review`）：

- 新增 `packages/codepiddy-review-extension`：Pi 扩展，`tool_call` 执行前读旧文件（缺失 = 新文件，二进制 / 超 64KB 跳过），`tool_result` 执行后读新文件，用 `diff@8.0.4` 生成 unified patch，写回 `details.patch` / `details.diff` / `details.review`。**不改 Pi core**。
- 打包与启动接线：`build-main.mjs` → `dist/runtime-extensions/review.js`；`build-codepiddy-runtime.mjs` → `.artifacts/codepiddy-runtime/extensions/review.js`；`startProcess` 与 runtime probe 都加 `--extension review.js`（开发态走源码 `packages/codepiddy-review-extension/index.ts`）。
- 桌面端：`tool_execution_end` 优先取 `event.result.details.patch`；`projectToolToPanel` 优先用 patch；`panelDiffLines` 改成严格判断（必须有 `@@` hunk 头或 `---/+++` 文件头），非 diff 的 write / edit 正文整块按新增；`inferPanelPathFromText` 优先取 `+++` 路径，修掉 `--- /dev/null` 导致的新文件路径丢失。
- 菜单：`.agent-actions-menu-wrap` 改 `position: relative`，菜单 `right: 0`，现在在按钮正下方展开。

验证：

- `@codepiddy/review-extension` 单测 3 项、desktop `work-panel` 单测 4 项全绿。
- 扩展集成验证（真实构建产物 `review.js` + 临时文件）：诗 → Markdown 覆盖，additions 6 / deletions 2，patch 含 `-《金缕衣》` 和 `+- 朝代：唐`。
- Playwright demo：菜单在按钮下方 8px 展开，四项 menuitem 可见。
- `npm run check`、`npm run typecheck --workspace=@codepiddy/desktop`、`npm run build:codepiddy` 全绿；主包 368.3kB / gzip 112.5kB，xterm chunk 保持按需。

### 2026-10-03 批次 29：工作区面板启动默认收起（待验收）

用户反馈：不希望一打开客户端右侧工作区面板就是展开的，默认关闭。

- `App.tsx` 的 `workPanelVisible` 从“读 localStorage，默认 true”改成启动固定 `false`；标题栏 panel 图标继续在当前会话里切换，宽度记忆 `codepiddy.work-panel.width` 保持不变。
- `capture-screenshots.mts` 增加 `ensureWorkPanelOpen()`，截图脚本在点标签前显式打开面板，否则 README 截图会拍到收起状态。
- `DESIGN.md` 的 Work Panel 增加 Visibility 规则：只记忆宽度，不记忆可见性。

验证：Playwright demo 实测进入会话后 `.work-panel` 数量为 0（收起），标题栏显示“显示文件管理器”按钮；点击后 `.work-panel` 数量为 1。`npm run check`、`npm run typecheck --workspace=@codepiddy/desktop`、`npm run build:codepiddy` 全绿。

### 2026-10-03 批次 30：重试改为不侵入实现（待验收）

用户确认：网关并发错误的重试要在不修改 Pi core 的前提下实现，并且 Pi 更新后仍然有效。

审计结论（详见「Pi core 更新边界」）：`c345b54` 给 core 留了两处补丁，更新后都失效。批次 30 把它们拆成配置 + 扩展两层：

- **退避策略走配置**：`AppSettingsStore.ensurePiRetrySettings()` 在应用启动时把 `retry.maxRetries = 5 / baseDelayMs = 1000 / maxAgentDelayMs = 5000` 合并写进 Pi 原生 `~/.pi/agent/settings.json`；只补缺失字段，用户显式配置优先。Pi 内置重试和扩展共用这一份参数。
- **网关并发错误走扩展**：新增 `packages/codepiddy-retry-extension`。Pi 内置重试只认自己的错误列表，网关并发错误不在里面；内置重试放弃后触发 `agent_before_settle`，扩展检查 `outcome === "error"`、`context.canContinue` 和错误文本，按同一套退避 sleep 后返回 `{ continue: true }`，强制再发一次 provider 请求。
- **版本口径**：开发侧只适配最新 Pi（v0.99.1+），`agent_before_settle` 是必备事件，不做旧版本兼容；类型 cast 只是因为仓库 vendored 的类型较旧。回退（手动 rollback / 启动失败自动回退）保留给用户更新出问题时的保护，不属于开发兼容范围。
- **回退 core**：`packages/ai/src/utils/retry.ts` 和 `packages/coding-agent/src/core/settings-manager.ts` 已恢复到 `9cf21c8` 上游基线（diff 为空）。
- 打包接线：`build-main.mjs` → `dist/runtime-extensions/retry.js`；`build-codepiddy-runtime.mjs` → `extensions/retry.js`；`startProcess` 和 runtime probe 都加 `--extension retry.js`。

验证：

- `@codepiddy/retry-extension` 单测 7 项全绿：模式匹配、指数退避、预算耗尽、非网关错误、成功重置、`canContinue === false`。
- `npm run check`、`npm run typecheck --workspace=@codepiddy/desktop`、`npm run build:codepiddy` 全绿。
- 重启真实客户端后：`~/.pi/agent/settings.json` 出现 `retry: { maxRetries: 5, baseDelayMs: 1000, maxAgentDelayMs: 5000 }`；Pi 进程命令行确认加载 `dist/runtime-extensions/retry.js`。
- 已知边界：命中 Pi 内置模式又命中网关模式的错误，最多会尝试 `2 × maxRetries` 次（内置一层 + 扩展一层）。

### 2026-10-03 批次 31：设置页分区 + MCP / Provider 配置（待验收）

用户反馈：设置页所有内容混在一页太乱，希望像参考项目一样分类；并且要在客户端里直接配置 MCP 服务和 Provider，而不是手改 `settings.json` / `models.json`。

落地内容：

- **设置页分区**：`.settings-page` 改成「左侧分类导航 + 右侧内容」。分组：`常规`（Pi 运行时、Shell）、`集成`（Provider 与模型、MCP 服务、Tavily Search）、`Agent`（默认权限、Agent Skills）。一次只渲染一个分类，导航 208px、次级底色列、选中项白底抬起。
- **MCP 服务**：新增 `McpSettings.tsx`，读写 Pi 原生 `~/.pi/agent/mcp.json` 的 `mcpServers`；支持 stdio（command / args / env）和 HTTP（url / headers）、禁用开关、增删改。内置 `web_search`（Tavily MCP）单独标注，Key 仍走 Tavily Search 设置。
- **Provider 与模型**：新增 `ProviderSettings.tsx`，读写 Pi 原生 `~/.pi/agent/models.json`；支持 Provider ID / API 类型 / baseUrl / 模型列表的增删改。API Key 用 Electron safeStorage 加密存在本机 secrets，models.json 只写 `$CODEPIDDY_PROVIDER_<ID>_API_KEY` 引用，启动 Agent 时通过环境变量注入；已有明文 Key 在用户不修改 Key 时原样保留。
- **IPC**：shared 新增 `McpServerSummary/Input`、`ProviderSummary/Input`；main 新增 6 个 handler（list/save/delete × MCP/Provider）和 `ipc-validation` 解析；preload 暴露对应方法。

验证：

- 隔离 `PI_CODING_AGENT_DIR` 的真实 Electron e2e：MCP save → list 1 → delete → 0；Provider save → list 1 → delete → 0；models.json 里 `apiKey` 是 `$CODEPIDDY_PROVIDER_E2E_PROVIDER_API_KEY`，明文 `test-key` 没有落盘。
- Playwright demo：设置页导航 7 项（Pi 运行时 / Shell / Provider 与模型 / MCP 服务 / Tavily Search / 默认权限 / Agent Skills）；MCP 页 2 行（内置 web_search + demo 服务）；Provider 页 1 行。
- `npm run check`、desktop typecheck、`npm run build:codepiddy` 全绿。

### 2026-10-03 批次 32：会话 Fork 可发现性修复（待验收）

用户反馈：会话树与 Fork「感觉用不了」。

诊断（用真实会话副本直连 v0.99.1 RPC）：`get_tree` 返回 115 个节点，`get_fork_messages` 返回 10 条可 Fork 的用户消息，`fork` 返回原消息文本并生成新分支。**后端是通的**，问题在 UI：

- `.session-fork-button` 默认 `opacity: 0`，只有 hover 到节点才出现；用户打开弹窗看不到 Fork 按钮。
- Fork 成功后弹窗不关、没有提示，填回输入框的草稿被弹窗挡住，看起来像没反应。

修复：

- Fork 按钮改成常显（inset 底 + 次墨色），hover 加深；forkable 节点一眼能看到入口。
- Fork 成功后关闭会话树弹窗，设置 3.2s 的 toast「已从该节点创建分支，原消息已填回输入框」，并聚焦输入框。
- 弹窗说明改成「点用户消息右侧的 Fork 从此处创建分支；原消息会填回输入框，原会话不会被修改」。

验证：Playwright demo 打开会话树后 3 个 Fork 按钮常显（computed opacity 1），说明文案正确；`npm run check`、`npm run build:codepiddy` 全绿。

### 2026-10-03 批次 33：Agent 会话新建 / 切换（待验收）

用户反馈：Fork 之后当前会话被替换，没有回切入口；而且不只是 Fork，每个 Agent（如 Coding Agent）都应该能自己新建会话、在历史会话之间切换。

落地内容：

- shared 新增 `AgentSessionSummary` / `SwitchAgentSessionInput` / `AgentSessionSwitchResult`，`CodePIddyClientApi` 增加 `listAgentSessions` / `newAgentSession` / `switchAgentSession`。
- main 新增会话列表：扫描 agent 的 sessionDirectory 下 `.jsonl`，解析 `session` 头（id / timestamp）、`session_info`（名称）、`message` 数量与首条用户消息预览，按更新时间排序，标记当前会话。
- main 新增新建 / 切换：调用 Pi RPC `new_session` / `switch_session`，切换后广播 `agent_history` 刷新转录；选中的 sessionId 写入 agent 目录的 `selected-session.json`，下次启动用 `--session <id>` 而不是 `--continue`，重启后回到同一会话。
- renderer 会话树弹窗顶部新增「会话」列表：显示名称 / 预览 / 消息数 / 更新时间 / 当前标记，支持点击切换；「新建会话」按钮创建新会话。

验证：Playwright demo 打开会话树显示 2 条会话，点「新建会话」变 3 条并标记当前，点击列表项可切换高亮；`npm run check`、desktop typecheck、`npm run build:codepiddy` 全绿。

### 2026-10-03 批次 34：会话删除 + 新建会话按钮单行（待验收）

- 「+ 新建会话」按钮加 `inline-flex + nowrap`，不再换行（实测 103×28 单行）。
- 新增 `deleteAgentSession` IPC：非当前会话可删（当前会话拒绝删除并提示），删除后刷新会话列表；如果删的是持久化选中的会话，同时清掉选择记录。
- 会话列表行改成「主按钮 + 删除按钮」结构，避免 button 嵌套；删除有 `window.confirm` 二次确认。

验证：Playwright demo 2 条会话、1 个删除按钮，删除后变 1 条；`npm run check`、`npm run build:codepiddy` 全绿。

### 2026-10-03 批次 35：对话快速定位条升级（待验收）

参考项目 `ConversationMinimap.tsx` 的 Codex 风格：

- 鼠标靠近刻度时按余弦衰减放大，只横向变宽（`--minimap-magnify` + `width: calc(10px * var(--minimap-magnify, 1))`），不改变堆叠布局。
- rAF 节流：mousemove 每帧批量写 CSS 变量，`onMouseLeave` 复位为 1。
- 内容不足一屏时整条隐藏：`ResizeObserver + MutationObserver` 监听 `.transcript` 的 `scrollHeight - clientHeight`；测量失败时默认显示，避免整条消失。
- 保留原有滚动跟随（`activeTranscriptIndex`）、点击跳转、hover 预览浮层。

验证：demo 只有 1 个 turn（`turns.length < 2`），定位条按设计不渲染；代码通过 typecheck、`npm run check`、`npm run build:codepiddy`。真实会话（68 条消息、多轮）重启后可见 dock 放大效果。

### 2026-10-03 批次 36：更改 diff 卡片堆叠（待验收）

参考项目 PI-Desktop 的 `ReviewTab` / `ReviewChangeCard`：文件变更不是左右分栏，而是纵向堆叠的可展开卡片；卡片默认折叠，展开后显示该文件的 hunk 和行级 diff。

- `WorkPanel.tsx` 删除 `selectedChangeKey` 和左右分栏浏览状态，改为 `ChangeStack` + `ChangeStackCard`。
- 每个文件一张卡片，头部显示展开箭头、文件名、相对路径和 `+ / −` 统计；默认 `aria-expanded="false"`，点击后在原位置展开。
- 展开区域显示完整 diff，新增绿色、删除红色、保留行号和 hunk 头；展开区最大高度 `min(360px, 42vh)`，内部滚动，长 diff 不拉长整个面板。
- “在文件中打开”按钮保留在卡片头部；顶部汇总同时显示文件总数和总 `+ / −`。
- 新增展开动效和 `prefers-reduced-motion` 降级；不改 `@codepiddy/review-extension` 的 patch 生成和变更持久化。
- README 的“更改”说明与截图脚本同步：截图会展开第一张卡片，展示折叠/展开两种状态。

验证：

- Playwright demo：更改页初始 `cardCount=1`、`aria-expanded=false`、展开体数量 `0`；点击后 `aria-expanded=true`、展开体数量 `1`。
- 1600px 视口无横向溢出：`bodyClientWidth=1600`、`bodyScrollWidth=1600`、面板宽度 `480px`；300px 窄面板下 stack / toggle 的 `clientWidth` 与 `scrollWidth` 一致。
- `npm run check`、`npm run typecheck --workspace=@codepiddy/desktop`、`npm run build:codepiddy` 全绿。
- `packages/codepiddy-desktop/test/work-panel.test.ts` 4 项通过。
- 截图：`.artifacts/diff-stack-collapsed.png`、`.artifacts/diff-stack-expanded.png`，README 截图已重新生成。

### 2026-10-03 批次 37：用户消息级快捷 Fork（待验收）

用户澄清：不要标题栏 Fork 当前会话，也不要用户消息气泡里的 Fork；要在每轮最终 AI 回复的“复制”旁边直接 Fork 这一轮。

- `App.tsx` 把用户消息拆成 `.message-user-bubble` 和气泡外 `.message-actions`，灰色气泡只包裹角色、正文和图片；`复制` 移到气泡外并保持右侧对齐。
- `Fork` 只出现在每轮最终 AI 回复的操作行，和该回复的 `复制` 并排；点击后调用现有 `forkAgentSession(entryId)`，不打开会话树。
- 用户消息的 Pi entryId 从 `agentSessionSnapshots[agentId].nodes` 的 forkable user nodes 映射到转录项，按规范化文本和 timestamp 选择匹配项；同一轮的所有 assistant 消息继承该轮的 entryId，但只有最终 AI 回复显示 Fork。
- Fork 成功后沿用现有行为：关闭会话树、把原消息填回输入框、聚焦输入框并显示 toast；正在 Fork 的按钮显示 `Fork 中…` 并禁用。
- 上一版误加的标题栏 Fork 和克隆会话相关改动已撤回，不保留在批次 37。

验证：

- Playwright demo：用户消息只有 1 个 `复制`，0 个 `Fork`，操作区 y=150.39、气泡底部 y=148.39，确认复制在气泡外；最终 AI 回复同时有 `Fork` 和 `复制`，按钮位置 x=553 / 611.8，点击 Fork 后 toast 文本为「已从该节点创建分支，原消息已填回输入框」。
- `npm run check`、`npm run typecheck --workspace=@codepiddy/desktop`、`npm run build:codepiddy` 全绿。
- 截图：`.artifacts/turn-fork-layout.png`、`.artifacts/turn-fork-notice.png`。

### 2026-10-03 批次 38：Pi 1.0.1 固定内置版本与客户端 Provider 登录（已提交）

用户要求确认 Pi 1.0.1 的原生 MCP、登录和全功能覆盖，并把缺失项留成后续任务清单。审计结果单独写入
[pi-1.0.1-feature-audit.md](./pi-1.0.1-feature-audit.md)。

结论摘要：

- 当前机器运行 Pi `1.0.1`，仓库内置运行时也已替换为固定 `1.0.1` bundle。
- Pi 1.0.1 原生包含 `@earendil-works/pi-mcp`，MCP 不再是外部插件。
- 客户端基础 MCP 已经使用原生 `mcp.json`；Tavily `web_search` 仍是独立注入通道，需要迁移到原生 MCP 配置，但保留客户端 Tavily 设置卡和加密 Key。
- `/login`、`/logout` 在 1.0.1 的原生 TUI 中可用，RPC 不暴露；SDK 提供 `ModelRuntime.login/logout`。客户端改为设置页直接提供 Provider 登录/退出，并完成隔离 API Key 登录验证，尚未验收。
- 登录验证结果：设置页「登录 Provider」可加载 42 个 Provider；隔离目录下 API Key 登录成功写入 `auth.json`；OAuth 启动、auth URL、manual code、取消流程已验证到 helper 事件层。
- 构建收口：`build:codepiddy-runtime` 只复制 `packages/coding-agent-runtime` 的固定 1.0.1 bundle，不联网、不自动选择版本。
- 列表统一：设置页与登录弹窗的 `<select>` 已替换为 `SelectMenu`，最大高度 `min(320px, 46vh)`，内部滚动。
- 审计过程中把运行时构建改成了 build 时 npm 安装 `1.0.1`，这与用户要求冲突，必须优先回退。

后续先按审计文档的阶段 0 处理：

1. 回退 build 自动安装 Pi。
2. 手动替换仓库内置 Pi 为固定 `1.0.1`。
3. 再处理 `web_search` 原生 MCP 统一、登录原型和缺失功能。

### 2026-10-04 批次 39：web_search 原生 MCP 统一（已提交）

- `web_search` 不再通过 `CODEPIDDY_TAVILY_MCP_ENTRY` 和自定义 extension 注册裸工具名。
- 客户端现在维护 Pi 原生 `~/.pi/agent/mcp.json` 的 `web_search` 条目：
  `command` / `args` 指向构建产物，`env.TAVILY_API_KEY` 只写 `${TAVILY_API_KEY}`，
  `exposure` 与 `toolExposure` 为 `direct`。
- Tavily Key 仍由 Electron safeStorage 加密保存；保存 Key 时原生条目启用，清除 Key 时条目保留并设为
  `enabled: false`。
- 旧包 `packages/codepiddy-tavily-tool-extension` 和两个构建脚本里的入口已删除，lockfile 已同步。
- Pi 用户级残留的 `npm:pi-mcp-adapter` 已用 `pi remove` 删除，`settings.json`、用户 npm 依赖、
  lockfile、node_modules 和 bin 链接都已清理；`pi list` 只保留 permission-system。
- 命名策略确定：接受原生工具名 `mcp__web_search__web_search`，不增加别名层；工具卡显示 `web_search`。
- 权限扩展识别 `mcp__<server>__<tool>`，并把它归入 MCP 权限类别。

验证：

- 隔离 Electron：保存测试 Key 后，`mcp.json` 不出现明文，`enabled` 未设置；
  清除后 `enabled: false`。
- 用隔离配置运行 Pi 1.0.1：保存后 `pi mcp list` 为
  `web_search: connected, 1 tool (direct, global)`；清除后为 `web_search: disabled (direct, global)`。
- `npm run check`、desktop typecheck、`npm run build:codepiddy` 全绿；真实客户端已重启。

### 2026-10-04 批次 40：MCP 设置完整能力（已提交）

- 设置页现在读写全局 `~/.pi/agent/mcp.json` 和项目级 `.pi/mcp.json`；项目级只写
  `enabled` / `exposure` / `toolExposure`，不越权覆盖 command / url / OAuth。
- 全局编辑器支持 `enabled`、`exposure`、`toolExposure`、`description`、`timeout`。
- HTTP MCP 支持 OAuth 字段：clientId、clientSecret、callbackPort、callbackUrl、scope、
  clientName、clientRegistration、authServerMetadataUrl、auth.provider。
- OAuth client secret 继续走 Electron safeStorage；`mcp.json` 只写
  `${CODEPIDDY_MCP_<NAME>_CLIENT_SECRET}` 引用。
- 登录 / 退出调用 Pi 原生 `pi mcp login|logout`；重连按钮重启当前 Agent 进程并重新加载 MCP。
- 设置页按“连接 / 行为 / 工具级 exposure / OAuth”分组，保留内置 `web_search` 状态和项目覆盖标记。

验证：

- 隔离 Electron：全局字段、项目 override 和 OAuth 引用均正确写盘；`mcp.json` 与 secrets 中无明文 client secret。
- Playwright：1440px 与 900px 视口无横向溢出；编辑器、OAuth 和项目覆盖状态均可渲染。
- `npm run check`、desktop typecheck、`npm run build:codepiddy` 全绿；真实客户端已重启。

### 2026-10-04 批次 41：MCP 管理入口（已提交）

- 客户端命令菜单新增 `/mcp`，选中后打开设置页 MCP 分区，不把 MCP 状态做成必须手输的 slash command。
- 新增 `pi mcp list --json` 包装，解析服务状态、工具数量、transport 和错误。
- MCP 设置页新增运行状态区，可刷新状态、重连当前 Agent，并与配置区并列展示。

验证：

- 隔离 Electron：`runMcpAction({ action: "list" })` 返回快照，真实 `web_search` 状态为 `disabled`。
- Playwright：MCP 运行状态区渲染 2 行，1440px 无横向溢出。
- `npm run check`、desktop typecheck、`npm run build:codepiddy` 全绿；真实客户端已重启。

### 2026-10-04 批次 42：MCP 设置反馈与扩展隔离收口（已提交）

- `/mcp` 现在由 Pi 原生 `mcp` extension 提供；启动参数继续隔离第三方 extension，同时显式加载
  `builtin:mcp`、`builtin:codemode`、`builtin:tool-search` 和 CodePIddy 自己的 permission/review/retry。
- MCP CLI 包装补齐 `TAVILY_API_KEY` 注入；`list --json` 非零退出也解析状态快照，不再把原始 JSON
  当异常铺到设置页。
- MCP、Provider、权限设置统一使用 `SettingsToast` 消息栈，支持成功/错误样式、自动消失和手动关闭。
- 权限设置下拉改成统一浮层样式，选中项使用浅蓝底和勾选图标。
- Tavily Search 改为掩码密码字段；眼睛按钮按需解密显示，进入设置分区会刷新配置状态。
- 隔离验证：保存 Tavily Key 后关闭客户端再启动，状态仍为“已配置”；显示/隐藏按钮工作正常。

验证：

- `npm run check`、desktop typecheck、`npm run build:codepiddy` 全绿。
- Playwright：权限下拉、MCP 运行状态、双消息 toast 堆叠和 Tavily 密码字段均通过。
- 真实客户端已重启。

### 2026-10-04 批次 43：Provider 凭据状态与来源显示（已提交）

- 设置页把 `Pi 认证状态` 改成 `Provider 凭据状态`，明确汇总 `auth.json`、`models.json` 和环境变量，而不是只代表登录凭据。
- 每个 Provider 行显示认证类型和凭据来源；`models.json` 配置的 Provider 不再显示无意义的退出登录按钮。
- 退出登录弹窗只列出真正来自 `auth.json` 的 Provider；退出后重新读取状态，不会误删或误判 `models.json` Key。
- 同一个 Provider 同时存在内置定义和 `models.json` 覆盖时，两侧分别标记 `models.json 覆盖` / `内置 Provider 覆盖`，避免看起来像两个独立配置。
- 900px 和 1440px 浏览器截图无横向溢出。

验证：

- `npm run check`、desktop typecheck、`npm run build:codepiddy` 全绿。
- 真实客户端已重启。

### 2026-10-04 批次 44：登录后刷新 Agent 与模型（已提交）

- `pi-auth-helper` 读取认证状态前显式加载 `auth.json`，修复 OAuth 登录成功后状态仍显示未配置的问题。
- 登录或退出后，空闲 Agent 会重连并重新读取模型列表和当前模型配置；运行中或等待授权的 Agent 不强行重启，只提示稍后生效。
- 登录 / 退出后会刷新 Provider 凭据状态和当前 Agent 的模型选择。

验证：

- `npm run check`、desktop typecheck、`npm run build:codepiddy` 全绿。
- 隔离 Electron 中完成 OpenRouter OAuth 写入验证，helper 返回 `configured: true`、`authType: oauth`、`source: stored`。

### 2026-10-04 批次 45：Provider 搜索与厂商图标（已提交）

- Provider 登录弹窗的选择框改为可输入组合框，支持按名称 / ID 过滤。
- 删除到空字符串时保持为空，不再自动回填当前选项；右侧箭头区域也可点击展开。
- 接入固定版本 `@lobehub/icons-static-svg@1.95.1`，在凭据状态列表、自定义模型列表和登录弹窗中显示厂商图标。
- Kimi 使用深色图标，适配浅色背景；未知厂商回退到 Server 图标。
- 搜索图标和输入文字垂直居中，焦点环只画在最外层选择框。

验证：

- `npm run check`、desktop typecheck、`npm run build:codepiddy` 全绿。
- 隔离 Electron：Provider 组合框可过滤、可清空、右侧可展开，品牌图标无破图。

### 2026-10-04 批次 46：Provider 组合框交互修正（已提交）

- 搜索图标与输入文字改为垂直居中，展开旋转只作用于右侧箭头。
- Provider 选择框支持 `↑ / ↓` 移动高亮、Enter 选择、滚动跟随和鼠标悬停高亮。
- 点击候选项后立即关闭列表；删除到空字符串时保持为空，不再自动回填。
- OpenRouter OAuth 登录、退出流程已按真实账号走通；退出后 helper 返回 `configured: false`。

验证：

- `npm run check`、desktop typecheck、`npm run build:codepiddy` 全绿。
- 隔离 Electron：键盘选择、点击关闭、空输入和右侧展开均通过。

### 2026-10-04 批次 47：Git Bash 黑窗修复与 Shell 重启提示（已提交）

- 定位到 `git-bash.exe` 是可见终端启动器，不是可静默执行的 shell。
- `AppSettingsStore` 自动把 `git-bash.exe` 纠正为同目录的 `Git\bin\bash.exe`，并迁移现有 `settings.json`。
- 设置页说明补充 `Git\bin\bash.exe` / `Git\usr\bin\bash.exe`，明确不要配置 `git-bash.exe`。
- 保存 Shell 路径后弹窗提供“稍后”和“立即重启”，避免用户不知道何时生效。

验证：

- `npm run check`、desktop typecheck、`npm run build:codepiddy` 全绿。
- 实际配置已迁移为 `D:\git\Git\bin\bash.exe`。

### 2026-10-04 批次 48：阶段 3 客户端化（已提交）

代码提交：`d402e6a7e feat(desktop): add stage 3 client workflows`。

完成 [pi-1.0.1-feature-audit.md](./pi-1.0.1-feature-audit.md) 阶段 3 的 16-19 项：

- **`/scoped-models` -> 常用模型范围**：设置页“Provider 与模型”新增常用模型范围，可搜索、启停、按 Provider 批量启停和排序。保存写 Pi 原生 `settings.json` 的 `enabledModels`；空闲 Agent 自动重连，运行中 Agent 延后生效。
- **常用模型语义**：`enabledModelIds = null` 表示全部可用模型都是常用；模型选择器显示“常用模型 · provider”。部分选择时显示“常用模型”和“其他模型”两组。明确清空常用列表时才显示“全部模型”。
- **`/import` -> 导入会话**：会话树顶部新增“导入会话”，使用系统文件选择器读取 JSONL，校验 `session` 文件头，复制到当前 Agent 会话目录并处理同名冲突，然后切换并持久化选中 Session。取消导入不改变当前会话。
- **`/trust` -> 项目信任**：新增 Pi `ProjectTrustStore` helper，不修改 core。打开/切换项目时，如果项目有需要信任的资源且没有已保存或继承决定，就弹窗询问；可信任当前项目、信任父目录、不信任或稍后。决定写 `~/.pi/agent/trust.json`，设置页可查看和修改。
- **信任行为收口**：Agent 启动移除无条件 `--approve`；项目级 settings / extensions / skills / packages 现在由 trust 决定。CodePIddy 自身权限、review、retry、内置 MCP / codemode / tool-search 仍显式加载。
- **`/session` -> 会话统计**：会话树和输入区上下文圆环可打开统计面板，显示 Session ID / 文件、消息数、工具调用与结果、Token 输入/输出/缓存、费用和上下文占用，数据来自 RPC `get_session_stats`。
- **搜索框样式**：常用模型搜索框和 Provider 登录搜索框使用同一套输入规则；内层 input 无边框和阴影，蓝色焦点环只画在外层容器，文字与占位符同一行。

验证：

- `npm run check`、`npm run typecheck --workspace=@codepiddy/desktop`、`npm run build:codepiddy`、`npm run build:codepiddy-runtime` 全绿。
- 隔离 Electron 实测：`enabledModels` 写入 `settings.json`，项目信任写入 `trust.json`，Session 统计读取和 JSONL 导入切换通过。
- 浏览器 demo：常用模型分组、信任弹窗、会话统计、导入入口和模型选择器分组通过 Playwright 验证。
- 测试信任项目：`E:\trust-demo-project`（包含 `.pi/settings.json`；当前无 trust 记录，打开时应弹窗）。该目录不在仓库内，不提交。

### 2026-10-05 批次 49：Session 命名补齐（已验收，已提交）

- `/name` 无参数时通过 RPC `get_state` 查询当前 Session 名称；未命名时返回明确说明，不再报“缺少参数”。
- `/name <name>` 保持原有 Pi 原生命名行为。
- 会话树标题和底部显示当前名称，未命名会话统一显示“未命名会话”。
- 会话操作区新增“重命名”入口和客户端原生弹窗；保存后刷新 Session 快照与会话列表。
- Session 名称只影响会话展示，不写入 `work-item.json`，不改变 Agent 的任务上下文。

验证：

- `npm run check`、`npm run typecheck --workspace=@codepiddy/desktop`、`npm run build:codepiddy` 全绿。
- Playwright demo 验证重命名弹窗、保存后的标题和当前会话列表同步。
- 固定 Pi 1.0.1 隔离 RPC smoke test 验证 `set_session_name` 后 `get_state.sessionName` 正确更新。

### 2026-10-05 批次 50：llama.cpp 客户端适配（已提交）

- 设置页新增 `llama.cpp` 分类；命令菜单中的 `/llama` 打开客户端设置页，不再依赖 TUI 命令。
- 新增 `LlamaCppManager`，通过 llama.cpp router HTTP API 读取 `/models` 和 `/props`，并执行模型加载、卸载、下载和状态刷新。
- 配置写入 Pi 原生 `~/.pi/agent/auth.json` 的 `llama.cpp` 凭据，支持 server URL 和可选 API Key，不修改 Pi core。
- 新增 Hugging Face GGUF 搜索、模型详情、量化版本选择和下载进度事件；支持标准 `HF_TOKEN` / `HF_HOME` / `HF_TOKEN_PATH` 凭据位置。
- 设置页支持模型状态、上下文、文件大小、加载/卸载操作和当前 Agent 重新连接入口。
- 已用 mock llama.cpp router 验证配置持久化、连接、模型列表、加载、卸载和下载流程；真实 router 端到端验证待后续环境。

### 2026-10-05 批次 51：`/share` 客户端原生分享（已验收，随 `52a1da50f` 提交）

- 会话树操作区新增“分享”，命令菜单新增 `/share`，两者打开同一个客户端分享弹窗。
- 分享前显示隐私确认，明确提示会话可能包含代码、路径、命令输出和凭据片段；GitHub secret gist 拿到链接的人可以查看内容。
- 主进程通过固定 Pi 运行时的 `SessionManager` 导出当前分支 JSONL，再调用独立 helper：
  - 配置并登录 Radius 时，上传到 `https://radius.pi.dev/v1/artifacts`。
  - 未配置 Radius 或没有 Radius 凭据时，调用本机 `gh gist create --public=false` 创建 secret gist。
  - GitHub CLI 从 PATH、常见安装目录、`D:\GitHubCLI\gh.exe` 和 `CODEPIDDY_GH_PATH` 自动发现。
- 成功状态显示 viewer 链接、复制链接、打开 Gist 和打开链接；失败状态显示可操作的错误信息。
- 未修改 `packages/coding-agent`；新增 helper 随桌面端构建复制，打包时也会进入 `extensions/`。

验证：

- `npm run check`、desktop typecheck、`npm run build:codepiddy` 全绿。
- Playwright demo 验证分享确认、成功链接和复制/打开操作。
- helper smoke test 已确认能识别 `D:\GitHubCLI\gh.exe`；当前机器尚未执行 `gh auth login`，真实上传链路待用户登录后验收。

### 2026-10-05 批次 52：分享设置独立（已验收，随 `52a1da50f` 提交）

- 新增设置分类“集成 > 分享”，不再把分享目标混在“Provider 与模型”页面。
- Radius 区块显示登录状态和凭据来源，复用现有 Provider 登录/退出弹窗，底层仍写 Pi `~/.pi/agent/auth.json`。
- GitHub CLI 区块显示自动检测路径、来源、版本和 `gh auth status`；支持手动选择 `gh.exe`、保存路径、清除配置和复制登录命令。
- GitHub CLI 路径保存到 CodePIddy `settings/share.json`，不保存 Token；分享 helper 新增 `--gh-path`，优先使用该路径。
- Provider 设置页的凭据列表和登录弹窗已排除 Radius，避免与分享设置重复；底层 Provider 认证能力保持不变。
- 当前机器 `gh auth status` 已通过，GitHub CLI 版本为 `2.102.0`；批次 53 删除机器特定路径后，需要在分享设置里手动选择一次 `D:\GitHubCLI\gh.exe`，或设置 `CODEPIDDY_GH_PATH`。未创建测试 Gist，等待用户从分享弹窗做端到端验收。

### 2026-10-05 批次 53：分享设置图标与路径检测收口（已验收，随 `52a1da50f` 提交）

- 将根目录的 `github-6.svg`、`pi-logo-on-light.svg` 移入 `codepiddy-icons/`，分别整理为 `github-cli.svg` 和 `radius.svg`。
- 分享设置中的 Radius 和 GitHub CLI 改用正式品牌图标，通过 Vite `?url` 资源导入。
- 删除 GitHub CLI 检测中的 `D:\GitHubCLI` 机器特定路径；检测顺序统一为：手动配置路径、`CODEPIDDY_GH_PATH`、PATH、官方安装器标准目录。
- 分享 helper 同步删除该机器路径，继续优先接收主进程传入的 `--gh-path`。
- 分享会话成功态弹窗去掉重复外层 padding，宽度 560px→520px，关闭按钮右边距恢复到 24px，成功态高度收紧。

### 2026-10-05 批次 54：诊断包导出与统一组件规则（已提交）

- 新增客户端原生诊断包导出：设置页“诊断”与 `/debug` 共用入口，先隐私确认，再导出本地 ZIP，不上传。
- 诊断包收集 CodePIddy / Pi / Electron / Node / 系统版本，Agent / Session / Provider / MCP / trust 摘要、最近错误、可用日志，并可选择包含脱敏后的 Session JSONL。
- 新增 [ui-component-rules.md](./ui-component-rules.md)，明确同一种交互只允许一个组件实现。
- 临时消息统一走 `SettingsToast`，支持 title、detail、path、action 和最右侧 `×`；App 级旧 `.toast` 已迁入。
- 持久内联状态统一走 `StateBlock`；全局错误、分享状态、MCP / llama.cpp / terminal / WorkPanel 等主要错误和加载状态已迁移。
- 所有复选框统一走 `SettingsCheckbox`；所有 App modal 统一走 `ModalShell`。
- 验证：`npm run check`、desktop typecheck、`npm run build:codepiddy`、诊断单测 3 项、Playwright demo 均通过；真实 Electron 已重启。

### 2026-10-06 批次 55：会话滚动定位与 compact 历史修复（已提交）

- 提交：`501be668a fix(desktop): 会话滚动定位与 compact 历史缺失修复`。
- 每个访问过的 Agent 常驻独立 `TranscriptPane`，切换 Agent 只做显隐；滚动位置、DOM 和折叠状态归各自 pane 所有。
- 界面历史改用 Pi `get_entries` 完整会话条目，`get_messages` 只代表 compact 后的 LLM 上下文，压缩后会丢失前缀消息。
- Agent 激活、Session 切换、Fork、克隆、导入和进程启动统一走 `historyMessages()`，compact 后历史前缀不再消失。
- 快速定位条只标记用户消息，时间显示完整年月日时分；定位条只在两轮以上且内容溢出时显示。
- 验证：`npm run check`、desktop typecheck、`npm run build:codepiddy` 通过；真实 Electron 已验证历史恢复和定位条显示。

### 2026-10-06 批次 56：Modal 输入框焦点环裁剪修复（已提交）

- 用户反馈重命名会话弹窗的输入框蓝色焦点环下侧被白色区域盖住。
- 根因：`.modal-shell-body` 是 `overflow-y: auto` 的滚动容器，底部没有给焦点环外扩空间。
- 修复：`.modal-shell-body` 底部增加 `--cp-space-sm` 内边距；弹窗结构、输入交互和其他 modal 行为不变。
- 验证：`npm run check`、desktop typecheck、`npm run build:codepiddy` 通过；真实 Electron 已重启。

### 2026-10-06 批次 57：定位条窗口式 20 条与滚轮翻页（已提交）

- 提交：`52a05d8e0 fix(desktop): 定位条改为窗口式 20 条并支持滚轮翻页`。
- marker 仍覆盖全部用户消息索引，但一次最多渲染 20 条，超长会话不会把左侧定位条堆满。
- 定位条支持滚轮上下翻窗口；点击仍按稳定 marker id 精确跳转。
- 当前 active 节点跑出可见窗口时自动平移，高亮不会丢失。

### 2026-10-06 批次 58：Cache Warming 设置与决策状态（已提交）

- 提交：`c17b64abf feat(desktop): add cache warming settings and status`。
- 设置页新增「常规 > 缓存预热」：模式 `off / streaming / idle` 和 `showCacheMissNotices` 写入 Pi 原生 `settings.json`，合并写不覆盖其他设置；改动对新启动或重置后的 Agent 生效。
- 新增 `packages/codepiddy-cache-warming-extension`：Pi 1.0.1 的 RPC 不返回 `session.cacheWarmingStatus`，扩展订阅 `cache_warming_decision`，把最近一次决策写入 `runtimeRoot/cache-warming/<agent>.json`。
- 会话统计面板新增「缓存预热」区块：显示模式、cache miss penalty、refresh cost、expected savings 和最近决策；没有决策时用 `StateBlock` 显示「尚无预热决策」，不伪造实时 state / nextWarmAt。
- 新扩展接入 `build-main.mjs`、`build-codepiddy-runtime.mjs`、Agent 启动参数和 `npm run check` 的 typecheck 列表。
- 修复 Provider 登录弹窗的嵌套滚动条：`.auth-modal .select-menu-list` 从绝对定位改为静态定位，弹窗随列表长高，列表保留自己的 `max-height` 滚动；避免 `.modal-shell-body` 外层滚动和 `.modal-shell` 的 `overflow: hidden` 裁切列表底部。
- 验证：`npm run check`、desktop typecheck、`npm run build:codepiddy`、设置读写单测 3 项、扩展状态文件单测 1 项、RPC smoke（加载 cache-warming 扩展）通过；demo `?demo=1` 截图检查设置卡片和会话统计面板；真实 Electron 已重启。

### 2026-10-06 批次 59：缓存预热云朵图标与弹窗滚动条收口（已提交）

- 提交：`6640bc795 fix(desktop): use cloud icon for cache warming`。
- 缓存预热图标从 lucide `Zap` 换成 `Cloud`，设置页「常规 > 缓存预热」导航和会话统计「缓存预热」区块统一；`app-icon.tsx` 移除不再使用的 `zap` 映射。
- Provider 登录弹窗的嵌套滚动条修复随本批提交：`.auth-modal .select-menu-list` 静态定位，弹窗随列表长高，列表自己滚动；修复前 `.modal-shell-body` 出现外层滚动条、列表底部被 `.modal-shell` 裁切。
- 验证：`npm run check`、desktop typecheck、`npm run build:codepiddy` 通过；demo `?demo=1` 截图检查云朵图标；真实 Electron 已重启。

### 2026-10-06 批次 60：上下文压缩设置（已提交）

- 提交：`db4e91195 feat(desktop): add context compaction settings`。
- 设置页新增「常规 > 上下文压缩」：自动压缩开关、全局 `reserveTokens` / `keepRecentTokens`、分支摘要 `reserveTokens` / `skipPrompt`，以及按精确 `provider/modelId` 的 `modelOverrides`。
- 设置合并写入 Pi 原生 `~/.pi/agent/settings.json`，保留其他配置；修改只对新启动或重置后的 Agent 生效，手动 `/compact` 不受影响。
- 单模型覆盖是全局参数的补充：未覆盖模型继续使用全局值。搜索框复用统一 `SelectMenu`，空态复用 `StateBlock`，没有新增第二套组件实现。
- 当前模型选择器的已选中项使用浅蓝底、蓝字、蓝色内描边；不要改成实心蓝底白字。
- 分支摘要当前只补配置，客户端会话树仍以 Fork 为主，实际触发由 Pi 的分支流程决定。
- 验证：`npm run check`、desktop typecheck、`npm run build:codepiddy`、设置读写单测 3 项、demo `?demo=1` 截图检查通过；真实 Electron 已重启。
- 同期由另一个 session 提交的 bugfix：`fe973c826` 常用模型设置刷新保留草稿并修复整页跳动、`032505627` 消息按实际模型显示并区分定位条窗口内外、`4909d90dd` 定位条颜色区分刚滚入的刻度、`6592f46d0` 滚入刻度亮黄后回归蓝色。

### 2026-10-06 批次 61：Codemode 设置、运行结果视图与 Provider 模型刷新（已提交）

- 提交：`ec4dde669 feat(desktop): add codemode settings and model refresh`。
- 设置页新增「常规 > Codemode」：读取/合并写入 Pi 原生 `settings.json` 的 `codemode.mode`（`on` 标准模式、`only` 仅 Codemode）和 `codemode.inlineBudget`（工具目录内联预算，留空使用 Pi 默认值）。
- 转录流新增 Codemode 专用运行结果视图：展开后显示 JavaScript 脚本、工具调用列表、调用状态、耗时、错误、完整输出路径和脚本结果；历史会话从 `tool result details` 恢复同样信息。
- 新增 `Braces` 图标并接入工具卡；Codemode 设置复用统一 `SelectMenu`、`SettingsToast`，没有新增第二套设置组件。
- Provider 新增/删除后，空闲 Agent 自动重连并重新读取 `models.json`，刷新常用模型范围和模型选择器；运行中或压缩中的 Agent 不强制中断，只显示待重连。
- 另一个 session 已提交 `b3693adba` 修复失效 Session 导致 Pi 启动失败、`7abba1aa1` 新建会话支持预设名称和模型，不要重做。
- 验证：`npm run check`、desktop typecheck、`npm run build:codepiddy`、Codemode 设置读写与详情解析单测 5 项、demo `?demo=1` 截图检查通过；真实 Electron 已重启。

### 2026-10-06 批次 62：工具设置与 MCP 自动刷新（已提交并推送）

- 代码提交：`6815fc026 feat(desktop): add tool settings and MCP refresh`；同期另一个 session 提交 `c7174fadc fix(desktop): 修复会话名称重启覆盖与删除交互`。
- 设置页新增「常规 > 工具」，读写 Pi 原生 `settings.json` 的 `defaultTools`。Pi 默认集合为 `read / bash / edit / write`；用户可以切换到自定义集合、恢复 Pi 默认或清空内置工具。
- 工具设置不再只写 `defaultTools`：Agent 启动时把未勾选的内置工具传给 `--exclude-tools`，从而从工具注册表真正排除，Codemode 也不能调用。扩展工具和 MCP 工具不受影响。
- 「工具发现与曝光」只读展示 MCP 服务级 `exposure`、工具级 `toolExposure` 和 `direct / deferred / codemode / hidden` 的含义；配置仍在「集成 > MCP 服务」，并提供直接跳转入口，不新增第二套 MCP 配置。
- 保存工具设置后，空闲的当前 Agent 自动重连；运行中或等待授权的 Agent 提示停止或手动重连后生效。
- MCP 服务保存、删除、项目覆盖、登录和退出后也统一触发同样的自动刷新：空闲 Agent 自动重连，运行中 Agent 延后生效。
- 修复“工具显示未启用但实际仍能调用”的根因：`defaultTools` 只控制直接激活，不能约束 Codemode 的工具注册表；`--exclude-tools` 才是完整隔离。
- 验证：`npm run check`、desktop typecheck、`npm run build:codepiddy`、工具设置单测 5 项、`?demo=1` 桌面 / 窄窗截图与交互检查通过；真实 Agent 启动参数已确认包含 `--exclude-tools`；真实 Electron 已重启。

### 2026-10-07 批次 63：Prompt 模板管理（已提交到本地 main）

- 代码提交：`8a9231079 feat(desktop): add prompt template management`。
- 设置页新增「Agent > Prompt 模板」：管理用户 `~/.pi/agent/prompts/` 和项目 `.pi/prompts/` 下的 Markdown 模板，支持新增、编辑、重命名、删除和打开模板目录。
- 模板编辑器支持 `description`、`argument-hint` 和正文；模板文件名就是命令名，例如 `review.md` 对应 `/review`。
- 设置页提供“使用”和“保存并插入”，会把 `/模板名 ` 插入当前 Agent 输入框；已有草稿作为参数接在命令后。`/name` 仍只用于 Session 重命名。
- 保存或删除后，空闲 Agent 自动重连并刷新 `/` 命令菜单；运行中或等待授权的 Agent 不强制中断，只提示停止或重连后生效。
- 实现完全在 `packages/codepiddy-desktop` 和 `packages/codepiddy-shared`，未修改 Pi core。
- 验证：`npm run check`、desktop typecheck、`npm run build:codepiddy`、模板单测 4 项、`?demo=1` 桌面 / 窄窗 / 保存 / 插入流程检查通过；真实 Electron 已重启。

### 2026-10-07 支线 64：工作区文件管理增强（已提交到本地 main）

- 代码提交：`293c6a5e2 feat(desktop): enhance workspace file management`。
- 参考项目：`E:\mypi-refs\reference-dsh-plugin-workbench`，拆解见 [reference-dsh-workbench.md](./reference-dsh-workbench.md)。
- 右侧「文件」视图新增完整文件树操作：新建文件 / 文件夹、重命名、删除、复制、剪切、粘贴、复制相对路径、刷新和资源管理器定位。
- 文件树支持多选、键盘快捷键、拖拽移动、自动刷新和按项目持久化展开状态；文件类型使用 Lucide 图标，保持 CodePIddy 的浅色和统一组件风格。
- 新增多标签预览：文本文件可编辑保存、未保存标记、`Ctrl/Cmd+S`、Markdown 渲染 / 源码切换、图片预览、行号、自动换行和复制。
- 新增磁盘变更同步：定时读取打开文件的元数据；干净标签自动重载，有未保存草稿时显示重新加载提示，不覆盖用户修改。
- 文件操作由 `packages/codepiddy-core/src/workspace-fs.ts` 提供，经 main IPC 和 preload 暴露；写操作检查项目路径、realpath 和 Agent write lease。
- 右键“在消息中引用”会把 `@相对路径` 插入当前 Agent 输入框。
- 未照搬深色主题、emoji 图标、自定义滚动条、宿主布局补丁和 `.dsh-trash`；语法高亮、撤销栈、标签拖拽排序、拖文件进聊天输入区留给后续可选增强。
- 验证：`npm run check`、desktop typecheck、`npm run build:codepiddy`、工作区文件操作单测 4 项、Playwright mock 文件树 / 右键菜单 / 重命名弹窗 / Markdown 编辑保存检查通过；真实 Electron 已重启。

### 2026-10-07 批次 65：工作区文件工作台增强（已提交到本地 main）

- 代码提交：`66f6bbe18 feat(desktop): polish workspace file workbench`。
- 文件编辑器新增常见语言语法高亮：TS / JS、Python、Rust、Go、Java、C / C++、C#、JSON、YAML、CSS、HTML、Markdown、Shell 等；高亮层与 textarea 滚动同步，超过 64 KB 回退纯文本。
- 文件标签支持拖拽排序；文件树条目可直接拖进聊天输入框，插入 `@相对路径`，多选时插入多个路径。
- 编辑器 `Tab` 插入制表符并保持 textarea 焦点，不再跳到其他控件。
- `@` 文件菜单补齐 `/` 命令菜单的键盘规则：上下键选择、自动滚动到当前项、滚轮接管、Enter / Escape。
- 项目栏、对话区边界、右侧工作区和文件树 / 文件预览共用统一宽度拖拽手柄；文件树宽度按项目保存。左侧项目栏手柄覆盖在毛玻璃边界上，不额外占布局宽度；蓝色悬停短条保留。
- 修复统一过程中右侧工作区手柄被替换成按钮后出现默认图标的问题，恢复原 `.work-panel-resize` DOM、鼠标事件和视觉。
- 验证：`npm run check`、desktop typecheck、`npm run build:codepiddy`；Playwright mock 验证语法高亮、标签重排、文件拖入输入框、`@` 菜单滚动、编辑器 Tab、三处手柄光标和毛玻璃边界无额外缝隙；真实 Electron 已重启。

### 2026-10-07 支线 66：工作区文件操作撤销栈（已提交到本地 main）

- 代码提交：`a1a2c0870 feat(desktop): add workspace file undo stack`。
- 按 `reference-dsh-workbench.md` 补齐文件操作撤销栈，未修改 Pi core。
- 每个项目独立保存最近 30 条操作；支持新建、重命名、复制、移动、删除的撤销。
- 删除不再永久移除文件：先移动到同目录的隐藏 `.codepiddy-trash`，撤销时通过重命名恢复；栈溢出时清理被淘汰的回收项。
- 文件树工具栏新增撤销入口，文件树支持 `Ctrl/Cmd+Z`；回收目录从 `listWorkspaceDir` 和文件搜索中隐藏。
- 重命名或移动时同步迁移标签、活动文件、编辑器状态和展开目录，避免已打开文件去读取旧路径；撤销时同样迁回。
- 验证：`npm run check`、desktop typecheck、`npm run build:codepiddy`、工作区文件操作单测 5 项、Playwright mock 新建 / 重命名 / 复制 / 移动 / 删除撤销流程及打开文件重命名 / 撤销检查通过；真实 Electron 已重启。

### 2026-10-07 阶段 4 第 29 项：Pi Packages 审计（代码未改动）

- 确认 Pi Packages 是 Pi 自己管理的扩展包，不等同于 CodePIddy 的 npm 依赖；一个包可包含
  extensions、skills、prompts、themes。
- 用户级配置为 `~/.pi/agent/settings.json`，项目级为 `.pi/settings.json`，`packages` 支持
  字符串和带 `source` / `autoload` / 资源过滤数组的对象。
- 安装源支持 `npm:`、Git URL 和本地路径；用户级 / 项目级安装路径、信任要求和 CLI 命令已审计。
- Pi 1.0.1 导出 `DefaultPackageManager`，可用于程序化列表、安装、更新、移除和更新检查；
  `pi list` 没有 JSON，不应作为客户端列表的唯一数据源。
- CodePIddy 默认使用 `--no-extensions` 隔离第三方 package extension；客户端按包提供显式
  开启开关，开启后启动 Agent 时把该包的 extension 作为额外 `--extension` 加载。
- 下一步实现客户端原生 Pi Packages 设置页，范围先限定为包来源管理、安装、更新、移除、刷新、
  版本 / 作用域 / 路径 / 资源摘要、按包 extension 开关和错误诊断；暂不复刻 `pi config` 的 TUI。

### 2026-10-08 批次 67：Pi Packages 设置与运行时包管理（已提交到本地 main）

- 设置页新增「Agent > Pi Packages」，读取用户级和项目级包；显示来源、作用域、版本、安装路径、
  资源摘要和每个包的 extension 开关。
- 新增 `pi-package-helper.mjs`，用固定 runtime bundle 的 `DefaultPackageManager` /
  `SettingsManager` 完成列表、安装、移除、单包更新和更新检查；不解析 `pi list`，不调用裸
  `pi update`。
- 修复内置 runtime 的 SDK 包根问题：锁死 1.0.1 peer dependencies，补 `dist/index.js`，
  依赖完整 1.0.1 SDK 包提供 `dist/core/slash-commands.js`，并把完整 `node_modules` 纳入
  packaged runtime。`pi-subagents` 的 host peer alias 和 codemode 的 `quickjs-wasi`
  可正常解析；Pi 更新器仍安装完整 npm 包，更新后结构与内置 runtime 一致。
- 新增 `npm run update:pi-runtime -- <version>`，后续更新内置 runtime 时统一替换 bundle、
  同步 SDK / peer 版本、hydrate `node_modules` 并验证；不允许只替换 `dist/bundle`。
- Pi 更新器新增完整 runtime 校验：`dist/index.js`、`dist/core/slash-commands.js`、
  `pi-agent-core`、`pi-ai`、`pi-tui`、`chord` 和 `quickjs-wasi` 缺一不可；失败保留当前版本。
- 新增 main / IPC / preload / shared 类型边界；项目级操作要求项目已打开且受信任，未受信任时
  只显示用户级包并提示先信任项目。
- Agent Skills 目录现在合并 package manager 解析出的 skill，避免 Pi 运行时已经能看到的
  `skill:pi-subagents` 在客户端设置页里消失。
- 设置页复用 `ModalShell`、`SettingsToast`、`StateBlock`、`SelectMenu`；安装前显示第三方包风险，
  更新只作用于当前包，配置变更后空闲 Agent 自动重连并刷新命令菜单。开启 extension 时写入
  Pi 原生 `extensions: ["*"]`，关闭时写入 `extensions: []`；Agent 只显式加载开启的包。
- 安装弹窗里的作用域下拉改为静态参与布局，避免展开时给 `.modal-shell-body` 增加内层滚动条。
- 移除 Pi Packages 页面里的常驻项目信任警告；信任状态仍由 Pi `trust.json` 的继承结果决定，
  未受信任时只禁用项目级操作，不再在页面顶部重复提示。
- 内置命令说明改为读取真实 `dist/core/slash-commands.js`；`/name`、`/session`、`/fork`、
  `/clone` 不再统一显示为“Pi 内置命令”。
- 验证：`npm run check`、desktop typecheck、`npm run build:codepiddy`、Pi Package helper 单测
  6 项（含用户级本地包安装 / 移除、extension 开关和 package prompt 来源读取）、
  真实用户级 npm 包列表读取、`?demo=1`
  桌面 / 安装弹窗 / 窄窗截图检查通过；真实 Electron 已重启。
- 代码提交：`3db8f6a37 feat(desktop): add Pi package controls and complete runtime root`。

### 2026-10-08 批次 68：客户端边界清理（已验收并提交 `65607e721`）

- 结论：CodePIddy 保留客户端编排、配置、展示和产品层；不再复制 Pi core 已公开的运行时能力。
- 保留自研扩展：`review` 变更 diff、`retry` 网关并发错误兜底、`cache-warming` 状态桥、
  内置 Agent Skills、角色提示词注入、角色 Skill 分配。
- 删除非原生功能：`permission-extension`、Tavily `web_search` 自建 MCP、
  `provider-extension`、`role-guard-extension`。
- Tavily 删除范围：专用设置、`web_search` 自动 MCP 条目、`TAVILY_API_KEY` 注入、
  角色提示词中的 Web Search Contract 和 `packages/codepiddy-tavily-search-mcp`。
- 重复实现审计：`llama.cpp` 桌面管理器和 `/share` helper 只保留 GUI / 配置适配；
  Pi 1.0.1 公开 SDK 导出与 RPC 没有 `LlamaClient` / `shareSession` 等价入口，
  本轮不搬 core 源码，等待 Pi 提供稳定入口。
- 已撤销上一轮未提交的 `subagents.defaultExtensions` 和 permission forwarding 兼容补丁。
- 删除内容：四个包目录、workspace / lockfile、runtime 和 desktop 构建入口、Agent 启动参数、
  settings store、IPC / preload / shared 类型、设置页 Tavily / 默认权限入口、诊断 permission 日志和
  Web Search Contract。
- 验证：`npm run check`、desktop typecheck、`npm run build:codepiddy`、`?demo=1` 设置导航检查通过；
  确认 Tavily / 默认权限入口不再出现，MCP / Agent Skills / Pi Packages 保留。
- 代码提交：`65607e721 feat(desktop): remove non-native client extensions`。

### 2026-10-08 批次 69：Shell aliases / Shell command prefix（已验收并提交 `cab6fa4ff`）

- 在设置页「常规 > Shell」增加 `shellCommandPrefix` 多行编辑器，和已有 bash 可执行文件配置放在同一页。
- `@codepiddy/shared` 增加 `shellCommandPrefix` 状态字段和保存接口；main / preload / IPC
  使用同一窄 API，不暴露原始 shell 命令。
- `AppSettingsStore` 合并读写 Pi 原生 `settings.json` 的 `shellCommandPrefix`；CRLF 归一为
  LF，空白值删除字段，其他 settings 字段保持不变。
- IPC 校验限制长度并拒绝 NUL；保存反馈走 `SettingsToast`，持久错误走 `StateBlock`。
- 保存后空闲 Agent 自动重连；运行中或等待授权的 Agent 提示停止或重连后生效。
- 验证：`npm run check`、desktop typecheck、`npm run build:codepiddy`、Shell 命令前缀单测 4 项、
  `?demo=1` 桌面 / 900px 窄窗截图检查通过；真实 Electron 已重启。

### 2026-10-08 批次 70：Telemetry 设置（已验收并提交 `cc55936ec`）

- 设置页新增「常规 > Telemetry」，用 `SettingsCheckbox` 控制 Pi 原生 `settings.json`
  的 `enableInstallTelemetry`。
- 状态返回 `enabled`、`effectiveEnabled` 和 `PI_TELEMETRY` 覆盖状态；环境变量存在时
  界面显示实际生效值，不再把文件值冒充生效值。
- `PI_OFFLINE`、匿名版本报告、Provider 归属请求头和隐私范围写入页面说明。
- `enableAnalytics` / `trackingId` 没有实际消费方，不提供假开关。
- 合并写 settings.json，保留其他字段；保存后空闲 Agent 自动重连，运行中 Agent 延后生效。
- 验证：`npm run check`、desktop typecheck、`npm run build:codepiddy`、Telemetry 单测 5 项、
  `?demo=1` 桌面 / 900px 窄窗截图检查通过；真实 Electron 已重启。

### 2026-10-08 自定义 Provider / 特殊模型审计（代码未改动）

- 静态自定义 Provider 走 `models.json`；当前客户端只覆盖简单字段，保存模型时会重建
  `models` 数组，可能删除未知高级字段。`PROVIDER_APIS` 还错误限制为四种 API。
- `models.json` 的 Provider / Model / `modelOverrides` schema 已写入
  `pi-1.0.1-feature-audit.md`；第一批实现必须无损写回并补齐主要高级静态字段。
- 虚拟模型只能由 extension / SDK `registerVirtualModel()` 注册；不能写进 `models.json`，
  也不做无代码路由编排器。
- 实测 `models.json` 中的 `type: "image"` 会被忽略并作为 chat 模型加载；自定义
  classifier / image 必须由 Provider extension 声明 `type`、`classifiers` 或 `images`。
- 内置 1.0.1 无网络目录枚举到 59 个 image、20 个 classifier 和 42 个 Provider；
  `get_available_models` RPC 只返回 chat，classifier / image 不出现。
- `pi-auth-helper.mjs` 不加载 package extension，extension Provider 的登录状态不会显示；
  第三方 extension 认证桥接要单独评估，不能恢复自动加载所有扩展。

### 2026-10-08 批次 71：Provider 配置正确性与无损保存（已验收并提交 `e46d0010e`）

- 共享类型对齐 Pi 1.0.1 `models.json` 的 Provider / Model / ModelOverride schema，增加
  未知字段承载对象，保存时不丢用户手写的字段。
- `AppSettingsStore` 从“重建 Provider / models 数组”改为按字段补丁写回；已有模型通过
  `originalId` 定位，改模型 ID 时同步迁移，不再删除原未知字段。
- Provider 编辑器支持 Provider 级 `headers / authHeader / compat / modelOverrides` 和模型级
  `api / baseUrl / thinkingLevelMap / inputLimits / cost / promptCache / samplingParams /
  headers / compat`；复杂字段走受控高级 JSON。
- API 类型改为统一 `SelectMenu`，列出 Pi 1.0.1 静态 API，同时提供「自定义 API...」输入路径；
  不再用原生 `datalist`，也不把 API 限制为四种。
- 保存后继续复用空闲 Agent 自动重连、运行中 Agent 延后生效；IPC / main 校验非法 JSON、
  非正数、重复模型 ID 和不完整 cost。
- 新增 `provider-settings.test.ts` 5 项，覆盖未知字段保留、嵌套合并、字段删除、模型重命名
  和非法输入；`npm run check`、desktop typecheck、`npm run build:codepiddy`、demo
  桌面 / 窄窗截图检查通过；真实 Electron 已重启。

## 待办清单（按优先级，下一批从这里挑）

1. [x] **会话树弹窗**：批次 18 已验收，随 `4473a98` 提交。
2. [x] **工作区面板多视图**：批次 19-21 已实现并在真实 Electron 中验证，随 `b2644f5`、`b5e30b2` 提交。
3. [x] **结构清理**：批次 22 删除旧玻璃层，白色叠加只剩侧栏 sheen 两处；已验收。
4. [x] **`.impeccable/design.json` sidecar**：批次 22 已写入 schemaVersion 2；已验收。
5. [x] **内置终端**：批次 24-25 用 `xterm + node-pty` 真 PTY，并读取本机 Windows Terminal 默认 profile；已验收。
6. [x] **收尾清理**：批次 27 把 Impeccable 安装目录加入 `.gitignore`，终端改为按需加载以消除大包告警，并同步过期设计文档。
7. [x] **变更 diff 证据**：批次 28 新增 `@codepiddy/review-extension`，Write / Edit 前后快照生成 unified patch；同时修复 Agent 操作菜单定位。
8. [x] **工作区面板默认收起**：批次 29 启动不再自动展开右侧面板，只保留宽度记忆。
9. [x] **重试不侵入化**：批次 30 把退避参数写进 Pi 原生 settings.json，网关并发错误用 `agent_before_settle` 扩展兜底，core 补丁已回退。
10. [x] **设置页分区与集成配置**：批次 31 设置页改成左侧分类导航；新增 MCP 服务和 Provider / 模型的客户端配置。
11. [x] **会话 Fork 可发现性**：批次 32 Fork 按钮常显，Fork 后关弹窗、提示并聚焦输入框。
12. [x] **Agent 会话新建 / 切换**：批次 33 每个 Agent 可列出、新建、切换会话，Fork 分支也在列表里，选择会持久化到重启。
13. [x] **对话快速定位条升级**：批次 35 加 dock 余弦放大、溢出才显示，保留滚动跟随与预览。
14. [ ] **更改 diff 卡片堆叠**：批次 36 已实现并完成截图验证，等待用户验收。
15. [ ] **用户消息级快捷 Fork**：批次 37 已实现并完成截图验证，等待用户验收。
16. [x] **Pi 1.0.1 功能审计与版本收口**：批次 38 已完成文档审计、固定内置 1.0.1 bundle、客户端 Provider 登录和统一 SelectMenu，已提交。详细清单见 [pi-1.0.1-feature-audit.md](./pi-1.0.1-feature-audit.md)。
17. [x] **web_search 原生 MCP 统一**：批次 39 已验收并提交。下一步是 MCP 设置 UI 的项目级 override、enabled、exposure、toolExposure、description、timeout 和 OAuth。
18. [x] **MCP 设置完整能力**：批次 40 已验收并提交。下一步是 `/mcp` 的客户端等价入口和 `pi mcp` 包装。
19. [x] **MCP 管理入口**：批次 41 已实现并完成隔离与视觉验证。下一步进入阶段 2：Provider 认证与凭据来源补齐。
20. [x] **MCP 设置反馈与扩展隔离收口**：批次 42 已实现、验证并提交。
21. [x] **Provider 凭据状态与来源显示**：批次 43 已实现、验证并提交；下一步是登录后刷新模型列表和当前 Agent。
22. [x] **登录后刷新 Agent 与模型**：批次 44 已实现、验证并提交。
23. [x] **Provider 搜索与厂商图标**：批次 45 已实现、验证并提交；下一步只剩 OpenRouter 真实 OAuth 端到端验收。
24. [x] **Provider 组合框交互修正**：批次 46 已实现、验证并提交。
25. [x] **Git Bash 黑窗修复与 Shell 重启提示**：批次 47 已实现、验证并提交。
26. [x] **阶段 3 前四项**：批次 48 已完成 `/scoped-models` 的常用模型范围、`/import` 客户端导入、`/trust` 持久化和 `/session` 统计，提交 `d402e6a7e`。
27. [x] **阶段 3 第 20 项 `/name`**：批次 49 已完成无参查询、会话树名称展示和客户端重命名，已验收并提交。
28. [x] **阶段 3 第 21 项 `/llama`**：批次 50 已完成客户端原生 router 管理和 mock 验证；真实 router 端到端测试待后续环境。
29. [x] **阶段 3 第 22 项 `/share`**：批次 51-53 已实现并验收客户端分享、独立分享设置、品牌图标和通用路径检测。
30. [x] **阶段 3 第 23 项：客户端诊断包导出**：批次 54 已实现客户端原生诊断导出、隐私确认、日志收集、可选脱敏 Session JSONL 和本地 ZIP；不做 `/bug` slash command。
31. [x] **统一 UI 组件规则**：批次 54 已将临时消息、持久状态、复选框和弹层分别收口到 `SettingsToast`、`StateBlock`、`SettingsCheckbox`、`ModalShell`，并写入 [ui-component-rules.md](./ui-component-rules.md)。
32. [x] **会话滚动定位与 compact 历史修复**：批次 55 使用常驻 Agent 转录面板和 Pi `get_entries` 完整历史，修复切换 Agent 后历史前缀丢失、滚动位置漂移和定位条错误。
33. [x] **Modal 输入框焦点环裁剪修复**：批次 56 给 `ModalShell` body 补底部内边距，重命名会话等弹窗的蓝色焦点环完整显示。
34. [x] **定位条窗口式 20 条与滚轮翻页**：批次 57 保留完整用户消息索引，但限制单次渲染数量，并支持滚轮翻窗口和 active 自动平移。
35. [x] **Cache Warming 设置与决策状态**：批次 58 已实现设置页「缓存预热」和会话统计的最近决策费用；已验收并提交 `c17b64abf`。
36. [x] **缓存预热云朵图标与弹窗滚动条收口**：批次 59 已验收并提交 `6640bc795`。
37. [x] **上下文压缩设置**：批次 60 已实现自动压缩、分支摘要和 per-model compaction overrides，提交 `db4e91195`。下一步进入阶段 4 第 26 项 Codemode 设置和运行结果视图。
38. [x] **Codemode 设置与 Provider 模型刷新**：批次 61 已实现 Codemode `mode / inlineBudget` 设置、转录流运行结果视图，以及 Provider 新增/删除后的 Agent 模型目录刷新，提交 `ec4dde669`。下一步进入阶段 4 第 27 项 Tool Search / Tool Exposure。
39. [x] **工具设置与 MCP 自动刷新**：批次 62 已实现 `defaultTools` 严格内置工具隔离、工具发现与曝光只读汇总、工具设置 / MCP 配置保存后的空闲 Agent 自动重连，提交 `6815fc026`。同期另一个 session 提交 `c7174fadc` 修复会话名称重启覆盖与删除交互。下一步进入阶段 4 第 28 项 Prompt Templates。
40. [x] **Prompt 模板管理**：批次 63 已实现用户 / 项目模板增删改、`/模板名` 插入、空闲 Agent 自动重连和命令菜单刷新，提交 `8a9231079`。下一步进入阶段 4 第 29 项 Pi Packages。
41. [x] **支线 64：工作区文件管理增强**：已适配参考项目的文件树操作、多选 / 剪贴板 / 拖拽、多标签编辑保存、磁盘变更同步、文件图标和 `@相对路径` 插入；写操作检查项目边界、realpath 和 Agent write lease。主线仍从阶段 4 第 29 项 Pi Packages 继续。
42. [x] **批次 65：工作区文件工作台增强**：语法高亮、标签拖拽排序、文件拖进聊天输入框、编辑器 Tab、`@` 菜单键盘导航、统一宽度拖拽手柄和毛玻璃边界收口已完成并提交 `66f6bbe18`。下一项按参考项目实现文件操作撤销栈。
43. [x] **支线 66：工作区文件操作撤销栈**：每项目 30 条撤销栈、隐藏回收目录、工具栏撤销、`Ctrl/Cmd+Z`，覆盖新建、重命名、复制、移动、删除；代码提交 `a1a2c0870`，支线至此收口。
44. [x] **阶段 4 第 29 项：Pi Packages 审计**：确认配置格式、用户 / 项目作用域、npm / Git / 本地路径、安装位置、CLI 与 `DefaultPackageManager` 能力，以及 `--no-extensions` 对 package extension 的隔离边界；下一步实现客户端原生 Pi Packages 设置页。
45. [x] **批次 67：Pi Packages 设置与运行时包管理**：实现用户 / 项目级包列表、npm / Git / 本地路径安装、移除、单包更新、更新检查、项目信任校验、资源摘要和按包 extension 开关；开启后 Agent 显式加载对应 extension，关闭后不加载。helper 使用 runtime bundle，不解析 `pi list`，不更新 Pi 运行时。完整 runtime 包根、内置 runtime 更新脚本和命令说明适配已提交 `3db8f6a37`。待验收。
46. [x] **批次 68：客户端边界清理（已验收并提交 `65607e721`）**：删除 `permission-extension`、Tavily `web_search` 自建 MCP、`provider-extension`、`role-guard-extension`；保留 `review`、`retry`、`cache-warming`、自研 Skills、角色提示词和角色 Skill 分配；审计确认 `llama.cpp` 与 `/share` 暂无公开 Pi core 入口，只保留 GUI / 配置适配。下一步实现 Shell aliases。
47. [x] **批次 69：Shell aliases / Shell command prefix**：设置页「常规 > Shell」已支持 Pi 原生 `shellCommandPrefix` 多行编辑、清除、合并写入和 Agent 重连；单测覆盖合并写入、清除、保留其他 settings 与 NUL 校验。已验收并提交 `cab6fa4ff`。
48. [x] **批次 70：Telemetry 设置**：已实现 Pi 原生 `enableInstallTelemetry`；设置页「常规 > Telemetry」提供开关、行为说明、`PI_TELEMETRY` 环境变量覆盖状态和 Agent 重连。未实现 `enableAnalytics` / `trackingId`。提交 `cc55936ec`。
49. [x] **批次 71：自定义 Provider 配置正确性与无损保存**：已完成并提交 `e46d0010e`。未知字段保留、字段补丁写回、Provider / 模型高级 JSON、统一 API `SelectMenu`、自定义 API 路径和 5 项单测均已验收。
50. [ ] **批次 72：特殊模型目录**：由 Agent 进程 extension 读取 `modelRegistry.getAllModels()`，只读展示 chat / virtual / classifier / image、来源和可用性。RPC `get_available_models` 不能作为唯一数据源。不给 `models.json` 添加无效的 image / classifier 类型；不恢复已删除的 provider extension；不做无代码虚拟模型路由编排器。
51. [ ] **批次 73：消息页只依赖 Pi core 原生的优化**：完整范围、审计证据、任务清单 T1-T15 和回归红线见 [desktop-transcript-optimization.md](./desktop-transcript-optimization.md)。原则是只做 Pi core 原生可实现的优化，不碰 `packages/coding-agent` / `coding-agent-runtime` / `packages/ai`，不做扩展 / MCP / subagent 专用卡。T15 长会话窗口化先搁置。

## 提交状态

批次 55-62 已推送到 `origin/main`；批次 63 Prompt 模板、支线 64-66 工作区文件工作台、批次 67 Pi Packages、批次 68 边界清理、批次 69 Shell command prefix、批次 70 Telemetry 和批次 71 Provider 无损保存仍只在本地 `main`，尚未推送。批次 58 Cache Warming 提交 `c17b64abf`，批次 59 云朵图标和 Provider 登录弹窗嵌套滚动条收口提交 `6640bc795`，批次 60 上下文压缩提交 `db4e91195`，批次 61 Codemode 与 Provider 模型刷新提交 `ec4dde669`，批次 62 工具设置与 MCP 自动刷新提交 `6815fc026`，批次 63 Prompt 模板提交 `8a9231079`，支线 64 工作区文件管理提交 `293c6a5e2`，批次 65 工作区文件工作台增强提交 `66f6bbe18`，支线 66 工作区文件撤销栈提交 `a1a2c0870`，批次 67 提交 `3db8f6a37`，批次 68 提交 `65607e721`，批次 69 提交 `cab6fa4ff`，批次 70 提交 `cc55936ec`，批次 71 提交 `e46d0010e`。另一个 session 还提交了 `fe973c826`、`032505627`、`4909d90dd`、`6592f46d0`、`b3693adba`、`7abba1aa1`、`c7174fadc`、`ebd1ea58b`、`873784d2c`。提交哈希以 `git log -1` 为准。

`E:\trust-demo-project` 是本机测试信任弹窗用的外部目录，不在仓库中。若要在同一机器重复测试，需要先删除 `C:\Users\zhaoy\.pi\agent\trust.json` 中该路径的决定。

`npx impeccable install` 的本地安装目录仍在 `.gitignore` 中，不提交。后续如改 `package-lock.json`，仍需按仓库规则使用 `PI_ALLOW_LOCKFILE_CHANGE=1`。

## Pi core 更新边界（2026-10-03 审计）

2026-10-08 补充：内置 `packages/coding-agent-runtime` 已从 bundle-only 目录升级为完整
1.0.1 canonical package root。以后更新内置 runtime 使用
`npm run update:pi-runtime -- <version>`，由脚本统一替换 bundle、同步 SDK / peer 版本、
hydrate 依赖并校验，不能只替换 `dist/bundle`。桌面端内置 Pi 更新器安装的是官方完整 npm 包，
并校验 SDK 入口、commands、host peers 和 `quickjs-wasi`，因此正常更新 Pi 不会再破坏
subagent / codemode 的宿主解析。

结论：审计时发现两处功能性 core 补丁在 Pi 更新后失效；批次 30 已把它们改成不侵入实现。现在 `packages/ai/src/utils/retry.ts` 和 `packages/coding-agent/src/core/settings-manager.ts` 与上游基线 `9cf21c8` 完全一致。

审计发现（历史记录）：

1. `packages/ai/src/utils/retry.ts` 曾加入 `gateway_concurrency_limit` / `concurrency.?limit` 两个可重试模式（commit `c345b54`）。v0.99.1 的 bundle 里没有这两个字符串。
2. `packages/coding-agent/src/core/settings-manager.ts` 曾把 `getRetrySettings()` 默认值改成 `5 / 1000 / 5000`。v0.99.1 仍是上游 `3 / 2000 / DEFAULT_MAX_AGENT_RETRY_DELAY_MS`。

批次 30 的不侵入实现：

- **退避策略走配置**：外壳启动时把 `retry.maxRetries = 5 / baseDelayMs = 1000 / maxAgentDelayMs = 5000` 合并写进 Pi 原生 `~/.pi/agent/settings.json`（只补缺失字段，用户显式配置优先）。Pi 内置重试和扩展共用这一份参数，更新后仍然生效。
- **网关并发错误走扩展**：新增 `packages/codepiddy-retry-extension`。Pi 内置重试只认自己的错误列表，网关并发错误不在里面；内置重试放弃后会触发 `agent_before_settle`，扩展在这里检查 `outcome === "error"`、`context.canContinue` 和错误文本，按同一套退避参数 sleep 后返回 `{ continue: true }`，强制再发一次 provider 请求。
- **版本口径**：功能以更新后的 Pi（v0.99.1+）为准，`agent_before_settle` 是必备事件，不做旧版本兼容；类型用最小结构声明 + 窄化 cast，只是因为仓库 vendored 类型较旧。
- **副作用**：扩展的 continue 不新增 user 消息，也不改 Pi core；内置重试和扩展兜底是两层，命中双方模式的错误最多会尝试 `2 × maxRetries` 次。

不影响运行、更新后会被上游完整包覆盖的 core 差异：

- 删除的 docs / examples / test（清理 commit `45c39bc`）。
- 各 Pi 包 devDependency `vitest 4.1.9 → 4.1.11`。
- 生成的 `packages/ai/src/providers/data/*.json` 模型数据。

已经修掉的旧侵入：

- `PI_SHELL_PATH` 私有环境变量旁路（`647cf1b`）。
- 私有 RPC 命令（`7d5f368`）。
- `getShellPath()` 现在只读 Pi 原生 `settings.json`。

## 决策记录

| 日期 | 决策 | 理由 |
| --- | --- | --- |
| 2026-10-02 | 只参考 PI-Desktop 的设计语言，不参考其架构与功能 | 用户明确要求 |
| 2026-10-02 | 目标主题为浅色 | 用户明确倾向 |
| 2026-10-02 | 引入 `lucide-react` 统一图标；恢复 `codepiddy-icons/` 作为设计源 | 用户同意 |
| 2026-10-02 | 只做客户端美化，不改业务逻辑 | 用户明确边界 |
| 2026-10-02 | 北极星「精密仪器台」，色调分层，紧凑精密 | 用户选定 1A/3A/4A |
| 2026-10-02 | 强调色从青绿 `#0f766e` 改为蓝 `#2563eb` | 用户明确表示不喜欢绿色、偏好蓝色 |
| 2026-10-02 | 跳过 AI 生成的效果图环节 | 当前运行环境没有原生图像生成能力，`DESIGN.md` 即为视觉契约 |
| 2026-10-02 | UI 字体采用 `Monaspace Argon + Maple Mono NF CN` | 用户要求英文和中文分别优化，且两份字体均适合作为技术工具字体 |
| 2026-10-02 | app icon 使用透明黑白矢量，不再保留图片底模 | 用户确认原图白色背景造成分层 |
| 2026-10-03 | 变更 diff 走 Pi 扩展快照（`tool_call` 前抓旧内容、`tool_result` 后写 patch），不改 Pi core | 用户明确要求 Pi core 可更新，增强只能走扩展点 |
| 2026-10-03 | 记入 core 更新边界审计：重试默认值和 gateway 并发错误模式曾是 core 补丁，更新后失效 | 用户要求确认外壳没有依赖私有 core 修改 |
| 2026-10-03 | 退避参数写 Pi 原生 settings.json，网关并发错误用 `agent_before_settle` 扩展兜底，core 补丁回退 | 用户要求功能不侵入且 Pi 更新后仍然有效 |
| 2026-10-03 | 开发只适配最新 Pi；更新器的回退 / 自动回退保留给用户侧 | 用户明确：开发不需要旧版本兼容，回退是用户更新失败时的保护 |
| 2026-10-03 | 设置页改左侧分类导航；MCP / Provider 直接在客户端配置，写 Pi 原生 mcp.json / models.json | 用户要求设置分类清晰，并参考项目做到客户端内配置 |
| 2026-10-03 | UI 改完 build 通过后自动重启客户端，不再询问 | 用户明确要求「下回你自动重启」 |
| 2026-10-06 | 会话界面历史必须用 Pi `get_entries`，不能用 `get_messages` | `get_messages` 是 compact 后的 LLM 上下文，压缩后会丢前缀消息 |
| 2026-10-06 | 自动压缩 / 分支摘要 / per-model overrides 只写 Pi 原生 `settings.json`，不改 core | Pi 1.0.1 已有配置能力，客户端负责设置入口和校验 |
| 2026-10-06 | 当前模型选择器的已选中项使用浅蓝底、蓝字、蓝色内描边，不用实心蓝 | 用户明确选择第一次浅蓝选中态，实心蓝过重 |
| 2026-10-06 | Codemode 只适配 Pi 原生 `codemode.mode / inlineBudget`，运行结果读 `tool_execution_*` 的 details | Pi core 可更新，外壳不复制 Codemode 引擎 |
| 2026-10-06 | Provider 新增/删除后刷新模型目录，空闲 Agent 自动重连，运行中 Agent 延后生效 | 避免强制中断当前回复，同时不要求用户重启客户端 |
| 2026-10-06 | 内置工具用 `defaultTools` 控制直接激活，并用 `--exclude-tools` 排除未勾选项 | `defaultTools` 单独使用无法阻止 Codemode 调用已注册工具 |
| 2026-10-06 | MCP exposure 继续只在 MCP 服务页配置，工具页只读汇总 | 避免为同一配置维护第二套 UI；配置来源保持单一 |
| 2026-10-06 | 工具设置和 MCP 配置保存后，空闲 Agent 自动重连，运行中 Agent 延后生效 | 配置是 Agent 启动参数，必须重建进程才能保证工具索引和注册表及时生效 |
| 2026-10-07 | Prompt 模板由客户端管理用户 / 项目 Markdown 文件，模板名就是 `/命令名`；保存或删除后空闲 Agent 自动重连并刷新命令菜单 | Pi 不提供模板管理 RPC；模板在 Agent 启动时加载，运行中的 Session 不会自动重载 |
| 2026-10-07 | 工作区文件管理参考 `dsh-plugin-workbench` 的能力，但只适配到 CodePIddy 的 core / main / preload / renderer，不照搬其主题、emoji 和宿主补丁 | 保持项目视觉与安全边界；文件写入必须继续受项目路径、realpath 和 Agent write lease 约束 |
| 2026-10-07 | 文件操作撤销栈按参考项目实现：隐藏回收目录、`Ctrl/Cmd+Z`、工具栏撤销入口，覆盖新建、重命名、复制、移动、删除 | 用户明确要求直接按参考项目方案，不再自行设计删除恢复机制 |
| 2026-10-08 | 保留 `review`、`retry`、`cache-warming`、自研 Agent Skills、角色提示词和角色 Skill 分配 | 用户确认这些是有价值的客户端功能，不随边界清理删除 |
| 2026-10-08 | 删除 `permission-extension`、Tavily `web_search` 自建 MCP、未加载的 `provider-extension` 和 `role-guard-extension` | 权限与专用 web search 是自研非原生功能；未加载包没有保留价值 |
| 2026-10-08 | `llama.cpp` 和 `/share` 的客户端实现只保留 GUI / 配置适配，优先复用 Pi core 的 SDK / CLI / RPC | 客户端不应继续复制 Pi core 的内部实现 |
| 2026-10-08 | Provider / Model 配置按字段补丁写回，未知字段保留；高级字段使用受控 JSON，API 统一走 `SelectMenu` | 避免 `models.json` 高级配置丢失，同时保持现有统一组件风格并支持 Pi 的其他静态 API |

## 待用户确认

- Pi Packages、package 资源和 runtime 更新待用户验收；批次 63-71 尚在本地 `main`，未推送。
- 批次 71 Provider 无损保存已验收，下一轮先做批次 72 特殊模型只读目录；不要恢复 provider extension 或给 `models.json` 添加假 image / classifier 类型。
