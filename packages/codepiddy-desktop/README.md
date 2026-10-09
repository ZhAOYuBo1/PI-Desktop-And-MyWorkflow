# @codepiddy/desktop

CodePIddy 的 Electron 桌面客户端。Main / Preload 负责本地能力、Pi RPC 和 IPC，Renderer 负责项目树、Agent 会话、工作区、终端和设置页。

## 开发

从仓库根目录执行：

```powershell
npm ci --ignore-scripts
npm run install:electron
npm run build:codepiddy
npm start --workspace=@codepiddy/desktop
```

只构建 renderer：

```powershell
npm run build:renderer --workspace=@codepiddy/desktop
```

## 浏览器演示

```powershell
cd packages/codepiddy-desktop
npm exec vite -- --host 127.0.0.1
```

打开 `http://127.0.0.1:5173/?demo=1`。演示模式包含完整项目、工作项、会话和消息数据，但文件树、终端、Pi RPC 等需要 IPC 的能力会使用假数据或不显示。

## 验证

```powershell
npm run typecheck --workspace=@codepiddy/desktop
npm run verify:transcript --workspace=@codepiddy/desktop
```

`verify:transcript` 会启动真实 Vite + Chromium，加载演示数据并断言消息页的渲染与交互结果。

## 目录

```text
src/main/                 Electron Main、Pi RPC、IPC 和本地能力
src/preload/              Context-isolated preload bridge
src/renderer/             React 客户端
scripts/                  构建、截图和功能验证脚本
test/                     纯逻辑单测
```

## 当前能力

- 项目与工作项管理；
- 每个 Agent 槽位的常驻实例、会话创建 / 切换 / 删除 / Fork；
- 基于 Pi `get_entries` 的完整会话历史；
- Markdown、GFM、KaTeX、代码高亮和文件 chip；
- 工具语义摘要、失败诊断和 diff 展示；
- 会话内搜索、快速定位条和 thinking 显示模式；
- 文件工作区、更改 diff 和真实 PTY 终端；
- Provider / Model / MCP / Skill / Pi Packages / 运行时更新设置。

Pi core 不在这里修改。客户端增强只能通过 Pi RPC、事件、公开 SDK / CLI 或客户端自己的 main / renderer 边界接入。
