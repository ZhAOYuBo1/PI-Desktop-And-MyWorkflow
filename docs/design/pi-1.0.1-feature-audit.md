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
- Tavily `web_search` 专用 MCP 已在批次 68 删除；需要 web search 时通过通用 MCP 配置。
- 客户端当前使用的 RPC 接口在 1.0.1 下已验证：
  `get_state`、`get_messages`、`get_session_tree`、`get_available_models`、`get_commands`。
- Pi 1.0.1 的 `/login`、`/logout` 是交互式 TUI 命令；RPC 没有直接暴露认证命令。SDK 公开了
  `ModelRuntime.login()` / `ModelRuntime.logout()`，因此客户端应直接提供 Provider 登录界面，
  通过外壳侧 helper 调用 SDK，不把 `/login`、`/logout` 放进客户端命令体系，也不修改 Pi core。

## MCP 结论

### 当前状态

- 用户自定义 MCP 服务读写 Pi 原生 `~/.pi/agent/mcp.json`。
- 客户端不再维护内置 `web_search` 条目、Tavily Key、`TAVILY_API_KEY` 注入或专用 MCP 脚本。
- 旧的 `packages/codepiddy-tavily-search-mcp` 和 Tavily 设置入口已删除。

### 目标状态

- 目标状态：客户端只提供通用 MCP 配置 UI，所有 MCP 服务都由 Pi 原生连接、重连、曝光和日志系统管理。
- 不再为 Tavily 或其他搜索服务维护专用设置、专用构建产物或环境变量注入。
- 扩展隔离策略：保留 `--no-extensions` 避免自动加载用户第三方 extension，同时显式加载
  `builtin:mcp`、`builtin:codemode`、`builtin:tool-search` 和 CodePIddy 自己的 review/retry/cache-warming。

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
| 自动压缩设置 | 已覆盖 | 批次 60 新增客户端「上下文压缩」；写 Pi 原生 `settings.json` 的 `compaction`，手动 `/compact` 保留 |
| 分支摘要设置 | 部分覆盖 | 客户端可写 `branchSummary.reserveTokens` / `skipPrompt`；当前客户端分支导航仍以 Fork 为主，实际触发由 Pi 分支流程决定 |
| Per-model compaction overrides | 已覆盖 | 支持按精确 `provider/modelId` 覆盖 `reserveTokens` / `keepRecentTokens` |
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
| Tavily `web_search` | 已删除 | 批次 68 删除专用 MCP、设置和注入；需要时由用户通过通用 MCP 配置 |

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
| Codemode | 已覆盖 | 批次 61 已实现客户端 `codemode.mode / inlineBudget` 设置和运行结果视图；脚本、工具调用、错误、完整输出路径从 `tool_execution_*` details 展示 |
| Tool Search | 已覆盖 | 客户端工具页汇总 MCP deferred / codemode exposure；实际搜索由 Pi 内置 `tool_search` 执行，不复制搜索实现 |
| Extensions | 部分覆盖 | 客户端自带 review、retry、cache-warming 扩展；第三方 extension 走 Pi Packages |
| Tool exposure | 已覆盖 | MCP 服务级 `exposure` / 工具级 `toolExposure` 在 MCP 设置页配置；内置工具用 `defaultTools + --exclude-tools` 严格隔离 |
| Tool rendering | 缺失 | Pi 1.0.1 支持任意工具 renderer，客户端没有扩展入口 |
| Skills | 已覆盖 | 角色 Skill 分配 |
| Prompt Templates | 已覆盖 | 批次 63 已实现用户 / 项目模板增删改、`/模板名` 插入和保存后的 Agent / 命令菜单刷新 |
| Packages | 缺失 | 没有 Pi package 安装、更新、移除 UI |
| Shell aliases | 已覆盖 | 「常规 > Shell」读写 Pi 原生 `shellCommandPrefix`，支持多行前缀、清除和保存后 Agent 重连 |
| Cache Warming | 部分覆盖 | 批次 58 已实现设置（`cacheWarming` off/streaming/idle、`showCacheMissNotices`）和最近一次预热决策的费用状态；Pi RPC 未暴露 `session.cacheWarmingStatus` 的实时 state / nextWarmAt，客户端通过 `cache_warming_decision` 扩展事件读取决策数据 |
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

## Pi Packages 审计（2026-10-07）

