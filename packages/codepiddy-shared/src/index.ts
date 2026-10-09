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

export interface AgentSessionStats {
	sessionFile?: string;
	sessionId: string;
	userMessages: number;
	assistantMessages: number;
	toolCalls: number;
	toolResults: number;
	totalMessages: number;
	tokens: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		total: number;
	};
	cost: number;
	contextUsage?: AgentContextUsage;
	cacheWarming?: AgentCacheWarmingStatus;
}

export const CACHE_WARMING_MODES = ["off", "streaming", "idle"] as const;
export type CacheWarmingMode = (typeof CACHE_WARMING_MODES)[number];

export interface CacheWarmingSettings {
	mode: CacheWarmingMode;
	showCacheMissNotices: boolean;
}

export interface CompactionModelOverride {
	reserveTokens?: number;
	keepRecentTokens?: number;
}

export interface CompactionSettings {
	enabled: boolean;
	reserveTokens: number;
	keepRecentTokens: number;
	modelOverrides: Record<string, CompactionModelOverride>;
}

export interface BranchSummarySettings {
	reserveTokens: number;
	skipPrompt: boolean;
}

export interface ContextCompactionSettings {
	compaction: CompactionSettings;
	branchSummary: BranchSummarySettings;
}

export const CODEMODE_MODES = ["on", "only"] as const;
export type CodemodeMode = (typeof CODEMODE_MODES)[number];

export interface CodemodeSettings {
	mode: CodemodeMode;
	/** null 表示使用 Pi 的默认工具目录预算。 */
	inlineBudget: number | null;
}

export const PI_BUILTIN_TOOL_NAMES = ["read", "bash", "powershell", "edit", "write", "grep", "find", "ls"] as const;
export type PiBuiltinToolName = (typeof PI_BUILTIN_TOOL_NAMES)[number];

export function isPiBuiltinToolName(value: unknown): value is PiBuiltinToolName {
	return typeof value === "string" && (PI_BUILTIN_TOOL_NAMES as readonly string[]).includes(value);
}

export interface ToolSettings {
	/** null 表示使用 Pi 的标准内置工具集合。 */
	defaultTools: PiBuiltinToolName[] | null;
}

export type InstallTelemetryEnvironmentOverride = "enabled" | "disabled" | null;

export interface InstallTelemetrySettings {
	/** Pi 原生 settings.json 中的 enableInstallTelemetry，默认 true。 */
	enabled: boolean;
	/** 环境变量存在时，这是 Pi 实际使用的值；否则与 enabled 相同。 */
	effectiveEnabled: boolean;
	/** PI_TELEMETRY 的规范化覆盖状态；null 表示未设置。 */
	environmentOverride: InstallTelemetryEnvironmentOverride;
}

export interface CacheWarmingDecisionSummary {
	warmCost: number;
	missCost: number;
	continuationProbability: number;
	expectedSavings: number;
	action: "warm" | "stop";
	updatedAt: string;
}

export interface AgentCacheWarmingStatus extends CacheWarmingSettings {
	decision: CacheWarmingDecisionSummary | null;
}

export interface ForkAgentSessionInput extends AgentInstanceLocator {
	entryId: string;
}

export interface ForkAgentSessionResult {
	selectedText: string;
	cancelled: boolean;
	snapshot: AgentSessionSnapshot;
}

export interface ShareAgentSessionResult {
	provider: "radius" | "github";
	viewerUrl: string;
	gistUrl?: string;
	artifactUrl?: string;
}

export type GitHubCliSource = "configured" | "environment" | "path" | "common" | "none";

export interface GitHubCliStatus {
	path: string | null;
	source: GitHubCliSource;
	authenticated: boolean;
	version: string | null;
	loginCommand: string | null;
	error: string | null;
}

export interface ShareSettingsStatus {
	radius: AuthProviderSummary | null;
	githubCli: GitHubCliStatus;
}

export type AuthMethodType = "api_key" | "oauth";

export type CredentialSource =
	| "stored"
	| "runtime"
	| "environment"
	| "fallback"
	| "models_json_key"
	| "models_json_command"
	| "codepiddy_secret"
	| "none";

export interface AuthMethodSummary {
	type: AuthMethodType;
	name: string;
	isSubscription?: boolean;
}

