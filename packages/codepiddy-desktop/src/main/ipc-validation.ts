import path from "node:path";
import type {
	AgentImageAttachment,
	AgentInstanceLocator,
	AgentRole,
	AgentUiState,
	ArchiveWorkItemInput,
	CacheWarmingSettings,
	CodemodeSettings,
	CompactionModelOverride,
	ContextCompactionSettings,
	CreateAgentInput,
	CreateWorkItemInput,
	DiagnosticsExportInput,
	ExtensionUiResponseInput,
	ForkAgentSessionInput,
	InvokeAgentBuiltinCommandInput,
	JsonObject,
	JsonValue,
	LaneKind,
	LlamaCppAction,
	McpActionInput,
	McpClientRegistration,
	McpExposure,
	McpOAuthInput,
	McpProjectOverrideInput,
	McpProjectOverrideLocator,
	McpServerInput,
	PiBuiltinToolName,
	PiPackageActionInput,
	PiPackageExtensionInput,
	PiPackageScope,
	ProjectUiState,
	PromptTemplateInput,
	PromptTemplateLocator,
	PromptTemplateScope,
	ProviderApiKeySource,
	ProviderInput,
	ProviderModelInput,
	ProviderModelOverride,
	RenameWorkItemInput,
	ResetAgentInput,
	RunLlamaCppActionInput,
	SaveLlamaCppConfigInput,
	SendAgentPromptInput,
	SetAgentModelInput,
	SetAgentModelScopeInput,
	SetAgentThinkingInput,
	SetProjectTrustInput,
	SetRoleSkillAssignmentsInput,
	SwitchAgentSessionInput,
	TerminalResizeInput,
	TerminalStartInput,
	TerminalWriteInput,
	ToolSettings,
	WorkspaceCopyEntryInput,
	WorkspaceCreateEntryInput,
	WorkspaceDeleteEntryInput,
	WorkspaceRenameEntryInput,
	WorkspaceRevealEntryInput,
	WorkspaceWriteFileInput,
} from "@codepiddy/shared";

const AGENT_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
const MAX_PROMPT_IMAGES = 8;
const MAX_PROMPT_IMAGE_BYTES = 10 * 1024 * 1024;
const PI_BUILTIN_TOOL_NAMES = [
	"read",
	"bash",
	"powershell",
	"edit",
	"write",
	"grep",
	"find",
	"ls",
] as const satisfies readonly PiBuiltinToolName[];

function isPiBuiltinToolName(value: unknown): value is PiBuiltinToolName {
	return typeof value === "string" && (PI_BUILTIN_TOOL_NAMES as readonly string[]).includes(value);
}

