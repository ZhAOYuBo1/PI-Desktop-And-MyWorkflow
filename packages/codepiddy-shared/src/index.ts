export const LANE_KINDS = ["requirements", "bugs"] as const;
export type LaneKind = (typeof LANE_KINDS)[number];

export const WORK_ITEM_STATUSES = ["active", "archived"] as const;
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

export const AGENT_ROLES = ["requirement-analysis", "coding", "bug-fix", "review"] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export const AGENT_STATUSES = ["not-created", "idle", "running", "waiting", "completed", "failed"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export interface AgentSlotSummary {
	role: AgentRole;
	displayName: string;
	status: AgentStatus;
	currentInstanceId?: string;
	kickoffPrompt?: string;
}

export interface WorkItemSummary {
	id: string;
	lane: LaneKind;
	title: string;
	description: string;
	status: WorkItemStatus;
	createdAt: string;
	archivedAt?: string;
	directoryPath: string;
	agentSlots: AgentSlotSummary[];
}

export interface LaneSummary {
	kind: LaneKind;
	displayName: string;
	workItems: WorkItemSummary[];
}

export interface ProjectSummary {
	id: string;
	name: string;
	rootPath: string;
	codepiddyPath: string;
	lanes: LaneSummary[];
}

export interface CreateWorkItemInput {
	projectRoot: string;
	lane: LaneKind;
	title: string;
	description: string;
}

export interface ArchiveWorkItemInput {
	projectRoot: string;
	lane: LaneKind;
	workItemId: string;
}

export interface RenameWorkItemInput extends ArchiveWorkItemInput {
	title: string;
}

export type PersistedSelectionType = "project" | "lane" | "work-item" | "agent" | "settings";

export interface ProjectUiState {
	projectRoot: string;
	selectionType: PersistedSelectionType;
	lane?: LaneKind;
	workItemId?: string;
	role?: AgentRole;
	expandedKeys: string[];
}

export interface AgentUiState {
	agentInstanceId: string;
	draft: string;
	scrollTop: number;
	unreadCount: number;
}

export interface ProjectClientApi {
	openProject(): Promise<ProjectSummary | null>;
	getStartupProject(): Promise<ProjectSummary | null>;
	closeProject(projectRoot: string): Promise<RecentProject[]>;
	refreshProject(projectRoot: string): Promise<ProjectSummary>;
	createWorkItem(input: CreateWorkItemInput): Promise<ProjectSummary>;
	archiveWorkItem(input: ArchiveWorkItemInput): Promise<ProjectSummary>;
	restoreWorkItem(input: ArchiveWorkItemInput): Promise<ProjectSummary>;
	renameWorkItem(input: RenameWorkItemInput): Promise<ProjectSummary>;
	deleteWorkItem(input: ArchiveWorkItemInput): Promise<ProjectSummary>;
	openWorkItemFolder(input: ArchiveWorkItemInput): Promise<void>;
	getProjectUiState(projectRoot: string): Promise<ProjectUiState | null>;
	saveProjectUiState(state: ProjectUiState): Promise<void>;
	getAgentUiState(agentInstanceId: string): Promise<AgentUiState | null>;
	saveAgentUiState(state: AgentUiState): Promise<void>;
}

export interface AgentInstanceSummary {
	id: string;
	projectId: string;
	workItemId: string;
	lane: LaneKind;
	role: AgentRole;
	status: Exclude<AgentStatus, "not-created">;
	sessionDirectory: string;
	createdAt: string;
}

export interface CreateAgentInput {
	projectRoot: string;
	projectId: string;
	workItemId: string;
	workItemDirectory: string;
	lane: LaneKind;
	role: AgentRole;
}

export interface AgentInstanceLocator {
	agentInstanceId: string;
	projectId: string;
	workItemId: string;
	role: AgentRole;
}

export interface InvokeAgentBuiltinCommandInput extends AgentInstanceLocator {
	name: string;
	args: string;
}

export interface AgentBuiltinCommandResult {
	message?: string;
	copiedText?: string;
	sessionReset?: boolean;
	commandsChanged?: boolean;
}

export const AGENT_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export type AgentImageMimeType = (typeof AGENT_IMAGE_MIME_TYPES)[number];

export interface AgentImageAttachment {
	id: string;
	name: string;
	mimeType: AgentImageMimeType;
	data: string;
}

export interface SendAgentPromptInput extends AgentInstanceLocator {
	message: string;
	images?: AgentImageAttachment[];
	streamingBehavior?: "steer" | "followUp";
}

export interface ResetAgentInput extends CreateAgentInput {
	agentInstanceId: string;
}

export interface AgentSessionNode {
	entryId: string;
	parentId: string | null;
	type: string;
	role?: string;
	label?: string;
	text: string;
	timestamp?: string;
	depth: number;
	isLeaf: boolean;
	forkable: boolean;
}

export interface AgentContextUsage {
	tokens: number | null;
	contextWindow: number;
	percent: number | null;
}

export interface AgentSessionSnapshot {
	sessionId: string;
	sessionName?: string;
	sessionFile?: string;
	messageCount: number;
	pendingMessageCount: number;
	isStreaming: boolean;
	isCompacting: boolean;
	contextUsage?: AgentContextUsage;
	leafId: string | null;
	nodes: AgentSessionNode[];
}

export interface AgentSessionSummary {
	sessionId: string;
	name: string | null;
	preview: string;
	messageCount: number;
	createdAt: string | null;
	updatedAt: string | null;
	isCurrent: boolean;
}

export interface SwitchAgentSessionInput extends AgentInstanceLocator {
	sessionId: string;
}

export interface AgentSessionSwitchResult {
	snapshot: AgentSessionSnapshot;
	sessions: AgentSessionSummary[];
}

export interface ForkAgentSessionInput extends AgentInstanceLocator {
	entryId: string;
}

export interface ForkAgentSessionResult {
	selectedText: string;
	cancelled: boolean;
	snapshot: AgentSessionSnapshot;
}

export type AuthMethodType = "api_key" | "oauth";

export interface AuthMethodSummary {
	type: AuthMethodType;
	name: string;
	isSubscription?: boolean;
}

export interface AuthProviderSummary {
	id: string;
	name: string;
	configured: boolean;
	statusLabel?: string;
	methods: AuthMethodSummary[];
}

export interface AuthPromptOption {
	id: string;
	label: string;
	description?: string;
}

export interface AuthPromptRequest {
	promptId: string;
	type: "text" | "secret" | "select" | "manual_code";
	message: string;
	placeholder?: string;
	options?: AuthPromptOption[];
}

export type AuthClientEvent =
	| { type: "prompt"; requestId: string; prompt: AuthPromptRequest }
	| { type: "info"; requestId: string; message: string; links?: Array<{ url: string; label?: string }> }
	| { type: "auth_url"; requestId: string; url: string; instructions?: string }
	| {
			type: "device_code";
			requestId: string;
			userCode: string;
			verificationUri: string;
			intervalSeconds?: number;
			expiresInSeconds?: number;
	  }
	| { type: "progress"; requestId: string; message: string }
	| { type: "complete"; requestId: string }
	| { type: "error"; requestId: string; error: string };

export interface AgentClientEvent {
	agentInstanceId: string;
	projectId: string;
	workItemId: string;
	role: AgentRole;
	event: Record<string, unknown>;
}

export interface CodePIddyClientApi extends ProjectClientApi {
	platform: string;
	createAgent(input: CreateAgentInput): Promise<ProjectSummary>;
	activateAgent(input: AgentInstanceLocator): Promise<void>;
	sendAgentPrompt(input: SendAgentPromptInput): Promise<void>;
	abortAgent(input: AgentInstanceLocator): Promise<void>;
	reconnectAgent(input: AgentInstanceLocator): Promise<void>;
	compactAgent(input: AgentInstanceLocator): Promise<void>;
	invokeAgentBuiltinCommand(input: InvokeAgentBuiltinCommandInput): Promise<AgentBuiltinCommandResult>;
	cloneAgentSession(input: AgentInstanceLocator): Promise<void>;
	getAgentSessionSnapshot(input: AgentInstanceLocator): Promise<AgentSessionSnapshot>;
	listAgentSessions(input: AgentInstanceLocator): Promise<AgentSessionSummary[]>;
	newAgentSession(input: AgentInstanceLocator): Promise<AgentSessionSwitchResult>;
	switchAgentSession(input: SwitchAgentSessionInput): Promise<AgentSessionSwitchResult>;
	deleteAgentSession(input: SwitchAgentSessionInput): Promise<AgentSessionSummary[]>;
	forkAgentSession(input: ForkAgentSessionInput): Promise<ForkAgentSessionResult>;
	listAuthProviders(): Promise<AuthProviderSummary[]>;
	startAuthLogin(input: { providerId: string; authType: AuthMethodType }): Promise<string>;
	respondAuthPrompt(input: {
		requestId: string;
		promptId: string;
		value?: string;
		cancelled?: boolean;
	}): Promise<void>;
	cancelAuthLogin(requestId: string): Promise<void>;
	logoutAuthProvider(providerId: string): Promise<void>;
	onAuthEvent(listener: (event: AuthClientEvent) => void): () => void;
	resetAgent(input: ResetAgentInput): Promise<ProjectSummary>;
	respondToExtensionUi(input: ExtensionUiResponseInput): Promise<void>;
	getPendingPermissionRequest(input: AgentInstanceLocator): Promise<PendingPermissionRequest | null>;
	getSettingsStatus(): Promise<SettingsStatus>;
	getPiRuntimeStatus(): Promise<PiRuntimeStatus>;
	checkPiRuntimeUpdate(): Promise<PiRuntimeStatus>;
	installPiRuntimeUpdate(version: string): Promise<PiRuntimeStatus>;
	rollbackPiRuntime(): Promise<PiRuntimeStatus>;
	restartCodePIddy(): Promise<void>;
	getPermissionDefaults(): Promise<PermissionDefaults>;
	setPermissionDefaults(input: PermissionDefaults): Promise<PermissionDefaults>;
	saveTavilyApiKey(apiKey: string): Promise<SettingsStatus>;
	clearTavilyApiKey(): Promise<SettingsStatus>;
	saveShellPath(shellPath: string): Promise<SettingsStatus>;
	listMcpServers(projectRoot?: string): Promise<McpServerSummary[]>;
	saveMcpServer(input: McpServerInput): Promise<McpServerSummary[]>;
	deleteMcpServer(name: string): Promise<McpServerSummary[]>;
	saveMcpProjectOverride(input: McpProjectOverrideInput): Promise<McpServerSummary[]>;
	deleteMcpProjectOverride(input: McpProjectOverrideLocator): Promise<McpServerSummary[]>;
	runMcpAction(input: McpActionInput): Promise<McpActionResult>;
	listProviders(): Promise<ProviderSummary[]>;
	saveProvider(input: ProviderInput): Promise<ProviderSummary[]>;
	deleteProvider(id: string): Promise<ProviderSummary[]>;
	listAgentSkills(projectRoot?: string): Promise<AgentSkillSummary[]>;
	getRoleSkillAssignments(): Promise<RoleSkillAssignments>;
	setRoleSkillAssignments(input: SetRoleSkillAssignmentsInput): Promise<RoleSkillAssignments>;
	openPiConfigFolder(): Promise<void>;
	openPermissionPolicyFolder(): Promise<void>;
	openProjectSkillsFolder(projectRoot: string): Promise<void>;
	openBuiltinSkillsFolder(): Promise<void>;
	getAgentModelSelection(input: AgentInstanceLocator): Promise<AgentModelSelection>;
	getAgentCommands(input: AgentInstanceLocator): Promise<AgentCommandOption[]>;
	setAgentModel(input: SetAgentModelInput): Promise<AgentModelSelection>;
	setAgentThinking(input: SetAgentThinkingInput): Promise<AgentModelSelection>;
	listRecentProjects(): Promise<RecentProject[]>;
	openRecentProject(projectRoot: string): Promise<ProjectSummary>;
	forgetRecentProject(projectRoot: string): Promise<RecentProject[]>;
	searchProjectFiles(projectRoot: string, query: string): Promise<string[]>;
	listWorkspaceDir(projectRoot: string, relativeDir: string): Promise<WorkspaceDirEntry[]>;
	readWorkspaceFile(projectRoot: string, relativePath: string): Promise<WorkspaceFileContent>;
	startTerminal(input: TerminalStartInput): Promise<TerminalSessionInfo>;
	writeTerminal(input: TerminalWriteInput): Promise<void>;
	resizeTerminal(input: TerminalResizeInput): Promise<void>;
	killTerminal(terminalId: string): Promise<void>;
	getProjectWriteLeaseStatus(projectId: string): Promise<ProjectWriteLeaseStatus>;
	clearStaleProjectWriteLease(projectId: string): Promise<ProjectWriteLeaseStatus>;
	onAgentEvent(listener: (event: AgentClientEvent) => void): () => void;
	onTerminalEvent(listener: (event: TerminalClientEvent) => void): () => void;
}

export interface PendingPermissionRequest extends AgentInstanceLocator {
	requestId: string;
	method: "select" | "confirm" | "input" | "editor";
	title: string;
	message: string;
	options: string[];
	placeholder: string;
	prefill: string;
	createdAt: string;
}

// 工作区文件系统直读（desktop-work-panel 文件管理器的数据源）。
export interface WorkspaceDirEntry {
	name: string;
	kind: "dir" | "file";
	/** 文件字节数，目录恒为 0。 */
	size: number;
}

export type WorkspaceFileKind = "text" | "image" | "binary" | "tooLarge";

export interface WorkspaceFileContent {
	kind: WorkspaceFileKind;
	size: number;
	/** kind 为 text 时的 UTF-8 内容。 */
	content?: string;
	/** kind 为 image 时的 dataUrl。 */
	dataUrl?: string;
}

export interface TerminalStartInput {
	terminalId: string;
	projectRoot: string;
	/** 初始列数；缺省时由主进程取 80。 */
	cols?: number;
	/** 初始行数；缺省时由主进程取 24。 */
	rows?: number;
}

export interface TerminalWriteInput {
	terminalId: string;
	data: string;
}

export interface TerminalResizeInput {
	terminalId: string;
	cols: number;
	rows: number;
}

export interface TerminalSessionInfo {
	terminalId: string;
	shell: string;
	cwd: string;
	/** 来源的 Windows Terminal profile 名；没有 WT 配置时为 null。 */
	profileName?: string | null;
	fontFamily?: string | null;
	fontSize?: number | null;
	cursorStyle?: "bar" | "block" | "underline" | null;
}

export interface TerminalClientEvent {
	terminalId: string;
	type: "data" | "error" | "exit";
	data?: string;
	exitCode?: number | null;
}

export interface ExtensionUiResponseInput extends AgentInstanceLocator {
	requestId: string;
	value?: string;
	confirmed?: boolean;
	cancelled?: true;
}

export interface SettingsStatus {
	tavilyApiKeyConfigured: boolean;
	encryptionAvailable: boolean;
	/** 用户配置的 bash 路径；为 null 表示交给 pi 自动探测。 */
	shellPath: string | null;
}

export type McpTransport = "stdio" | "http";
export const MCP_EXPOSURES = ["codemode", "deferred", "direct", "hidden"] as const;
export type McpExposure = (typeof MCP_EXPOSURES)[number];
export const MCP_CLIENT_REGISTRATIONS = ["dcr", "cimd"] as const;
export type McpClientRegistration = (typeof MCP_CLIENT_REGISTRATIONS)[number];

export interface McpOAuthSummary {
	clientId: string | null;
	clientSecretConfigured: boolean;
	callbackPort: number | null;
	callbackUrl: string | null;
	scope: string | null;
	clientName: string | null;
	clientRegistration: McpClientRegistration | null;
	authServerMetadataUrl: string | null;
}

export interface McpOAuthInput {
	clientId?: string;
	/** 省略表示保持已有 secret；空字符串表示清除。 */
	clientSecret?: string;
	callbackPort?: number | null;
	callbackUrl?: string;
	scope?: string;
	clientName?: string;
	clientRegistration?: McpClientRegistration | null;
	authServerMetadataUrl?: string;
}

export interface McpProjectOverride {
	enabled?: boolean | null;
	exposure?: McpExposure | null;
	toolExposure?: Record<string, McpExposure> | null;
}

export interface McpProjectOverrideInput extends McpProjectOverride {
	projectRoot: string;
	name: string;
}

export interface McpProjectOverrideLocator {
	projectRoot: string;
	name: string;
}

export interface McpServerSummary {
	name: string;
	transport: McpTransport;
	command: string | null;
	args: string[];
	url: string | null;
	env: Record<string, string>;
	headers: Record<string, string>;
	enabled: boolean;
	exposure: McpExposure;
	toolExposure: Record<string, McpExposure>;
	description: string | null;
	timeout: number | null;
	oauth: McpOAuthSummary | null;
	authProvider: string | null;
	projectOverride: McpProjectOverride | null;
	source: "global" | "builtin";
}

export interface McpServerInput {
	name: string;
	transport: McpTransport;
	command?: string;
	args?: string[];
	url?: string;
	env?: Record<string, string>;
	headers?: Record<string, string>;
	enabled?: boolean;
	exposure?: McpExposure;
	toolExposure?: Record<string, McpExposure>;
	description?: string;
	timeout?: number;
	oauth?: McpOAuthInput | null;
	authProvider?: string;
}

export interface McpActionInput {
	action: "login" | "logout";
	name: string;
}

export interface McpActionResult {
	output: string;
}

export const PROVIDER_APIS = [
	"openai-completions",
	"openai-responses",
	"anthropic-messages",
	"google-generative-ai",
] as const;
export type ProviderApi = (typeof PROVIDER_APIS)[number];

export interface ProviderModelSummary {
	id: string;
	name: string;
	contextWindow: number;
	maxTokens: number;
	reasoning: boolean;
	input: ("text" | "image")[];
}

export interface ProviderSummary {
	id: string;
	baseUrl: string;
	api: ProviderApi;
	apiKeyConfigured: boolean;
	models: ProviderModelSummary[];
}

export interface ProviderInput {
	id: string;
	baseUrl: string;
	api: ProviderApi;
	/** 省略表示保持已有 Key；空字符串表示清除。 */
	apiKey?: string;
	models: ProviderModelSummary[];
}

export interface PiRuntimeStatus {
	bundledVersion: string;
	currentVersion: string;
	rollbackVersion: string | null;
	runningVersion: string;
	latestVersion: string | null;
	updateAvailable: boolean;
	restartRequired: boolean;
	npmAvailable: boolean;
	warning: string | null;
}

export const PERMISSION_STATES = ["allow", "ask", "deny"] as const;
export type PermissionState = (typeof PERMISSION_STATES)[number];

export interface PermissionDefaults {
	read: PermissionState;
	write: PermissionState;
	bash: PermissionState;
	mcp: PermissionState;
	skills: PermissionState;
	otherTools: PermissionState;
	externalDirectory: PermissionState;
}

/**
 * 权限请求弹窗的选项表 —— 扩展与桌面端的单一真相源。
 *
 * 之前两端各自硬编码英文文案：扩展发 "Allow Once" / "Allow Always"，
 * 桌面端靠 `option.startsWith("Allow")` 猜哪个是主按钮。扩展改一次文案，
 * 桌面端的按钮样式就跟着错位；而且整个中文界面里只剩这个弹窗是英文。
 * 改成两端都查这张表之后，文案不会再各自漂移。
 */
export type PermissionDecisionId = "once" | "always" | "reject" | "reject_with_reason";

export interface PermissionDecisionChoice {
	readonly id: PermissionDecisionId;
	/** 直接显示给用户的文案。 */
	readonly label: string;
	readonly tone: "approve" | "deny";
	/** 主按钮：回车默认落在它上面。 */
	readonly primary: boolean;
	/** 选中后是否要写进策略文件，从而跨会话生效。 */
	readonly persistent: boolean;
}

export const PERMISSION_DECISION_CHOICES: readonly PermissionDecisionChoice[] = [
	{ id: "once", label: "仅本次允许", tone: "approve", primary: true, persistent: false },
	{ id: "always", label: "该 Agent 始终允许", tone: "approve", primary: false, persistent: true },
	{ id: "reject", label: "拒绝", tone: "deny", primary: false, persistent: false },
	{ id: "reject_with_reason", label: "拒绝并说明原因", tone: "deny", primary: false, persistent: false },
];

export function findPermissionDecisionChoice(label: string): PermissionDecisionChoice | undefined {
	return PERMISSION_DECISION_CHOICES.find((choice) => choice.label === label);
}

export type AgentSkillSource = "builtin" | "codex" | "agents" | "pi" | "project";

export interface AgentSkillSummary {
	id: string;
	name: string;
	description: string;
	filePath: string;
	source: AgentSkillSource;
}

export type RoleSkillAssignments = Record<AgentRole, string[]>;

export interface SetRoleSkillAssignmentsInput {
	role: AgentRole;
	skillIds: string[];
	projectRoot?: string;
}

export const CUSTOM_PROVIDER_APIS = [
	"openai-completions",
	"openai-responses",
	"anthropic-messages",
	"google-generative-ai",
] as const;
export type CustomProviderApi = (typeof CUSTOM_PROVIDER_APIS)[number];

export interface CustomProviderInput {
	id: string;
	name: string;
	baseUrl: string;
	api: CustomProviderApi;
	apiKey?: string;
	modelId: string;
	modelName: string;
	reasoning: boolean;
	contextWindow: number;
	maxTokens: number;
}

export interface RecentProject {
	id: string;
	name: string;
	rootPath: string;
	lastOpenedAt: string;
	available: boolean;
}

export interface ProjectWriteLeaseDetails {
	projectId: string;
	holderAgentInstanceId: string;
	workItemId: string;
	role: AgentRole;
	acquiredAt: string;
	heartbeatAt: string;
	ownerProcessId?: number;
}

export interface ProjectWriteLeaseStatus {
	lease: ProjectWriteLeaseDetails | null;
	stale: boolean;
}

export interface AgentCommandOption {
	name: string;
	command: string;
	description: string;
	argumentHint?: string;
	source: "builtin" | "extension" | "prompt" | "skill";
}

export interface AgentModelOption {
	provider: string;
	id: string;
	name: string;
	reasoning: boolean;
}

export interface AgentModelSelection {
	model: AgentModelOption;
	thinkingLevel: string;
	availableThinkingLevels: string[];
	availableModels: AgentModelOption[];
}

export interface SetAgentModelInput extends AgentInstanceLocator {
	provider: string;
	modelId: string;
}

export interface SetAgentThinkingInput extends AgentInstanceLocator {
	level: string;
}