export interface AuthProviderSummary {
	id: string;
	name: string;
	configured: boolean;
	authType: AuthMethodType | null;
	source: CredentialSource | null;
	sourceLabel: string | null;
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
	importAgentSession(input: AgentInstanceLocator): Promise<AgentSessionSwitchResult | null>;
	getAgentSessionStats(input: AgentInstanceLocator): Promise<AgentSessionStats>;
	forkAgentSession(input: ForkAgentSessionInput): Promise<ForkAgentSessionResult>;
	shareAgentSession(input: AgentInstanceLocator): Promise<ShareAgentSessionResult>;
	getShareSettings(): Promise<ShareSettingsStatus>;
	chooseGitHubCliPath(): Promise<string | null>;
	setGitHubCliPath(path: string | null): Promise<ShareSettingsStatus>;
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
	getPendingExtensionUiRequest(input: AgentInstanceLocator): Promise<PendingExtensionUiRequest | null>;
	getSettingsStatus(): Promise<SettingsStatus>;
	getPiRuntimeStatus(): Promise<PiRuntimeStatus>;
	getDiagnosticsInfo(): Promise<DiagnosticsInfo>;
	exportDiagnostics(input: DiagnosticsExportInput): Promise<DiagnosticsExportResult | null>;
	checkPiRuntimeUpdate(): Promise<PiRuntimeStatus>;
	installPiRuntimeUpdate(version: string): Promise<PiRuntimeStatus>;
	rollbackPiRuntime(): Promise<PiRuntimeStatus>;
	restartCodePIddy(): Promise<void>;
	saveShellPath(shellPath: string): Promise<SettingsStatus>;
	saveShellCommandPrefix(prefix: string): Promise<SettingsStatus>;
	saveInstallTelemetry(enabled: boolean): Promise<SettingsStatus>;
	saveCacheWarmingSettings(input: CacheWarmingSettings): Promise<SettingsStatus>;
	saveContextCompactionSettings(input: ContextCompactionSettings): Promise<SettingsStatus>;
	saveCodemodeSettings(input: CodemodeSettings): Promise<SettingsStatus>;
	saveToolSettings(input: ToolSettings): Promise<SettingsStatus>;
	listPiPackages(projectRoot?: string): Promise<PiPackageListResult>;
	checkPiPackageUpdates(projectRoot?: string): Promise<PiPackageUpdateSummary[]>;
	installPiPackage(input: PiPackageActionInput): Promise<PiPackageListResult>;
	removePiPackage(input: PiPackageActionInput): Promise<PiPackageListResult>;
	updatePiPackage(input: PiPackageActionInput): Promise<PiPackageListResult>;
	setPiPackageExtensionEnabled(input: PiPackageExtensionInput): Promise<PiPackageListResult>;
	choosePiPackageLocalPath(): Promise<string | null>;
	listMcpServers(projectRoot?: string): Promise<McpServerSummary[]>;
	saveMcpServer(input: McpServerInput): Promise<McpServerSummary[]>;
	deleteMcpServer(name: string): Promise<McpServerSummary[]>;
	saveMcpProjectOverride(input: McpProjectOverrideInput): Promise<McpServerSummary[]>;
	deleteMcpProjectOverride(input: McpProjectOverrideLocator): Promise<McpServerSummary[]>;
	runMcpAction(input: McpActionInput): Promise<McpActionResult>;
	listProviders(): Promise<ProviderSummary[]>;
	saveProvider(input: ProviderInput): Promise<ProviderSummary[]>;
	deleteProvider(id: string): Promise<ProviderSummary[]>;
	getLlamaCppConfig(): Promise<LlamaCppConfigStatus>;
	saveLlamaCppConfig(input: SaveLlamaCppConfigInput): Promise<LlamaCppConfigStatus>;
	clearLlamaCppConfig(): Promise<LlamaCppConfigStatus>;
	getLlamaCppStatus(): Promise<LlamaCppRuntimeStatus>;
	runLlamaCppAction(input: RunLlamaCppActionInput): Promise<LlamaCppRuntimeStatus>;
	searchLlamaCppModels(query: string): Promise<HuggingFaceModelSummary[]>;
	getLlamaCppModelDetails(modelId: string): Promise<HuggingFaceModelDetails>;
	onLlamaCppEvent(listener: (event: LlamaCppActionEvent) => void): () => void;
	listAgentSkills(projectRoot?: string): Promise<AgentSkillSummary[]>;
	getRoleSkillAssignments(): Promise<RoleSkillAssignments>;
	setRoleSkillAssignments(input: SetRoleSkillAssignmentsInput): Promise<RoleSkillAssignments>;
	listPromptTemplates(projectRoot?: string): Promise<PromptTemplateSummary[]>;
	savePromptTemplate(input: PromptTemplateInput): Promise<PromptTemplateSummary[]>;
	deletePromptTemplate(input: PromptTemplateLocator): Promise<PromptTemplateSummary[]>;
	openPromptTemplateFolder(input: Pick<PromptTemplateLocator, "scope" | "projectRoot">): Promise<void>;
	openPiConfigFolder(): Promise<void>;
	openProjectSkillsFolder(projectRoot: string): Promise<void>;
	openBuiltinSkillsFolder(): Promise<void>;
	openExternalUrl(url: string): Promise<void>;
	getAgentModelSelection(input: AgentInstanceLocator): Promise<AgentModelSelection>;
	getAgentModelScope(input: AgentInstanceLocator): Promise<AgentModelScope>;
	refreshAgentModelScope(input: AgentInstanceLocator): Promise<AgentModelRefreshResult>;
	getAgentCommands(input: AgentInstanceLocator): Promise<AgentCommandOption[]>;
	setAgentModel(input: SetAgentModelInput): Promise<AgentModelSelection>;
	setAgentModelScope(input: SetAgentModelScopeInput): Promise<AgentModelScope>;
	setAgentThinking(input: SetAgentThinkingInput): Promise<AgentModelSelection>;
	getProjectTrustStatus(projectRoot: string): Promise<ProjectTrustStatus>;
	setProjectTrust(input: SetProjectTrustInput): Promise<ProjectTrustStatus>;
	listRecentProjects(): Promise<RecentProject[]>;
	openRecentProject(projectRoot: string): Promise<ProjectSummary>;
	forgetRecentProject(projectRoot: string): Promise<RecentProject[]>;
	searchProjectFiles(projectRoot: string, query: string): Promise<string[]>;
	listWorkspaceDir(projectRoot: string, relativeDir: string): Promise<WorkspaceDirEntry[]>;
	readWorkspaceFile(projectRoot: string, relativePath: string): Promise<WorkspaceFileContent>;
	statWorkspaceFile(projectRoot: string, relativePath: string): Promise<WorkspaceFileMetadata>;
	writeWorkspaceFile(input: WorkspaceWriteFileInput): Promise<WorkspaceFileMetadata>;
	createWorkspaceEntry(input: WorkspaceCreateEntryInput): Promise<WorkspaceMutationResult>;
	renameWorkspaceEntry(input: WorkspaceRenameEntryInput): Promise<WorkspaceMutationResult>;
	deleteWorkspaceEntry(input: WorkspaceDeleteEntryInput): Promise<WorkspaceMutationResult>;
	copyWorkspaceEntry(input: WorkspaceCopyEntryInput): Promise<WorkspaceMutationResult>;
	revealWorkspaceEntry(input: WorkspaceRevealEntryInput): Promise<void>;
	openWorkspaceEntry(input: WorkspaceRevealEntryInput): Promise<void>;
	startTerminal(input: TerminalStartInput): Promise<TerminalSessionInfo>;
	writeTerminal(input: TerminalWriteInput): Promise<void>;
	resizeTerminal(input: TerminalResizeInput): Promise<void>;
	killTerminal(terminalId: string): Promise<void>;
	getProjectWriteLeaseStatus(projectId: string): Promise<ProjectWriteLeaseStatus>;
	clearStaleProjectWriteLease(projectId: string): Promise<ProjectWriteLeaseStatus>;
	onAgentEvent(listener: (event: AgentClientEvent) => void): () => void;
	onTerminalEvent(listener: (event: TerminalClientEvent) => void): () => void;
}

