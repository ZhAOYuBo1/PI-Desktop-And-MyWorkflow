---
name: CodePIddy Desktop
description: 一个安静、精密、浅色的桌面编码工作台
colors:
  ink: "#17181a"
  ink-secondary: "#4a4c50"
  ink-muted: "#6e7075"
  ink-faint: "#a0a2a8"
  surface-content: "#ffffff"
  surface-secondary: "#f8f8f9"
  surface-rail: "#f2f2f4"
  surface-inset: "#e8e8eb"
  border-subtle: "#17181a0f"
  border-default: "#17181a1a"
  border-strong: "#17181a29"
  accent: "#2563eb"
  accent-hover: "#1d4ed8"
  accent-soft: "#2563eb1a"
  success: "#15803d"
  warning: "#b45309"
  error: "#b91c1c"
  violet: "#7c3aed"
typography:
  title:
    fontFamily: '"Monaspace Argon", "Maple Mono NF CN", -apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, system-ui, sans-serif'
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0em"
  body:
    fontFamily: '"Monaspace Argon", "Maple Mono NF CN", -apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, system-ui, sans-serif'
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
  label:
    fontFamily: '"Monaspace Argon", "Maple Mono NF CN", -apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, system-ui, sans-serif'
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "0em"
  mono:
    fontFamily: '"Monaspace Argon", "Maple Mono NF CN", ui-monospace, SFMono-Regular, Cascadia Mono, Consolas, Liberation Mono, monospace'
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.55
rounded:
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "18px"
  2xl: "24px"
  full: "9999px"
spacing:
  micro: "2px"
  xxs: "4px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
  3xl: "40px"
  4xl: "48px"
  5xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface-content}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "28px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.surface-content}"
    rounded: "{rounded.md}"
    height: "28px"
  button-secondary:
    backgroundColor: "{colors.surface-inset}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "28px"
  button-ghost:
    backgroundColor: "{colors.surface-content}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.md}"
    height: "28px"
  field:
    backgroundColor: "{colors.surface-inset}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "30px"
  tile:
    backgroundColor: "{colors.surface-secondary}"
    rounded: "{rounded.lg}"
    padding: "12px"
  chip:
    backgroundColor: "{colors.surface-inset}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
---

# Design System: CodePIddy Desktop

## 1. Overview

**Creative North Star: "精密仪器台"**

这不是一个展示型界面，是一台放在桌面上的测量仪器。操作者长时间盯着它，读的是状态、数值和过程。所以它必须中性、稳定、对齐严格：底色分成清晰的几层，文字对比足够但不过分锐利，彩色只出现在真正承载信息的地方——运行中的绿点、失败的红色边框、特殊状态的紫色标记。

它明确拒绝"AI 味重的界面"：玻璃拟态堆叠、渐变文字、紫色渐变、没有意义的超大圆角卡片网格、用 emoji 当图标、每张卡片都长一样。这些手法在展示页上也许还行，在需要连续使用几小时的工具里只会增加噪音。参考对象是 PI-Desktop 的浅色主题：中性灰阶、墨色强调、色调分层、克制的状态色。

差异化的地方在"密度与秩序"：信息密度接近专业开发工具，但每条信息的层级用字号、字重和灰色深浅区分，而不是用框线。整个界面看起来应该是被一个严格的栅格和一套色阶管理出来的，而不是被组件库默认值拼出来的。

**Key Characteristics:**

- 浅色、中性、低饱和；彩色只表达状态与分类。
- 四层底色（内容 / 次级 / 侧栏 / 内嵌）承担主要层次，描边只出现在浮层。
- 单一无衬线字体家族，紧凑梯级，非整数字重。
- 控件尺寸统一，28px 基准，不出现差 2px 的控件。
- 动效只表达状态变化，150-240ms，尊重 `prefers-reduced-motion`。

## 2. Colors

一套中性灰阶承托整个界面，一个蓝色强调色负责选中与主操作，四个语义色负责状态。

### Primary

- **强调蓝（#2563eb）**：唯一的主操作色。用于主按钮底色、当前选中项、聚焦环、活动状态图标。它出现的总面积在任何一屏都不应超过 10%。白底上 5.2:1，配白字同样 5.2:1，正文与按钮都过 AA。
- **强调蓝-悬停（#1d4ed8）**：主按钮悬停/按下态。
- **强调蓝-浅（#2563eb1a）**：选中行、聚焦环外圈、轻量强调底色。