### 结论

Pi Packages 是 Pi 自己管理的扩展包，不等同于 CodePIddy 的 npm 依赖。一个包可以同时提供
`extensions`、`skills`、`prompts` 和 `themes`，其中 extensions 是可执行代码，skills 也可能指示模型执行命令。

当前机器用户级 `settings.json` 已配置一个真实包：

```text
npm:@gotgenes/pi-permission-system
C:\Users\zhaoy\.pi\agent\npm\node_modules\@gotgenes\pi-permission-system
```

该包的 `package.json` 使用：

```json
{
  "pi": {
    "extensions": ["./src/index.ts"]
  }
}
```

### 配置格式

用户级配置：

```text
~/.pi/agent/settings.json
```

项目级配置：

```text
<project>/.pi/settings.json
```

Pi 1.0.1 的 `packages` 字段是数组，元素支持两种形式：

```json
[
  "npm:@foo/pi-tools",
  {
    "source": "git:github.com/foo/pi-tools",
    "autoload": false,
    "extensions": ["+"],
    "skills": ["skills/review"],
    "prompts": ["prompts/review.md"],
    "themes": ["themes/light.json"]
  }
]
```

- 字符串形式：自动加载包内全部资源。
- 对象形式：`source` 是包来源，`autoload` 控制是否自动加载。
- `extensions` / `skills` / `prompts` / `themes` 是资源过滤规则，支持精确路径、glob 和
  `!` / `+` / `-` 覆盖语义。
- `autoload: false` 表示从空集合开始，只加载显式列出的资源；没有资源列表时等于不加载资源。
- 项目包与用户包身份相同时，项目级配置优先；项目包只有在项目受信任后才允许解析、安装和修改。

### 来源和安装路径

支持 npm、Git 和本地路径：

```text
npm:@foo/pi-tools
npm:@foo/pi-tools@1.2.3
git:github.com/user/repo
git:git@github.com:user/repo@v1
https://github.com/user/repo
ssh://git@github.com/user/repo
./local/path
```

用户级安装路径：

```text
npm  ~/.pi/agent/npm/node_modules/<package-name>
git  ~/.pi/agent/git/<host>/<repo-path>
```

项目级安装路径：

```text
npm  <project>/.pi/npm/node_modules/<package-name>
git  <project>/.pi/git/<host>/<repo-path>
```

本地路径不会复制文件，只把规范化后的路径写入对应作用域的 `settings.json`。

### Pi 1.0.1 命令与能力

CLI 命令：

```text
pi install <source> [-l] [--approve|--no-approve]
pi remove <source> [-l]
pi uninstall <source> [-l]
pi update --extensions
pi update --extension <source>
pi list [--approve|--no-approve]
pi config [-l]
```

- `pi list` 只有人类可读文本，没有 `--json`，且只输出来源、作用域、`filtered` 和安装路径，
  不输出版本、资源类型或每个资源的启用状态。
- `pi config` 是 TUI，用来启用/禁用包内资源；它不是客户端可直接复用的 RPC 接口。
- `pi update` 不带参数时更新 Pi 自身；客户端只能使用 `--extensions` 或 `--extension <source>`，
  不能调用裸 `pi update`。
- `pi remove` 对本地路径只移除配置，不删除源目录；npm / git 包会移除对应安装目录。

运行时 SDK：

- `packages/coding-agent-runtime/dist/bundle/index.js` 导出 `DefaultPackageManager` 和 `SettingsManager`。
- `DefaultPackageManager` 提供 `resolve`、`install`、`installAndPersist`、`remove`、
  `removeAndPersist`、`update`、`listConfiguredPackages`、`checkForAvailableUpdates`、
  `getInstalledPath` 和进度回调。
- 因此客户端不应解析 `pi list` 文本；列表应优先走 `DefaultPackageManager`，安装、更新、移除也优先走它。
- Pi 的 RPC 没有 package 管理命令，不能把 `/pi-package` 之类不存在的命令硬接进命令菜单。

### 与 CodePIddy 当前启动策略的关系

CodePIddy 启动 Agent 时继续使用 `--no-extensions`，并显式加载：

```text
builtin:mcp
builtin:codemode
builtin:tool-search
review.js
retry.js
cache-warming.js
```

