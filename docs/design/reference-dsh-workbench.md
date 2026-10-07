# dsh-plugin-workbench 参考拆解

参考仓库：`https://github.com/Pasumao/dsh-plugin-workbench`

本地只读克隆：`E:\mypi-refs\reference-dsh-plugin-workbench`

审查版本：`c669b42`（0.0.25，仓库已停止维护，原因是 DSH 后续版本内置了文件树和文档预览）。

## 可迁移能力

- 文件树懒加载、自动刷新、每个项目独立保存展开状态。
- 文件 / 文件夹右键菜单：新建、重命名、删除、复制、剪切、粘贴、复制路径、在资源管理器中显示、刷新。
- 多选、`Ctrl/Cmd+C/X/V`、`Ctrl+A`、`Delete`、`Escape`。
- 拖拽文件或目录到目录行，执行移动。
- 多标签预览、编辑保存、未保存标记。
- 外部磁盘变更同步；有未保存草稿时不覆盖，只提示重新加载。
- Markdown 渲染 / 源码切换、图片预览、自动换行、行号。
- 文件类型图标。
- 在消息中插入 `@相对路径`。

## CodePIddy 适配边界

已适配：

- 文件操作和文件树交互由 `packages/codepiddy-core/src/workspace-fs.ts`、主进程 IPC、preload 和 `WorkspaceFilesView.tsx` 实现。
- 所有写操作都限制在当前项目根目录内，并对最近存在的祖先执行 `realpath` 校验，避免符号链接越界。
- 写操作会检查当前 Agent 的 write lease，避免用户保存和 Agent 写入同时发生。
- 视觉继续使用 CodePIddy 的浅色令牌、Lucide 图标、`ModalShell`、`SettingsToast` 和 `StateBlock`。

未照搬：

- 深色主题、emoji 文件图标、自定义滚动条、宿主布局补丁和 `.dsh-trash`。
- 语法高亮、操作撤销栈、标签拖拽排序、把文件直接拖进聊天输入区。这些属于后续可选增强，不是当前文件工作台的基础闭环。