### Secondary

- **状态紫（#7c3aed）**：只用于 Agent 相关的特殊标记（如"多 Agent 协作""特殊能力"），不用于按钮。它的稀有性是它有意义的原因。

### Tertiary

- **成功绿（#15803d）**：任务完成、工具执行成功、连接正常。
- **警告琥珀（#b45309）**：等待确认、降级、需要注意但不阻塞。
- **错误红（#b91c1c）**：失败、校验不通过、危险操作。

三个状态色都以"小面积"出现：状态点、图标、1px 边框或 8% 底色，不整块铺。需要文字时用上述深色值；需要指示点时可以用更亮的同色系（`#22c55e` / `#f59e0b` / `#ef4444`）。

### Neutral

- **主墨（#17181a）**：正文、标题、主要图标的默认色。不用纯黑，纯黑在浅色界面上太硬。
- **次墨（#4a4c50）**：次级文字、说明、非激活标签。
- **弱墨（#6e7075）**：占位符、时间戳、元信息。**占位符必须用这一档而不是更浅的，4.5:1 是底线。**
- **淡墨（#a0a2a8）**：仅用于禁用态和纯装饰性分隔，永远不承载需要阅读的信息。
- **内容底（#ffffff）**：会话、编辑器、主内容区。
- **次级底（#f8f8f9）**：浮起的卡片、会话列表行。
- **侧栏底（#f2f2f4）**：左侧项目/会话导航。
- **内嵌底（#e8e8eb）**：输入框、搜索框、代码块、凹陷区域。
- **描边（#17181a0f / 1a / 29）**：默认 / 强调 / 强分隔，全部是墨色透明度，不是灰色 hex。

### Named Rules

**The Color-Is-Information Rule.** 彩色只允许出现在状态、分类和当前选中上。任何纯装饰性的彩色都必须删除。判断方法：把这块颜色换成灰色，如果信息没有丢失，那它就不该是彩色的。

**The Blue-Is-Action Rule.** 蓝色只出现在可交互或当前选中的地方：主按钮、选中行、聚焦环、活动状态。它不做纯装饰填色，也不出现在静态内容上。

**The Ten Percent Rule.** 强调色在一屏内的覆盖面积不超过 10%。它的稀有性是它有效的原因。

## 3. Typography

**Body Font:** `"Monaspace Argon", "Maple Mono NF CN", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`
**Mono Font:** 同一组合。Monaspace Argon 负责拉丁字符与符号，Maple Mono NF CN 负责中文和中文标点。

**Character:** 这是一套两层等宽字体系统，不是传统 sans 正文。Monaspace 提供编码工具的骨架，Maple 保持中文在紧凑行高下的稳定字形。只带 Regular 400 和 SemiBold 600 两个 WOFF2 字重，避免把未使用的字重打进客户端。

### Hierarchy

- **Title（600, 16px, 1.3）**：页面级标题、空态标题、设置分组标题。全界面最大字号，不出现 20px 以上的标题。
- **Subtitle（560, 14px, 1.35）**：区块标题、会话标题、卡片标题。
- **Body（400, 13px, 1.5）**：正文与消息内容。正文列宽限制在 65-75ch，超出由容器约束。
- **Label（500, 12px, 1.35）**：按钮、标签、表头、状态文字。不做大写字母间距处理（中文界面无意义）。
- **Meta（400, 11.5px, 1.35）**：时间戳、模型名、token 数、路径等元信息。用弱墨色，等宽字体。
- **Mono（400, 12.5px, 1.55）**：代码块、终端输出、diff。

### Named Rules

**The Two-Layer Font Rule.** UI 固定使用 `Monaspace Argon -> Maple Mono NF CN`。前者有字形时优先走前者，中文和前者没有的象形字符由后者接住。不要再引入第三种 UI 字体。

**The Fixed Scale Rule.** 产品界面不使用 `clamp()` 流体字号。字号是固定的梯级，由全局 `--font-scale` 统一缩放。