export interface PendingExtensionUiRequest extends AgentInstanceLocator {
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
export const WORKSPACE_TRASH_DIR_NAME = ".codepiddy-trash";

export interface WorkspaceDirEntry {
	name: string;
	kind: "dir" | "file";
	/** 文件字节数，目录恒为 0。 */
	size: number;
}

export type WorkspaceFileKind = "text" | "image" | "pdf" | "document" | "binary" | "tooLarge";

/** OOXML / 表格文档的渲染器类型。xls 与 xlsx 共用同一个渲染器。 */
export type WorkspaceDocumentFormat = "docx" | "xlsx" | "pptx";

export interface WorkspaceFileContent {
	kind: WorkspaceFileKind;
	size: number;
	/** kind 为 text 时的 UTF-8 内容。 */
	content?: string;
	/** kind 为 image 时的 dataUrl。 */
	dataUrl?: string;
	/** kind 为 pdf / document 时的 base64 原始字节，渲染层解码成 ArrayBuffer。 */
	data?: string;
	/** kind 为 pdf / document 时的原始 MIME。 */
	mime?: string;
	/** kind 为 document 时决定使用哪个渲染器。 */
	format?: WorkspaceDocumentFormat;
}

export interface WorkspaceFileMetadata {
	size: number;
	mtimeMs: number;
}

export interface WorkspaceMutationResult {
	relativePath: string;
	/** 仅复制操作使用：目标已存在且未请求覆盖。 */
	exists?: boolean;
}

export interface WorkspaceWriteFileInput {
	projectId: string;
	projectRoot: string;
	relativePath: string;
	content: string;
}

export interface WorkspaceCreateEntryInput {
	projectId: string;
	projectRoot: string;
	relativePath: string;
	kind: "file" | "dir";
}

export interface WorkspaceRenameEntryInput {
	projectId: string;
	projectRoot: string;
	relativePath: string;
	nextRelativePath: string;
}

export interface WorkspaceDeleteEntryInput {
	projectId: string;
	projectRoot: string;
	relativePath: string;
}

export interface WorkspaceCopyEntryInput {
	projectId: string;
	projectRoot: string;
	sourceRelativePath: string;
	targetRelativePath: string;
	overwrite: boolean;
}

export interface WorkspaceRevealEntryInput {
	projectRoot: string;
	relativePath: string;
	kind: "file" | "dir";
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
	encryptionAvailable: boolean;
	/** 用户配置的 bash 路径；为 null 表示交给 pi 自动探测。 */
	shellPath: string | null;
	/** Pi 原生 shellCommandPrefix；为 null 表示不添加命令前缀。 */
	shellCommandPrefix: string | null;
	installTelemetry: InstallTelemetrySettings;
	cacheWarming: CacheWarmingSettings;
	contextCompaction: ContextCompactionSettings;
	codemode: CodemodeSettings;
	tools: ToolSettings;
}

export const PI_PACKAGE_SCOPES = ["user", "project"] as const;
export type PiPackageScope = (typeof PI_PACKAGE_SCOPES)[number];

export const PI_PACKAGE_SOURCE_TYPES = ["npm", "git", "local"] as const;
export type PiPackageSourceType = (typeof PI_PACKAGE_SOURCE_TYPES)[number];

export interface PiPackageResourceCount {
	total: number;
	enabled: number;
}

export interface PiPackageResourceSummary {
	extensions: PiPackageResourceCount;
	skills: PiPackageResourceCount;
	prompts: PiPackageResourceCount;
	themes: PiPackageResourceCount;
}

export interface PiPackageSummary {
	source: string;
	scope: PiPackageScope;
	sourceType: PiPackageSourceType;
	displayName: string;
	version: string | null;
	installedPath: string | null;
	installed: boolean;
	filtered: boolean;
	resources: PiPackageResourceSummary;
	/** 是否允许 CodePIddy Agent 显式加载这个包的 extension。 */
	extensionEnabled: boolean;
}

export interface PiPackageUpdateSummary {
	source: string;
	displayName: string;
	sourceType: Exclude<PiPackageSourceType, "local">;
	scope: PiPackageScope;
}

export interface PiPackageListResult {
	packages: PiPackageSummary[];
	updates: PiPackageUpdateSummary[];
	projectTrusted: boolean;
}

export interface PiPackageActionInput {
	action: "install" | "remove" | "update";
	source: string;
	scope: PiPackageScope;
	projectRoot?: string;
}

export interface PiPackageExtensionInput {
	action: "set-extension";
	source: string;
	scope: PiPackageScope;
	enabled: boolean;
	projectRoot?: string;
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
	action: "list" | "login" | "logout";
	name?: string;
}

export type McpServerRuntimeState =
	| "connected"
	| "disabled"
	| "failed"
	| "disconnected"
	| "needs-auth"
	| "starting"
	| "unknown";

export interface McpToolSummary {
	name: string;
	description?: string;
}

export interface McpServerRuntimeStatus {
	name: string;
	scope: string;
	source: string;
	enabled: boolean;
	exposure: McpExposure;
	transport: string;
	state: McpServerRuntimeState;
	tools: McpToolSummary[];
	error?: string;
}

export interface McpRuntimeSnapshot {
	servers: McpServerRuntimeStatus[];
	errors: string[];
}

export interface McpActionResult {
	output: string;
	snapshot?: McpRuntimeSnapshot;
}

export const PROVIDER_APIS = [
	"openai-completions",
	"openai-responses",
	"anthropic-messages",
	"google-generative-ai",
	"google-vertex",
	"bedrock-converse",
	"mistral-conversations",
	"pi-messages",
] as const;
/** models.json uses an open API id string; PROVIDER_APIS is only a UI suggestion list. */
export type ProviderApi = string;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue | undefined };

