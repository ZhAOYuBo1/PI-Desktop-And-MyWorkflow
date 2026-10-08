// Pi core 原生内置工具（packages/coding-agent/src/core/tools）只有下面 8 个。
// 这里只对原生工具做语义化展示，扩展 / MCP 工具保持通用回退，避免把非 core
// 能力耦合进消息页。
export type NativeToolAction = "read" | "write" | "edit" | "run" | "search" | "find" | "list";

const NATIVE_TOOL_ACTIONS: Record<string, NativeToolAction> = {
	read: "read",
	write: "write",
	edit: "edit",
	bash: "run",
	powershell: "run",
	grep: "search",
	find: "find",
	ls: "list",
};

export type ToolArgs = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** args 在内存里是 JSON 字符串；解析失败返回 null，由调用方回退到原文。 */
export function parseToolArgs(raw: string): ToolArgs | null {
	if (!raw.trim()) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function bareToolName(toolName: string): string {
	const normalized = toolName.trim().toLowerCase();
	const last = normalized.split(/[.:/]/).pop() ?? normalized;
	return last.replace(/[^a-z0-9]+/g, "");
}

export function nativeToolAction(toolName: string): NativeToolAction | null {
	return NATIVE_TOOL_ACTIONS[bareToolName(toolName)] ?? null;
}

export function isNativeTool(toolName: string): boolean {
	return nativeToolAction(toolName) !== null;
}

export function toolActionLabel(action: NativeToolAction): string {
	switch (action) {
		case "read":
			return "读取";
		case "write":
			return "写入";
		case "edit":
			return "编辑";
		case "run":
			return "运行";
		case "search":
			return "搜索";
		case "find":
			return "查找文件";
		case "list":
			return "列出目录";
	}
}

function stringField(args: ToolArgs | null, keys: string[]): string | null {
	if (!args) return null;
	for (const key of keys) {
		const value = args[key];
		if (typeof value === "string" && value.trim()) return value;
	}
	return null;
}

function numberField(args: ToolArgs | null, key: string): number | null {
	if (!args) return null;
	const value = args[key];
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function compact(value: string, limit = 160): string {
	const singleLine = value.replace(/\s+/g, " ").trim();
	return singleLine.length > limit ? `${singleLine.slice(0, limit - 1).trimEnd()}…` : singleLine;
}

/** 折叠行右侧的一行摘要；非原生工具返回空字符串。 */
export function toolSummary(toolName: string, args: ToolArgs | null): string {
	const action = nativeToolAction(toolName);
	if (!action) return "";
	switch (action) {
		case "read": {
			const path = stringField(args, ["path", "file_path", "filePath"]);
			const offset = numberField(args, "offset");
			const limit = numberField(args, "limit");
			const range = limit !== null ? ` :${offset ?? 1}+${limit}` : offset !== null ? ` :${offset}` : "";
			return path ? compact(`${path}${range}`) : "";
		}
		case "write": {
			const path = stringField(args, ["path", "file_path", "filePath"]);
			const content = stringField(args, ["content"]);
			const lines = content ? content.split("\n").length : 0;
			return path ? compact(lines > 0 ? `${path} · ${lines} 行` : path) : "";
		}
		case "edit": {
			const path = stringField(args, ["path", "file_path", "filePath"]);
			const edits = Array.isArray(args?.edits) ? args.edits.length : 0;
			return path ? compact(edits > 0 ? `${path} · ${edits} 处替换` : path) : "";
		}
		case "run":
			return compact(stringField(args, ["command", "cmd"]) ?? "");
		case "search": {
			const pattern = stringField(args, ["pattern", "query"]);
			const glob = stringField(args, ["glob"]);
			const path = stringField(args, ["path"]);
			const scope = glob ?? path;
			return pattern ? compact(scope ? `${pattern} · ${scope}` : pattern) : "";
		}
		case "find": {
			const pattern = stringField(args, ["pattern", "glob"]);
			const path = stringField(args, ["path"]);
			return pattern ? compact(path ? `${pattern} · ${path}` : pattern) : "";
		}
		case "list": {
			const path = stringField(args, ["path"]);
			return path ? compact(path) : "当前目录";
		}
	}
}

export interface ToolDetailRow {
	label: string;
	value: string;
	mono: boolean;
}

function pushRow(rows: ToolDetailRow[], label: string, value: string | null, mono = false): void {
	if (value?.trim()) rows.push({ label, value, mono });
}

/** 展开区的结构化参数行；原生工具给语义字段，其它工具给 key/value 回退。 */
export function toolDetailRows(toolName: string, args: ToolArgs | null): ToolDetailRow[] {
	const action = nativeToolAction(toolName);
	const rows: ToolDetailRow[] = [];
	if (!action) {
		if (args) {
			for (const [key, value] of Object.entries(args)) {
				if (typeof value === "string") pushRow(rows, key, value);
				else if (value !== undefined && value !== null) pushRow(rows, key, JSON.stringify(value));
			}
		}
		return rows;
	}
	switch (action) {
		case "read":
			pushRow(rows, "路径", stringField(args, ["path", "file_path", "filePath"]));
			pushRow(rows, "起始行", numberField(args, "offset")?.toString() ?? null);
			pushRow(rows, "行数上限", numberField(args, "limit")?.toString() ?? null);
			break;
		case "write":
			pushRow(rows, "路径", stringField(args, ["path", "file_path", "filePath"]));
			break;
		case "edit": {
			pushRow(rows, "路径", stringField(args, ["path", "file_path", "filePath"]));
			const edits = Array.isArray(args?.edits) ? args.edits.length : 0;
			if (edits > 0) pushRow(rows, "替换", `${edits} 处`);
			break;
		}
		case "run":
			pushRow(rows, "命令", stringField(args, ["command", "cmd"]), true);
			pushRow(rows, "超时", numberField(args, "timeout")?.toString() ?? null);
			break;
		case "search":
			pushRow(rows, "模式", stringField(args, ["pattern", "query"]), true);
			pushRow(rows, "路径", stringField(args, ["path"]));
			pushRow(rows, "过滤", stringField(args, ["glob"]));
			break;
		case "find":
			pushRow(rows, "模式", stringField(args, ["pattern", "glob"]), true);
			pushRow(rows, "路径", stringField(args, ["path"]));
			break;
		case "list":
			pushRow(rows, "路径", stringField(args, ["path"]) ?? "当前目录");
			break;
	}
	return rows;
}
