# Pi 1.0.1 客户端功能审计

审计日期：2026-10-03  
审计对象：`@earendil-works/pi-coding-agent` 1.0.1  
审计范围：Pi 1.0.1 文档、RPC、SDK、原生 MCP 与当前 CodePIddy 外壳

## 当前版本事实

- 当前机器实际运行的 Pi 运行时是 `1.0.1`：
  `%APPDATA%\@codepiddy\desktop\pi-updates\active.json`
- 仓库内置运行时已替换为固定 `1.0.1` bundle：
  `packages/coding-agent-runtime/dist/bundle` + `packages/coding-agent-runtime/package.json`。
- `packages/coding-agent` 等上游源码仍保留在仓库中，但客户端内置运行时不再由它们构建，也不再在 build 时联网升级。
- Pi 1.0.1 已原生依赖 `@earendil-works/pi-mcp`，MCP 不再依赖外部插件。
- `web_search` 已迁移到 Pi 原生 `mcp.json`；客户端只保留 Tavily 设置入口和加密 Key，
  启动 Agent 时注入 `TAVILY_API_KEY`，不再维护独立 MCP 注入通道。
- 客户端当前使用的 RPC 接口在 1.0.1 下已验证：
  `get_state`、`get_messages`、`get_session_tree`、`get_available_models`、`get_commands`。
- Pi 1.0.1 的 `/login`、`/logout` 是交互式 TUI 命令；RPC 没有直接暴露认证命令。SDK 公开了
  `ModelRuntime.login()` / `ModelRuntime.logout()`，因此客户端应直接提供 Provider 登录界面，
  通过外壳侧 helper 调用 SDK，不把 `/login`、`/logout` 放进客户端命令体系，也不修改 Pi core。

## MCP 结论

### 当前状态

- 用户自定义 MCP 服务已经读写 Pi 原生 `~/.pi/agent/mcp.json`。
- `web_search` 现在由客户端维护为原生 `mcp.json` 条目：
  - `command` / `args` 指向随应用构建的 Tavily MCP 脚本；
  - `env.TAVILY_API_KEY` 只保存 `${TAVILY_API_KEY}` 引用；
  - `exposure: "direct"`，`toolExposure.web_search: "direct"`；
  - 未配置 Tavily Key 时条目保留但 `enabled: false`。
- 旧的 `CODEPIDDY_TAVILY_MCP_ENTRY` 和 `packages/codepiddy-tavily-tool-extension` 已删除。

### 目标状态

- 已完成：不再维护 `CODEPIDDY_TAVILY_MCP_ENTRY` 这类独立注入通道。
- 已完成：客户端继续保留独立的 `web_search` / Tavily 设置入口和 Key 输入。
- 已完成：Tavily Key 由客户端加密保存，启动 Agent 时只注入 `TAVILY_API_KEY` 环境变量。
- 已完成：`web_search` 服务写入 Pi 原生 MCP 配置：

```json
{
  "mcpServers": {
    "web_search": {
      "command": "node",
      "args": ["<packaged-or-dev-tavily-search-mcp.js>"],
      "env": {
        "TAVILY_API_KEY": "${TAVILY_API_KEY}"
      },
      "description": "Tavily web search",
      "exposure": "direct",
      "toolExposure": {
        "web_search": "direct"
      }
    }
  }
}
```

- 配置统一后，`web_search` 由 Pi 原生 MCP 连接、重连、权限、曝光和日志系统管理。
- 命名策略已决定：接受原生工具名 `mcp__web_search__web_search`，不增加别名适配层。
  客户端工具卡和设置页仍显示友好名称 `web_search`，实际调用名保持 Pi 原生格式。
- 扩展隔离策略：保留 `--no-extensions` 避免自动加载用户第三方 extension，同时显式加载
  `builtin:mcp`、`builtin:codemode`、`builtin:tool-search` 和 CodePIddy 自己的 permission/review/retry。

### Pi 1.0.1 原生 MCP 能力