export interface ProviderModelCost {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	tiers?: Array<{
		inputTokensAbove: number;
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
	}>;
}

export interface ProviderModelCostOverride extends JsonObject {
	input?: number;
	output?: number;
	cacheRead?: number;
	cacheWrite?: number;
	tiers?: ProviderModelCost["tiers"];
}

export interface ProviderPromptCache extends JsonObject {
	short?: number;
	long?: number;
}

export type ProviderThinkingLevelMap = Record<string, string | null>;

export interface ProviderModelSummary {
	id: string;
	name: string;
	api?: string;
	baseUrl?: string;
	contextWindow?: number;
	maxTokens?: number;
	reasoning: boolean;
	thinkingLevelMap?: ProviderThinkingLevelMap;
	input: ("text" | "image")[];
	inputLimits?: JsonObject;
	cost?: ProviderModelCost;
	promptCache?: ProviderPromptCache;
	samplingParams?: JsonObject;
	headers?: Record<string, string>;
	compat?: JsonObject;
	/** 可直接编辑并原样写回的高级字段与未知字段。 */
	advanced: JsonObject;
	/** Pi schema 之外的字段，保存时按对象合并回去。 */
	extra: JsonObject;
}

export interface ProviderModelInput {
	/** 编辑已有模型时用于定位原对象；改 ID 不会丢字段。 */
	originalId?: string;
	id: string;
	name?: string;
	api?: string | null;
	baseUrl?: string | null;
	contextWindow?: number | null;
	maxTokens?: number | null;
	reasoning?: boolean;
	thinkingLevelMap?: ProviderThinkingLevelMap | null;
	input?: ("text" | "image")[];
	inputLimits?: JsonObject | null;
	cost?: ProviderModelCostOverride | null;
	promptCache?: ProviderPromptCache | null;
	samplingParams?: JsonObject | null;
	headers?: Record<string, string> | null;
	compat?: JsonObject | null;
	advanced?: JsonObject;
	extra?: JsonObject;
}