**The Mono-Is-Code Rule.** 等宽字体只用于代码、路径、命令、数值。按钮文案、标签、标题一律用 sans——给 UI 文字套 monospace 是最容易暴露"AI 生成感"的细节之一。

## 4. Elevation

这套系统以**色调分层**为主、阴影为辅。平面元素靠底色深浅分层，不使用投影；只有真正浮在内容之上的层（下拉、弹窗、工具提示、悬浮面板）才使用阴影和描边。

具体做法：内容区 `#ffffff`，往里嵌入一层用 `#f2f2f4`，再嵌一层用 `#e8e8eb`。层级越"深"（越靠近背景）越浅或越灰，需要"抬起"的元素反而是纯白加极轻投影。

### Shadow Vocabulary

- **raised（`0 1px 2px rgba(23,24,26,.06), 0 0 0 .5px rgba(23,24,26,.05)`）**：悬停抬起、激活的控件、可选中的卡片。
- **float（`0 1px 2px rgba(23,24,26,.06), 0 8px 28px rgba(23,24,26,.12), 0 0 0 .5px rgba(23,24,26,.08)`）**：下拉菜单、弹窗、命令面板。
- **composer（`0 1px 2px rgba(23,24,26,.05), 0 4px 16px rgba(23,24,26,.06)`）**：底部输入区，比 float 更轻，因为它常驻不消失。

### Named Rules

**The Tonal-First Rule.** 先用底色分层，再考虑阴影。如果一个区块能用更深的底色表达从属关系，就不许给它加投影。

**The Half-Pixel Rule.** 必须画线的地方用 `0 0 0 0.5px` 的描边而不是 1px `border`。高 DPI 屏幕上 1px 边框会显得笨重。

**The Material-Not-Decoration Rule.** 禁止装饰性的玻璃拟态。唯一例外是**左侧导航栏**：它允许用毛玻璃材质，因为这层模糊承担"和内容区做材质区分"的功能。其余区域的模糊只允许出现在真实的浮层遮罩上。

侧栏毛玻璃的实现方式：**模糊来自操作系统的窗口材质，不是 CSS**。Windows 上主进程设置 `backgroundMaterial: "acrylic"`（需 Windows 11 22H2+，build ≥ 22621，不满足则回退不透明），渲染层只叠一层 tint + 上下两道 sheen——和参考项目在 macOS 上用 `vibrancy: "sidebar"` 的分工完全一致。tint 取 `color-mix(in oklab, #f2f2f4 45%, transparent)`。

**必须记住的一条**：要让系统材质透上来，从窗口到侧栏之间的每一层都不能有不透明底色——`:root`、`body`、`.app-shell` 都要在 Electron(Windows) 下设为 `transparent`。漏掉任何一层，材质会被整个盖住，表现为"侧栏是块实心灰"。

**The No-Frame Rule.** 区域之间不加圆角外框。外壳是边到边的分区（左侧 rail、右侧内容、更右侧的 dock），靠底色和材质分层，不靠描边、圆角和投影把每一块包成卡片。描边只出现在浮层和输入控件上。

## 5. Spacing

间距使用固定的语义梯级：`2 / 4 / 6 / 8 / 12 / 16 / 24 / 32 / 40 / 48 / 64px`。其中 `2px` 只允许用于图标、描边和光学对齐，不作为常规布局间距。

相关控件用 `4-8px` 的紧凑间距归组，同一区块内的信息用 `8-12px` 分隔，不同区块之间用 `16-24px`，页面级留白用 `32-64px`。兄弟元素优先用 `gap`，不要用 margin 拼间距。

**The Space-Ladder Rule.** 组件 CSS 中不得出现梯级之外的裸 px 间距。所有 `gap`、`margin`、`padding`、`inset` 和定位偏移都必须引用 `--cp-space-*` 令牌。

## 6. Components

### Radius Scale

圆角梯级为 `6 / 8 / 10 / 12 / 18 / 24px`，全圆使用 `9999px`。相较上一版整体上调一档：小控件不再像方形，卡片与浮层保持比参考项目再克制一档，输入区使用 `18px`。

发送、停止、附件和纯图标按钮统一使用全圆；普通按钮、输入框和列表行使用 `10px`，卡片使用 `12px`，浮层使用 `18px`。