- 用户级 `~/.pi/agent/mcp.json`
- 项目级 `.pi/mcp.json`
- 项目级只覆盖 `enabled`、`exposure`、`toolExposure`
- stdio：`command`、`args`、`env`、`cwd`
- HTTP：`url`、`headers`
- `timeout`
- `enabled`
- `exposure`: `codemode` / `deferred` / `direct` / `hidden`
- `toolExposure`: 精确名与 `*` 模式
- `description`
- OAuth：`clientId`、`clientSecret`、`callbackPort`、`callbackUrl`、`scope`
- `oauth.clientName`
- `oauth.clientRegistration: "cimd"`
- `oauth.authServerMetadataUrl`
- `auth.provider`
- 环境变量插值 `${NAME}`
- 命令型值 `!command`
- MCP resources
- MCP 权限 annotations
- `~/.pi/agent/mcp-auth.json`
- `~/.pi/agent/mcp.log`
- `/mcp`
- `pi mcp add/remove/list/login/logout`

## Pi 1.0.1 功能面与客户端覆盖

状态说明：

- `已覆盖`：客户端已有可用入口或已有外壳实现。
- `部分覆盖`：有基础实现，但缺少 Pi 1.0.1 的完整能力。
- `缺失`：客户端没有对应入口或实现。
- `TUI-only`：属于 Pi 终端界面能力，本轮客户端明确不需要复刻。

### 模型、认证与 Provider

| Pi 1.0.1 功能 | 客户端状态 | 备注 |
| --- | --- | --- |
| `/model` | 已覆盖 | 模型选择器、模型搜索、当前模型 |
| `/thinking` | 已覆盖 | Thinking 波场选择器 |
| Provider API Key | 部分覆盖 | `ProviderSettings` 可写 `models.json`，Key 加密保存 |
| Provider 登录 | 已验证 | 客户端设置页入口；隔离目录下 API Key 登录成功写入 `auth.json` |
| Provider 退出 | 已验证 | 客户端设置页入口，调用 `ModelRuntime.logout()`；仅对 `auth.json` 来源显示 |
| OAuth 登录 | 已验证 | OpenRouter 真实账号完成 OAuth 登录和退出；auth URL、manual code、device code、进度和取消事件已打通 |
| 环境变量 Key | 部分覆盖 | 启动 Agent 时已有 Provider env 注入基础 |
| 凭据来源显示 | 已覆盖 | 汇总显示 `auth.json`、`models.json`、环境变量和运行时来源；`models.json` 覆盖会单独标记 |
| `!command` Key | 缺失 | Pi 原生支持命令型 Key，客户端没有配置入口 |
| `/scoped-models` | 已覆盖 | 客户端“常用模型范围”写入 `enabledModels`，模型选择器按常用/其他分组 |
| `/llama` | 部分覆盖 | 客户端原生 router 连接、模型管理、HF 下载和量化选择已实现；真实 router 端到端测试待后续环境 |
| 自定义 Provider | 部分覆盖 | `models.json` 支持基础 Provider，没有 Provider extension 管理 |
| 虚拟模型 | 缺失 | 没有虚拟模型注册和路由状态 UI |
| Classifier models | 缺失 | Pi 1.0.1 可通过 codemode 调用，客户端无 UI |
| Image models | 缺失 | Pi 1.0.1 支持 codemode 图片生成，客户端无 UI |

### 会话、上下文与分支

| Pi 1.0.1 功能 | 客户端状态 | 备注 |
| --- | --- | --- |
| `/new` | 已覆盖 | 新建 Session |
| `/resume` | 已覆盖 | 文件选择恢复 JSONL |
| `/name` | 已覆盖 | 无参数查询当前名称；客户端会话树支持显示名称和重命名 |
| `/session` | 已覆盖 | 客户端会话统计面板读取 RPC `get_session_stats` |
| `/tree` | 已覆盖 | 会话树弹窗 |
| `/fork` | 已覆盖 | 会话树 Fork 和消息级 Fork |
| `/clone` | 已覆盖 | 克隆当前 Session |
| `/compact` | 已覆盖 | 手动压缩 |
| `/import` | 已覆盖 | 会话树提供 JSONL 导入、校验、复制、切换和持久化 |
| 自动压缩设置 | 部分覆盖 | 有 compact 操作，没有完整设置 UI |
| 分支摘要设置 | 缺失 | Pi 1.0.1 有 branch summary 配置 |
| Per-model compaction overrides | 缺失 | `compaction.modelOverrides` 无 UI |
| Session 存储控制 | 缺失 | session dir、in-memory、外部存储等无 UI |

