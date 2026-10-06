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
	LaneKind,
	LlamaCppAction,
	McpActionInput,
	McpClientRegistration,
	McpExposure,
	McpOAuthInput,
	McpProjectOverrideInput,
	McpProjectOverrideLocator,
	McpServerInput,
	PermissionDefaults,
	PermissionState,
	ProjectUiState,
	ProviderInput,
	ProviderModelSummary,
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
} from "@codepiddy/shared";

const AGENT_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
const MAX_PROMPT_IMAGES = 8;
const MAX_PROMPT_IMAGE_BYTES = 10 * 1024 * 1024;

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
	const input = record(value, "Permission Response");
	const result: ExtensionUiResponseInput = {
		...parseAgentLocator(input),
		requestId: text(input.requestId, "Permission Request ID", 200),
	};
	if (input.value !== undefined) result.value = text(input.value, "Permission Value", 100_000, true);
	if (input.confirmed !== undefined) {
		if (typeof input.confirmed !== "boolean") throw new Error("Permission confirmed 必须是布尔值");
		result.confirmed = input.confirmed;
	}
	if (input.cancelled !== undefined) {
		if (input.cancelled !== true) throw new Error("Permission cancelled 值无效");
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

export function parseProviderInput(value: unknown): ProviderInput {
	const input = record(value, "Provider");
	if (
		input.api !== "openai-completions" &&
		input.api !== "openai-responses" &&
		input.api !== "anthropic-messages" &&
		input.api !== "google-generative-ai"
	) {
		throw new Error("Provider API 类型无效");
	}
	if (!Array.isArray(input.models)) throw new Error("Provider models 必须是数组");
	const models = input.models.slice(0, 50).map((item): ProviderModelSummary => {
		const model = record(item, "Provider model");
		return {
			id: text(model.id, "模型 ID", 200),
			name: text(model.name, "模型名称", 200, true),
			contextWindow: nonNegativeInteger(model.contextWindow, "上下文窗口"),
			maxTokens: nonNegativeInteger(model.maxTokens, "最大 Token"),
			reasoning: model.reasoning === true,
			input: Array.isArray(model.input)
				? model.input.filter((entry): entry is "text" | "image" => entry === "text" || entry === "image")
				: ["text"],
		};
	});
	return {
		id: text(input.id, "Provider ID", 100),
		baseUrl: text(input.baseUrl, "baseUrl", 2000),
		api: input.api,
		...(input.apiKey === undefined ? {} : { apiKey: text(input.apiKey, "API Key", 1000, true) }),
		models,
	};
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

function permissionState(value: unknown, label: string): PermissionState {
	if (value === "allow" || value === "ask" || value === "deny") return value;
	throw new Error(`${label}权限状态无效`);
}

export function parsePermissionDefaults(value: unknown): PermissionDefaults {
	const input = record(value, "Permission Defaults");
	return {
		read: permissionState(input.read, "读取"),
		write: permissionState(input.write, "修改"),
		bash: permissionState(input.bash, "命令执行"),
		mcp: permissionState(input.mcp, "MCP"),
		skills: permissionState(input.skills, "Skill"),
		otherTools: permissionState(input.otherTools, "其他工具"),
		externalDirectory: permissionState(input.externalDirectory, "项目外路径"),
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
