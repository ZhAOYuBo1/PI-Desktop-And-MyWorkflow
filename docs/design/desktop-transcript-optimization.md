# 消息页（Transcript）优化：只依赖 Pi core 原生

状态：进行中。本文件是压缩后的恢复入口，保持简短；实现细节看代码和 git log。

下一步：T4（markdown 依赖 + 渲染器替换），然后按 T5 → T14 顺序继续。T15 先搁置。

## 目标与边界

- 只做 Pi core 原生能力（RPC / 事件 / session entries / 内置工具）。
- 不碰 `packages/coding-agent`、`packages/coding-agent-runtime`、`packages/ai`。
- 只做优化，不回退已有功能。
- 历史展示必须继续用 `get_entries`，不能用 `get_messages`。
- 原生内置工具只有：`read` / `bash` / `powershell` / `edit` / `write` / `grep` / `find` / `ls`。
- 扩展 / MCP / subagent 专用卡不做；权限审批内联卡不做。

## 任务清单

- [x] T1 工具行语义化（原生 8 工具）+ 历史 `toolCall` 参数修复
- [x] T2 回复元信息：模型 / usage / cost / thinkingLevel
- [x] T3 复制整段对话（Agent 操作菜单）
- [ ] T4 markdown 换成参考项目方案：`react-markdown` + `remark-gfm` + rehype 系列；
      代码高亮继续用仓库已有的 `highlight.js`，不引入 `shiki`
- [ ] T5 消息内文件路径 chip（需要把「打开文件」请求从 `App.tsx` 传到 `WorkPanel`）
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
4. 按 T4 → T14 顺序继续；每步 `npm run check`，renderer 改动再跑
   `npm run build:renderer --workspace=@codepiddy/desktop`。
5. UI 改动要跑功能生效验证：`npm run verify:transcript --workspace=@codepiddy/desktop`
   （起真实 Vite + Chromium，加载 `?demo=1` 断言渲染结果；新增 UI 断言就扩展这个脚本）。