**The Shape-Means-Control Rule.** 同一个控件不能随 `disabled / enabled` 状态切换圆角。发送与停止按钮形态完全相同，只改底色、图标和可点击状态。

### Buttons

- **Shape:** 8px 圆角（`--radius-md`），高度统一 28px，内边距 0 12px。
- **Primary:** 蓝底 `#2563eb` + 白字，用于每个视图唯一的主操作。
- **Hover / Focus:** 悬停变 `#1d4ed8`；聚焦显示 2px `#2563eb` 26% 透明外环；按下 `scale(0.98)`。
- **Secondary:** `#e8e8eb` 底 + 主墨字，用于并列的次级操作。
- **Ghost:** 透明底 + 次墨字，悬停出现 `#17181a0a` 底色，用于图标按钮和工具栏。
- **Danger:** 错误红作为文字与描边，仅在确认类操作使用实心红底。

### Chips

- **Style:** `#e8e8eb` 底、次墨字、全圆角、高 20-22px、字号 11.5px。
- **State:** 选中态换成 `#2563eb1a` 底 + 强调蓝字，不使用实心填充；状态点用 6px 圆点。

### Cards / Containers

- **Corner Style:** 10px（`--radius-lg`）。
- **Background:** 平铺卡片用 `#f8f8f9`；需要抬起时用 `#ffffff` + raised 投影。
- **Shadow Strategy:** 见 Elevation。默认无阴影。
- **Border:** 平铺卡片无边框；浮层用 0.5px 墨色 8% 描边。
- **Internal Padding:** 12px 为基准，紧凑区域 8px。

### Inputs / Fields

- **Style:** `#e8e8eb` 底色填充、无边框、8px 圆角、高度 30px、内边距 0 10px。
- **Focus:** 底色转白 + 2px 强调蓝 26% 外环。
- **Placeholder:** 必须使用 `#6e7075`（弱墨），保证 4.5:1。
- **Disabled:** 文字转淡墨，底色不变，光标 default。

### Unified Interaction Components

同一种交互只允许一个组件实现。新增功能必须优先复用现有组件，不能复制一套近似样式：

- 临时消息：`SettingsToast`。支持 message、detail、path、action，关闭按钮固定为最右侧 `×`；不用于常驻内容。
- 持久内联状态：`StateBlock`。统一 neutral / success / warning / error / loading，不再为错误、加载、空态各写一套块。
- 复选框：`SettingsCheckbox`。统一 16px 框体、真实勾号、选中/禁用/焦点态；`labelClickable=false` 用于只允许点击复选框本身的场景。
- 弹层：`ModalShell` + `ModalCloseButton`。统一遮罩、顶部右侧关闭、底部 actions、`backdropDismiss` 和 `closeDisabled`。

完整迁移规则、禁止恢复的旧实现和审计命令见 [docs/design/ui-component-rules.md](docs/design/ui-component-rules.md)。

### Composer（签名组件）

底部输入区是整个客户端使用频次最高的控件。最小高度 46px（约两行），**随内容自动增高**，超过 240px 后转为内部滚动。自动增高由 `App.tsx` 的 `useLayoutEffect` 实现：先把 `height` 归零再读 `scrollHeight`，否则高度只会增不会减。注意 `.composer textarea` 必须是 `flex: none`——基础规则里的 `flex: 1` 会解析成 `flex-basis: 0%`，在 column flex 容器里会直接盖掉 `height`，导致输入框永远长不高。

### Thinking Effort Dial

思考强度弹层里的滑块使用轻量 canvas 场，而不是普通的纯色进度条。轨道高 18px，滑块直径 20px；场由从滑块向左行进的非对称波锋、稀疏流星和落点扫光组成。低档慢而疏，高档快而密，最高档只做一次短促爆发后回到稳定状态，不常驻高强度闪烁。颜色以强调蓝为主，高档才混入少量紫色；整个效果必须服从浅色背景和紧凑尺寸。

拖拽经过档位时有轻微磁吸，但滑块速度始终保持在手指速度的 0.5–1.5 倍之间，不能卡死或突然窜动。`prefers-reduced-motion` 下只保留当前进度的静态场，不运行动画。

### Empty / Error / Loading States