### MCP

| Pi 1.0.1 功能 | 客户端状态 | 备注 |
| --- | --- | --- |
| 原生 `mcp.json` | 部分覆盖 | 基础 stdio/http 服务可配置 |
| 项目级 `.pi/mcp.json` | 已覆盖 | 客户端可读写项目级 `enabled` / `exposure` / `toolExposure` override |
| `enabled` | 已覆盖 | 设置页使用原生 `enabled` 语义 |
| `exposure` | 已覆盖 | 支持 codemode / deferred / direct / hidden |
| `toolExposure` | 已覆盖 | 支持精确工具名与 `*` 通配 |
| `description` | 已覆盖 | 设置页可编辑 |
| `timeout` | 已覆盖 | 设置页可编辑，单位秒 |
| MCP OAuth | 部分覆盖 | 字段、登录、退出和 Agent 重连入口已完成；仍需真实 OAuth 服务端到端验收 |
| CIMD / clientName / authServerMetadataUrl | 已覆盖 | 设置页可编辑 |
| `auth.provider` | 已覆盖 | 设置页可编辑 |
| MCP resources | 缺失 | 无资源浏览入口 |
| MCP permissions annotations | 部分覆盖 | 有统一 MCP 权限开关，但没有按 annotation 展示 |
| `/mcp` | 已覆盖 | 客户端命令菜单提供 `/mcp`，打开设置页的 MCP 管理入口 |
| `pi mcp add/remove/list/login/logout` | 已覆盖 | `list/login/logout` 走 Pi CLI；add/remove 走客户端原生设置 UI |
| Tavily `web_search` | 已覆盖 | 已写入 Pi 原生 `mcp.json`，Key 使用 `${TAVILY_API_KEY}`，工具名 `mcp__web_search__web_search` |

### 导出、分享与诊断

| Pi 1.0.1 功能 | 客户端状态 | 备注 |
| --- | --- | --- |
| `/copy` | 已覆盖 | 复制最后 Assistant 消息 |
| `/export` | 已覆盖 | HTML / JSONL |
| `/share` | 已覆盖 | 客户端原生分享弹窗、独立分享设置、品牌图标、Radius / GitHub CLI 回退、viewer link 和复制入口已实现并验收；Provider 页已排除 Radius 登录入口，GitHub CLI 检测无机器特定路径 |
| `/bug` | 缺失 | Pi 1.0.1 没有 `/bug` 命令；TUI 只有 `/debug` 写 debug log。客户端应实现原生诊断包导出，而不是复刻 slash command |
| `/changelog` | 已覆盖 | 客户端自定义输出 |
| `/hotkeys` | 已覆盖 | 客户端自定义输出 |

### 运行时、工具与资源

| Pi 1.0.1 功能 | 客户端状态 | 备注 |
| --- | --- | --- |
| Codemode | 部分覆盖 | Pi 后端已有，客户端没有设置、脚本状态或结果面板 |
| Tool Search | 部分覆盖 | Pi 后端已有，客户端只展示工具调用结果 |
| Extensions | 部分覆盖 | 客户端自带权限、Tavily、review、retry 扩展，没有通用管理 UI |
| Tool exposure | 缺失 | 没有按工具设置 direct/deferred/codemode/hidden |
| Tool rendering | 缺失 | Pi 1.0.1 支持任意工具 renderer，客户端没有扩展入口 |
| Skills | 已覆盖 | 角色 Skill 分配 |
| Prompt Templates | 缺失 | 没有模板管理 UI |
| Packages | 缺失 | 没有 Pi package 安装、更新、移除 UI |
| Shell aliases | 缺失 | 没有设置 UI |
| Cache Warming | 缺失 | 没有设置、状态或费用提示 |
| Retry 设置 | 部分覆盖 | 通过 Pi settings 写默认值，没有完整设置 UI |
| Telemetry | 缺失 | 没有 Pi 原生 telemetry 设置 UI |
| Update / rollback | 已覆盖 | 客户端 Pi 运行时更新和回退 |

