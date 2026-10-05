# CodePIddy UI Component Rules

> 目的：同一种交互只允许一个组件实现。后续新增或修改 UI 时，先复用这里的组件，不要再写第二种样式或第二套交互。

## 核心规则

1. **临时消息只走 `SettingsToast`**
   - 文件：`packages/codepiddy-desktop/src/renderer/components/settings-toast.tsx`
   - 适用于成功、失败、短提示、带详情、带路径、可撤销动作。
   - 关闭按钮必须是消息最右侧的 `×`。
   - 临时消息不能改成常驻卡片；需要常驻时使用 `StateBlock`。

2. **持久内联状态只走 `StateBlock`**
   - 文件：`packages/codepiddy-desktop/src/renderer/components/state-block.tsx`
   - 适用于空态、加载态、错误态、警告态，以及需要长期留在页面里的说明。
   - 使用 `tone`：`neutral | success | warning | error | loading`。
   - 使用 `compact` 表示工具条或窄面板里的紧凑状态。

3. **所有复选框只走 `SettingsCheckbox`**
   - 文件：`packages/codepiddy-desktop/src/renderer/components/settings-checkbox.tsx`
   - 统一 16px 框体、真实 `Check` 勾号、选中/禁用/焦点态。
   - `labelClickable=true`：复选框和文案可点，适用于普通设置项。
   - `labelClickable=false`：只有复选框本身可点，适用于诊断会话这类需要限制点击范围的场景。
   - 不要直接写原生 `input type="checkbox"`，除非是在组件内部。

4. **所有弹层只走 `ModalShell`**
   - 文件：`packages/codepiddy-desktop/src/renderer/components/modal-shell.tsx`
   - 统一遮罩、顶部右侧关闭按钮、底部 actions、关闭禁用状态和点击遮罩规则。
   - `backdropDismiss=false`：权限请求等不允许点遮罩关闭的弹层。
   - `closeDisabled=true`：异步提交中禁止关闭。
   - 关闭按钮统一使用 `ModalCloseButton` / `AppIcon name="close"`，不要手写 `×` 字符。

## 组件边界

- 下拉选择：`SelectMenu`
- 模型选择器：`model-picker` popover，不是 modal
- 工作区标签：`WorkPanel` 内部 tabs
- 图标按钮：`IconButton` / `PanelIconButton`
- 品牌矢量：`codepiddy-icons/` 下的 SVG，使用 Vite `?url`

## 禁止恢复的旧实现

- 不要再新增 `.toast` 常驻节点；旧 `.toast` 已退役。
- 不要再新增 `.error-banner`；错误使用 `StateBlock tone="error"`。
- 不要再新增 `session-tree-heading` + 手写 `×` 的弹层头部；使用 `ModalShell`。
- 不要再新增原生 checkbox + `accent-color` 的实现；使用 `SettingsCheckbox`。
- 不要再新增单独的 `modal-backdrop` 分支；使用 `ModalShell`。

## 审计命令

```powershell
rg -n 'type="checkbox"' packages/codepiddy-desktop/src/renderer -g '*.tsx'
rg -n 'className="modal-backdrop"|className="modal ' packages/codepiddy-desktop/src/renderer -g '*.tsx'
rg -n 'className="toast"|error-banner' packages/codepiddy-desktop/src/renderer -g '*.tsx'
rg -n 'showSettingsToast|StateBlock|ModalShell|SettingsCheckbox' packages/codepiddy-desktop/src/renderer -g '*.tsx'
```

预期结果：

- `type="checkbox"` 只出现在 `settings-checkbox.tsx`。
- `modal-backdrop` 只出现在 `modal-shell.tsx`。
- `className="toast"` 和 `error-banner` 不再出现。
- 新增业务代码只引用统一组件，不直接复制样式。

## 验证要求

改 UI 后必须跑：

```powershell
npm run check
npm run typecheck --workspace=@codepiddy/desktop
npm run build:codepiddy
```

涉及组件交互时，至少用 demo `?demo=1` 检查默认态、选中态、禁用态、错误态和弹层关闭。