- **Empty:** 一个 40px 的 `state-mark`、16px 标题和最多两行说明；有明确下一步时只放一个主操作，不靠卡片或装饰填满空间。
- **Error:** 使用错误红 9% 淡底、20% 半像素内描边和 15px 警告图标。正文保持主墨色，只有标题、图标和操作使用错误红，不铺整块实心红。
- **Loading:** 文件预览使用四行骨架；目录树、斜杠命令等紧凑区域使用状态点或状态文字。运行中的 Agent 继续使用 activity spinner，因为那里表达的是持续活动，不是内容加载。
- **State Mark:** 40px 方形、12px 圆角、无外边框；通过内底色和图标色区分中性、会话运行与错误状态。空项目仍使用透明 app icon，不套底托。

### Navigation

- **Style:** 左侧栏底色 `#f2f2f4`，与内容区分离但不加右边框。选中项用 `#ffffff` 底 + raised 投影，形成"从侧栏抬起"的效果。
- **Typography:** 会话标题 13px/500，元信息 11.5px/400 弱墨色。
- **States:** 悬停 `#17181a0a`，选中纯白抬起，未读用强调色圆点而不是加粗整行。

### Message Actions

- 用户消息的灰色气泡只包裹角色、正文和图片，`复制` 放在气泡外；每轮最终 AI 回复的 `复制` 旁边显示 `Fork`。Fork 使用 `GitBranch` 图标，点击后从该轮对应用户消息的 Pi entryId 创建分支，并把原消息填回输入框；不要求打开会话树。操作按钮保持 24px 高度、透明底、悬停加深，Fork 悬停时才使用强调蓝。

### Work Panel

右侧工作区是转录流的伴随面板，固定提供三个视图：`文件`、`更改`、`终端`。文件和更改只投影现有 tool 事件；终端是项目根目录下的真实 PTY 会话。

- **Visibility:** 应用启动时默认收起，只记忆宽度，不记忆可见性；由标题栏的 panel 图标切换。右侧面板是伴随工具，不应该在用户没有主动打开时占用内容区。
- **Shell:** 面板用 `#f8f8f9` 与内容区分离，左缘只用半像素墨色线，不用整块边框。
- **Tabs:** 顶部 44px 工具栏内放 28px 视图标签；当前标签用白底 + raised 投影。数量只显示在“更改”标签内，使用小号 pill，不抢主标签。
- **Files:** 文件树行高 28px，使用 Lucide 文件类型图标；支持多选、右键菜单、复制 / 剪切 / 粘贴、拖拽移动、新建、重命名、删除、自动刷新和资源管理器定位。所有写操作限制在项目根内，并受 Agent write lease 约束。
- **Viewer:** 文件以标签页打开，支持编辑保存、未保存标记和外部磁盘变更同步；Markdown 可切换渲染 / 源码，图片内联预览，代码保留行号并默认自动换行。预览头显示文件名、相对路径、复制、换行、保存和资源管理器定位操作。
- **Changes:** 从最新一轮对话中的 `edit / write` 工具事件按文件分组，纵向堆叠成可展开卡片。每张卡片默认折叠，头部显示文件名、相对路径和 `+ / −` 统计；展开后原地显示该文件完整 diff，新增行绿色、删除行红色，带行号和 hunk 头，并提供“在文件中打开”回到 Files。展开区有独立最大高度和滚动，长 diff 不会把整个面板拉长。diff 不是从 tool 文本猜出来的：`@codepiddy/review-extension` 在 Write / Edit 执行前抓旧内容、执行后生成 unified patch，写回 tool result 的 `details.patch`；桌面端优先展示这份 patch，拿不到 patch 时才把 write 的正文整块按新增展示。只有同时出现 `@@` hunk 头或 `---/+++` 文件头才算 diff，避免 Markdown 列表的 `- ` 行被误判成删除。按项目 + 工作项 + Agent 角色 + 轮次持久化最近 80 条变更，重启客户端或更新 Pi 核心后仍可查看。
- **Terminal:** 面板内嵌项目根目录下的真实 PTY 会话（xterm.js + node-pty），不是自绘的输入行。shell、参数、字体和光标形状读取 Windows Terminal 的默认 profile（稳定版 / 预览版 / 非打包版的标准路径，没有配置时回退 PATH），PSReadLine、Tab 补全、Ctrl+C、选择复制等原生行为全部保留。顶部只显示 shell 名称和运行状态；ANSI 调色板按浅色背景重取，保证命令与参数在白底上可读。关闭项目或退出应用时同步结束终端进程。
- **Empty:** 三个视图都使用现有 `state-mark` 空态，说明当前会话会产生什么内容，而不是只显示“暂无数据”。