Pi 1.0.1 的 `--no-extensions` 会禁用自动发现的 extensions 和内置 extensions，但显式 `-e`
仍然有效。当前实现中它只过滤 extension 路径；包内的 skills / prompts / themes 仍可能被解析。

这意味着：

- 第三方包里的 extension 默认不会加载；客户端提供按包开关，开启后会把该包的 extension
  作为显式 `--extension` 传给 Agent。
- 包内的 skills / prompts / themes 仍可能进入 Pi 资源解析，因此客户端不能只用“扩展已安装”
  一个状态描述整个包。
- 启用第三方 package extension 必须经过显式确认；客户端不能自动放宽所有包，也不能修改
  review / retry / cache-warming 这些内置扩展的加载顺序。

### 客户端实现建议

第一版应放在「Agent > Pi Packages」，默认隔离但允许按包开启 extension：

1. 读取用户级和项目级 `packages`，显示来源、作用域、版本、安装路径、来源类型和资源摘要。
2. 对 extension 资源提供按包开关；开启时写入 Pi 原生 `extensions: ["*"]`，关闭时写入
   `extensions: []`。skills / prompts / themes 显示实际解析状态，不把它们和 extension
   混成一个开关。
3. 支持 npm / git / 本地路径安装，安装前显示第三方代码风险确认和项目信任要求。
4. 支持移除和单包更新；更新只调用 package manager 的扩展更新能力，绝不更新 Pi 运行时。
5. Agent 启动仍使用 `--no-extensions`，只把已开启包的 extension 作为显式 `--extension`
   传入；支持刷新列表和错误诊断，配置变更后空闲 Agent 重新连接，运行中 Agent 延后生效。
6. 复用 `ModalShell`、`SettingsToast`、`StateBlock`、`SelectMenu`，不新增第二套组件。

暂不在第一版做 `pi config` 的完整资源级 TUI 复刻；extension 按包开关先走 Pi 原生
`PackageSource` 过滤字段，不复制 `pi config`。

### 下一轮代码落点

建议按下面的边界实现，避免把 Pi package 管理做成第二套独立系统：

1. `packages/codepiddy-shared/src/index.ts`
   - 增加 package scope、source type、resource summary、installed package、action result 类型。
   - 在 `CodePIddyClientApi` 增加 list / install / remove / update / check-updates 接口。
2. `packages/codepiddy-desktop/scripts/`
   - 新增 Pi package helper，使用与 `pi-auth-helper.mjs` 相同的 `createRequire` 方式加载
     `packages/coding-agent-runtime/dist/bundle/index.js`。
   - helper 只输出 JSON 行；不要在 main 里解析 `pi list` 的人类文本。
   - 操作范围只允许 `install`、`remove`、`update --extensions` / `update --extension` 和 list /
     update-check；禁止裸 `pi update` 或 `--all`。
3. `packages/codepiddy-desktop/src/main/`
   - 新增 package manager 包装，负责 helper 进程、超时、stderr、项目根和 trust 校验。
   - 在 IPC validation 中限制 source 长度、scope、action 和项目路径，不接受任意命令字符串。
4. `packages/codepiddy-desktop/src/preload/index.ts`
   - 只暴露共享类型定义的窄 API，不暴露原始 helper 参数或 shell 命令。
5. `packages/codepiddy-desktop/src/renderer/`
   - 新增 `PiPackageSettings.tsx`，挂在设置页 `Agent` 分组。
   - 列表显示名称 / source / scope / version / installedPath / 资源摘要 / extension 开关。
   - 安装、移除、更新、风险确认使用 `ModalShell`；结果使用 `SettingsToast`；空态和错误使用
     `StateBlock`；来源和 scope 选择使用 `SelectMenu`。
   - 不在第一版复制 `pi config` TUI，不新增 package 专用弹层、消息或复选框实现。
6. 测试
   - main helper 单测覆盖 source 解析、scope、缺失安装目录、版本读取和 update-check。
   - IPC validation 单测覆盖非法 scope / source / 项目路径。
   - `?demo=1` 覆盖空列表、已安装包、extension 开关、安装弹窗、移除确认和错误状态。
   - 真实验收至少覆盖用户级 npm 包列表、安装本地测试包、移除本地测试包和刷新。