### 交互、终端与 UI

| Pi 1.0.1 功能 | 客户端状态 | 备注 |
| --- | --- | --- |
| Settings | 部分覆盖 | 已有客户端自己的设置页，不等于 Pi 全量 settings |
| Themes | TUI-only | 不需要在客户端复刻 |
| Keybindings | TUI-only | 不需要在客户端复刻 |
| Fullscreen TUI | TUI-only | 不需要在客户端复刻 |
| Terminal setup | TUI-only | 不需要在客户端复刻 |
| Windows/WSL 说明 | TUI-only | 客户端已有自己的内置终端方案 |
| Quiet startup | TUI-only | 不需要在客户端复刻 |

### SDK、RPC 与集成

| Pi 1.0.1 功能 | 客户端状态 | 备注 |
| --- | --- | --- |
| RPC 命令 | 部分覆盖 | 当前客户端使用其中一部分 |
| RPC Extension UI | 部分覆盖 | 已有 select/confirm/input/editor/notify 的基础处理 |
| SDK Session lifecycle | 部分覆盖 | 外壳主要走 RPC，没有直接接 SDK |
| SDK Auth | 已完成验证，待验收 | 客户端通过 helper 调 `ModelRuntime.login/logout` |
| SDK ModelRuntime | 缺失 | 尚未直接接入外壳 |

## 后续任务清单

### 阶段 0：清理和控制版本（已完成）

1. 已回退构建时自动安装 Pi 的改动。
2. 已恢复“内置 Pi 版本由仓库固定、由开发手动升级”的构建方式。
3. 已手动把客户端内置 Pi 替换为固定 `1.0.1` bundle。
4. 已用 RPC smoke test 验证固定 bundle 的 state / messages / tree / models / commands。

### 阶段 1：MCP 统一

5. [x] 保留客户端 Tavily / `web_search` 独立设置卡和加密 Key。
6. [x] 删除 `CODEPIDDY_TAVILY_MCP_ENTRY` 独立注入通道。
7. [x] 将 `web_search` 写入 Pi 原生 `mcp.json`，env 使用 `${TAVILY_API_KEY}`。
8. [x] 决定原生 MCP 工具名策略：接受 `mcp__web_search__web_search`，仅在客户端显示层使用短名。
9. [x] 升级 MCP 设置 UI：项目级 override、enabled、exposure、toolExposure、description、timeout、OAuth。
10. [x] 增加 `/mcp` 命令入口和 `pi mcp` 包装；状态读取使用 `pi mcp list --json`。

### 阶段 2：认证与 Provider

11. 审核并验收客户端设置页的 Provider 登录 / 退出 UI；不接入 `/login`、`/logout` 命令。
12. [x] 支持 Provider OAuth、API Key、device code、manual code 和浏览器回调；OpenRouter 真实 OAuth 登录 / 退出已验证。
13. [x] 登录成功后刷新 Provider、模型列表和当前 Agent 配置；空闲 Agent 自动重连，运行中 Agent 延后生效。
14. [x] 增加 Provider 状态、退出登录和凭据来源显示；退出登录只对 `auth.json` 来源开放。
15. 增加 `!command` Key 和 `auth.provider` 配置。

批次 43（提交 `5d489c02a`）已完成第 14 项；批次 44（提交 `796171533`）已完成第 13 项；批次 46（提交 `e0e81b4c9`）已完成第 12 项真实 OpenRouter OAuth 验收。阶段 2 已收口，下一步进入阶段 3。

### 阶段 3：会话和命令补齐