### Settings

设置页是左侧分类导航 + 右侧内容，一次只显示一个分类：`常规`（Pi 运行时、Shell、工具、Codemode、缓存预热、上下文压缩、诊断）、`集成`（Provider 与模型、llama.cpp、MCP 服务、分享）、`Agent`（Agent Skills、Prompt 模板、Pi Packages）。导航是 208px 的次级底色列，选中项白底抬起；不再把所有设置堆在同一页。

- **Provider 与模型**：读写 Pi 原生 `~/.pi/agent/models.json`。直接 API Key 用 Electron safeStorage 加密保存在本机，models.json 里只写 `$ENV` 引用，启动 Agent 时通过环境变量注入，不落明文；也可选择 Pi 原生 `!command`，客户端只保存命令文本，由 Pi 使用 configured shell 执行并读取 stdout。下方“常用模型范围”把选中的模型写入 Pi 原生 `settings.json` 的 `enabledModels`；模型选择器优先显示“常用模型 · provider”，部分选择时再显示“其他模型”，明确清空常用列表时才显示“全部模型”。
- **Pi 运行时 / 项目信任**：读取 Pi 原生 `~/.pi/agent/trust.json`。只有项目存在需要信任的本地资源且没有已保存或继承决定时才弹窗；可选择信任当前项目、信任父目录、不信任或稍后。Agent 不再无条件使用 `--approve`，项目资源是否加载由 trust 决定。
- **Session 统计**：会话树和输入区上下文圆环可打开统计面板，显示 Session ID / 文件、消息数、工具调用与结果、Token、费用和上下文占用；只读 RPC `get_session_stats`，不改 Session 文件。
- **缓存预热**：读写 Pi 原生 `settings.json` 的 `cacheWarming`（`off / streaming / idle`）和 `showCacheMissNotices`。Provider 支持 prompt caching 时，在缓存过期前用一次很小的请求续上前缀，减少下一轮的 cache miss 费用。会话统计面板显示当前模式、cache miss penalty、refresh cost、expected savings 和最近一次决策；Pi 1.0.1 的 RPC 不暴露实时 `cacheWarmingStatus`，决策数据由 `cache_warming_decision` 扩展事件写入状态文件。
- **Shell**：读写 Pi 原生 `settings.json` 的 `shellPath` 和 `shellCommandPrefix`。`shellCommandPrefix` 使用多行文本编辑，Pi 会在每条 bash 命令前单独插入该片段；空值删除字段，适合启用 alias 展开或加载用户 shell 初始化文件。
- **Codemode**：读写 Pi 原生 `settings.json` 的 `codemode.mode`（`on / only`）和 `codemode.inlineBudget`。转录流中的 Codemode 工具卡显示脚本、工具调用、状态/耗时、错误、完整输出路径和结果；这些详情来自 Pi `tool_execution_*` 的 `details`，客户端不实现第二套脚本引擎。
- **上下文压缩**：读写 Pi 原生 `settings.json` 的 `compaction` 和 `branchSummary`。支持自动压缩开关、全局 `reserveTokens` / `keepRecentTokens`、分支摘要 `reserveTokens` / `skipPrompt`，以及按精确 `provider/modelId` 配置的 `modelOverrides`。单模型覆盖是全局参数的补充，未覆盖的模型继续使用全局值；手动 `/compact` 不受影响。当前客户端分支导航仍以 Fork 为主，分支摘要的实际触发由 Pi 的分支流程决定。
- **MCP 服务**：读写 Pi 原生 `~/.pi/agent/mcp.json`，并支持项目级 `.pi/mcp.json` 覆盖 `enabled` / `exposure` / `toolExposure`。全局编辑器覆盖 stdio / HTTP、参数、环境变量、Headers、描述、超时、工具级 exposure、OAuth 和 `auth.provider`。OAuth client secret 使用 safeStorage，配置只写环境变量引用；登录 / 退出调用 Pi 原生 `mcp` 子命令，重连复用当前 Agent 进程重启。`/mcp` 在客户端命令菜单中打开 MCP 管理页，运行状态由 `pi mcp list --json` 包装读取。客户端不维护内置搜索服务，需要搜索时由用户在通用 MCP 页面配置。
- **分享**：Radius 登录 / 退出复用 Pi Provider 认证和 `auth.json`，但入口与 Provider 页面分离。GitHub CLI 只做路径、版本和登录状态检测，用户手动选择 `gh.exe` 后保存到 CodePIddy `share.json`，不保存 GitHub Token。检测顺序是手动路径、`CODEPIDDY_GH_PATH`、PATH、官方安装器标准目录；不包含机器特定盘符。Radius 与 GitHub CLI 使用 `codepiddy-icons/radius.svg` 和 `codepiddy-icons/github-cli.svg` 品牌图标。
- **设置反馈**：MCP、Provider、Package 和其他设置统一使用右下角 `SettingsToast` 消息栈。成功和错误提示自动消失、可手动关闭；多条消息纵向堆叠，不互相覆盖。
- 两类配置都只影响新启动或重置后的 Agent；正在运行的 Agent 不受影响。

