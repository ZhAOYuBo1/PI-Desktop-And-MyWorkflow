import {
	Braces,
	ChevronRight,
	CircleCheck,
	CircleX,
	Clock,
	Eye,
	FilePlus,
	FileSearch,
	List,
	ListChecks,
	type LucideIcon,
	MessageCircleQuestion,
	Pencil,
	Plug,
	Shield,
	Sparkles,
	Terminal,
	TextSearch,
} from "lucide-react";
import { memo } from "react";

/** 工具卡图标同样走 lucide-react，和应用图标共用一套几何语言。 */
export type ToolIconName =
	| "eye"
	| "braces"
	| "terminal"
	| "edit"
	| "file-plus"
	| "text-search"
	| "file-search"
	| "list"
	| "sparkles"
	| "plug"
	| "checklist"
	| "message-question"
	| "clock"
	| "check-circle"
	| "x-circle"
	| "caret"
	| "shield";

export function toolIconForTool(toolName: string): ToolIconName {
	const name = toolName.toLowerCase();
	if (name === "read") return "eye";
	if (name === "codemode") return "braces";
	if (name === "bash" || name === "powershell") return "terminal";
	if (name === "edit") return "edit";
	if (name === "write") return "file-plus";
	if (name === "grep") return "text-search";
	if (name === "find") return "file-search";
	if (name === "ls") return "list";
	if (name === "skill") return "sparkles";
	if (name === "mcp") return "plug";
	if (name === "todo") return "checklist";
	if (name === "question") return "message-question";
	if (name.startsWith("mcp__")) return "plug";
	return "sparkles";
}

const TOOL_ICONS: Record<ToolIconName, LucideIcon> = {
	eye: Eye,
	braces: Braces,
	terminal: Terminal,
	edit: Pencil,
	"file-plus": FilePlus,
	"text-search": TextSearch,
	"file-search": FileSearch,
	list: List,
	sparkles: Sparkles,
	plug: Plug,
	checklist: ListChecks,
	"message-question": MessageCircleQuestion,
	clock: Clock,
	"check-circle": CircleCheck,
	"x-circle": CircleX,
	caret: ChevronRight,
	shield: Shield,
};

export const ToolIcon = memo(function ToolIcon({
	name,
	size = 14,
	className = "",
}: {
	name: ToolIconName;
	size?: number;
	className?: string;
}) {
	const Icon = TOOL_ICONS[name];
	return (
		<Icon className={`app-svg-icon tool-glyph ${className}`.trim()} size={size} strokeWidth={2} aria-hidden="true" />
	);
});