16. [x] `/scoped-models`：批次 48 已改为客户端“常用模型范围”，模型选择器显示“常用模型 / 其他模型”，底层写 `enabledModels`。
17. [x] `/import`：批次 48 已改为会话树原生导入入口，文件选择器 + JSONL 校验、复制、切换和持久化。
18. [x] `/trust` 持久化：批次 48 已接入 Pi `ProjectTrustStore` helper、信任弹窗、设置页状态和 `trust.json` 持久化。
19. [x] `/session` 完整统计信息：批次 48 已接入 RPC `get_session_stats` 和客户端统计面板。
20. [x] `/name`：批次 49 已完成无参查询、会话树名称展示和客户端重命名。
21. [x] `/llama`：批次 50 已完成客户端原生 router 管理、Hugging Face 下载和 mock 验证；真实 router 端到端测试待后续环境。
22. [x] `/share`：批次 51-53 已实现并验收客户端原生分享、隐私确认、独立分享设置、品牌图标、Radius / GitHub CLI 回退和 viewer link。
23. [x] `/bug` / 客户端诊断包：批次 54 已完成客户端原生诊断导出，收集版本、平台、Agent / Session / Provider / MCP / trust 状态、最近错误、日志路径和可选脱敏 Session JSONL，导出本地 ZIP，不上传。Pi 1.0.1 仍没有原生 `/bug`。

批次 53 已完成并验收第 22 项 `/share`；批次 54 已完成第 23 项客户端诊断包导出，并顺带完成统一 UI 组件规则。阶段 3 已全部完成，下一步进入阶段 4 第 24 项 Cache Warming。

### 阶段 4：高级运行时能力

24. Cache Warming 设置和状态
25. 自动压缩、分支摘要、per-model compaction overrides
26. Codemode 设置和运行结果视图
27. Tool Search / Tool Exposure 设置
28. Prompt Templates
29. Pi Packages
30. Shell aliases
31. Telemetry 设置
32. 自定义 Provider / 虚拟模型 / classifier / image models

### 阶段 5：回归和收尾

33. 用 Pi 1.0.1 回归会话、Fork、模型、Thinking、压缩、diff、终端、MCP、登录。
34. 跑：
   - `npm run check`
   - `npm run typecheck --workspace=@codepiddy/desktop`
   - `npm run build:codepiddy`
35. 更新 `PRODUCT.md`、`DESIGN.md`、`docs/design/redesign-plan.md` 和本文件。
36. 按验收结果拆分提交并推送。

## 本轮已提交的实现

以下代码已在本轮提交（`55e6d4bf3`、`888ed5b27`）：

- 固定内置 Pi 1.0.1 bundle：
  `packages/coding-agent-runtime/`、`scripts/build-codepiddy-runtime.mjs`
- 统一自定义下拉菜单：
  `packages/codepiddy-desktop/src/renderer/components/select-menu.tsx`、
  `packages/codepiddy-desktop/src/renderer/components/ProviderSettings.tsx`、
  `packages/codepiddy-desktop/src/renderer/components/McpSettings.tsx`、
  `packages/codepiddy-desktop/src/renderer/App.tsx`、`styles.css`
- 登录 helper 和 IPC：
  `packages/codepiddy-desktop/scripts/pi-auth-helper.mjs`、
  `packages/codepiddy-desktop/src/main/pi-auth.ts`、
  `packages/codepiddy-shared/src/index.ts`、
  `packages/codepiddy-desktop/src/preload/index.ts`
- 设置页 Provider 登录入口和弹窗：
  `packages/codepiddy-desktop/src/renderer/App.tsx`、
  `packages/codepiddy-desktop/src/renderer/styles.css`

`packages/coding-agent-runtime` 是仓库内固定版本，不由 build 更新；升级时必须手动替换该目录并跑 RPC smoke test。

批次 39 已完成阶段 1 的第 5-8 项：

- 删除 `packages/codepiddy-tavily-tool-extension` 及构建入口。
- `AppSettingsStore` 维护原生 `web_search` MCP 条目，保存/清除 Tavily Key 时同步 `enabled`。
- Agent 启动继续注入 `TAVILY_API_KEY`，但不再传独立 MCP 脚本路径。
- 权限扩展识别 `mcp__<server>__<tool>`，工具卡显示短名和 MCP 图标。
- 清理 Pi 用户级残留插件：`npm:pi-mcp-adapter` 已从 `settings.json`、用户 npm 依赖、
  lockfile、node_modules 和 bin 链接中移除；`pi list` 只保留 permission-system。
- 隔离 Electron + `pi mcp list` 验证：保存 Key 后为 `connected, 1 tool (direct)`，
  清除 Key 后为 `disabled`，`mcp.json` 中无明文 Key。