### Tool Card（签名组件）

Agent 工具调用的卡片是整个客户端最有辨识度的元素。它有三种形态：运行中展开显示实时输出（左侧状态点呼吸、等宽输出区用内嵌底）、完成后折叠为单行摘要（图标 + 工具名 + 状态 + 耗时）、失败时保留错误红描边并默认展开。摘要行的信息密度要高，但行高不超过 32px。

### Running Indicator

运行状态属于转录流末尾，不放进输入区，也不做浮起的胶囊或卡片。它是一行轻量状态：三个 4px 圆点以 120ms 间隔做 0.8→1 的缩放和透明度变化，后面跟运行标签，超长时省略；只有紧急状态才用琥珀或红色，普通运行保持次墨色。这样回复、工具调用和过程摘要都在同一阅读轴线上，输入区始终干净。

### Stream Stats Glyph

Token 速率前的流星不能依赖字体字符。`codepiddy-icons/meteor.svg` 是用户提供的正式源文件，渲染层通过 Vite 资源 URL 缩到 12px，保留原始 viewBox 与多彩配色，并标记为装饰性内容。分享设置中的 `codepiddy-icons/radius.svg` 和 `codepiddy-icons/github-cli.svg` 同样作为品牌矢量例外，使用 Vite `?url` 导入，不重绘、不重着色。这样不会因 Monaspace / Maple 缺少符号而出现豆腐块，也保留图标自身的识别度。

## 7. Do's and Don'ts

### Do:

- **Do** 用四层底色（`#ffffff` / `#f8f8f9` / `#f2f2f4` / `#e8e8eb`）表达层级，先分层再考虑阴影。
- **Do** 把控件统一到 28px 高度、8px 圆角、0-12px 内边距这三条基线上。
- **Do** 用 `#17181a` 墨色的透明度生成描边和悬停底色，而不是手写独立灰值。
- **Do** 让彩色只出现在状态点、选中态、状态文字和必要的分类标记上。
- **Do** 给每个交互元素补齐 default / hover / focus-visible / active / disabled 五种状态。
- **Do** 用半像素描边（`0 0 0 0.5px`）画必须存在的线条。
- **Do** 用等宽字体只标注代码、路径、命令和数值。

### Don't:

- **Don't** 做成"AI 味重的界面"：禁止玻璃拟态堆叠、渐变文字、紫色渐变、无意义的超大圆角卡片网格、用 emoji 当图标、每张卡片都长得一样。
- **Don't** 用 1px `border` 给平铺卡片画框；那是 2014 年的做法，会让界面立刻显得廉价。
- **Don't** 把蓝色用于纯装饰；蓝色只表达可交互与当前选中。
- **Don't** 用 `clamp()` 做流体字号，产品界面不需要。
- **Don't** 给按钮、标签、标题套等宽字体。
- **Don't** 用纯黑 `#000` 作为正文色。
- **Don't** 让占位符或元信息浅于 `#6e7075`——那是可读性事故的常见来源。
- **Don't** 为装饰添加动效。动效只表达状态变化，且必须提供 `prefers-reduced-motion` 降级。