2026-10-08 边界清理后，Agent 启动继续用 `--no-extensions` 隔离第三方扩展，但显式扩展只保留
`review` / `retry` / `cache-warming`。`permission` 和 Tavily `web_search` 自建 MCP 将删除，
不能再恢复第二套权限协议或专用 web search 注入。

## 客户端边界清理决定（2026-10-08）

CodePIddy 是客户端，不复制 Pi core 已公开的运行时能力。保留客户端自己的产品层和统一配置 / 展示，
删除无必要的自研运行时实现。

保留：

- `@codepiddy/review-extension`：变更 diff。
- `@codepiddy/retry-extension`：网关并发错误兜底。
- `@codepiddy/cache-warming-extension`：把核心决策事件桥接到客户端状态文件。
- `codepiddy-agent-skills`、角色提示词注入、角色 Skill 分配。

删除：

- `@codepiddy/permission-extension`，包括第二套权限策略、权限弹窗、权限转发和 `pi-subagents` 特判。
- Tavily `web_search` 自建 MCP：`packages/codepiddy-tavily-search-mcp`、专用设置、
  自动 `mcp.json` 条目、`TAVILY_API_KEY` 注入和 Web Search Contract。
- 未加载的 `@codepiddy/provider-extension` 和 `@codepiddy/role-guard-extension`。

重复实现处理：

- `llama.cpp` 桌面管理器：保留设置 / 操作界面，优先调用 Pi core 的 provider / extension 能力，
  不再复制 router、Hugging Face、load / unload / download 逻辑。
- `/share` helper：保留客户端分享弹窗，优先复用 Pi core 分享流程，不复制 Radius / Gist 业务逻辑。

批次 68 已实现该清理并通过验证，下一步进入 Shell aliases。

重复实现审计结果：Pi 1.0.1 的公开 SDK 导出没有 `LlamaClient` / `shareSession`，
RPC 也没有对应命令；若要让 GUI 直接复用 core，只能引用内部文件路径或复制源码。
因此本轮不迁移、不搬源码，保留现有 GUI / 配置适配，等待 Pi 提供稳定公开入口。

## 后续任务清单

### 阶段 0：清理和控制版本（已完成）

1. 已回退构建时自动安装 Pi 的改动。
2. 已恢复“内置 Pi 版本由仓库固定、由开发手动升级”的构建方式。
3. 已手动把客户端内置 Pi 替换为固定 `1.0.1` bundle。
4. 已用 RPC smoke test 验证固定 bundle 的 state / messages / tree / models / commands。

### 阶段 1：MCP 统一

2026-10-08 更新：本阶段第 5-8 项关于保留 Tavily `web_search` 的结论已被
「客户端边界清理决定」替代；批次 68 已删除专用 Tavily MCP 和设置，只保留通用 MCP 配置。

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

批次 53 已完成并验收第 22 项 `/share`；批次 54 已完成第 23 项客户端诊断包导出，并顺带完成统一 UI 组件规则。阶段 3 已全部完成；阶段 4 第 24 项 Cache Warming 已由批次 58 实现并提交 `c17b64abf`，第 25 项自动压缩 / 分支摘要 / per-model compaction overrides 已由批次 60 实现并提交 `db4e91195`，第 26 项 Codemode 已由批次 61 实现并提交 `ec4dde669`，第 27 项 Tool Search / Tool Exposure 已由批次 62 实现并提交 `6815fc026`，第 28 项 Prompt Templates 已由批次 63 实现并提交 `8a9231079`。第 29 项 Pi Packages 已由批次 67 实现客户端设置页、runtime helper、安装 / 更新 / 移除 / 更新检查和项目信任边界。批次 68 已完成客户端边界清理，下一步进入第 30 项 Shell aliases。

### 阶段 4：高级运行时能力