export interface ProviderModelOverride extends JsonObject {
	name?: string;
	reasoning?: boolean;
	thinkingLevelMap?: ProviderThinkingLevelMap;
	input?: ("text" | "image")[];
	inputLimits?: JsonObject;
	cost?: ProviderModelCostOverride;
	promptCache?: ProviderPromptCache;
	contextWindow?: number;
	maxTokens?: number;
	samplingParams?: JsonObject;
	headers?: Record<string, string>;
	compat?: JsonObject;
}

export interface ProviderSummary {
	id: string;
	name?: string;
	baseUrl?: string;
	api?: string;
	headers?: Record<string, string>;
	authHeader?: boolean;
	compat?: JsonObject;
	modelOverrides?: Record<string, ProviderModelOverride>;
	advanced: JsonObject;
	extra: JsonObject;
	credentialSource: CredentialSource;
	credentialLabel: string | null;
	models: ProviderModelSummary[];
}

export interface ProviderInput {
	id: string;
	name?: string | null;
	baseUrl?: string | null;
	api?: string | null;
	headers?: Record<string, string> | null;
	authHeader?: boolean | null;
	compat?: JsonObject | null;
	modelOverrides?: Record<string, ProviderModelOverride> | null;
	advanced?: JsonObject;
	extra?: JsonObject;
	/** 省略表示保持已有 Key；空字符串表示清除。 */
	apiKey?: string;
	models?: ProviderModelInput[];
}

export type LlamaCppModelStatus = "unloaded" | "loading" | "loaded" | "downloading" | "sleeping";

export interface LlamaCppModelSummary {
	id: string;
	status: LlamaCppModelStatus;
	failed: boolean;
	exitCode: number | null;
	contextWindow: number | null;
	size: number | null;
	source: string | null;
	input: ("text" | "image")[];
	progress: Record<string, { done: number; total: number }> | null;
}

