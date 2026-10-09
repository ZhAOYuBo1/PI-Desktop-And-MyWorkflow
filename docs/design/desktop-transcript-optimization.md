# 消息页（Transcript）优化：只依赖 Pi core 原生

状态：进行中。本文件是压缩后的恢复入口，保持简短；实现细节看代码和 git log。

进度：T1-T5 已完成并提交 `46f63909f`（T1/T2/T3 原始提交 `4f3183067`，功能生效验证脚本 `204733bff`）。
下一步：T6（渲染 `compaction` 行），然后按 T7 → T14 顺序继续。T15 先搁置。

## 目标与边界

- 只做 Pi core 原生能力（RPC / 事件 / session entries / 内置工具）。
- 不碰 `packages/coding-agent`、`packages/coding-agent-runtime`、`packages/ai`。
- 只做优化，不回退已有功能。
- 历史展示必须继续用 `get_entries`，不能用 `get_messages`。
- 原生内置工具只有：`read` / `bash` / `powershell` / `edit` / `write` / `grep` / `find` / `ls`。
- 扩展 / MCP / subagent 专用卡不做；权限审批内联卡不做。

## 任务清单

- [x] T1 工具行语义化（原生 8 工具）+ 历史 `toolCall` 参数修复
- [x] T2 回复元信息：模型 / usage / cost / thinkingLevel。每条回复都显示，放在正文**上方**；
      历史消息按各自实际使用的模型取值（不是当前模型）。流式统计行（tok/s）仍只在最新一条。
- [x] T3 复制整段对话（Agent 操作菜单）
- [x] T4 markdown 换成参考项目方案：`react-markdown` + `remark-gfm` + `remark-math` +
      `rehype-katex` + `rehype-raw` + `rehype-sanitize`（精确版本，`katex` 一并引入）；
      代码高亮继续用仓库已有的 `highlight.js`，不引入 `shiki`；代码块工具条 / 表格 /
      `message-rich-text` 外观保留。功能生效验证已扩展到 T4。
- [x] T5 消息内文件路径 chip：行内代码里像工作区相对路径的（已知扩展名）变成可点击
      chip，点击打开右侧工作区文件视图（`App.tsx` → `WorkPanel` 的 `requestedPath`）。
      点击前先 `statWorkspaceFile` 校验；直接打不开时按文件名在项目内找唯一同名项
      （`searchProjectFiles`），命中就打开那个路径。都没有或有歧义（例如构建产物
      basename）只弹提示，不打开读不到的标签页。文件名识别支持中文（Unicode）。
- [ ] T6 渲染 `compaction` 行（tokensBefore + 可折叠 summary）
- [ ] T7 渲染 `context_edit` 行
- [ ] T8 渲染 `model_change` / `thinking_level_change` 行
- [ ] T10 会话内搜索 + 高亮 + 命中折叠过程组自动展开
- [ ] T11 助手回合 + 部件（part）模型：`thinking / text / toolCall` 有序部件
- [ ] T12 Thinking 显示模式（compact / detailed），依赖 T11
- [ ] T13 平滑流式输出 + 光标，尊重 reduced-motion
- [ ] T14 分支 / 重放入口放到助手回合（`fork` 与 draft 回填已有）
- [ ] T15 长会话窗口化 + minimap 配套（先搁置）

## 不做

权限审批内联、web search 卡、subagent / bg_wait / contact_supervisor 卡、生成图片卡、
插件 tool slot、用户消息原地编辑 / 删除 / 修订翻页。

## 禁止破坏

常驻 Agent pane；`get_entries` 完整历史；滚动跟随；定位条（20 条 / 滚轮 / 颜色）；
工具卡失败指引与「显示全部」；用户图片 / delivery / Fork 回填；会话增删改与重命名；
工作区文件面板；设置页；Pi core 更新边界。

## 恢复

1. 读本文件 + `docs/design/reference-pi-desktop.md`。
2. `git log --oneline -10`，对照上面勾选状态确认进度。
3. `npm run check` 确认基线。
4. 按 T6 → T14 顺序继续；每步 `npm run check`，renderer 改动再跑
   `npm run build:renderer --workspace=@codepiddy/desktop`。
5. UI 改动要跑功能生效验证：`npm run verify:transcript --workspace=@codepiddy/desktop`
   （起真实 Vite + Chromium，加载 `?demo=1` 断言渲染结果；新增 UI 断言就扩展这个脚本）。
6. 测试循环：纯逻辑加单测（`test/*.test.ts`）；UI 交互扩展 `verify:transcript`；
   真实 Pi 事件（流式跟随、compaction、会话内搜索）用 Electron + 真实会话或
   `scripts/fixtures/shot-pi-rpc.mjs` 假 RPC 验证。先写 → 跑 → 看反馈 → 修 → 再跑。
7. 每批通过验证、用户确认后按批次提交；只暂存本批次改动的显式路径，禁止 `git add -A`。
   改 `package-lock.json` 用 `PI_ALLOW_LOCKFILE_CHANGE=1`。