function record(value: unknown, label: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} 格式无效`);
	return value as Record<string, unknown>;
}

function text(value: unknown, label: string, maximum: number, allowEmpty = false): string {
	if (typeof value !== "string") throw new Error(`${label} 必须是字符串`);
	const result = value.trim();
	if (!allowEmpty && !result) throw new Error(`${label} 不能为空`);
	if (result.length > maximum) throw new Error(`${label} 超过最大长度 ${maximum}`);
	if (result.includes("\0")) throw new Error(`${label} 包含非法字符`);
	return result;
}

function rawText(value: unknown, label: string, maximum: number, allowEmpty = false): string {
	if (typeof value !== "string") throw new Error(`${label} 必须是字符串`);
	if (!allowEmpty && !value.trim()) throw new Error(`${label} 不能为空`);
	if (value.length > maximum) throw new Error(`${label} 超过最大长度 ${maximum}`);
	if (value.includes("\0")) throw new Error(`${label} 包含非法字符`);
	return value;
}

function nonNegativeSafeInteger(value: unknown, label: string): number {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
		throw new Error(`${label} 必须是非负整数`);
	}
	return value;
}

function booleanValue(value: unknown, label: string): boolean {
	if (typeof value !== "boolean") throw new Error(`${label} 必须是布尔值`);
	return value;
}

function jsonValue(value: unknown, label: string, depth = 0): JsonValue {
	if (depth > 32) throw new Error(`${label} 嵌套过深`);
	if (value === null || typeof value === "string" || typeof value === "boolean") return value;
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new Error(`${label} 必须是有限数值`);
		return value;
	}
	if (Array.isArray(value)) return value.map((item) => jsonValue(item, label, depth + 1));
	const object = record(value, label);
	return Object.fromEntries(
		Object.entries(object).map(([key, item]) => [key, jsonValue(item, `${label}.${key}`, depth + 1)] as const),
	);
}

function jsonObject(value: unknown, label: string): JsonObject {
	const parsed = jsonValue(value, label);
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error(`${label} 必须是 JSON 对象`);
	}
	return parsed;
}

function optionalJsonObject(value: unknown, label: string): JsonObject | null | undefined {
	if (value === undefined) return undefined;
	if (value === null) return null;
	return jsonObject(value, label);
}

function optionalText(value: unknown, label: string, maximum: number): string | null | undefined {
	if (value === undefined) return undefined;
	if (value === null) return null;
	return text(value, label, maximum, true);
}

function optionalStringRecord(value: unknown, label: string): Record<string, string> | null | undefined {
	if (value === undefined) return undefined;
	if (value === null) return null;
	const input = record(value, label);
	return Object.fromEntries(
		Object.entries(input).flatMap(([key, item]) => {
			if (typeof item !== "string") return [];
			const normalizedKey = key.trim();
			const normalizedValue = item.trim();
			return normalizedKey && normalizedValue ? [[normalizedKey, normalizedValue] as const] : [];
		}),
	);
}

function role(value: unknown): AgentRole {
	if (value === "requirement-analysis" || value === "coding" || value === "bug-fix" || value === "review")
		return value;
	throw new Error("Agent Role 无效");
}

function lane(value: unknown): LaneKind {
	if (value === "requirements" || value === "bugs") return value;
	throw new Error("Work Item Lane 无效");
}

function projectRoot(value: unknown): string {
	return path.resolve(text(value, "项目路径", 2048));
}

function projectId(value: unknown): string {
	const result = text(value, "Project ID", 128);
	if (!/^[a-zA-Z0-9-]+$/.test(result)) throw new Error("Project ID 格式无效");
	return result;
}

function workItemId(value: unknown): string {
	const result = text(value, "Work Item ID", 64);
	if (!/^(FEAT|BUG)-\d{3,}$/i.test(result)) throw new Error("Work Item ID 格式无效");
	return result.toUpperCase();
}

function agentInstanceId(value: unknown): string {
	const result = text(value, "Agent Instance ID", 128);
	if (!/^[a-zA-Z0-9-]+$/.test(result)) throw new Error("Agent Instance ID 格式无效");
	return result;
}

function terminalId(value: unknown): string {
	const result = text(value, "Terminal ID", 128);
	if (!/^[a-zA-Z0-9-]+$/.test(result)) throw new Error("Terminal ID 格式无效");
	return result;
}

export function parseAgentRole(value: unknown): AgentRole {
	return role(value);
}

export function parseProjectRoot(value: unknown): string {
	return projectRoot(value);
}

export function parseExternalUrl(value: unknown): string {
	const result = text(value, "外部链接", 2048);
	let url: URL;
	try {
		url = new URL(result);
	} catch {
		throw new Error("外部链接格式无效");
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("只允许打开 HTTP 或 HTTPS 链接");
	return url.toString();
}

export function parseDiagnosticsExportInput(value: unknown): DiagnosticsExportInput {
	const input = record(value, "Diagnostics Export");
	if (typeof input.includeSession !== "boolean") throw new Error("诊断包 includeSession 必须是布尔值");
	const agent = input.agent === undefined || input.agent === null ? undefined : parseAgentLocator(input.agent);
	const projectRoot =
		input.projectRoot === undefined || input.projectRoot === null
			? undefined
			: path.resolve(text(input.projectRoot, "项目路径", 2048));
	const uiError =
		input.uiError === undefined || input.uiError === null
			? undefined
			: text(input.uiError, "界面错误信息", 20_000, true);
	return {
		includeSession: input.includeSession,
		...(agent ? { agent } : {}),
		...(projectRoot ? { projectRoot } : {}),
		...(uiError ? { uiError } : {}),
	};
}

export function parseCreateWorkItemInput(value: unknown): CreateWorkItemInput {
	const input = record(value, "Create Work Item");
	return {
		projectRoot: projectRoot(input.projectRoot),
		lane: lane(input.lane),
		title: text(input.title, "标题", 200),
		description: text(input.description, "初始描述", 20_000, true),
	};
}

export function parseArchiveWorkItemInput(value: unknown): ArchiveWorkItemInput {
	const input = record(value, "Work Item");
	return {
		projectRoot: projectRoot(input.projectRoot),
		lane: lane(input.lane),
		workItemId: workItemId(input.workItemId),
	};
}

export function parseRenameWorkItemInput(value: unknown): RenameWorkItemInput {
	const input = record(value, "Rename Work Item");
	return {
		projectRoot: projectRoot(input.projectRoot),
		lane: lane(input.lane),
		workItemId: workItemId(input.workItemId),
		title: text(input.title, "标题", 200),
	};
}

export function parseAgentLocator(value: unknown): AgentInstanceLocator {
	const input = record(value, "Agent Locator");
	return {
		agentInstanceId: agentInstanceId(input.agentInstanceId),
		projectId: projectId(input.projectId),
		workItemId: workItemId(input.workItemId),
		role: role(input.role),
	};
}

export function parseCreateAgentInput(value: unknown): CreateAgentInput {
	const input = record(value, "Create Agent");
	return {
		projectRoot: projectRoot(input.projectRoot),
		projectId: projectId(input.projectId),
		workItemId: workItemId(input.workItemId),
		workItemDirectory: path.resolve(text(input.workItemDirectory, "Work Item 路径", 2048)),
		lane: lane(input.lane),
		role: role(input.role),
	};
}

export function parseResetAgentInput(value: unknown): ResetAgentInput {
	const input = record(value, "Reset Agent");
	return { ...parseCreateAgentInput(input), agentInstanceId: agentInstanceId(input.agentInstanceId) };
}

export function parseSendAgentPromptInput(value: unknown): SendAgentPromptInput {
	const input = record(value, "Send Prompt");
	const streamingBehavior = input.streamingBehavior;
	if (streamingBehavior !== undefined && streamingBehavior !== "steer" && streamingBehavior !== "followUp") {
		throw new Error("Streaming Behavior 无效");
	}
	const images = parsePromptImages(input.images);
	const message = text(input.message, "消息", 200_000, true);
	if (!message && images.length === 0) throw new Error("消息或图片至少需要提供一项");
	return {
		...parseAgentLocator(input),
		message,
		...(images.length > 0 ? { images } : {}),
		...(streamingBehavior ? { streamingBehavior } : {}),
	};
}

function parsePromptImages(value: unknown): AgentImageAttachment[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) throw new Error("图片附件必须是数组");
	if (value.length > MAX_PROMPT_IMAGES) throw new Error(`图片附件最多 ${MAX_PROMPT_IMAGES} 张`);
	return value.map((item, index) => {
		const image = record(item, `图片附件 ${index + 1}`);
		const mimeType = text(image.mimeType, "图片 MIME Type", 64);
		if (!AGENT_IMAGE_MIME_TYPES.some((allowed) => allowed === mimeType))
			throw new Error(`不支持的图片格式：${mimeType}`);
		const data = text(image.data, "图片数据", 14_000_000);
		if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw new Error("图片数据不是有效 Base64");
		if (Buffer.byteLength(data, "base64") > MAX_PROMPT_IMAGE_BYTES) {
			throw new Error(`单张图片不能超过 ${MAX_PROMPT_IMAGE_BYTES / 1024 / 1024}MB`);
		}
		return {
			id: text(image.id, "图片 ID", 128),
			name: text(image.name, "图片名称", 300),
			mimeType: mimeType as AgentImageAttachment["mimeType"],
			data,
		};
	});
}

export function parseSetAgentModelInput(value: unknown): SetAgentModelInput {
	const input = record(value, "Set Agent Model");
	return {
		...parseAgentLocator(input),
		provider: text(input.provider, "Provider", 200),
		modelId: text(input.modelId, "Model ID", 300),
	};
}

export function parseSetAgentModelScopeInput(value: unknown): SetAgentModelScopeInput {
	const input = record(value, "Set Agent Model Scope");
	if (input.enabledModelIds === null) {
		return { ...parseAgentLocator(input), enabledModelIds: null };
	}
	if (!Array.isArray(input.enabledModelIds)) throw new Error("模型范围必须是数组或 null");
	return {
		...parseAgentLocator(input),
		enabledModelIds: [
			...new Set(input.enabledModelIds.slice(0, 1000).map((modelId) => text(modelId, "模型 ID", 300))),
		],
	};
}

export function parseSetAgentThinkingInput(value: unknown): SetAgentThinkingInput {
	const input = record(value, "Set Thinking");
	return { ...parseAgentLocator(input), level: text(input.level, "Thinking Level", 32) };
}

export function parseSetProjectTrustInput(value: unknown): SetProjectTrustInput {
	const input = record(value, "Project Trust");
	if (typeof input.decision !== "boolean") throw new Error("项目信任决定必须是布尔值");
	if (input.includeParent !== undefined && typeof input.includeParent !== "boolean") {
		throw new Error("信任父目录标记必须是布尔值");
	}
	return {
		projectRoot: projectRoot(input.projectRoot),
		decision: input.decision,
		...(input.includeParent === undefined ? {} : { includeParent: input.includeParent }),
	};
}

export function parseForkAgentSessionInput(value: unknown): ForkAgentSessionInput {
	const input = record(value, "Fork Session");
	return { ...parseAgentLocator(input), entryId: text(input.entryId, "Session Entry ID", 200) };
}

export function parseExtensionUiResponseInput(value: unknown): ExtensionUiResponseInput {
	const input = record(value, "Extension UI Response");
	const result: ExtensionUiResponseInput = {
		...parseAgentLocator(input),
		requestId: text(input.requestId, "Extension UI Request ID", 200),
	};
	if (input.value !== undefined) result.value = text(input.value, "Extension UI Value", 100_000, true);
	if (input.confirmed !== undefined) {
		if (typeof input.confirmed !== "boolean") throw new Error("Extension UI confirmed 必须是布尔值");
		result.confirmed = input.confirmed;
	}
	if (input.cancelled !== undefined) {
		if (input.cancelled !== true) throw new Error("Extension UI cancelled 值无效");
		result.cancelled = true;
	}
	return result;
}

export function parseRoleSkillAssignmentsInput(value: unknown): SetRoleSkillAssignmentsInput {
	const input = record(value, "Role Skills");
	if (!Array.isArray(input.skillIds)) throw new Error("Skill IDs 必须是数组");
	return {
		role: role(input.role),
		skillIds: [...new Set(input.skillIds.map((item) => text(item, "Skill ID", 2048)))],
		...(input.projectRoot === undefined ? {} : { projectRoot: projectRoot(input.projectRoot) }),
	};
}

export function parseProjectId(value: unknown): string {
	return projectId(value);
}

export function parseTerminalStartInput(value: unknown): TerminalStartInput {
	const input = record(value, "Terminal Start");
	return {
		terminalId: terminalId(input.terminalId),
		projectRoot: projectRoot(input.projectRoot),
		...(input.cols === undefined ? {} : { cols: terminalDimension(input.cols, "终端列数") }),
		...(input.rows === undefined ? {} : { rows: terminalDimension(input.rows, "终端行数") }),
	};
}

export function parseTerminalWriteInput(value: unknown): TerminalWriteInput {
	const input = record(value, "Terminal Write");
	return {
		terminalId: terminalId(input.terminalId),
		data: terminalData(input.data),
	};
}

// 终端输入是原始字节流：Tab(\t)、回车(\r)、Esc、方向键转义序列都必须原样通过，
// 不能复用会 trim 掉控制字符的 rawText。
function terminalData(value: unknown): string {
	if (typeof value !== "string") throw new Error("终端输入必须是字符串");
	if (value.length === 0) throw new Error("终端输入不能为空");
	if (value.length > 64_000) throw new Error("终端输入超过最大长度 64000");
	if (value.includes("\0")) throw new Error("终端输入包含非法字符");
	return value;
}

export function parseTerminalResizeInput(value: unknown): TerminalResizeInput {
	const input = record(value, "Terminal Resize");
	return {
		terminalId: terminalId(input.terminalId),
		cols: terminalDimension(input.cols, "终端列数"),
		rows: terminalDimension(input.rows, "终端行数"),
	};
}

function terminalDimension(value: unknown, label: string): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 2 || value > 1000) {
		throw new Error(`${label}无效`);
	}
	return value;
}

export function parseTerminalId(value: unknown): string {
	return terminalId(value);
}

export function parseBoundedText(value: unknown, label: string, maximum: number, allowEmpty = false): string {
	return text(value, label, maximum, allowEmpty);
}

export function parseShellCommandPrefix(value: unknown): string {
	return rawText(value, "Shell 命令前缀", 16_000, true).replace(/\r\n?/gu, "\n");
}

export function parseInstallTelemetryEnabled(value: unknown): boolean {
	return booleanValue(value, "安装统计开关");
}

function workspaceRelativePath(value: unknown, label: string): string {
	const result = text(value, label, 1000).replace(/\\/g, "/");
	if (path.isAbsolute(result) || result.startsWith("/")) throw new Error(`${label}必须是项目内相对路径`);
	const normalized = path.posix.normalize(result);
	if (normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
		throw new Error(`${label}不能超出项目范围`);
	}
	return normalized.replace(/^\.\/+/, "");
}

export function parseWorkspaceWriteFileInput(value: unknown): WorkspaceWriteFileInput {
	const input = record(value, "Workspace Write");
	return {
		projectId: projectId(input.projectId),
		projectRoot: projectRoot(input.projectRoot),
		relativePath: workspaceRelativePath(input.relativePath, "文件路径"),
		content: rawText(input.content, "文件内容", 5_000_000, true),
	};
}

export function parseWorkspaceCreateEntryInput(value: unknown): WorkspaceCreateEntryInput {
	const input = record(value, "Workspace Create");
	if (input.kind !== "file" && input.kind !== "dir") throw new Error("创建类型无效");
	return {
		projectId: projectId(input.projectId),
		projectRoot: projectRoot(input.projectRoot),
		relativePath: workspaceRelativePath(input.relativePath, "路径"),
		kind: input.kind,
	};
}

export function parseWorkspaceRenameEntryInput(value: unknown): WorkspaceRenameEntryInput {
	const input = record(value, "Workspace Rename");
	return {
		projectId: projectId(input.projectId),
		projectRoot: projectRoot(input.projectRoot),
		relativePath: workspaceRelativePath(input.relativePath, "原路径"),
		nextRelativePath: workspaceRelativePath(input.nextRelativePath, "新路径"),
	};
}

export function parseWorkspaceDeleteEntryInput(value: unknown): WorkspaceDeleteEntryInput {
	const input = record(value, "Workspace Delete");
	return {
		projectId: projectId(input.projectId),
		projectRoot: projectRoot(input.projectRoot),
		relativePath: workspaceRelativePath(input.relativePath, "路径"),
	};
}

export function parseWorkspaceCopyEntryInput(value: unknown): WorkspaceCopyEntryInput {
	const input = record(value, "Workspace Copy");
	if (typeof input.overwrite !== "boolean") throw new Error("覆盖标记必须是布尔值");
	return {
		projectId: projectId(input.projectId),
		projectRoot: projectRoot(input.projectRoot),
		sourceRelativePath: workspaceRelativePath(input.sourceRelativePath, "源路径"),
		targetRelativePath: workspaceRelativePath(input.targetRelativePath, "目标路径"),
		overwrite: input.overwrite,
	};
}

export function parseWorkspaceRevealEntryInput(value: unknown): WorkspaceRevealEntryInput {
	const input = record(value, "Workspace Reveal");
	if (input.kind !== "file" && input.kind !== "dir") throw new Error("条目类型无效");
	return {
		projectRoot: projectRoot(input.projectRoot),
		relativePath: workspaceRelativePath(input.relativePath, "路径"),
		kind: input.kind,
	};
}

export function parseSwitchAgentSessionInput(value: unknown): SwitchAgentSessionInput {
	const input = record(value, "Switch Session");
	return {
		...parseAgentLocator(input),
		sessionId: text(input.sessionId, "Session ID", 200),
	};
}

function nonNegativeInteger(value: unknown, label: string): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new Error(`${label} 必须是非负整数`);
	return value;
}

function stringRecordInput(value: unknown, label: string): Record<string, string> {
	const input = record(value, label);
	return Object.fromEntries(
		Object.entries(input).map(([key, entry]) => [
			text(key, `${label}键`, 200),
			text(entry, `${label}值`, 4000, true),
		]),
	);
}

function mcpExposure(value: unknown, label: string): McpExposure {
	if (value === "codemode" || value === "deferred" || value === "direct" || value === "hidden") return value;
	throw new Error(`${label}无效`);
}

function mcpToolExposure(value: unknown, label: string): Record<string, McpExposure> {
	const input = record(value, label);
	return Object.fromEntries(
		Object.entries(input).map(([key, entry]) => [
			text(key, `${label}工具名`, 300),
			mcpExposure(entry, `${label} ${key}`),
		]),
	);
}

function optionalPositiveNumber(value: unknown, label: string, maximum: number): number | null {
	if (value === null) return null;
	if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > maximum) {
		throw new Error(`${label}必须是 1-${maximum} 的整数`);
	}
	return value;
}

function parseMcpOAuthInput(value: unknown): McpOAuthInput | null {
	if (value === null) return null;
	const input = record(value, "MCP OAuth");
	const clientRegistration = input.clientRegistration;
	if (
		clientRegistration !== undefined &&
		clientRegistration !== null &&
		clientRegistration !== "dcr" &&
		clientRegistration !== "cimd"
	) {
		throw new Error("MCP OAuth clientRegistration 无效");
	}
	return {
		...(input.clientId === undefined ? {} : { clientId: text(input.clientId, "OAuth clientId", 2000, true) }),
		...(input.clientSecret === undefined
			? {}
			: { clientSecret: text(input.clientSecret, "OAuth clientSecret", 4000, true) }),
		...(input.callbackPort === undefined
			? {}
			: { callbackPort: optionalPositiveNumber(input.callbackPort, "OAuth callbackPort", 65535) }),
		...(input.callbackUrl === undefined
			? {}
			: { callbackUrl: text(input.callbackUrl, "OAuth callbackUrl", 2000, true) }),
		...(input.scope === undefined ? {} : { scope: text(input.scope, "OAuth scope", 2000, true) }),
		...(input.clientName === undefined ? {} : { clientName: text(input.clientName, "OAuth clientName", 200, true) }),
		...(clientRegistration === undefined
			? {}
			: { clientRegistration: clientRegistration as McpClientRegistration | null }),
		...(input.authServerMetadataUrl === undefined
			? {}
			: {
					authServerMetadataUrl: text(input.authServerMetadataUrl, "OAuth authServerMetadataUrl", 2000, true),
				}),
	};
}

export function parseMcpServerInput(value: unknown): McpServerInput {
	const input = record(value, "MCP Server");
	if (input.transport !== "stdio" && input.transport !== "http") throw new Error("MCP transport 无效");
	let args: string[] | undefined;
	if (input.args !== undefined) {
		if (!Array.isArray(input.args)) throw new Error("MCP args 必须是数组");
		args = input.args.slice(0, 100).map((item) => text(item, "MCP arg", 2000, true));
	}
	if (input.enabled !== undefined && typeof input.enabled !== "boolean") throw new Error("MCP enabled 必须是布尔值");
	const toolExposure =
		input.toolExposure === undefined ? undefined : mcpToolExposure(input.toolExposure, "MCP toolExposure");
	return {
		name: text(input.name, "MCP 服务名", 100),
		transport: input.transport,
		...(input.command === undefined ? {} : { command: text(input.command, "MCP command", 2000, true) }),
		...(args === undefined ? {} : { args }),
		...(input.url === undefined ? {} : { url: text(input.url, "MCP url", 2000, true) }),
		...(input.env === undefined ? {} : { env: stringRecordInput(input.env, "MCP env ") }),
		...(input.headers === undefined ? {} : { headers: stringRecordInput(input.headers, "MCP headers ") }),
		...(input.enabled === undefined ? {} : { enabled: input.enabled }),
		...(input.exposure === undefined ? {} : { exposure: mcpExposure(input.exposure, "MCP exposure") }),
		...(toolExposure === undefined ? {} : { toolExposure }),
		...(input.description === undefined
			? {}
			: { description: text(input.description, "MCP description", 2000, true) }),
		...(input.timeout === undefined
			? {}
			: {
					timeout:
						input.timeout === null || input.timeout === 0
							? 0
							: (optionalPositiveNumber(input.timeout, "MCP timeout", 3600) ?? 0),
				}),
		...(input.oauth === undefined ? {} : { oauth: parseMcpOAuthInput(input.oauth) }),
		...(input.authProvider === undefined
			? {}
			: { authProvider: text(input.authProvider, "MCP auth provider", 300, true) }),
	};
}

export function parseMcpProjectOverrideInput(value: unknown): McpProjectOverrideInput {
	const input = record(value, "MCP Project Override");
	const toolExposure =
		input.toolExposure === undefined
			? undefined
			: input.toolExposure === null
				? null
				: mcpToolExposure(input.toolExposure, "MCP project toolExposure");
	if (input.enabled !== undefined && input.enabled !== null && typeof input.enabled !== "boolean") {
		throw new Error("MCP project enabled 必须是布尔值或 null");
	}
	return {
		projectRoot: projectRoot(input.projectRoot),
		name: text(input.name, "MCP 服务名", 100),
		...(input.enabled === undefined ? {} : { enabled: input.enabled as boolean | null }),
		...(input.exposure === undefined
			? {}
			: { exposure: input.exposure === null ? null : mcpExposure(input.exposure, "MCP project exposure") }),
		...(toolExposure === undefined ? {} : { toolExposure }),
	};
}

export function parseMcpProjectOverrideLocator(value: unknown): McpProjectOverrideLocator {
	const input = record(value, "MCP Project Override");
	return {
		projectRoot: projectRoot(input.projectRoot),
		name: text(input.name, "MCP 服务名", 100),
	};
}

export function parseMcpActionInput(value: unknown): McpActionInput {
	const input = record(value, "MCP Action");
	if (input.action !== "list" && input.action !== "login" && input.action !== "logout") {
		throw new Error("MCP 操作无效");
	}
	return {
		action: input.action,
		...(input.action === "list" ? {} : { name: text(input.name, "MCP 服务名", 100) }),
	};
}

function optionalProviderPositiveNumber(value: unknown, label: string): number | null | undefined {
	if (value === undefined) return undefined;
	if (value === null) return null;
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		throw new Error(`${label} 必须是正数`);
	}
	return value;
}

function providerThinkingLevelMapInput(value: unknown, label: string): ProviderModelInput["thinkingLevelMap"] {
	if (value === undefined || value === null) return value;
	const input = record(value, label);
	return Object.fromEntries(
		Object.entries(input).flatMap(([level, mapped]) => {
			if (mapped !== null && typeof mapped !== "string") return [];
			return [[level, mapped] as const];
		}),
	);
}

function providerPromptCacheInput(value: unknown, label: string): ProviderModelInput["promptCache"] {
	if (value === undefined || value === null) return value;
	const input = record(value, label);
	const output: NonNullable<ProviderModelInput["promptCache"]> = {};
	for (const key of ["short", "long"] as const) {
		if (input[key] === undefined) continue;
		const number = optionalProviderPositiveNumber(input[key], `${label}.${key}`);
		if (typeof number === "number") output[key] = number;
	}
	return output;
}

function providerModelOverridesInput(
	value: unknown,
	label: string,
): Record<string, ProviderModelOverride> | null | undefined {
	if (value === undefined || value === null) return value;
	const input = record(value, label);
	return Object.fromEntries(
		Object.entries(input).flatMap(([modelId, override]) => {
			const normalizedId = modelId.trim();
			if (!normalizedId) return [];
			return [[normalizedId, jsonObject(override, `${label}.${normalizedId}`)] as const];
		}),
	);
}

function providerApiKeySourceInput(value: unknown): ProviderApiKeySource | undefined {
	if (value === undefined) return undefined;
	if (value === "secret" || value === "command") return value;
	throw new Error("Provider API Key 来源无效");
}

function parseProviderModelInput(value: unknown): ProviderModelInput {
	const model = record(value, "Provider model");
	const result: ProviderModelInput = {
		id: text(model.id, "模型 ID", 200),
	};
	if (model.originalId !== undefined) result.originalId = text(model.originalId, "原模型 ID", 200);
	if (model.name !== undefined) result.name = text(model.name, "模型名称", 200, true);
	result.api = optionalText(model.api, "模型 API", 200);
	result.baseUrl = optionalText(model.baseUrl, "模型 baseUrl", 2000);
	result.contextWindow = optionalProviderPositiveNumber(model.contextWindow, "上下文窗口");
	result.maxTokens = optionalProviderPositiveNumber(model.maxTokens, "最大 Token");
	if (model.reasoning !== undefined) result.reasoning = booleanValue(model.reasoning, "推理标记");
	if (model.thinkingLevelMap !== undefined) {
		result.thinkingLevelMap = providerThinkingLevelMapInput(model.thinkingLevelMap, "模型 thinkingLevelMap");
	}
	if (model.input !== undefined) {
		if (!Array.isArray(model.input)) throw new Error("模型 input 必须是数组");
		result.input = model.input.filter((item): item is "text" | "image" => item === "text" || item === "image");
	}
	result.inputLimits = optionalJsonObject(model.inputLimits, "模型 inputLimits");
	result.cost = optionalJsonObject(model.cost, "模型 cost");
	result.promptCache = providerPromptCacheInput(model.promptCache, "模型 promptCache");
	result.samplingParams = optionalJsonObject(model.samplingParams, "模型 samplingParams");
	result.headers = optionalStringRecord(model.headers, "模型 headers");
	result.compat = optionalJsonObject(model.compat, "模型 compat");
	if (model.advanced !== undefined) result.advanced = jsonObject(model.advanced, "模型高级字段");
	if (model.extra !== undefined) result.extra = jsonObject(model.extra, "模型高级字段");
	return result;
}

export function parseProviderInput(value: unknown): ProviderInput {
	const input = record(value, "Provider");
	const result: ProviderInput = {
		id: text(input.id, "Provider ID", 100),
		name: optionalText(input.name, "Provider 名称", 200),
		baseUrl: optionalText(input.baseUrl, "baseUrl", 2000),
		api: optionalText(input.api, "Provider API", 200),
		headers: optionalStringRecord(input.headers, "Provider headers"),
		compat: optionalJsonObject(input.compat, "Provider compat"),
	};
	if (input.authHeader !== undefined) {
		result.authHeader = input.authHeader === null ? null : booleanValue(input.authHeader, "Provider authHeader");
	}
	result.modelOverrides = providerModelOverridesInput(input.modelOverrides, "Provider modelOverrides");
	if (input.apiKey !== undefined) result.apiKey = text(input.apiKey, "API Key", 1000, true);
	const apiKeySource = providerApiKeySourceInput(input.apiKeySource);
	if (apiKeySource !== undefined) result.apiKeySource = apiKeySource;
	if (apiKeySource !== undefined && result.apiKey === undefined) {
		throw new Error("设置 Provider API Key 来源时必须提供 API Key 或命令");
	}
	if (input.advanced !== undefined) result.advanced = jsonObject(input.advanced, "Provider 高级字段");
	if (input.extra !== undefined) result.extra = jsonObject(input.extra, "Provider 高级字段");
	if (input.models !== undefined) {
		if (!Array.isArray(input.models)) throw new Error("Provider models 必须是数组");
		if (input.models.length > 200) throw new Error("单个 Provider 最多配置 200 个模型");
		result.models = input.models.map(parseProviderModelInput);
	}
	return result;
}

export function parseSaveLlamaCppConfigInput(value: unknown): SaveLlamaCppConfigInput {
	const input = record(value, "llama.cpp Config");
	if (input.clearApiKey !== undefined && typeof input.clearApiKey !== "boolean") {
		throw new Error("清除 llama.cpp API Key 必须是布尔值");
	}
	return {
		serverUrl: text(input.serverUrl, "llama.cpp 地址", 2000),
		...(input.apiKey === undefined ? {} : { apiKey: text(input.apiKey, "llama.cpp API Key", 4000, true) }),
		...(input.clearApiKey === undefined ? {} : { clearApiKey: input.clearApiKey }),
	};
}

export function parseRunLlamaCppActionInput(value: unknown): RunLlamaCppActionInput {
	const input = record(value, "llama.cpp Action");
	const action: LlamaCppAction | null =
		input.action === "refresh" || input.action === "load" || input.action === "unload" || input.action === "download"
			? input.action
			: null;
	if (!action) throw new Error("llama.cpp 操作无效");
	return {
		action,
		...(input.modelId === undefined ? {} : { modelId: text(input.modelId, "llama.cpp 模型 ID", 2000) }),
	};
}

export function parseInvokeAgentBuiltinCommandInput(value: unknown): InvokeAgentBuiltinCommandInput {
	const input = record(value, "Agent Command");
	return {
		...parseAgentLocator(input),
		name: text(input.name, "命令名称", 200),
		args: text(input.args, "命令参数", 20_000, true),
	};
}

export function parseProjectUiState(value: unknown): ProjectUiState {
	const input = record(value, "Project UI State");
	const selectionType = input.selectionType;
	if (
		selectionType !== "project" &&
		selectionType !== "lane" &&
		selectionType !== "work-item" &&
		selectionType !== "agent" &&
		selectionType !== "settings"
	) {
		throw new Error("Selection Type 无效");
	}
	if (!Array.isArray(input.expandedKeys)) throw new Error("Expanded Keys 必须是数组");
	return {
		projectRoot: projectRoot(input.projectRoot),
		selectionType,
		...(input.lane === undefined ? {} : { lane: lane(input.lane) }),
		...(input.workItemId === undefined ? {} : { workItemId: workItemId(input.workItemId) }),
		...(input.role === undefined ? {} : { role: role(input.role) }),
		expandedKeys: [...new Set(input.expandedKeys.map((item) => text(item, "Expanded Key", 256)))].slice(0, 1000),
	};
}

export function parseAgentUiState(value: unknown): AgentUiState {
	const input = record(value, "Agent UI State");
	if (typeof input.scrollTop !== "number" || !Number.isFinite(input.scrollTop) || input.scrollTop < 0) {
		throw new Error("Scroll Top 无效");
	}
	if (typeof input.unreadCount !== "number" || !Number.isInteger(input.unreadCount) || input.unreadCount < 0) {
		throw new Error("Unread Count 无效");
	}
	return {
		agentInstanceId: agentInstanceId(input.agentInstanceId),
		draft: text(input.draft, "草稿", 200_000, true),
		scrollTop: input.scrollTop,
		unreadCount: input.unreadCount,
	};
}

export function assertPathInside(parentPath: string, candidatePath: string, label: string): void {
	const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
	if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)))
		return;
	throw new Error(`${label} 超出允许目录`);
}

export function parseCacheWarmingSettings(value: unknown): CacheWarmingSettings {
	const input = record(value, "缓存预热设置");
	if (input.mode !== "off" && input.mode !== "streaming" && input.mode !== "idle") {
		throw new Error("缓存预热模式无效");
	}
	if (typeof input.showCacheMissNotices !== "boolean") throw new Error("缓存未命中提示设置无效");
	return { mode: input.mode, showCacheMissNotices: input.showCacheMissNotices };
}

export function parseContextCompactionSettings(value: unknown): ContextCompactionSettings {
	const input = record(value, "上下文压缩设置");
	const compactionInput = record(input.compaction, "压缩设置");
	const branchSummaryInput = record(input.branchSummary, "分支摘要设置");
	const modelOverridesInput = record(compactionInput.modelOverrides ?? {}, "模型覆盖设置");
	const modelOverrideEntries = Object.entries(modelOverridesInput);
	if (modelOverrideEntries.length > 200) throw new Error("模型覆盖最多支持 200 项");

	const modelOverrides = Object.fromEntries(
		modelOverrideEntries.map(([key, raw]) => {
			if (!/^[^/]+\/[^/]+$/.test(key) || key.length > 300) {
				throw new Error(`模型覆盖 key 无效：${key}`);
			}
			const overrideInput = record(raw, `模型覆盖 ${key}`);
			const override: CompactionModelOverride = {};
			if (overrideInput.reserveTokens !== undefined) {
				override.reserveTokens = nonNegativeSafeInteger(overrideInput.reserveTokens, `${key} 的压缩预留 Token`);
			}
			if (overrideInput.keepRecentTokens !== undefined) {
				override.keepRecentTokens = nonNegativeSafeInteger(
					overrideInput.keepRecentTokens,
					`${key} 的压缩保留最近 Token`,
				);
			}
			return [key, override] as const;
		}),
	);

	return {
		compaction: {
			enabled: booleanValue(compactionInput.enabled, "自动压缩开关"),
			reserveTokens: nonNegativeSafeInteger(compactionInput.reserveTokens, "压缩预留 Token"),
			keepRecentTokens: nonNegativeSafeInteger(compactionInput.keepRecentTokens, "压缩保留最近 Token"),
			modelOverrides,
		},
		branchSummary: {
			reserveTokens: nonNegativeSafeInteger(branchSummaryInput.reserveTokens, "分支摘要预留 Token"),
			skipPrompt: booleanValue(branchSummaryInput.skipPrompt, "分支摘要确认开关"),
		},
	};
}

export function parseCodemodeSettings(value: unknown): CodemodeSettings {
	const input = record(value, "Codemode 设置");
	if (input.mode !== "on" && input.mode !== "only") throw new Error("Codemode 模式无效");
	const inlineBudget =
		input.inlineBudget === null ? null : nonNegativeInteger(input.inlineBudget, "Codemode 工具目录预算");
	return {
		mode: input.mode,
		inlineBudget,
	};
}

export function parseToolSettings(value: unknown): ToolSettings {
	const input = record(value, "工具设置");
	let advancedDefaultTools: string[] | null = null;
	if (input.advancedDefaultTools !== null && input.advancedDefaultTools !== undefined) {
		if (!Array.isArray(input.advancedDefaultTools)) throw new Error("Pi 高级工具列表必须是数组或 null");
		if (input.advancedDefaultTools.length > 200) throw new Error("Pi 高级工具列表最多包含 200 项");
		advancedDefaultTools = input.advancedDefaultTools.map((entry) => text(entry, "Pi 高级工具项", 200));
	}
	if (input.defaultTools === null) return { defaultTools: null, advancedDefaultTools };
	if (!Array.isArray(input.defaultTools)) throw new Error("内置工具列表必须是数组或 null");
	if (input.defaultTools.length > 8) throw new Error("内置工具列表最多包含 8 项");
	const defaultTools = [...new Set(input.defaultTools)];
	if (!defaultTools.every(isPiBuiltinToolName)) throw new Error("内置工具列表包含无效工具名");
	return { defaultTools: defaultTools as PiBuiltinToolName[], advancedDefaultTools };
}

function piPackageScope(value: unknown): PiPackageScope {
	if (value === "user" || value === "project") return value;
	throw new Error("Pi Package 作用域无效");
}

export function parsePiPackageActionInput(value: unknown): PiPackageActionInput {
	const input = record(value, "Pi Package Action");
	if (input.action !== "install" && input.action !== "remove" && input.action !== "update") {
		throw new Error("Pi Package 操作无效");
	}
	const scope = piPackageScope(input.scope);
	const projectRoot =
		input.projectRoot === undefined || input.projectRoot === null
			? undefined
			: path.resolve(text(input.projectRoot, "项目路径", 2048));
	if (scope === "project" && !projectRoot) throw new Error("项目级 Pi Package 需要项目路径");
	const source = text(input.source, "Pi Package 来源", 2048);
	if (/[\r\n\u0000]/u.test(source)) throw new Error("Pi Package 来源包含非法字符");
	return {
		action: input.action,
		source,
		scope,
		...(projectRoot ? { projectRoot } : {}),
	};
}

export function parsePiPackageExtensionInput(value: unknown): PiPackageExtensionInput {
	const input = record(value, "Pi Package Extension");
	if (input.action !== "set-extension") throw new Error("Pi Package extension 操作无效");
	const scope = piPackageScope(input.scope);
	const projectRoot =
		input.projectRoot === undefined || input.projectRoot === null
			? undefined
			: path.resolve(text(input.projectRoot, "项目路径", 2048));
	if (scope === "project" && !projectRoot) throw new Error("项目级 Pi Package 需要项目路径");
	if (typeof input.enabled !== "boolean") throw new Error("Pi Package extension 开关必须是布尔值");
	const source = text(input.source, "Pi Package 来源", 2048);
	if (/[\r\n\u0000]/u.test(source)) throw new Error("Pi Package 来源包含非法字符");
	return {
		action: "set-extension",
		source,
		scope,
		enabled: input.enabled,
		...(projectRoot ? { projectRoot } : {}),
	};
}

function promptTemplateScope(value: unknown): PromptTemplateScope {
	if (value === "user" || value === "project") return value;
	throw new Error("模板范围无效");
}

function promptTemplateName(value: unknown): string {
	const name = text(value, "模板名称", 80);
	if (name === "." || name === "..") throw new Error("模板名称无效");
	if (/[<>:"/\\|?*\u0000-\u001f]/u.test(name)) throw new Error("模板名称包含非法字符");
	if (/[. ]$/u.test(name)) throw new Error("模板名称不能以点或空格结尾");
	return name;
}

export function parsePromptTemplateInput(value: unknown): PromptTemplateInput {
	const input = record(value, "Prompt Template");
	const scope = promptTemplateScope(input.scope);
	const projectRoot =
		input.projectRoot === undefined || input.projectRoot === null
			? undefined
			: path.resolve(text(input.projectRoot, "项目路径", 2048));
	if (scope === "project" && !projectRoot) throw new Error("项目模板需要项目路径");
	return {
		scope,
		...(projectRoot ? { projectRoot } : {}),
		...(input.originalName === undefined ? {} : { originalName: promptTemplateName(input.originalName) }),
		name: promptTemplateName(input.name),
		description: rawText(input.description, "模板说明", 500, true),
		argumentHint: rawText(input.argumentHint, "参数提示", 200, true),
		content: rawText(input.content, "模板内容", 200_000),
	};
}

export function parsePromptTemplateLocator(value: unknown): PromptTemplateLocator {
	const input = record(value, "Prompt Template");
	const scope = promptTemplateScope(input.scope);
	const projectRoot =
		input.projectRoot === undefined || input.projectRoot === null
			? undefined
			: path.resolve(text(input.projectRoot, "项目路径", 2048));
	if (scope === "project" && !projectRoot) throw new Error("项目模板需要项目路径");
	return {
		scope,
		...(projectRoot ? { projectRoot } : {}),
		name: promptTemplateName(input.name),
	};
}

export function parsePromptTemplateFolderInput(value: unknown): Pick<PromptTemplateLocator, "scope" | "projectRoot"> {
	const input = record(value, "Prompt Template Folder");
	const scope = promptTemplateScope(input.scope);
	const projectRoot =
		input.projectRoot === undefined || input.projectRoot === null
			? undefined
			: path.resolve(text(input.projectRoot, "项目路径", 2048));
	if (scope === "project" && !projectRoot) throw new Error("项目模板需要项目路径");
	return {
		scope,
		...(projectRoot ? { projectRoot } : {}),
	};
}
