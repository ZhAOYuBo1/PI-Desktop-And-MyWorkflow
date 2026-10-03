<p align="center">
  <img src="packages/codepiddy-desktop/public/codepiddy-icon.png" alt="CodePIddy" width="104" />
</p>

<h1 align="center">CodePIddy</h1>

<p align="center"><strong>基于 Pi 的 Windows 桌面编码工作台：把「做需求」和「修 Bug」变成可管理、可交接的长期工作流。</strong></p>

<p align="center">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-2563eb?style=flat-square" />
  <img alt="Electron" src="https://img.shields.io/badge/client-Electron-334155?style=flat-square" />
  <img alt="Runtime" src="https://img.shields.io/badge/runtime-Pi-111827?style=flat-square" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-16a34a?style=flat-square" />
</p>

<p align="center">
  <a href="https://github.com/ZhAOYuBo1/My-PI-development-workflow/releases/latest"><strong>下载 Windows 版本</strong></a>
</p>

<p align="center">
  <img src="docs/images/codepiddy-overview.png" alt="CodePIddy 会话与更改视图" width="100%" />
</p>

## 这是什么

CodePIddy 是一个基于 [Pi](https://github.com/earendil-works/pi) 的 Windows 桌面客户端。它不试图把开发变成一条全自动流水线，而是把程序员日常的两类工作——**做一个新需求**和**修一个已存在的问题**——变成结构清晰、可以随时接手的工作项。

每个工作项下挂固定职责的长期 Agent（需求分析 / Coding / Bug Fix / Review），它们不共享短期记忆，交接靠 OpenSpec、Git diff、测试和项目文档这些真实产物。创建哪个 Agent、什么时候写代码、什么时候审核、要不要返工和归档，都由你决定。

Pi 仍然是底层事实源：模型、Provider、Session、Tool、Skill、Slash Command 全部来自 Pi。CodePIddy 负责工作流、桌面客户端和界面。

## 界面

### 会话与工作区

左侧是项目 / 工作项 / Agent 树，中间是按轮组织的会话流，右侧是随会话打开的工作区面板。

<img src="docs/images/codepiddy-files.png" alt="文件树与文件预览" width="100%" />

- 一条用户消息到该轮最后一条 AI 回复算一轮；运行中的最新一轮默认展开，历史轮默认收起，点一行 `N 条过程 · 用时 X` 可以回看。
- 工具调用完成后折叠为单行摘要，运行中展开显示实时输出。
- 工作区面板固定三个视图：`文件`、`更改`、`终端`。
- 用户消息的灰色气泡只包裹正文，`复制` 放在气泡外；每轮最终 AI 回复的 `复制` 旁边提供 `Fork`，点击后从这一轮对应的用户消息创建新分支，并把原消息填回输入框。

### 更改

只保留**最新一轮对话**产生的文件变更，按文件堆叠成可展开卡片：默认折叠，点开某个文件后在原地查看完整 diff，新增绿色、删除红色，带行号和 `+ / −` 统计。历史按「项目 + 工作项 + Agent 角色 + 轮次」持久化在客户端本地，重启客户端或更新 Pi 内核后仍然能看。

<img src="docs/images/codepiddy-overview.png" alt="按文件分组的 diff" width="100%" />

### 终端

面板内嵌真正的 PTY（`xterm.js` + `node-pty`），不是行式封装：Tab 补全、Ctrl+C、方向键历史、颜色、选择复制、`vim` 这类全屏程序都由 shell 自己处理。

启动的 shell、参数、字体和光标形状会读取本机 **Windows Terminal 的默认 profile**（稳定版 / 预览版 / 非打包版的 `settings.json`），因此每台机器都跟着用户自己的 Windows Terminal 配置走；找不到配置时回退到系统默认 PowerShell。

<img src="docs/images/codepiddy-terminal.png" alt="内嵌终端" width="100%" />

### 设置

Pi 运行时的独立版本检查 / 更新 / 回退、按工具类型划分的权限策略、Tavily Search、Shell 路径和按 Agent 角色分配的 Skill，都在设置页。

<img src="docs/images/codepiddy-settings.png" alt="设置页" width="100%" />

## 工作流

### 新需求

```text
用户想法
  -> Requirement Analysis Agent
       -> Grill With Docs：逐项澄清需求
       -> OpenSpec：proposal / specs / design / tasks
  -> Coding Agent
       -> openspec-apply-change
       -> 代码、测试、任务状态与 Git diff
  -> Review Agent
       -> open-code-review
       -> 测试、Findings 与 Verdict
  -> 用户决定继续修正或归档
```

### 修漏洞

```text
Bug 描述
  -> Bug Fix Agent
       -> OpenSpec：问题、根因、决策与任务
       -> 修复代码并补充测试
  -> Review Agent
       -> OpenSpec + Git diff + open-code-review
  -> 用户决定继续修正或归档
```

Agent 之间不做进程内编排。Grill 和 OpenSpec 产生的真实产物就是交接文档，不要求固定的 `requirement.md` / `implementation.md` / `fix.md` / `review.md`。

## 内置 Skill

以下 Skill 随客户端分发，不要求用户单独下载：

| Agent | 默认启用 |
| --- | --- |
| Requirement Analysis | `grill-with-docs`、`openspec-explore`、`openspec-propose`、`openspec-update-change` |
| Coding | `openspec-apply-change`、`openspec-sync-specs` |
| Bug Fix | `openspec-explore`、`openspec-propose`、`openspec-apply-change`、`openspec-sync-specs` |
| Review | `open-code-review` |

另外内置 `openspec-archive-change`，默认不主动分配。所有 Skill 都可以在设置中按 Agent 角色启用或停用；项目自己的 Skill 放在 `<project>/.codepiddy/.pi/skills`。

> OpenSpec Skill 调用 `openspec` CLI，Open Code Review Skill 调用 `ocr` CLI。Skill 指令随应用分发，使用对应能力时仍需要相应 CLI 和模型 Provider 可用。

## 下载与运行

前往 [GitHub Releases](https://github.com/ZhAOYuBo1/My-PI-development-workflow/releases/latest) 下载 Windows `.exe`。

```text
Windows 10 / Windows 11 · x64
```

首次运行后，需要在 Pi 原生配置中准备至少一个可用模型或 Provider，也可以在 Agent 里用 `/login` 完成受支持 Provider 的 OAuth 登录：

```text
~/.pi/agent/models.json
~/.pi/agent/settings.json
```

> 当前 Release 未做商业代码签名，Windows 可能显示未知发布者提示。请只从本仓库 Release 下载。

## 本地开发

环境：Windows 10 / 11、Node.js 22.19+、npm。

```powershell
git clone https://github.com/ZhAOYuBo1/My-PI-development-workflow.git
cd My-PI-development-workflow
npm ci --ignore-scripts
npm run install:electron
npm run build:codepiddy
npm start --workspace=@codepiddy/desktop
```

- `npm ci --ignore-scripts` 按锁文件安装依赖，避免自动执行第三方安装脚本。
- `npm run install:electron` 显式下载 Electron 运行文件，首次开发必须执行。
- 内置终端依赖 `node-pty`，它使用随包的 N-API prebuild，不需要本机编译原生模块。

日常改完代码后：

```powershell
npm run build:codepiddy
npm start --workspace=@codepiddy/desktop
```

### 验证

```powershell
npm run check
npm run typecheck --workspace=@codepiddy/desktop
```

### 重新生成 README 截图

截图由脚本自己造项目目录、工作项和会话历史，不依赖本机真实项目：

```powershell
npm run build:codepiddy
node --import tsx packages/codepiddy-desktop/scripts/capture-screenshots.mts
```

产物写入 `docs/images/`。脚本会临时起一个 Vite 和一个 Electron 实例，结束时都会关掉。

### 构建 Windows Release

```powershell
npm run prepare:codepiddy-package
npm run package:win --workspace=@codepiddy/desktop
```

产物位于 `.artifacts/release`。

## 目录结构

```text
packages/codepiddy-desktop/              Electron Main、Preload 与 React Renderer
packages/codepiddy-core/                 Work Item、Agent Registry、Pi RPC 与写锁
packages/codepiddy-shared/               共享 IPC 与工作流类型
packages/codepiddy-agent-skills/         随应用分发的固定 Skill
packages/codepiddy-permission-extension/ 权限系统适配
packages/codepiddy-tavily-search-mcp/    Tavily Search MCP
packages/coding-agent/                   Pi Coding Agent Runtime
docs/images/                             README 截图
```

## 更新 Pi 内核

在 **设置 → Pi 运行时** 检查新版本，确认后从 npm 安装 `@earendil-works/pi-coding-agent`。CodePIddy 会先在独立目录校验 RPC、模型列表、命令和内置扩展，再切换到新版；现有 Agent 不会在运行中被强制中断，重启客户端后生效。安装或校验失败时保留原版本，新版启动失败会自动回退，也可以手动逐次回退。

这只更新 Pi 内核，不更新 CodePIddy UI 或项目文件。Windows 安装包自带更新所需的 npm；源码开发模式使用本机 npm。

## 安全

- Renderer 开启 Sandbox 与 Context Isolation，禁用 Node Integration；
- IPC 输入做运行时校验；
- Tavily Key 使用 Electron `safeStorage`；
- 文件面板只能列出和读取项目根目录内的路径，越界请求被拒绝；
- Bash、MCP、Skill 和项目外路径的审批策略可在设置中调整；
- 多 Agent 之间不做进程内编排，交接靠共享工作树和工作项文档；
- 当前 Windows MVP 未提供强执行沙箱，Agent 进程使用当前操作系统用户权限。

更多信息见 [SECURITY.md](SECURITY.md)。

## 上游 Pi 与 License

CodePIddy 基于开源 Pi Agent Harness 开发。Pi 继续负责模型、Provider、Session、Tool、Skill 与 Slash Command，CodePIddy 提供桌面客户端、项目管理和工作流层。上游说明见 [docs/upstream/PI_README.md](docs/upstream/PI_README.md)。

本仓库保留上游 MIT License，详见 [LICENSE](LICENSE)。Bundled Skills 保留各自文件中声明的许可证和作者信息。