export type LlamaCppConfigSource = "stored" | "environment" | "none";

export interface LlamaCppConfigStatus {
	configured: boolean;
	serverUrl: string | null;
	apiKeyConfigured: boolean;
	source: LlamaCppConfigSource;
}

export interface LlamaCppRuntimeStatus extends LlamaCppConfigStatus {
	connected: boolean;
	routerAutoload: boolean;
	models: LlamaCppModelSummary[];
	error: string | null;
}

export interface SaveLlamaCppConfigInput {
	serverUrl: string;
	/** 省略表示保持已有 Key；clearApiKey 优先。 */
	apiKey?: string;
	clearApiKey?: boolean;
}

export type LlamaCppAction = "refresh" | "load" | "unload" | "download";

export interface RunLlamaCppActionInput {
	action: LlamaCppAction;
	modelId?: string;
}

export type LlamaCppActionEvent =
	| {
			type: "progress";
			actionId: string;
			modelId: string;
			message: string;
			ratio?: number;
			detail?: string;
	  }
	| {
			type: "complete";
			actionId: string;
			modelId?: string;
			status: LlamaCppRuntimeStatus;
	  }
	| {
			type: "error";
			actionId: string;
			modelId?: string;
			error: string;
	  };

export interface HuggingFaceModelSummary {
	id: string;
	downloads: number;
}

export interface HuggingFaceQuantization {
	name: string;
	size?: number;
}

export interface HuggingFaceModelDetails {
	id: string;
	gated: false | "auto" | "manual";
	quantizations: HuggingFaceQuantization[];
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

export interface DiagnosticsInfo {
	codepiddyVersion: string;
	piRuntime: PiRuntimeStatus;
	platform: string;
	architecture: string;
	electronVersion: string | null;
	nodeVersion: string;
	osRelease: string;
	osVersion: string;
	debugLogPath: string;
	mcpLogPath: string;
}

export interface DiagnosticsExportInput {
	includeSession: boolean;
	agent?: AgentInstanceLocator;
	projectRoot?: string;
	uiError?: string;
}

export interface DiagnosticsExportResult {
	filePath: string;
	createdAt: string;
	sizeBytes: number;
	includedSession: boolean;
}

export type AgentSkillSource = "builtin" | "codex" | "agents" | "pi" | "project" | "package";

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

export const PROMPT_TEMPLATE_SCOPES = ["user", "project"] as const;
export type PromptTemplateScope = (typeof PROMPT_TEMPLATE_SCOPES)[number];
export const PROMPT_TEMPLATE_SOURCES = ["user", "project", "package"] as const;
export type PromptTemplateSource = (typeof PROMPT_TEMPLATE_SOURCES)[number];

export interface PromptTemplateSummary {
	name: string;
	description: string;
	argumentHint: string | null;
	content: string;
	scope: PromptTemplateScope;
	source: PromptTemplateSource;
	sourceLabel: string | null;
	readOnly: boolean;
	filePath: string;
}

export interface PromptTemplateInput {
	scope: PromptTemplateScope;
	projectRoot?: string;
	originalName?: string;
	name: string;
	description: string;
	argumentHint: string;
	content: string;
}

export interface PromptTemplateLocator {
	scope: PromptTemplateScope;
	projectRoot?: string;
	name: string;
}

export const CUSTOM_PROVIDER_APIS = [
	"openai-completions",
	"openai-responses",
	"anthropic-messages",
	"google-generative-ai",
] as const;
export type CustomProviderApi = string;

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
	enabledModelIds: string[] | null;
}

export interface AgentModelScope {
	enabledModelIds: string[] | null;
	availableModels: AgentModelOption[];
	applyPending: boolean;
}

export interface AgentModelRefreshResult {
	scope: AgentModelScope;
	selection: AgentModelSelection;
}

export interface SetAgentModelInput extends AgentInstanceLocator {
	provider: string;
	modelId: string;
}

export interface SetAgentModelScopeInput extends AgentInstanceLocator {
	enabledModelIds: string[] | null;
}

export interface SetAgentThinkingInput extends AgentInstanceLocator {
	level: string;
}

export type ProjectTrustDecision = boolean | null;

export interface ProjectTrustStatus {
	projectRoot: string;
	decision: ProjectTrustDecision;
	inheritedFrom: string | null;
	requiresTrust: boolean;
}

export interface SetProjectTrustInput {
	projectRoot: string;
	decision: boolean;
	includeParent?: boolean;
}