24. [x] Cache Warming 设置和状态：批次 58 已实现并提交 `c17b64abf`。设置写 Pi 原生 `settings.json`（`cacheWarming` / `showCacheMissNotices`）；会话统计面板显示模式、cache miss penalty、refresh cost、expected savings 和最近决策。Pi 1.0.1 的 RPC 不返回 `session.cacheWarmingStatus`，实时 state / nextWarmAt 无法读取，客户端用 `@codepiddy/cache-warming-extension` 订阅 `cache_warming_decision`，把最近一次决策写入状态文件；没有决策时显示“尚无预热决策”。
25. [x] 自动压缩、分支摘要、per-model compaction overrides：批次 60 已完成客户端「上下文压缩」设置页，写 Pi 原生 `settings.json` 的 `compaction` / `branchSummary`，支持全局参数和按 `provider/modelId` 的覆盖；手动 `/compact` 保留。分支摘要当前只补配置，实际触发仍由 Pi 分支流程决定。
26. [x] Codemode 设置和运行结果视图：批次 61 已完成设置页 `codemode.mode / inlineBudget`、转录流脚本与工具调用详情、错误和完整输出路径展示，提交 `ec4dde669`。
27. [x] Tool Search / Tool Exposure 设置：批次 62 已完成客户端工具页、`defaultTools` 严格隔离和 MCP exposure 汇总；保存后空闲 Agent 自动重连，提交 `6815fc026`。
28. [x] Prompt Templates：批次 63 已完成客户端用户 / 项目模板管理、`/模板名` 插入、空闲 Agent 自动重连和命令菜单刷新，提交 `8a9231079`。
29. [x] Pi Packages：批次 67 已实现客户端原生包列表、npm / Git / 本地路径安装、更新、移除、
    刷新、更新检查、项目信任校验、资源摘要和按包 extension 开关；使用 runtime bundle 的
    `DefaultPackageManager`，不解析 `pi list`，不更新 Pi 运行时。默认隔离，开启后 Agent
    显式加载对应 package extension；Agent Skills 页面也会合并 package manager 解析出的
    package skills，并标记来源为 `package`；Prompt 模板页面会合并 package prompts，
    以只读“包模板”展示并支持插入输入框。

运行时更新补充：内置 `packages/coding-agent-runtime` 已补齐 canonical 1.0.1 SDK 包根，
包含 `dist/index.js`、完整 1.0.1 peer dependencies 和 `quickjs-wasi`。Pi 更新器继续安装
官方完整 npm 包，更新后的 `PI_PACKAGE_DIR` 结构同样满足 `pi-subagents` host peer alias
解析，并校验 SDK 入口、commands、host peers 和 `quickjs-wasi`。更新内置 runtime 使用
`npm run update:pi-runtime -- <version>`；只替换 `dist/bundle` 不再被视为有效更新。
内置命令说明从 `dist/core/slash-commands.js` 读取，不再回退为统一的“Pi 内置命令”文案。
30. [x] 客户端边界清理：删除 permission / Tavily / 未加载扩展；审计确认 Pi 1.0.1 暂无
    llama / share 公开入口，保留 GUI 适配且不复制 core 源码。
31. [x] Shell aliases / Shell command prefix：客户端 UI 读写 Pi 原生 `settings.json` 的
    `shellCommandPrefix`，不维护独立 alias 列表。该值会作为前缀拼到每次 bash 命令前，
    可用于启用 alias 展开或加载用户 shell 配置。设置页放在「常规 > Shell」，空字符串表示清除。
    保存后空闲 Agent 自动重连，运行中 Agent 延后生效；未修改 Pi core。
32. Telemetry 设置
33. 自定义 Provider / 虚拟模型 / classifier / image models

Shell aliases 下一轮代码落点：

1. `@codepiddy/shared` 增加 shell command prefix 的设置类型和状态字段。
2. `AppSettingsStore` 合并读写 Pi 原生 `settings.json` 的 `shellCommandPrefix`；空值删除字段。
3. main / preload / IPC 增加 get / save 接口，输入限制长度并拒绝 NUL。
4. 设置页「常规 > Shell」增加多行文本框、保存 / 清除和示例说明；临时反馈走 `SettingsToast`，
   持久错误走 `StateBlock`。
5. 保存后空闲 Agent 自动重连；运行中 Agent 提示停止或重连后生效。
6. 单测覆盖合并写入、清除字段、保留其他 settings 字段和非法输入。

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
- Prompt 模板管理（批次 63，提交 `8a9231079`）：
  `packages/codepiddy-desktop/src/main/prompt-templates.ts`、
  `packages/codepiddy-desktop/src/renderer/components/PromptTemplateSettings.tsx`、
  `packages/codepiddy-desktop/src/main/index.ts`、
  `packages/codepiddy-desktop/src/preload/index.ts`、
  `packages/codepiddy-shared/src/index.ts`、
  `packages/codepiddy-desktop/test/prompt-templates.test.ts`

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
