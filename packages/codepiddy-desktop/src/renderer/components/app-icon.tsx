import {
	Archive,
	ArchiveRestore,
	ArrowUp,
	ChevronRight,
	CircleCheck,
	CircleX,
	Clock,
	Copy,
	Ellipsis,
	Eye,
	FilePlus,
	FileSearch,
	Folder,
	GitBranch,
	Globe,
	HardDrive,
	List,
	ListChecks,
	type LucideIcon,
	MessageCircleQuestion,
	PanelRight,
	Paperclip,
	Pencil,
	Plug,
	Plus,
	Search,
	Settings,
	Shield,
	Sparkles,
	Square,
	Terminal,
	TextSearch,
	TriangleAlert,
	X,
} from "lucide-react";

/**
 * 图标统一取自 lucide-react（24 网格、2px 描边、圆角端点、无实心点缀）。
 * 之前每个图标都是手写 path，线宽、圆角半径、视觉重心各不相同，放在一起就成了
 * 「AI 拼出来」的第一眼来源。设计源文件见仓库根的 codepiddy-icons/。
 */
export type AppIconName =
	| "archive"
	| "arrow-up"
	| "branch"
	| "chevron"
	| "close"
	| "copy"
	| "edit"
	| "folder"
	| "more"
	| "paperclip"
	| "panel"
	| "plus"
	| "restore"
	| "search"
	| "stop"
	| "settings"
	| "warning"
	| "eye"
	| "terminal"
	| "file-plus"
	| "text-search"
	| "file-search"
	| "list"
	| "sparkles"
	| "plug"
	| "checklist"
	| "message-question"
	| "globe"
	| "hard-drive"
	| "clock"
	| "check-circle"
	| "x-circle"
	| "caret"
	| "shield";

const APP_ICONS: Record<AppIconName, LucideIcon> = {
	archive: Archive,
	"arrow-up": ArrowUp,
	branch: GitBranch,
	chevron: ChevronRight,
	close: X,
	copy: Copy,
	edit: Pencil,
	folder: Folder,
	more: Ellipsis,
	paperclip: Paperclip,
	panel: PanelRight,
	plus: Plus,
	restore: ArchiveRestore,
	search: Search,
	stop: Square,
	settings: Settings,
	warning: TriangleAlert,
	eye: Eye,
	terminal: Terminal,
	"file-plus": FilePlus,
	"text-search": TextSearch,
	"file-search": FileSearch,
	list: List,
	sparkles: Sparkles,
	plug: Plug,
	checklist: ListChecks,
	"message-question": MessageCircleQuestion,
	globe: Globe,
	"hard-drive": HardDrive,
	clock: Clock,
	"check-circle": CircleCheck,
	"x-circle": CircleX,
	caret: ChevronRight,
	shield: Shield,
};

export function AppIcon({ name, size = 16, className = "" }: { name: AppIconName; size?: number; className?: string }) {
	const Icon = APP_ICONS[name];
	return (
		<Icon
			className={`app-svg-icon ${className}`.trim()}
			size={size}
			strokeWidth={2}
			fill={name === "stop" ? "currentColor" : "none"}
			aria-hidden="true"
		/>
	);
}
