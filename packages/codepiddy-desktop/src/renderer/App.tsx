import type {
	AgentClientEvent,
	AgentCommandOption,
	AgentImageAttachment,
	AgentInstanceLocator,
	AgentModelSelection,
	AgentRole,
	AgentSessionSnapshot,
	AgentSessionStats,
	AgentSessionSummary,
	AgentSkillSummary,
	AgentSlotSummary,
	AgentStatus,
	AuthClientEvent,
	AuthMethodType,
	AuthPromptRequest,
	AuthProviderSummary,
	CacheWarmingMode,
	CacheWarmingSettings,
	LaneKind,
	PendingExtensionUiRequest,
	PiRuntimeStatus,
	ProjectSummary,
	ProjectTrustStatus,
	ProjectUiState,
	ProjectWriteLeaseStatus,
	PromptTemplateSummary,
	RecentProject,
	RoleSkillAssignments,
	SettingsStatus,
	ShareAgentSessionResult,
	WorkItemSummary,
} from "@codepiddy/shared";
import { Trash2 } from "lucide-react";
import {
	type CSSProperties,
	lazy,
	type MutableRefObject,
	memo,
	Suspense,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { AppIcon, type AppIconName } from "./components/app-icon.tsx";
import { CodemodeSettingsPanel } from "./components/CodemodeSettingsPanel.tsx";
import { CompactionSettingsPanel } from "./components/CompactionSettingsPanel.tsx";
import { DiagnosticsSettings } from "./components/DiagnosticsSettings.tsx";
import { FileMentionMenu } from "./components/FileMentionMenu.tsx";
import { McpSettings } from "./components/McpSettings.tsx";
import { ModelScopeSettings } from "./components/ModelScopeSettings.tsx";
import { MessageContent } from "./components/message-content.tsx";
import { ModalShell } from "./components/modal-shell.tsx";
import { PiPackageSettings } from "./components/PiPackageSettings.tsx";
import { ProjectTrustSettings } from "./components/ProjectTrustSettings.tsx";
import { PromptTemplateSettings } from "./components/PromptTemplateSettings.tsx";
import { ProviderSettings } from "./components/ProviderSettings.tsx";
import { PanelResizeHandle } from "./components/panel-resize-handle.tsx";
import { ProviderIcon } from "./components/provider-icon.tsx";
import { type SessionCreateDraft, SessionCreateForm } from "./components/SessionCreateForm.tsx";
import { SessionShareDialog } from "./components/SessionShareDialog.tsx";
import { SessionStatsDialog } from "./components/SessionStatsDialog.tsx";
import { ShareSettings } from "./components/ShareSettings.tsx";
import { SlashCommandMenu } from "./components/SlashCommandMenu.tsx";
import { StreamStats } from "./components/StreamStats.tsx";
import { SelectMenu } from "./components/select-menu.tsx";
import { SettingsCheckbox } from "./components/settings-checkbox.tsx";
import { SettingsToastHost } from "./components/settings-toast-host.tsx";
import { showSettingsToast } from "./components/settings-toast-store.ts";
import { StateBlock } from "./components/state-block.tsx";
import { estimateTokens, extractUsageOutput, type FinalStreamStats, formatElapsed } from "./components/stream-stats.ts";
import { ThinkingControl } from "./components/ThinkingControl.tsx";
import { ToolCallCard } from "./components/ToolCallCard.tsx";
import { ToolSettingsPanel } from "./components/ToolSettingsPanel.tsx";
import { thinkingLevelLabel } from "./components/thinking-levels.ts";
import {
	formatTurnElapsed,
	groupTranscriptIntoTurns,
	resolveTurnCollapsed,
	splitTurnEntries,
	turnElapsedMs,
} from "./components/turn-group.ts";
import { useTranscriptScroll } from "./components/use-transcript-scroll.ts";
import { WorkPanel } from "./components/WorkPanel.tsx";
import { demoProject } from "./demo-project.ts";
import { WORKSPACE_FILES_DRAG_TYPE } from "./workspace-drag.ts";

const LlamaCppSettings = lazy(() =>
	import("./components/LlamaCppSettings.tsx").then((module) => ({ default: module.LlamaCppSettings })),
);

const SIDEBAR_DEFAULT_WIDTH = 266;
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 420;

function clampSidebarWidth(value: number): number {
	return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(value)));
}

function loadStoredSidebarWidth(): number {
	try {
		const stored = Number(window.localStorage.getItem("codepiddy.sidebar.width"));
		return Number.isFinite(stored) && stored > 0 ? clampSidebarWidth(stored) : SIDEBAR_DEFAULT_WIDTH;
	} catch {
		return SIDEBAR_DEFAULT_WIDTH;
	}
}

type Selection =
	| { type: "welcome" }
	| { type: "project" }
	| { type: "settings" }
	| { type: "lane"; lane: LaneKind }
	| { type: "work-item"; lane: LaneKind; workItemId: string }
	| { type: "agent"; lane: LaneKind; workItemId: string; role: AgentSlotSummary["role"] };

function restoreSelection(project: ProjectSummary, state: ProjectUiState): Selection {
	if (state.selectionType === "settings") return { type: "settings" };
	if (state.selectionType === "lane" && state.lane && project.lanes.some((lane) => lane.kind === state.lane)) {
		return { type: "lane", lane: state.lane };
	}
	if ((state.selectionType === "work-item" || state.selectionType === "agent") && state.lane && state.workItemId) {
		const item = project.lanes
			.find((lane) => lane.kind === state.lane)
			?.workItems.find((candidate) => candidate.id === state.workItemId);
		if (item) {
			if (
				state.selectionType === "agent" &&
				state.role &&
				item.agentSlots.some((slot) => slot.role === state.role)
			) {
				return { type: "agent", lane: state.lane, workItemId: state.workItemId, role: state.role };
			}
			return { type: "work-item", lane: state.lane, workItemId: state.workItemId };
		}
	}
	return { type: "project" };
}

function workspacePathsFromDrag(dataTransfer: DataTransfer): string[] {
	try {
		const parsed: unknown = JSON.parse(dataTransfer.getData(WORKSPACE_FILES_DRAG_TYPE));
		return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
	} catch {
		return [];
	}
}

interface WorkItemDialogState {
	lane: LaneKind;
	title: string;
	description: string;
}

interface RenameDialogState {
	lane: LaneKind;
	item: WorkItemSummary;
	title: string;
}

interface SessionRenameDialogState {
	locator: AgentInstanceLocator;
	displayName: string;
	name: string;
}

interface SessionDeleteDialogState {
	locator: AgentInstanceLocator;
	sessionId: string;
	name: string;
}

interface DeleteDialogState {
	lane: LaneKind;
	item: WorkItemSummary;
}

interface ResetAgentDialogState {
	workItem: WorkItemSummary;
	slot: AgentSlotSummary;
}

interface SessionPanelState {
	agentInstanceId: string;
	projectId: string;
	workItemId: string;
	role: AgentRole;
	displayName: string;
	snapshot: AgentSessionSnapshot;
	sessions: AgentSessionSummary[];
}

interface SessionStatsDialogState {
	locator: AgentInstanceLocator;
	displayName: string;
}

interface SessionShareDialogState {
	locator: AgentInstanceLocator;
	displayName: string;
	sessionName: string | null;
	result: ShareAgentSessionResult | null;
	error: string | null;
}

interface ExtensionDialogState {
	agentInstanceId: string;
	projectId: string;
	workItemId: string;
	role: AgentRole;
	requestId: string;
	method: "select" | "confirm" | "input" | "editor";
	title: string;
	message: string;
	options: string[];
	placeholder: string;
	value: string;
}

type AssistantMessageStatus = "streaming" | "complete" | "aborted" | "error";

type TranscriptItem =
	| {
			id: string;
			type: "user";
			text: string;
			images?: AgentImageAttachment[];
			delivery?: "steer" | "followUp";
			createdAt?: string;
	  }
	| {
			id: string;
			type: "assistant";
			text: string;
			thinking?: string;
			status: AssistantMessageStatus;
			createdAt?: string;
			streamStartedAt?: number;
			streamStats?: FinalStreamStats;
			/** 生成这条回复时实际使用的模型，用于逐条显示模型名。 */
			modelProvider?: string;
			modelId?: string;
	  }
	| { id: string; type: "system"; text: string; createdAt?: string }
	| {
			id: string;
			type: "tool";
			name: string;
			args: string;
			text: string;
			details?: unknown;
			status: "running" | "completed";
			isError: boolean;
	  };

interface ToolRecoveryOffer {
	toolName: string;
	reason: string;
}

function extensionDialogFromRequest(request: PendingExtensionUiRequest): ExtensionDialogState {
	return {
		agentInstanceId: request.agentInstanceId,
		projectId: request.projectId,
		workItemId: request.workItemId,
		role: request.role,
		requestId: request.requestId,
		method: request.method,
		title: request.title,
		message: request.message,
		options: request.options,
		placeholder: request.placeholder,
		value: request.prefill,
	};
}

interface AgentActivity {
	label: string;
	kind: "working" | "tool" | "compaction" | "retry" | "waiting" | "reconnecting";
	queued: number;
}

const statusLabels: Record<AgentSlotSummary["status"], string> = {
	"not-created": "创建",
	idle: "空闲",
	running: "运行中",
	waiting: "等待",
	completed: "完成",
	failed: "失败",
};

const roleLabels: Record<AgentRole, string> = {
	"requirement-analysis": "需求分析 Agent",
	coding: "Coding Agent",
	"bug-fix": "Bug Fix Agent",
	review: "Review Agent",
};

const PROMPT_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_PROMPT_IMAGES = 8;
const MAX_PROMPT_IMAGE_BYTES = 10 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findAgentStatus(project: ProjectSummary | null, locator: AgentInstanceLocator): AgentStatus | null {
	for (const lane of project?.lanes ?? []) {
		for (const workItem of lane.workItems) {
			const slot = workItem.agentSlots.find(
				(candidate) => candidate.role === locator.role && candidate.currentInstanceId === locator.agentInstanceId,
			);
			if (slot) return slot.status;
		}
	}
	return null;
}

function extractMessageText(value: unknown): string {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value.map(extractMessageText).filter(Boolean).join("\n");
	if (!isRecord(value)) return "";
	if (value.type === "text" && typeof value.text === "string") return value.text;
	if ("content" in value) return extractMessageText(value.content);
	return "";
}

function extractThinkingText(value: unknown): string {
	if (Array.isArray(value)) return value.map(extractThinkingText).filter(Boolean).join("\n");
	if (!isRecord(value)) return "";
	if (value.type === "thinking" && typeof value.thinking === "string") return value.thinking;
	if ("content" in value) return extractThinkingText(value.content);
	return "";
}

function extractMessageImages(value: unknown, messageIndex: number): AgentImageAttachment[] {
	if (Array.isArray(value)) return value.flatMap((item) => extractMessageImages(item, messageIndex));
	if (!isRecord(value)) return [];
	if (
		value.type === "image" &&
		typeof value.data === "string" &&
		typeof value.mimeType === "string" &&
		PROMPT_IMAGE_MIME_TYPES.has(value.mimeType)
	) {
		return [
			{
				id: `history-image-${messageIndex}-${value.data.slice(0, 12)}`,
				name: `图片 ${messageIndex + 1}`,
				mimeType: value.mimeType as AgentImageAttachment["mimeType"],
				data: value.data,
			},
		];
	}
	if ("content" in value) return extractMessageImages(value.content, messageIndex);
	return [];
}

async function imageAttachmentFromFile(file: File): Promise<AgentImageAttachment> {
	if (!PROMPT_IMAGE_MIME_TYPES.has(file.type)) throw new Error(`不支持的图片格式：${file.type || file.name}`);
	if (file.size > MAX_PROMPT_IMAGE_BYTES) throw new Error("单张图片不能超过 10MB");
	const bytes = new Uint8Array(await file.arrayBuffer());
	let binary = "";
	const chunkSize = 32_768;
	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
	}
	return {
		id: crypto.randomUUID(),
		name: file.name || "clipboard-image",
		mimeType: file.type as AgentImageAttachment["mimeType"],
		data: btoa(binary),
	};
}

function assistantMessageStatus(value: unknown): Exclude<AssistantMessageStatus, "streaming"> {
	if (!isRecord(value)) return "complete";
	if (value.stopReason === "aborted") return "aborted";
	if (value.stopReason === "error") return "error";
	return "complete";
}

/** Pi 的 AssistantMessage 带 provider / model；存下来逐条展示，而不是回落到当前模型。 */
function assistantModelRef(value: unknown): { modelProvider?: string; modelId?: string } {
	if (!isRecord(value)) return {};
	const provider = typeof value.provider === "string" && value.provider.trim() ? value.provider : undefined;
	const modelId = typeof value.model === "string" && value.model.trim() ? value.model : undefined;
	return {
		...(provider ? { modelProvider: provider } : {}),
		...(modelId ? { modelId } : {}),
	};
}

function buildModelLabels(models: AgentModelSelection["availableModels"] | undefined): Map<string, string> | undefined {
	if (!models || models.length === 0) return undefined;
	return new Map(models.map((model) => [`${model.provider}/${model.id}`, model.name]));
}

function finalizeAssistantTranscript(
	items: TranscriptItem[],
	assistantId: string | undefined,
	message: unknown,
	fallbackStatus: Exclude<AssistantMessageStatus, "streaming"> = "complete",
): TranscriptItem[] {
	if (!assistantId) return items;
	const messageRecord = isRecord(message) ? message : null;
	const status = messageRecord ? assistantMessageStatus(messageRecord) : fallbackStatus;
	const finalText = messageRecord ? extractMessageText(messageRecord.content) : "";
	const finalThinking = messageRecord ? extractThinkingText(messageRecord.content) : "";
	const errorMessage =
		messageRecord && typeof messageRecord.errorMessage === "string" ? messageRecord.errorMessage : "";
	return items.flatMap((item) => {
		if (item.id !== assistantId || item.type !== "assistant") return [item];
		const text = finalText || item.text;
		const thinking = finalThinking || item.thinking;
		if (status === "complete" && !text && !thinking) return [];
		const usageOutput = messageRecord ? extractUsageOutput(messageRecord) : null;
		const statsTokens = usageOutput ?? estimateTokens(text.length);
		return [
			{
				...item,
				...assistantModelRef(messageRecord),
				text:
					text ||
					(status === "aborted" ? "本轮已中断。" : status === "error" ? errorMessage || "本轮回复失败。" : ""),
				...(thinking ? { thinking } : {}),
				status,
				...(statsTokens > 0
					? {
							streamStats: {
								tokens: statsTokens,
								estimated: usageOutput === null,
								...(typeof item.streamStartedAt === "number"
									? { elapsedMs: Math.max(0, Date.now() - item.streamStartedAt) }
									: {}),
							} satisfies FinalStreamStats,
						}
					: {}),
			},
		];
	});
}

/** 会话历史里的 timestamp 是 Unix 毫秒数（AgentMessage 定义），在线消息才带 ISO 字符串。 */
function historyTimestamp(message: Record<string, unknown>): string | null {
	const value = message.timestamp;
	if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
	if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return value;
	return null;
}

/**
 * 取 tool result 里的 unified patch。review 扩展会在 Write / Edit 完成后写入
 * details.patch；Pi core 自己的 Edit 结果也有 patch。没有 @@ 的 details.diff
 * 是旧版展示格式，不能当 diff 解析。
 */
function patchFromDetails(details: unknown): string | null {
	if (!isRecord(details)) return null;
	if (typeof details.patch === "string" && details.patch.includes("@@")) return details.patch;
	if (typeof details.diff === "string" && details.diff.includes("@@")) return details.diff;
	return null;
}

function extractToolResultPatch(result: unknown): string | null {
	return isRecord(result) ? patchFromDetails(result.details) : null;
}

function extractToolResultDetails(result: unknown): unknown {
	return isRecord(result) ? result.details : undefined;
}

function normalizeHistory(messages: unknown[]): TranscriptItem[] {
	const items: TranscriptItem[] = [];
	for (const [index, message] of messages.entries()) {
		if (!isRecord(message)) continue;
		const text = extractMessageText(message.content);
		const images = extractMessageImages(message.content, index);
		const role = message.role;
		if (!text && !(role === "user" && images.length > 0)) continue;
		const createdAt = historyTimestamp(message);
		if (role === "toolResult") {
			const patch = patchFromDetails(message.details);
			items.push({
				id: typeof message.toolCallId === "string" ? message.toolCallId : `history-tool-${index}`,
				type: "tool",
				name: typeof message.toolName === "string" ? message.toolName : "tool",
				args: "",
				text: patch || text,
				details: message.details,
				status: "completed",
				isError: message.isError === true,
				...(createdAt ? { completedAt: Date.parse(createdAt) } : {}),
			});
		} else if (role === "assistant") {
			const thinking = extractThinkingText(message.content);
			const historyUsage = extractUsageOutput(message);
			const historyTokens = historyUsage ?? estimateTokens(text.length);
			items.push({
				id: `history-${index}`,
				type: "assistant",
				text,
				...(thinking ? { thinking } : {}),
				status: assistantMessageStatus(message),
				...(createdAt ? { createdAt } : {}),
				...(historyTokens > 0 ? { streamStats: { tokens: historyTokens, estimated: historyUsage === null } } : {}),
				...assistantModelRef(message),
			});
		} else {
			items.push({
				id: `history-${index}`,
				type: role === "user" ? "user" : "system",
				text,
				...(role === "user" && images.length > 0 ? { images } : {}),
				...(createdAt ? { createdAt } : {}),
			});
		}
	}
	return items;
}

/**
 * 历史事件是会话的权威快照，但流式中的 assistant 消息要到 message_end 才会
 * 进入 AgentMessage 列表，因此 get_messages 里看不到它。直接替换会把用户
 * 正在看的回复抹掉，随后 message_update 又从零拼一段。这里把仍在流式的
 * 本地条目接回历史尾部，流式增量才能继续追加而不是重建。
 */
function beginTranscriptHistoryMerge(
	current: TranscriptItem[],
	history: TranscriptItem[],
	activeAssistantId: string | undefined,
): TranscriptItem[] {
	if (!activeAssistantId) return history;
	const active = current.find((item) => item.id === activeAssistantId);
	if (!active || active.type !== "assistant") return history;
	if (history.some((item) => item.type === "assistant" && item.status === "streaming")) return history;
	const lastHistoryAssistant = [...history].reverse().find((item) => item.type === "assistant");
	const activeStartedAt = active.createdAt ? Date.parse(active.createdAt) : Number.NaN;
	const historyCompletedAt = lastHistoryAssistant?.createdAt ? Date.parse(lastHistoryAssistant.createdAt) : Number.NaN;
	const historyIsStale =
		Number.isFinite(activeStartedAt) && Number.isFinite(historyCompletedAt) && historyCompletedAt >= activeStartedAt;
	if (historyIsStale) return history;
	return [...history, active];
}

/** 统计行只保留一条：该 assistant 消息之后是否还有更新的 assistant 消息。 */
function hasLaterAssistant(items: TranscriptItem[], index: number): boolean {
	for (let i = index + 1; i < items.length; i += 1) if (items[i]?.type === "assistant") return true;
	return false;
}

function formatMessageTime(value: string | undefined): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	// 会话可能跨天，只有时分无法判断是哪一次；统一显示年月日时分。
	return new Intl.DateTimeFormat(undefined, {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

function normalizeMessageForkText(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function buildTurnForkEntryMap(
	items: TranscriptItem[],
	snapshot: AgentSessionSnapshot | undefined,
): Map<string, string> {
	const result = new Map<string, string>();
	if (!snapshot) return result;
	const candidates = snapshot.nodes
		.filter((node) => node.forkable && node.role === "user" && normalizeMessageForkText(node.text))
		.map((node) => ({
			entryId: node.entryId,
			text: normalizeMessageForkText(node.text),
			timestamp: node.timestamp ? Date.parse(node.timestamp) : Number.NaN,
		}));
	const used = new Set<string>();
	let currentTurnEntryId: string | null = null;
	for (const item of items) {
		if (item.type === "assistant") {
			if (currentTurnEntryId) result.set(item.id, currentTurnEntryId);
			continue;
		}
		if (item.type !== "user") continue;
		const text = normalizeMessageForkText(item.text);
		if (!text) {
			currentTurnEntryId = null;
			continue;
		}
		const itemTimestamp = item.createdAt ? Date.parse(item.createdAt) : Number.NaN;
		const matches = candidates
			.filter((candidate) => !used.has(candidate.entryId) && candidate.text === text)
			.sort((left, right) => {
				const leftDistance =
					Number.isFinite(itemTimestamp) && Number.isFinite(left.timestamp)
						? Math.abs(left.timestamp - itemTimestamp)
						: Number.POSITIVE_INFINITY;
				const rightDistance =
					Number.isFinite(itemTimestamp) && Number.isFinite(right.timestamp)
						? Math.abs(right.timestamp - itemTimestamp)
						: Number.POSITIVE_INFINITY;
				return leftDistance - rightDistance;
			});
		const match = matches[0];
		if (!match) {
			currentTurnEntryId = null;
			continue;
		}
		used.add(match.entryId);
		currentTurnEntryId = match.entryId;
		result.set(item.id, match.entryId);
	}
	return result;
}

const TranscriptMessage = memo(function TranscriptMessage({
	item,
	assistantModel,
	showStats,
	forkEntryId,
	forkPending,
	onFork,
}: {
	item: Extract<TranscriptItem, { type: "user" | "assistant" | "system" }>;
	assistantModel?: string;
	showStats: boolean;
	forkEntryId?: string;
	forkPending?: boolean;
	onFork?(entryId: string): void;
}) {
	const [copied, setCopied] = useState(false);
	const messageTime = formatMessageTime(item.createdAt);
	const elapsedText =
		item.type === "assistant" && item.status !== "streaming" && item.streamStats?.elapsedMs !== undefined
			? formatElapsed(item.streamStats.elapsedMs)
			: null;
	const systemOutputIsLong = item.type === "system" && (item.text.length > 360 || item.text.split("\n").length > 8);
	async function copyMessage(): Promise<void> {
		if (!item.text) return;
		try {
			await navigator.clipboard.writeText(item.text);
			setCopied(true);
			setTimeout(() => setCopied(false), 1400);
		} catch {}
	}
	const assistantStatus =
		item.type === "assistant"
			? item.status === "streaming"
				? "回复中"
				: item.status === "aborted"
					? "已中断"
					: item.status === "error"
						? "失败"
						: null
			: null;
	return (
		<div className={`message message-${item.type} ${item.type === "assistant" ? `message-${item.status}` : ""}`}>
			<div className="message-body">
				<div className={item.type === "user" ? "message-user-bubble" : "message-content-block"}>
					<div className="message-role-label">
						{item.type === "assistant" ? <span className="pi-response-dot" /> : null}
						<strong>
							{item.type === "assistant"
								? `Pi${assistantModel ? ` · ${assistantModel}` : ""}`
								: item.type === "user"
									? "你"
									: "系统"}
						</strong>
						{item.type === "assistant" && assistantStatus ? (
							<span className={`message-status status-${item.status}`}>{assistantStatus}</span>
						) : null}
						{messageTime ? <time>{messageTime}</time> : null}
						{elapsedText ? <span className="message-elapsed">用时 {elapsedText}</span> : null}
					</div>
					{item.type === "assistant" && item.thinking ? (
						<details className="thinking-block">
							<summary>思考过程</summary>
							<p>{item.thinking}</p>
						</details>
					) : null}
					{item.type === "user" && item.images?.length ? (
						<div className="message-image-grid">
							{item.images.map((image) => (
								<img
									key={image.id}
									src={`data:${image.mimeType};base64,${image.data}`}
									alt={image.name}
									title={image.name}
								/>
							))}
						</div>
					) : null}
					{item.type === "assistant" && item.status === "streaming" && !item.text ? (
						<output className="message-streaming-placeholder" aria-live="polite">
							<span className="sr-only">Pi 正在生成回复</span>
							<span aria-hidden="true" />
							<span aria-hidden="true" />
							<span aria-hidden="true" />
						</output>
					) : systemOutputIsLong ? (
						<details className="system-output-fold">
							<summary>
								<span>系统输出</span>
								<small>{item.text.length.toLocaleString()} 字符</small>
							</summary>
							<div className="system-output-content">
								<MessageContent text={item.text} />
							</div>
						</details>
					) : item.text ? (
						<MessageContent text={item.text} />
					) : null}
					{item.type === "user" && item.delivery ? (
						<small className="message-delivery">
							{item.delivery === "steer" ? "已追加到当前运行" : "已排队等待"}
						</small>
					) : null}
					{item.type === "assistant" && showStats ? (
						<StreamStats
							status={item.status}
							text={item.text}
							streamStartedAt={item.streamStartedAt}
							streamStats={item.streamStats}
						/>
					) : null}
				</div>
				{item.text || (item.type === "user" && forkEntryId) ? (
					<div className="message-actions">
						{item.type === "assistant" && forkEntryId ? (
							<button
								className="message-action message-fork"
								type="button"
								aria-label="从这一轮 Fork"
								title="从这一轮 Fork"
								disabled={forkPending}
								onClick={() => onFork?.(forkEntryId)}
							>
								<AppIcon name="branch" size={14} />
								<span>{forkPending ? "Fork 中…" : "Fork"}</span>
							</button>
						) : null}
						{item.text ? (
							<button
								className="message-action message-copy"
								type="button"
								aria-label="复制消息"
								title={copied ? "已复制" : "复制消息"}
								onClick={() => void copyMessage()}
							>
								<AppIcon name="copy" size={14} />
								<span>{copied ? "已复制" : "复制"}</span>
							</button>
						) : null}
					</div>
				) : null}
			</div>
		</div>
	);
});

const TranscriptTurns = memo(function TranscriptTurns({
	items,
	assistantModel,
	modelLabels,
	idPrefix,
	running,
	collapsedRounds,
	onToggleRound,
	forkEntryIds,
	forkingEntryId,
	onFork,
}: {
	items: TranscriptItem[];
	assistantModel?: string;
	/** `${provider}/${id}` → 展示名；历史消息按各自实际使用的模型取名。 */
	modelLabels?: Map<string, string>;
	idPrefix: string;
	/** 当前 Agent 是否在跑，决定最新一轮中间过程是否默认展开。 */
	running: boolean;
	collapsedRounds: Record<string, boolean>;
	onToggleRound(id: string, collapsed: boolean): void;
	forkEntryIds: Map<string, string>;
	forkingEntryId: string | null;
	onFork(entryId: string): void;
}) {
	const turns = groupTranscriptIntoTurns(items);
	const latestTurnId = turns[turns.length - 1]?.id;
	return (
		<>
			{turns.map((turn) => {
				const key = `${idPrefix}:${turn.id}`;
				// 一轮一折：只折中间过程，用户消息与最终结果常显。最新轮运行中展开，结束后默认收起。
				const { head, middle, tail } = splitTurnEntries(turn);
				const finalAssistantIds = new Set(
					tail.filter((entry) => entry.item.type === "assistant").map((entry) => entry.item.id),
				);
				const collapsed = resolveTurnCollapsed(collapsedRounds[key], {
					isLatest: turn.id === latestTurnId,
					running,
				});
				const elapsed = turnElapsedMs(turn);
				const renderEntry = (entry: TranscriptItem, index: number) => {
					const entryModel =
						entry.type === "assistant" && entry.modelId
							? (modelLabels?.get(`${entry.modelProvider ?? ""}/${entry.modelId}`) ?? entry.modelId)
							: assistantModel;
					return (
						<div
							className={`transcript-entry entry-${entry.type}`}
							data-transcript-index={index}
							data-minimap-id={entry.id}
							key={entry.id}
						>
							{entry.type === "tool" ? (
								<ToolCallCard item={entry} />
							) : (
								<TranscriptMessage
									item={entry}
									assistantModel={entryModel}
									showStats={entry.type === "assistant" && !hasLaterAssistant(items, index)}
									forkEntryId={
										entry.type === "assistant" && finalAssistantIds.has(entry.id)
											? forkEntryIds.get(entry.id)
											: undefined
									}
									forkPending={
										entry.type === "assistant" &&
										finalAssistantIds.has(entry.id) &&
										forkEntryIds.get(entry.id) === forkingEntryId
									}
									onFork={onFork}
								/>
							)}
						</div>
					);
				};
				return (
					<section className="turn-group" key={turn.id}>
						{head.map((entry) => renderEntry(entry.item, entry.index))}
						{middle.length > 0 ? (
							<>
								<button
									type="button"
									className="turn-process-toggle"
									aria-expanded={!collapsed}
									onClick={() => onToggleRound(key, !collapsed)}
								>
									<AppIcon name="caret" size={13} className={`turn-caret${collapsed ? "" : " open"}`} />
									<span>{middle.length} 条过程</span>
									{elapsed !== null ? (
										<span className="turn-elapsed">用时 {formatTurnElapsed(elapsed)}</span>
									) : null}
								</button>
								{collapsed ? null : middle.map((entry) => renderEntry(entry.item, entry.index))}
							</>
						) : null}
						{tail.map((entry) => renderEntry(entry.item, entry.index))}
					</section>
				);
			})}
		</>
	);
});

function clientErrorMessage(caught: unknown, fallback: string): string {
	let message = caught instanceof Error ? caught.message : typeof caught === "string" ? caught : fallback;
	message = message.replace(/^Error invoking remote method '[^']+': Error:\s*/i, "");
	if (/Agent is already processing/i.test(message)) {
		return "Pi Agent 正在处理上一条消息。新消息会作为 steering 指令追加，请重试一次。";
	}
	if (/Timed out waiting for Pi RPC response/i.test(message)) {
		return `Pi RPC 响应超时：${message}`;
	}
	if (/Pi RPC process is not available|pipe.*closed|stdin/i.test(message)) {
		return "Pi Agent 连接已经断开，请重新打开当前 Agent 以恢复 Session。";
	}
	return message || fallback;
}

function Chevron({ expanded }: { expanded: boolean }) {
	return <AppIcon name="chevron" size={15} className={`chevron ${expanded ? "expanded" : ""}`} />;
}

function IconButton({
	label,
	active,
	onClick,
	children,
}: {
	label: string;
	active?: boolean;
	onClick(): void;
	children: React.ReactNode;
}) {
	return (
		<button
			className={`icon-button${active ? " active" : ""}`}
			type="button"
			aria-label={label}
			title={label}
			aria-pressed={active ?? false}
			onClick={onClick}
		>
			{children}
		</button>
	);
}

function formatTokenCount(value: number): string {
	return new Intl.NumberFormat(undefined, {
		notation: value >= 10_000 ? "compact" : "standard",
		maximumFractionDigits: value >= 10_000 ? 1 : 0,
	}).format(value);
}

function ContextGauge({ snapshot, onClick }: { snapshot?: AgentSessionSnapshot; onClick(): void }) {
	const usage = snapshot?.contextUsage;
	const percent =
		usage?.percent ?? (usage?.tokens === null || !usage ? null : (usage.tokens / usage.contextWindow) * 100);
	const level =
		percent !== null && percent >= 95
			? "critical"
			: percent !== null && percent >= 85
				? "high"
				: percent !== null && percent >= 70
					? "watch"
					: "normal";
	const label = usage
		? `${usage.tokens === null ? "—" : formatTokenCount(usage.tokens)} / ${formatTokenCount(usage.contextWindow)}`
		: "正在读取";
	const roundedPercent = percent === null ? null : Math.min(100, Math.max(0, percent));
	const tooltip = usage
		? `上下文 ${label} · ${roundedPercent === null ? "等待下一次回复" : `已使用 ${Math.round(roundedPercent)}%`}`
		: "正在读取上下文容量";
	return (
		<button
			className={`context-gauge context-${level} ${usage ? "" : "context-unknown"}`}
			type="button"
			onClick={onClick}
			aria-label={`${tooltip}。点击查看 Session 统计`}
		>
			<span
				className="context-gauge-ring"
				style={{ background: `conic-gradient(var(--context-gauge-color) ${roundedPercent ?? 0}%, #d9ded9 0)` }}
				aria-hidden="true"
			/>
			<span className="context-gauge-value" aria-hidden="true">
				{roundedPercent === null ? "—" : Math.round(roundedPercent)}
			</span>
			<span className="context-gauge-tooltip" role="tooltip">
				<strong>上下文容量</strong>
				<span>{label}</span>
				<small>{roundedPercent === null ? "等待下一次模型回复" : `已使用 ${Math.round(roundedPercent)}%`}</small>
			</span>
		</button>
	);
}

interface TranscriptMarker {
	id: string;
	preview: string;
	turn: number;
}

function compactTranscriptText(value: string, maximum: number): string {
	const normalized = value.replace(/\s+/g, " ").trim();
	return normalized.length > maximum ? `${normalized.slice(0, maximum)}…` : normalized;
}

/** 定位条只标记用户消息：用户要的是"我发过什么"，不是回复。 */
function buildTranscriptMarkers(items: TranscriptItem[]): TranscriptMarker[] {
	const markers: TranscriptMarker[] = [];
	let turn = 0;
	for (const item of items) {
		if (item.type !== "user") continue;
		turn += 1;
		markers.push({
			id: item.id,
			preview: compactTranscriptText(item.text, 140) || "图片消息",
			turn,
		});
	}
	return markers;
}

const MINIMAP_MAGNIFY_RADIUS = 46;
const MINIMAP_MAGNIFY_BOOST = 1.35;
/** 定位条一次最多显示多少条；超出后用滚轮上下翻窗口。 */
const MINIMAP_VISIBLE_MAX = 20;
/** 新滚进来的刻度先亮黄色，这段时间后回归蓝色。 */
const MINIMAP_SCROLLED_IN_MS = 700;

function TranscriptMinimap({
	items,
	onJump,
	scrollRef,
}: {
	items: TranscriptItem[];
	onJump(entryId: string): void;
	scrollRef: MutableRefObject<HTMLDivElement | null>;
}) {
	const markers = useMemo(() => buildTranscriptMarkers(items), [items]);
	const markerIdSet = useMemo(() => new Set(markers.map((marker) => marker.id)), [markers]);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [overflows, setOverflows] = useState(false);
	const [windowStart, setWindowStart] = useState(0);
	/** 本次窗口变化里新滚进来的刻度，用黄色区分；下次窗口变化时重新计算。 */
	const [scrolledInIds, setScrolledInIds] = useState<Set<string>>(new Set());
	const scrollable = markers.length > MINIMAP_VISIBLE_MAX;
	const railRef = useRef<HTMLElement | null>(null);
	const tickRefs = useRef(new Map<string, HTMLButtonElement>());
	const cachedOffsetsRef = useRef<{ id: string; offset: number }[]>([]);
	const activeIdRef = useRef<string | null>(null);
	const overflowsRef = useRef(false);
	const frameRef = useRef(0);
	const previousWindowIdsRef = useRef<Set<string>>(new Set());
	const scrolledInTimerRef = useRef(0);

	// 从 DOM 采样 marker 的绝对偏移；marker 锚定 user 消息节点，一定已渲染。
	const recomputeOffsets = useCallback(() => {
		const element = scrollRef.current;
		if (!element) {
			cachedOffsetsRef.current = [];
			return;
		}
		const baseTop = element.getBoundingClientRect().top;
		const offsets: { id: string; offset: number }[] = [];
		element.querySelectorAll<HTMLElement>("[data-minimap-id]").forEach((node) => {
			const id = node.dataset.minimapId ?? "";
			if (!markerIdSet.has(id)) return;
			offsets.push({ id, offset: node.getBoundingClientRect().top - baseTop + element.scrollTop });
		});
		cachedOffsetsRef.current = offsets;
	}, [markerIdSet, scrollRef]);

	// 缓存偏移 + 二分查找当前 marker，视口上方 30% 作为锚点（参考项目做法）。
	const updateActive = useCallback(() => {
		const element = scrollRef.current;
		if (!element) return;
		const offsets = cachedOffsetsRef.current;
		if (offsets.length === 0) {
			if (activeIdRef.current !== null) {
				activeIdRef.current = null;
				setActiveId(null);
			}
			return;
		}
		const anchor = element.scrollTop + element.clientHeight * 0.3;
		let low = 0;
		let high = offsets.length - 1;
		while (low < high) {
			const mid = (low + high + 1) >>> 1;
			if (offsets[mid].offset <= anchor) low = mid;
			else high = mid - 1;
		}
		const id = offsets[low].id;
		if (id !== activeIdRef.current) {
			activeIdRef.current = id;
			setActiveId(id);
		}
	}, [scrollRef]);

	const updateOverflow = useCallback(() => {
		const element = scrollRef.current;
		if (!element) {
			if (overflowsRef.current) {
				overflowsRef.current = false;
				setOverflows(false);
			}
			return;
		}
		const next = element.scrollHeight - element.clientHeight > 1;
		if (next !== overflowsRef.current) {
			overflowsRef.current = next;
			setOverflows(next);
		}
	}, [scrollRef]);

	useEffect(() => {
		recomputeOffsets();
		updateActive();
		updateOverflow();
	}, [recomputeOffsets, updateActive, updateOverflow]);

	// 滚动、内容高度与视口变化都会移动 marker 与 active，按帧合并。
	useEffect(() => {
		const element = scrollRef.current;
		if (!element) return;
		let scrollFrame = 0;
		let resizeFrame = 0;
		const scheduleScroll = (): void => {
			cancelAnimationFrame(scrollFrame);
			scrollFrame = requestAnimationFrame(() => {
				updateActive();
				updateOverflow();
			});
		};
		const scheduleResize = (): void => {
			cancelAnimationFrame(resizeFrame);
			resizeFrame = requestAnimationFrame(() => {
				recomputeOffsets();
				updateActive();
				updateOverflow();
			});
		};
		recomputeOffsets();
		element.addEventListener("scroll", scheduleScroll, { passive: true });
		const content = element.firstElementChild;
		const observer = content && typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleResize) : null;
		if (observer && content) observer.observe(content);
		window.addEventListener("resize", scheduleResize);
		return () => {
			element.removeEventListener("scroll", scheduleScroll);
			observer?.disconnect();
			cancelAnimationFrame(scrollFrame);
			cancelAnimationFrame(resizeFrame);
			window.removeEventListener("resize", scheduleResize);
		};
	}, [recomputeOffsets, scrollRef, updateActive, updateOverflow]);

	// active 跑出窗口时把窗口移到它附近，保证高亮始终可见。
	useEffect(() => {
		if (markers.length <= MINIMAP_VISIBLE_MAX) return;
		const index = markers.findIndex((marker) => marker.id === activeId);
		if (index < 0) return;
		setWindowStart((current) => {
			if (index >= current && index < current + MINIMAP_VISIBLE_MAX) return current;
			const maxStart = markers.length - MINIMAP_VISIBLE_MAX;
			return Math.min(Math.max(index - Math.floor(MINIMAP_VISIBLE_MAX / 2), 0), maxStart);
		});
	}, [activeId, markers]);

	/*
	 * 和上一次窗口的 id 做差集，只给这次新滚进来的刻度亮黄色；700ms 后回归蓝色。
	 * 上次已经在窗口里的始终是蓝色，窗口本身也始终是 20 条。
	 */
	useEffect(() => {
		const start = Math.min(windowStart, Math.max(0, markers.length - MINIMAP_VISIBLE_MAX));
		const current = new Set(markers.slice(start, start + MINIMAP_VISIBLE_MAX).map((marker) => marker.id));
		const previous = previousWindowIdsRef.current;
		previousWindowIdsRef.current = current;
		if (previous.size === 0) return;
		const added = [...current].filter((id) => !previous.has(id));
		if (added.length === 0) return;
		window.clearTimeout(scrolledInTimerRef.current);
		setScrolledInIds(new Set(added));
		scrolledInTimerRef.current = window.setTimeout(() => setScrolledInIds(new Set()), MINIMAP_SCROLLED_IN_MS);
	}, [windowStart, markers]);

	// 滚轮上下翻定位条窗口。非 passive 监听，避免和转录区滚动争抢。
	useEffect(() => {
		// rail 只有 overflows 时才挂载，因此这个值必须参与依赖以重挂监听。
		void overflows;
		const rail = railRef.current;
		if (!rail || markers.length <= MINIMAP_VISIBLE_MAX) return;
		const maxStart = markers.length - MINIMAP_VISIBLE_MAX;
		const onWheel = (event: WheelEvent): void => {
			if (event.deltaY === 0) return;
			event.preventDefault();
			const step = event.deltaY > 0 ? 1 : -1;
			setWindowStart((current) => Math.min(Math.max(current + step, 0), maxStart));
		};
		rail.addEventListener("wheel", onWheel, { passive: false });
		return () => rail.removeEventListener("wheel", onWheel);
	}, [markers.length, overflows]);

	function applyMagnify(clientY: number): void {
		const rail = railRef.current;
		if (!rail) return;
		const y = clientY - rail.getBoundingClientRect().top;
		cancelAnimationFrame(frameRef.current);
		frameRef.current = requestAnimationFrame(() => {
			for (const tick of tickRefs.current.values()) {
				const center = tick.offsetTop + tick.offsetHeight / 2;
				const distance = Math.abs(y - center);
				const falloff =
					distance >= MINIMAP_MAGNIFY_RADIUS ? 0 : Math.cos((distance / MINIMAP_MAGNIFY_RADIUS) * (Math.PI / 2));
				tick.style.setProperty("--minimap-magnify", String(1 + (MINIMAP_MAGNIFY_BOOST - 1) * falloff));
			}
		});
	}

	function resetMagnify(): void {
		cancelAnimationFrame(frameRef.current);
		for (const tick of tickRefs.current.values()) tick.style.setProperty("--minimap-magnify", "1");
	}

	useEffect(
		() => () => {
			cancelAnimationFrame(frameRef.current);
			window.clearTimeout(scrolledInTimerRef.current);
		},
		[],
	);

	if (markers.length < 2 || !overflows) return null;
	const maxStart = Math.max(0, markers.length - MINIMAP_VISIBLE_MAX);
	const visibleStart = Math.min(windowStart, maxStart);
	const visibleMarkers = markers.slice(visibleStart, visibleStart + MINIMAP_VISIBLE_MAX);
	return (
		<nav
			className="transcript-minimap"
			aria-label="对话快速定位"
			ref={railRef}
			style={{ "--transcript-marker-count": markers.length } as CSSProperties}
			data-scrollable={scrollable ? "true" : "false"}
			onMouseMove={(event) => applyMagnify(event.clientY)}
			onMouseLeave={resetMagnify}
		>
			{visibleMarkers.map((marker, visibleIndex) => {
				const offset = visibleIndex - (visibleMarkers.length - 1) / 2;
				const label = `第 ${marker.turn} 轮：${marker.preview}`;
				return (
					<button
						key={marker.id}
						type="button"
						ref={(element) => {
							if (element) tickRefs.current.set(marker.id, element);
							else tickRefs.current.delete(marker.id);
						}}
						className={`transcript-minimap-tick tick-user${
							scrolledInIds.has(marker.id) ? " tick-scrolled-in" : ""
						}${marker.id === activeId ? " active" : ""}`}
						style={{ top: `calc(50% + ${offset * 20}px)` }}
						onClick={() => onJump(marker.id)}
						aria-label={label}
					>
						<span className="transcript-minimap-preview" role="tooltip">
							<strong>第 {marker.turn} 轮 · 你的消息</strong>
							<span>{marker.preview}</span>
							<small>点击跳到这条消息</small>
						</span>
					</button>
				);
			})}
		</nav>
	);
}

const demoMode = import.meta.env.DEV && new URLSearchParams(window.location.search).has("demo");

type SettingsSectionId =
	| "runtime"
	| "shell"
	| "tools"
	| "codemode"
	| "cache-warming"
	| "compaction"
	| "diagnostics"
	| "providers"
	| "llama"
	| "mcp"
	| "share"
	| "skills"
	| "prompts"
	| "packages";

const SETTINGS_NAV: { label: string; items: { id: SettingsSectionId; label: string; icon: AppIconName }[] }[] = [
	{
		label: "常规",
		items: [
			{ id: "runtime", label: "Pi 运行时", icon: "settings" },
			{ id: "shell", label: "Shell", icon: "terminal" },
			{ id: "tools", label: "工具", icon: "wrench" },
			{ id: "codemode", label: "Codemode", icon: "braces" },
			{ id: "cache-warming", label: "缓存预热", icon: "cloud" },
			{ id: "compaction", label: "上下文压缩", icon: "gauge" },
			{ id: "diagnostics", label: "诊断", icon: "bug" },
		],
	},
	{
		label: "集成",
		items: [
			{ id: "providers", label: "Provider 与模型", icon: "globe" },
			{ id: "llama", label: "llama.cpp", icon: "hard-drive" },
			{ id: "mcp", label: "MCP 服务", icon: "plug" },
			{ id: "share", label: "分享", icon: "share" },
		],
	},
	{
		label: "Agent",
		items: [
			{ id: "skills", label: "Agent Skills", icon: "sparkles" },
			{ id: "prompts", label: "Prompt 模板", icon: "message-question" },
			{ id: "packages", label: "Pi Packages", icon: "package" },
		],
	},
];

const demoSessionSnapshot: AgentSessionSnapshot = {
	sessionId: "demo-session",
	sessionName: "FEAT-001 Coding Agent",
	messageCount: 6,
	pendingMessageCount: 0,
	isStreaming: false,
	isCompacting: false,
	contextUsage: { tokens: 42500, contextWindow: 128000, percent: 33.2 },
	leafId: "assistant-3",
	nodes: [
		{
			entryId: "user-1",
			parentId: null,
			type: "message",
			role: "user",
			text: "按照交接文档实现登录功能，并给出关键修改。",
			timestamp: "2026-09-17T02:10:00.000Z",
			depth: 0,
			isLeaf: false,
			forkable: true,
		},
		{
			entryId: "assistant-1",
			parentId: "user-1",
			type: "message",
			role: "assistant",
			text: "我会先检查交接文档和现有认证代码。",
			timestamp: "2026-09-17T02:10:08.000Z",
			depth: 1,
			isLeaf: false,
			forkable: false,
		},
		{
			entryId: "user-2",
			parentId: "assistant-1",
			type: "message",
			role: "user",
			text: "先不要接第三方登录，只保留扩展接口。",
			timestamp: "2026-09-17T02:18:00.000Z",
			depth: 2,
			isLeaf: false,
			forkable: true,
		},
		{
			entryId: "assistant-2",
			parentId: "user-2",
			type: "message",
			role: "assistant",
			text: "已完成账号密码登录和扩展接口，并补充了基础测试。",
			timestamp: "2026-09-17T02:25:00.000Z",
			depth: 3,
			isLeaf: false,
			forkable: false,
		},
		{
			entryId: "user-3",
			parentId: "assistant-2",
			type: "message",
			role: "user",
			text: "修复 Review Agent 提出的会话过期边界问题。",
			timestamp: "2026-09-17T02:31:00.000Z",
			depth: 4,
			isLeaf: false,
			forkable: true,
		},
		{
			entryId: "assistant-3",
			parentId: "user-3",
			type: "message",
			role: "assistant",
			text: "边界问题已修复，OpenSpec 任务状态和验证结果已更新。",
			timestamp: "2026-09-17T02:38:00.000Z",
			depth: 5,
			isLeaf: true,
			forkable: false,
		},
	],
};

const demoSessionStats: AgentSessionStats = {
	sessionId: "demo-session",
	sessionFile: "C:\\Users\\demo\\.pi\\agent\\sessions\\demo-session.jsonl",
	userMessages: 3,
	assistantMessages: 4,
	toolCalls: 6,
	toolResults: 6,
	totalMessages: 7,
	tokens: {
		input: 42_500,
		output: 8_200,
		cacheRead: 18_400,
		cacheWrite: 3_100,
		total: 72_200,
	},
	cost: 0.184,
	contextUsage: { tokens: 42_500, contextWindow: 128_000, percent: 33.2 },
	cacheWarming: {
		mode: "streaming",
		showCacheMissNotices: false,
		decision: {
			warmCost: 0.0021,
			missCost: 0.034,
			continuationProbability: 1,
			expectedSavings: 0.0319,
			action: "warm",
			updatedAt: "2026-10-06T03:20:00.000Z",
		},
	},
};

const demoAgentCommands: AgentCommandOption[] = [
	{ name: "settings", command: "/settings", description: "Open settings menu", source: "builtin" },
	{
		name: "model",
		command: "/model",
		description: "Select model (opens selector UI)",
		argumentHint: "<provider/model>",
		source: "builtin",
	},
	{ name: "tree", command: "/tree", description: "Navigate session tree (switch branches)", source: "builtin" },
	{
		name: "thinking",
		command: "/thinking",
		description: "Set thinking level",
		argumentHint: "<level>",
		source: "builtin",
	},
	{ name: "export", command: "/export", description: "Export session", argumentHint: "[path]", source: "builtin" },
	{ name: "share", command: "/share", description: "Share session as a secret GitHub gist", source: "builtin" },
	{ name: "debug", command: "/debug", description: "Export a local diagnostics package", source: "builtin" },
	{ name: "copy", command: "/copy", description: "Copy last agent message to clipboard", source: "builtin" },
	{ name: "llama", command: "/llama", description: "Manage llama.cpp router models", source: "builtin" },
	{
		name: "name",
		command: "/name",
		description: "Query or set the current session display name",
		argumentHint: "[name]",
		source: "builtin",
	},
	{ name: "session", command: "/session", description: "Show session info and stats", source: "builtin" },
	{ name: "fork", command: "/fork", description: "Create a new fork from a previous user message", source: "builtin" },
	{
		name: "clone",
		command: "/clone",
		description: "Duplicate the current session at the current position",
		source: "builtin",
	},
	{ name: "new", command: "/new", description: "Start a new session", source: "builtin" },
	{ name: "compact", command: "/compact", description: "Manually compact the session context", source: "builtin" },
	{
		name: "reload",
		command: "/reload",
		description: "Reload extensions, skills, prompts and context",
		source: "builtin",
	},
	{
		name: "skill:grill",
		command: "/skill:grill",
		description: "Clarify requirements with focused questions",
		source: "skill",
	},
];

const demoModelSelection: AgentModelSelection = {
	model: { provider: "openai", id: "gpt-5.5", name: "GPT-5.5", reasoning: true },
	thinkingLevel: "medium",
	availableThinkingLevels: ["off", "low", "medium", "high", "xhigh"],
	enabledModelIds: ["openai/gpt-5.5", "anthropic/claude-sonnet-4-6"],
	availableModels: [
		{ provider: "openai", id: "gpt-5.5", name: "GPT-5.5", reasoning: true },
		{ provider: "openai", id: "gpt-5.4-mini", name: "GPT-5.4 Mini", reasoning: true },
		{ provider: "anthropic", id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", reasoning: true },
		{ provider: "custom-team", id: "deepseek-v3", name: "DeepSeek V3", reasoning: false },
	],
};

/**
 * 一个常驻会话面板。DOM 归它自己所有，切换 Agent 只是显隐其它面板，
 * 不会把这个滚动容器重指到别的会话数据，所以滚动位置天然保留。
 * 这是参考项目 PI-Desktop `SessionPane` 的做法。
 */
const TranscriptPane = memo(function TranscriptPane({
	agentId,
	displayName,
	kickoffPrompt,
	items,
	activity,
	assistantModel,
	modelLabels,
	running,
	visible,
	resetKey,
	collapsedRounds,
	onToggleRound,
	forkEntryIds,
	forkingEntryId,
	onFork,
	initialOffset,
	onScrollPosition,
	onElement,
	onShowJumpChange,
	onController,
	onUseKickoff,
}: {
	agentId: string;
	displayName: string;
	kickoffPrompt?: string;
	items: TranscriptItem[];
	activity?: AgentActivity;
	assistantModel?: string;
	modelLabels?: Map<string, string>;
	running: boolean;
	visible: boolean;
	/** 会话切换时变化，用于把滚动重置为贴底。 */
	resetKey: string;
	collapsedRounds: Record<string, boolean>;
	onToggleRound(id: string, collapsed: boolean): void;
	forkEntryIds: Map<string, string>;
	forkingEntryId: string | null;
	onFork(entryId: string): void;
	initialOffset: number | null;
	onScrollPosition(offset: number): void;
	onElement(agentId: string, element: HTMLDivElement | null): void;
	onShowJumpChange(showJump: boolean): void;
	onController(controller: { runJump: (position: () => void) => void; jumpToLatest: () => void } | null): void;
	onUseKickoff(): void;
}) {
	const scroll = useTranscriptScroll({
		initialOffset,
		isRunning: running,
		contentLength: items.length,
		visible,
		resetKey,
		onScrollPosition,
	});
	useEffect(() => {
		onElement(agentId, scroll.scrollRef.current);
		return () => onElement(agentId, null);
	}, [agentId, onElement, scroll.scrollRef]);
	useEffect(() => {
		onShowJumpChange(scroll.showJump);
	}, [onShowJumpChange, scroll.showJump]);
	useEffect(() => {
		onController({ runJump: scroll.runJump, jumpToLatest: scroll.jumpToLatest });
		return () => onController(null);
	}, [onController, scroll.runJump, scroll.jumpToLatest]);

	return (
		<div
			className="transcript-pane"
			data-visible={visible ? "true" : "false"}
			aria-hidden={visible ? undefined : true}
			inert={visible ? undefined : true}
		>
			<div className="transcript" ref={scroll.scrollRef} onScroll={scroll.handleScroll}>
				<div className="transcript-content" ref={scroll.contentRef}>
					{items.length === 0 ? (
						<div className="transcript-placeholder compact">
							<div className="state-mark state-mark-conversation">
								<AppIcon name="message-question" size={18} />
							</div>
							<h2>{displayName}</h2>
							<p>发送一条消息开始工作。Agent 会检查当前工作目录中实际存在的材料。</p>
							{kickoffPrompt ? (
								<button className="quick-start-button" type="button" onClick={onUseKickoff}>
									使用默认交接提示
								</button>
							) : null}
						</div>
					) : (
						<TranscriptTurns
							items={items}
							assistantModel={assistantModel}
							modelLabels={modelLabels}
							idPrefix={agentId}
							running={running}
							collapsedRounds={collapsedRounds}
							onToggleRound={onToggleRound}
							forkEntryIds={forkEntryIds}
							forkingEntryId={forkingEntryId}
							onFork={onFork}
						/>
					)}
					{activity ? (
						<div className="transcript-runtime-status">
							<output className={`agent-activity activity-${activity.kind}`} aria-live="polite">
								<span className="activity-dots" aria-hidden="true">
									<span />
									<span />
									<span />
								</span>
								<span className="activity-label">{activity.label}</span>
								{activity.queued > 0 ? <small>{activity.queued} 条排队</small> : null}
							</output>
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
});

export function App() {
	const [project, setProject] = useState<ProjectSummary | null>(demoMode ? demoProject : null);
	const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
	const [selection, setSelection] = useState<Selection>(demoMode ? { type: "project" } : { type: "welcome" });
	const [expanded, setExpanded] = useState<Set<string>>(
		new Set(demoMode ? ["project:demo-project", "lane:requirements", "lane:bugs", "work-item:FEAT-001"] : []),
	);
	const [dialog, setDialog] = useState<WorkItemDialogState | null>(null);
	const [sessionNotice, setSessionNotice] = useState<string | null>(null);
	const [renameDialog, setRenameDialog] = useState<RenameDialogState | null>(null);
	const [sessionRenameDialog, setSessionRenameDialog] = useState<SessionRenameDialogState | null>(null);
	const [sessionDeleteDialog, setSessionDeleteDialog] = useState<SessionDeleteDialogState | null>(null);
	const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null);
	const [resetAgentDialog, setResetAgentDialog] = useState<ResetAgentDialogState | null>(null);
	const [shellRestartDialog, setShellRestartDialog] = useState(false);
	const [cacheWarmingSaving, setCacheWarmingSaving] = useState(false);
	const [agentActionsOpen, setAgentActionsOpen] = useState<string | null>(null);
	const [sessionPanel, setSessionPanel] = useState<SessionPanelState | null>(null);
	const [sessionPanelLoading, setSessionPanelLoading] = useState(false);
	const [sessionCreateDraft, setSessionCreateDraft] = useState<SessionCreateDraft | null>(null);
	const [sessionCreateError, setSessionCreateError] = useState<string | null>(null);
	const [sessionStatsDialog, setSessionStatsDialog] = useState<SessionStatsDialogState | null>(null);
	const [sessionStats, setSessionStats] = useState<AgentSessionStats | null>(null);
	const [sessionStatsLoading, setSessionStatsLoading] = useState(false);
	const [sessionShareDialog, setSessionShareDialog] = useState<SessionShareDialogState | null>(null);
	const [sessionShareBusy, setSessionShareBusy] = useState(false);
	const [forkingEntryId, setForkingEntryId] = useState<string | null>(null);
	const [authDialogMode, setAuthDialogMode] = useState<"login" | "logout" | null>(null);
	const [authProviders, setAuthProviders] = useState<AuthProviderSummary[]>([]);
	const [authProviderId, setAuthProviderId] = useState<string | null>(null);
	const [authMethod, setAuthMethod] = useState<AuthMethodType | null>(null);
	const [authRequestId, setAuthRequestId] = useState<string | null>(null);
	const [authPrompt, setAuthPrompt] = useState<AuthPromptRequest | null>(null);
	const [authPromptValue, setAuthPromptValue] = useState("");
	const [authMessage, setAuthMessage] = useState<string | null>(null);
	const [authError, setAuthError] = useState<string | null>(null);
	const [authBusy, setAuthBusy] = useState(false);
	const [providerSettingsRefreshToken, setProviderSettingsRefreshToken] = useState(0);
	const [writeLeaseDialog, setWriteLeaseDialog] = useState<ProjectWriteLeaseStatus | null>(null);
	const [busy, setBusy] = useState(false);
	const [searchOpen, setSearchOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [extensionDialog, setExtensionDialog] = useState<ExtensionDialogState | null>(null);
	const [settingsStatus, setSettingsStatus] = useState<SettingsStatus | null>(null);
	const [projectTrustStatus, setProjectTrustStatus] = useState<ProjectTrustStatus | null>(null);
	const [projectTrustBusy, setProjectTrustBusy] = useState(false);
	const [projectTrustPromptOpen, setProjectTrustPromptOpen] = useState(false);
	const [piRuntimeStatus, setPiRuntimeStatus] = useState<PiRuntimeStatus | null>(null);
	const [piRuntimeBusy, setPiRuntimeBusy] = useState<"check" | "install" | "rollback" | null>(null);
	const [settingsSection, setSettingsSection] = useState<SettingsSectionId>("runtime");
	const [piUpdateConfirm, setPiUpdateConfirm] = useState(false);
	const [shellPath, setShellPath] = useState("");
	const [shellCommandPrefix, setShellCommandPrefix] = useState("");
	const [shellCommandPrefixSaving, setShellCommandPrefixSaving] = useState(false);
	const [shellCommandPrefixError, setShellCommandPrefixError] = useState<string | null>(null);
	const [availableSkills, setAvailableSkills] = useState<AgentSkillSummary[]>([]);
	const [roleSkillAssignments, setRoleSkillAssignments] = useState<RoleSkillAssignments>({
		"requirement-analysis": [],
		coding: [],
		"bug-fix": [],
		review: [],
	});
	const [roleSkillSaving, setRoleSkillSaving] = useState<AgentRole | null>(null);
	const [transcripts, setTranscripts] = useState<Record<string, TranscriptItem[]>>(
		demoMode
			? {
					"CODE-001": [
						{
							id: "demo-user",
							type: "user",
							text: "按照交接文档实现登录功能，并给出关键修改。",
							createdAt: "2026-09-17T09:30:00.000Z",
						},
						{
							id: "demo-assistant",
							type: "assistant",
							text: "我会先检查现有工作区面板实现，再补上文件差异和命令输出视图。",
							status: "complete",
							streamStats: { tokens: 82, estimated: false, elapsedMs: 3200 },
						},
						{
							id: "demo-tool-read-work-panel",
							type: "tool",
							name: "read",
							args: '{"filePath":"packages/codepiddy-desktop/src/renderer/components/WorkPanel.tsx"}',
							text: 'export const WorkPanel = memo(function WorkPanel({ projectRoot, toolItems }) {\n  const [fileState, setFileState] = useState<FileState | null>(null);\n  return <aside className="work-panel" aria-label="文件管理器" />;\n});',
							status: "completed",
							isError: false,
						},
						{
							id: "demo-tool-codemode",
							type: "tool",
							name: "codemode",
							args: JSON.stringify({
								code: 'const files = await tools.find({ pattern: "**/*.ts" });\nconst target = files.split("\\n").find((file) => file.includes("WorkPanel"));\nreturn tools.read({ path: target });',
							}),
							text: "Tool calls made:\n- find (ok, 24ms)\n- read (ok, 11ms)\n\nexport const WorkPanel = memo(function WorkPanel({ projectRoot, toolItems }) { ... });",
							details: {
								calls: [
									{
										id: "demo-codemode-find",
										name: "find",
										args: '{"pattern":"**/*.ts"}',
										status: "ok",
										durationMs: 24,
									},
									{
										id: "demo-codemode-read",
										name: "read",
										args: '{"path":"packages/codepiddy-desktop/src/renderer/components/WorkPanel.tsx"}',
										status: "ok",
										durationMs: 11,
									},
								],
								fullOutputPath: "C:\\Users\\demo\\AppData\\Local\\Temp\\pi-codemode-demo.txt",
							},
							status: "completed",
							isError: false,
						},
						{
							id: "demo-tool-edit-work-panel",
							type: "tool",
							name: "edit",
							args: '{"filePath":"packages/codepiddy-desktop/src/renderer/components/WorkPanel.tsx","oldText":"<strong>文件管理器</strong>","newText":"工作区视图"}',
							text: '@@ -1,6 +1,8 @@\n-<strong>文件管理器</strong>\n+<div className="work-panel-tabs">\n+  <button>文件</button>\n+  <button>更改</button>\n+  <button>运行</button>\n+</div>\n <div className="file-tree">',
							status: "completed",
							isError: false,
						},
						{
							id: "demo-tool-run-check",
							type: "tool",
							name: "bash",
							args: '{"command":"npm run check"}',
							text: "> biome check --write --error-on-warnings .\nChecked 664 files in 504ms. No fixes applied.\n> tsgo --noEmit\n> check:browser-smoke",
							status: "completed",
							isError: false,
						},
						{
							id: "demo-assistant-final",
							type: "assistant",
							text: "工作区面板已补齐文件、更改和运行视图。\n\n```ts\nconst entries = toolItems.map(projectToolToPanel).filter(Boolean);\n```\n\n基础检查已经通过，工作区导航和 diff 展示已更新。",
							status: "complete",
							streamStats: { tokens: 150, estimated: false, elapsedMs: 6000 },
						},
					],
				}
			: {},
	);
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const [collapsedRounds, setCollapsedRounds] = useState<Record<string, boolean>>({});
	// 右侧工作区面板启动时始终收起；宽度记忆仍然保留，只有可见性不跨会话恢复。
	const [workPanelVisible, setWorkPanelVisible] = useState(false);
	const [sidebarWidth, setSidebarWidth] = useState(loadStoredSidebarWidth);
	const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
	const [agentActivities, setAgentActivities] = useState<Record<string, AgentActivity>>(
		demoMode ? { "CODE-001": { label: "Pi 正在处理", kind: "working", queued: 0 } } : {},
	);
	const [pendingExtensionUiRequests, setPendingExtensionUiRequests] = useState<
		Record<string, PendingExtensionUiRequest>
	>({});
	const [deferredExtensionUiAgentId, setDeferredExtensionUiAgentId] = useState<string | null>(null);
	const [toolRecoveryOffers, setToolRecoveryOffers] = useState<Record<string, ToolRecoveryOffer>>({});
	const [agentSessionSnapshots, setAgentSessionSnapshots] = useState<Record<string, AgentSessionSnapshot>>(
		demoMode ? { "CODE-001": demoSessionSnapshot } : {},
	);
	const [abortingAgents, setAbortingAgents] = useState<Record<string, boolean>>({});
	const [agentCommandsLoading, setAgentCommandsLoading] = useState<Record<string, boolean>>({});
	const [agentCommands, setAgentCommands] = useState<Record<string, AgentCommandOption[]>>(
		demoMode
			? {
					"CODE-001": demoAgentCommands,
					"RA-001": demoAgentCommands,
					"RA-002": demoAgentCommands,
					"FIX-001": demoAgentCommands,
				}
			: {},
	);
	const [modelSelections, setModelSelections] = useState<Record<string, AgentModelSelection>>(
		demoMode
			? {
					"CODE-001": demoModelSelection,
					"RA-001": demoModelSelection,
					"RA-002": demoModelSelection,
					"FIX-001": demoModelSelection,
				}
			: {},
	);
	const [imageAttachments, setImageAttachments] = useState<Record<string, AgentImageAttachment[]>>({});
	const [modelPickerAgentId, setModelPickerAgentId] = useState<string | null>(null);
	const [modelPickerBusy, setModelPickerBusy] = useState(false);
	const [modelSearch, setModelSearch] = useState("");
	const [modelPickerSelectedIndex, setModelPickerSelectedIndex] = useState(0);
	const [fileMatches, setFileMatches] = useState<string[]>([]);
	const activeAssistantIds = useRef(new Map<string, string>());
	const pendingToolFailures = useRef(new Map<string, ToolRecoveryOffer>());
	const extensionUiResponsesInFlight = useRef(new Set<string>());
	const agentCommandLoads = useRef(new Map<string, Promise<AgentCommandOption[]>>());
	const activatedAgentKey = useRef<string | null>(null);
	const lastActiveAgentLocatorRef = useRef<AgentInstanceLocator | null>(null);
	const projectRef = useRef<ProjectSummary | null>(project);
	const imageInputRef = useRef<HTMLInputElement | null>(null);
	const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
	const modelSearchInputRef = useRef<HTMLInputElement | null>(null);
	const modelListRef = useRef<HTMLDivElement | null>(null);
	const modelPickerRef = useRef<HTMLDivElement | null>(null);
	const modelPickerInitializedRef = useRef<string | null>(null);
	const modelPickerKeyboardScrollRef = useRef(false);
	const modelPickerSelectedIndexRef = useRef(0);
	const scrollPositions = useRef<Record<string, number | undefined>>({});
	const restoredProjectUiRoots = useRef(new Set<string>());
	const restoringProjectUiRoots = useRef(new Set<string>());
	const restoredAgentUiIds = useRef(new Set<string>());
	const restoringAgentUiIds = useRef(new Set<string>());
	const agentUiSaveTimers = useRef(new Map<string, number>());
	const showJumpByAgentRef = useRef<Record<string, boolean>>({});
	const unreadCountsRef = useRef<Record<string, number>>({});
	const paneElementsRef = useRef(new Map<string, HTMLDivElement>());
	const activeTranscriptRef = useRef<HTMLDivElement | null>(null);
	const sidebarResizeStartRef = useRef(sidebarWidth);
	const sidebarResizeLatestRef = useRef(sidebarWidth);
	const [retainedAgentIds, setRetainedAgentIds] = useState<string[]>([]);

	const selectedWorkItem = useMemo(() => {
		if (
			!project ||
			selection.type === "welcome" ||
			selection.type === "project" ||
			selection.type === "lane" ||
			selection.type === "settings"
		)
			return null;
		return (
			project.lanes
				.find((lane) => lane.kind === selection.lane)
				?.workItems.find((item) => item.id === selection.workItemId) ?? null
		);
	}, [project, selection]);

	const activeAgentId = useMemo(() => {
		if (!selectedWorkItem || selection.type !== "agent") return null;
		return selectedWorkItem.agentSlots.find((slot) => slot.role === selection.role)?.currentInstanceId ?? null;
	}, [selectedWorkItem, selection]);

	// 常驻 pane 可能属于别的 Work Item，需要从项目树反查它的展示信息。
	const agentSlotIndex = useMemo(() => {
		const index = new Map<
			string,
			{ displayName: string; kickoffPrompt?: string; role: AgentSlotSummary["role"]; workItemId: string }
		>();
		if (!project) return index;
		for (const lane of project.lanes) {
			for (const item of lane.workItems) {
				for (const slot of item.agentSlots) {
					if (!slot.currentInstanceId) continue;
					index.set(slot.currentInstanceId, {
						displayName: slot.displayName,
						...(slot.kickoffPrompt ? { kickoffPrompt: slot.kickoffPrompt } : {}),
						role: slot.role,
						workItemId: item.id,
					});
				}
			}
		}
		return index;
	}, [project]);

	const loadAgentCommands = useCallback(async (locator: AgentInstanceLocator): Promise<AgentCommandOption[]> => {
		const existing = agentCommandLoads.current.get(locator.agentInstanceId);
		if (existing) return existing;
		setAgentCommandsLoading((current) => ({ ...current, [locator.agentInstanceId]: true }));
		const load = window.codepiddy.getAgentCommands(locator);
		agentCommandLoads.current.set(locator.agentInstanceId, load);
		try {
			const commands = await load;
			setAgentCommands((current) => ({ ...current, [locator.agentInstanceId]: commands }));
			return commands;
		} finally {
			if (agentCommandLoads.current.get(locator.agentInstanceId) === load) {
				agentCommandLoads.current.delete(locator.agentInstanceId);
			}
			setAgentCommandsLoading((current) => ({ ...current, [locator.agentInstanceId]: false }));
		}
	}, []);

	const activeAgentIdRef = useRef<string | null>(null);
	activeAgentIdRef.current = activeAgentId;
	const [activeShowJump, setActiveShowJump] = useState(false);

	// 每个访问过的 Agent 保留一个常驻 pane；切换只是显隐，滚动位置由该 pane
	// 自己的 DOM 保留，这是与参考项目 SessionPane 相同的做法。
	useEffect(() => {
		if (!activeAgentId) {
			activeTranscriptRef.current = null;
			return;
		}
		setRetainedAgentIds((current) =>
			current.includes(activeAgentId) ? current : [...current, activeAgentId].slice(-8),
		);
		activeTranscriptRef.current = paneElementsRef.current.get(activeAgentId) ?? null;
	}, [activeAgentId]);

	const rememberScrollPosition = useCallback((agentId: string, offset: number): void => {
		scrollPositions.current[agentId] = offset;
	}, []);
	const handlePaneElement = useCallback((agentId: string, element: HTMLDivElement | null): void => {
		if (element) paneElementsRef.current.set(agentId, element);
		else paneElementsRef.current.delete(agentId);
		if (agentId === activeAgentIdRef.current) activeTranscriptRef.current = element;
	}, []);
	const paneControllersRef = useRef(
		new Map<string, { runJump: (position: () => void) => void; jumpToLatest: () => void }>(),
	);
	const handlePaneController = useCallback(
		(
			agentId: string,
			controller: { runJump: (position: () => void) => void; jumpToLatest: () => void } | null,
		): void => {
			if (controller) paneControllersRef.current.set(agentId, controller);
			else paneControllersRef.current.delete(agentId);
		},
		[],
	);
	const handleShowJumpChange = useCallback((agentId: string, showJump: boolean): void => {
		showJumpByAgentRef.current[agentId] = showJump;
		if (agentId === activeAgentIdRef.current) setActiveShowJump(showJump);
	}, []);
	unreadCountsRef.current = unreadCounts;

	useEffect(() => {
		projectRef.current = project;
	}, [project]);

	useEffect(() => {
		if (
			demoMode ||
			!project ||
			!("codepiddy" in window) ||
			restoredProjectUiRoots.current.has(project.rootPath) ||
			restoringProjectUiRoots.current.has(project.rootPath)
		)
			return;
		restoringProjectUiRoots.current.add(project.rootPath);
		void window.codepiddy
			.getProjectUiState(project.rootPath)
			.then((state) => {
				if (!state) return;
				setExpanded(new Set(state.expandedKeys));
				setSelection(restoreSelection(project, state));
			})
			.catch(() => undefined)
			.finally(() => {
				restoringProjectUiRoots.current.delete(project.rootPath);
				restoredProjectUiRoots.current.add(project.rootPath);
			});
	}, [project]);

	useEffect(() => {
		if (demoMode || !project || !("codepiddy" in window) || !restoredProjectUiRoots.current.has(project.rootPath))
			return;
		const timer = window.setTimeout(() => {
			const state: ProjectUiState = {
				projectRoot: project.rootPath,
				selectionType: selection.type === "welcome" ? "project" : selection.type,
				expandedKeys: [...expanded],
				...("lane" in selection ? { lane: selection.lane } : {}),
				...("workItemId" in selection ? { workItemId: selection.workItemId } : {}),
				...(selection.type === "agent" ? { role: selection.role } : {}),
			};
			void window.codepiddy.saveProjectUiState(state);
		}, 200);
		return () => window.clearTimeout(timer);
	}, [expanded, project, selection]);

	const activeAgentLocator = useMemo<AgentInstanceLocator | null>(() => {
		if (!project || !selectedWorkItem || selection.type !== "agent" || !activeAgentId) return null;
		return {
			agentInstanceId: activeAgentId,
			projectId: project.id,
			workItemId: selectedWorkItem.id,
			role: selection.role,
		};
	}, [activeAgentId, project, selectedWorkItem, selection]);

	useEffect(() => {
		if (activeAgentLocator) lastActiveAgentLocatorRef.current = activeAgentLocator;
	}, [activeAgentLocator]);

	const insertPromptTemplate = useCallback(
		(template: PromptTemplateSummary): void => {
			const locator = activeAgentLocator ?? lastActiveAgentLocatorRef.current;
			if (!project || !locator) {
				showSettingsToast("请先打开一个 Agent 会话，再使用 Prompt 模板", "error");
				return;
			}
			for (const lane of project.lanes) {
				for (const item of lane.workItems) {
					const slot = item.agentSlots.find(
						(candidate) => candidate.currentInstanceId === locator.agentInstanceId,
					);
					if (!slot) continue;
					setSelection({ type: "agent", lane: lane.kind, workItemId: item.id, role: slot.role });
					setDrafts((current) => {
						const currentDraft = current[locator.agentInstanceId]?.trim() ?? "";
						return {
							...current,
							[locator.agentInstanceId]: currentDraft
								? `/${template.name} ${currentDraft}`
								: `/${template.name} `,
						};
					});
					window.requestAnimationFrame(() => composerInputRef.current?.focus());
					return;
				}
			}
			showSettingsToast("当前 Agent 已不在项目树中，无法插入模板", "error");
		},
		[activeAgentLocator, project],
	);

	const startSidebarResize = useCallback(() => {
		sidebarResizeStartRef.current = sidebarWidth;
		sidebarResizeLatestRef.current = sidebarWidth;
	}, [sidebarWidth]);

	const resizeSidebar = useCallback((delta: number) => {
		const next = clampSidebarWidth(sidebarResizeStartRef.current + delta);
		sidebarResizeLatestRef.current = next;
		setSidebarWidth(next);
	}, []);

	const finishSidebarResize = useCallback(() => {
		try {
			window.localStorage.setItem("codepiddy.sidebar.width", String(sidebarResizeLatestRef.current));
		} catch {}
	}, []);

	const resetSidebarWidth = useCallback(() => {
		sidebarResizeStartRef.current = SIDEBAR_DEFAULT_WIDTH;
		sidebarResizeLatestRef.current = SIDEBAR_DEFAULT_WIDTH;
		setSidebarWidth(SIDEBAR_DEFAULT_WIDTH);
		try {
			window.localStorage.removeItem("codepiddy.sidebar.width");
		} catch {}
	}, []);

	const refreshAfterProviderChange = useCallback(async (label: string): Promise<void> => {
		setProviderSettingsRefreshToken((current) => current + 1);
		if (demoMode || !("codepiddy" in window)) return;
		const locator = lastActiveAgentLocatorRef.current;
		if (!locator) {
			setSessionNotice(label);
			return;
		}
		const status = findAgentStatus(projectRef.current, locator);
		if (!status) {
			setSessionNotice(label);
			return;
		}
		if (status === "running" || status === "waiting") {
			setSessionNotice(`${label}；当前 Agent 正在运行，停止或重新连接后生效`);
			return;
		}
		try {
			const refreshed = await window.codepiddy.refreshAgentModelScope(locator);
			const snapshot = await window.codepiddy.getAgentSessionSnapshot(locator);
			setModelSelections((current) => ({ ...current, [locator.agentInstanceId]: refreshed.selection }));
			setAgentSessionSnapshots((current) => ({ ...current, [locator.agentInstanceId]: snapshot }));
			setSessionNotice(
				refreshed.scope.applyPending
					? `${label}；当前 Agent 正在运行，停止或重新连接后生效`
					: `${label}；当前 Agent 已重新连接`,
			);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "刷新 Agent 配置失败");
			setSessionNotice(`${label}；当前 Agent 刷新失败`);
		}
	}, []);

	const refreshAfterToolChange = useCallback(async (): Promise<string> => {
		if (demoMode || !("codepiddy" in window)) return "工具设置已保存。";
		const locator = lastActiveAgentLocatorRef.current;
		if (!locator) return "工具设置已保存；新启动或重置后的 Agent 生效。";
		const status = findAgentStatus(projectRef.current, locator);
		if (!status) return "工具设置已保存；重新打开 Agent 后生效。";
		if (status === "running" || status === "waiting") {
			return "工具设置已保存；当前 Agent 正在运行，停止或重新连接后生效。";
		}
		try {
			await window.codepiddy.reconnectAgent(locator);
			return "工具设置已保存；当前 Agent 已重新连接。";
		} catch (caught) {
			return `工具设置已保存；刷新 Agent 失败：${clientErrorMessage(caught, "未知错误")}`;
		}
	}, []);

	const refreshAfterShellCommandChange = useCallback(async (): Promise<string> => {
		if (demoMode || !("codepiddy" in window)) return "Shell 命令前缀已保存。";
		const locator = lastActiveAgentLocatorRef.current;
		if (!locator) return "Shell 命令前缀已保存；新启动或重置后的 Agent 生效。";
		const status = findAgentStatus(projectRef.current, locator);
		if (!status) return "Shell 命令前缀已保存；重新打开 Agent 后生效。";
		if (status === "running" || status === "waiting") {
			return "Shell 命令前缀已保存；当前 Agent 正在运行，停止或重新连接后生效。";
		}
		try {
			await window.codepiddy.reconnectAgent(locator);
			return "Shell 命令前缀已保存；当前 Agent 已重新连接。";
		} catch (caught) {
			return `Shell 命令前缀已保存；刷新 Agent 失败：${clientErrorMessage(caught, "未知错误")}`;
		}
	}, []);

	const refreshAfterPromptTemplateChange = useCallback(
		async (action: "save" | "delete"): Promise<string> => {
			const label = action === "delete" ? "Prompt 模板已删除" : "Prompt 模板已保存";
			if (demoMode || !("codepiddy" in window)) return `${label}。`;
			const locator = lastActiveAgentLocatorRef.current;
			if (!locator) return `${label}；新启动或重连后的 Agent 生效。`;
			const status = findAgentStatus(projectRef.current, locator);
			if (!status) return `${label}；重新打开 Agent 后生效。`;
			if (status === "running" || status === "waiting") {
				return `${label}；当前 Agent 正在运行，停止或重新连接后生效。`;
			}
			try {
				await window.codepiddy.reconnectAgent(locator);
				await loadAgentCommands(locator);
				return `${label}；当前 Agent 已重新连接，命令菜单已刷新。`;
			} catch (caught) {
				return `${label}；刷新 Agent 失败：${clientErrorMessage(caught, "未知错误")}`;
			}
		},
		[loadAgentCommands],
	);

	const refreshAfterPiPackageChange = useCallback(
		async (action: "install" | "remove" | "update" | "extension"): Promise<string> => {
			const label =
				action === "install"
					? "Pi Package 已安装"
					: action === "remove"
						? "Pi Package 已移除"
						: action === "extension"
							? "Pi Package extension 状态已更新"
							: "Pi Package 已更新";
			if (demoMode || !("codepiddy" in window)) return `${label}。`;
			const locator = lastActiveAgentLocatorRef.current;
			if (!locator) return `${label}；新启动或重连后的 Agent 生效。`;
			const status = findAgentStatus(projectRef.current, locator);
			if (!status) return `${label}；重新打开 Agent 后生效。`;
			if (status === "running" || status === "waiting") {
				return `${label}；当前 Agent 正在运行，停止或重新连接后生效。`;
			}
			try {
				await window.codepiddy.reconnectAgent(locator);
				await loadAgentCommands(locator);
				return `${label}；当前 Agent 已重新连接，命令菜单已刷新。`;
			} catch (caught) {
				return `${label}；刷新 Agent 失败：${clientErrorMessage(caught, "未知错误")}`;
			}
		},
		[loadAgentCommands],
	);

	const refreshAfterMcpChange = useCallback(async (): Promise<string> => {
		if (demoMode || !("codepiddy" in window)) return "MCP 配置已更新。";
		const locator = lastActiveAgentLocatorRef.current;
		if (!locator) return "MCP 配置已更新；新启动或重连后的 Agent 生效。";
		const status = findAgentStatus(projectRef.current, locator);
		if (!status) return "MCP 配置已更新；重新打开 Agent 后生效。";
		if (status === "running" || status === "waiting") {
			return "当前 Agent 正在运行，停止或重新连接后生效。";
		}
		try {
			await window.codepiddy.reconnectAgent(locator);
			return "当前 Agent 已重新连接。";
		} catch (caught) {
			return `当前 Agent 自动重连失败：${clientErrorMessage(caught, "未知错误")}`;
		}
	}, []);

	const refreshAfterAuthChange = useCallback(
		async (action: "login" | "logout"): Promise<void> => {
			await refreshAfterProviderChange(action === "login" ? "Provider 登录成功" : "已退出该 Provider");
		},
		[refreshAfterProviderChange],
	);

	const handleModelScopeSelectionChange = useCallback(
		(locator: AgentInstanceLocator, selection: AgentModelSelection): void => {
			setModelSelections((current) => ({ ...current, [locator.agentInstanceId]: selection }));
		},
		[],
	);

	/*
	 * 输入框跟随内容增高。
	 * 不能只靠 CSS：textarea 的滚动高度要先把 height 归零才量得准，否则会一路只增不减。
	 * 超过上限后改为内部滚动，避免长消息把转录区挤没。
	 */
	useLayoutEffect(() => {
		const element = composerInputRef.current;
		if (!element) return;
		const draftText = activeAgentId ? (drafts[activeAgentId] ?? "") : "";
		const maxHeight = 240;
		if (!draftText) {
			element.style.height = "";
			element.style.overflowY = "hidden";
			return;
		}
		element.style.height = "auto";
		element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`;
		element.style.overflowY = element.scrollHeight > maxHeight ? "auto" : "hidden";
	}, [activeAgentId, drafts]);

	useEffect(() => {
		if (
			demoMode ||
			!activeAgentId ||
			!("codepiddy" in window) ||
			restoredAgentUiIds.current.has(activeAgentId) ||
			restoringAgentUiIds.current.has(activeAgentId)
		)
			return;
		restoringAgentUiIds.current.add(activeAgentId);
		void window.codepiddy
			.getAgentUiState(activeAgentId)
			.then((state) => {
				if (!state) return;
				setDrafts((current) => ({ ...current, [activeAgentId]: state.draft }));
				setUnreadCounts((current) => ({ ...current, [activeAgentId]: state.unreadCount }));
				unreadCountsRef.current = { ...unreadCountsRef.current, [activeAgentId]: state.unreadCount };
				scrollPositions.current[activeAgentId] = state.scrollTop;
			})
			.catch(() => undefined)
			.finally(() => {
				restoringAgentUiIds.current.delete(activeAgentId);
				restoredAgentUiIds.current.add(activeAgentId);
			});
	}, [activeAgentId]);

	useEffect(() => {
		if (demoMode || !activeAgentId || !("codepiddy" in window) || !restoredAgentUiIds.current.has(activeAgentId))
			return;
		const existing = agentUiSaveTimers.current.get(activeAgentId);
		if (existing) window.clearTimeout(existing);
		const timer = window.setTimeout(() => {
			void window.codepiddy.saveAgentUiState({
				agentInstanceId: activeAgentId,
				draft: drafts[activeAgentId] ?? "",
				scrollTop: scrollPositions.current[activeAgentId] ?? 0,
				unreadCount: unreadCounts[activeAgentId] ?? 0,
			});
			agentUiSaveTimers.current.delete(activeAgentId);
		}, 250);
		agentUiSaveTimers.current.set(activeAgentId, timer);
		return () => window.clearTimeout(timer);
	}, [activeAgentId, drafts, unreadCounts]);

	useEffect(() => {
		if (!activeAgentId || activeShowJump) return;
		setUnreadCounts((current) =>
			(current[activeAgentId] ?? 0) === 0 ? current : { ...current, [activeAgentId]: 0 },
		);
	}, [activeAgentId, activeShowJump]);

	const activeDraftStartsWithSlash = Boolean(
		activeAgentId && (drafts[activeAgentId] ?? "").trimStart().startsWith("/"),
	);

	const modelPickerSections = useMemo(() => {
		if (!modelPickerAgentId) return [];
		const modelSelection = modelSelections[modelPickerAgentId];
		if (!modelSelection) return [];
		const normalizedSearch = modelSearch.trim().toLowerCase();
		const filtered = modelSelection.availableModels.filter((model) =>
			`${model.provider} ${model.name} ${model.id}`.toLowerCase().includes(normalizedSearch),
		);
		const enabledIds = modelSelection.enabledModelIds;
		const groups: Array<{ label: string; models: AgentModelSelection["availableModels"] }> = [];
		if (enabledIds === null) {
			groups.push({ label: "常用模型", models: filtered });
		} else if (enabledIds.length > 0) {
			const enabled = enabledIds.flatMap((id) => {
				const model = filtered.find((candidate) => `${candidate.provider}/${candidate.id}` === id);
				return model ? [model] : [];
			});
			const enabledSet = new Set(enabledIds);
			const remaining = filtered.filter((model) => !enabledSet.has(`${model.provider}/${model.id}`));
			if (enabled.length > 0) groups.push({ label: "常用模型", models: enabled });
			if (remaining.length > 0) groups.push({ label: "其他模型", models: remaining });
		} else {
			groups.push({ label: "全部模型", models: filtered });
		}
		return groups.flatMap((group) => {
			const providers = [...new Set(group.models.map((model) => model.provider))];
			return providers.map((provider) => ({
				key: `${group.label}:${provider}`,
				label: `${group.label} · ${provider}`,
				models: group.models.filter((model) => model.provider === provider),
			}));
		});
	}, [modelPickerAgentId, modelSearch, modelSelections]);
	const modelPickerOptions = useMemo(
		() => modelPickerSections.flatMap((section) => section.models),
		[modelPickerSections],
	);
	const modelPickerIndexById = useMemo(
		() => new Map(modelPickerOptions.map((model, index) => [`${model.provider}/${model.id}`, index] as const)),
		[modelPickerOptions],
	);

	const updateAgentStatus = useCallback((clientEvent: AgentClientEvent, status: AgentStatus): void => {
		setProject((current) =>
			current
				? {
						...current,
						lanes: current.lanes.map((lane) => ({
							...lane,
							workItems: lane.workItems.map((item) =>
								item.id === clientEvent.workItemId
									? {
											...item,
											agentSlots: item.agentSlots.map((slot) =>
												slot.role === clientEvent.role &&
												slot.currentInstanceId === clientEvent.agentInstanceId
													? { ...slot, status }
													: slot,
											),
										}
									: item,
							),
						})),
					}
				: current,
		);
	}, []);

	const updateTranscript = useCallback(
		(agentId: string, update: (items: TranscriptItem[]) => TranscriptItem[]): void => {
			setTranscripts((current) => ({ ...current, [agentId]: update(current[agentId] ?? []) }));
		},
		[],
	);

	const updateAgentActivity = useCallback((agentId: string, activity: AgentActivity | null): void => {
		setAgentActivities((current) => {
			if (activity) return { ...current, [agentId]: activity };
			if (!(agentId in current)) return current;
			const next = { ...current };
			delete next[agentId];
			return next;
		});
	}, []);

	const refreshAgentSessionSnapshot = useCallback(async (locator: AgentInstanceLocator): Promise<void> => {
		if (demoMode || !("codepiddy" in window)) return;
		try {
			const snapshot = await window.codepiddy.getAgentSessionSnapshot(locator);
			setAgentSessionSnapshots((current) => ({ ...current, [locator.agentInstanceId]: snapshot }));
			setSessionPanel((current) =>
				current?.agentInstanceId === locator.agentInstanceId ? { ...current, snapshot } : current,
			);
		} catch {
			// The process may be settling or restarting. The next activation will refresh it.
		}
	}, []);

	const markAgentUnread = useCallback(
		(agentId: string): void => {
			if (agentId === activeAgentId && !showJumpByAgentRef.current[agentId]) return;
			unreadCountsRef.current = {
				...unreadCountsRef.current,
				[agentId]: (unreadCountsRef.current[agentId] ?? 0) + 1,
			};
			setUnreadCounts((current) => ({ ...current, [agentId]: (current[agentId] ?? 0) + 1 }));
		},
		[activeAgentId],
	);

	const handleAgentEvent = useCallback(
		(clientEvent: AgentClientEvent): void => {
			const { agentInstanceId, event } = clientEvent;
			const type = event.type;
			const locator: AgentInstanceLocator = {
				agentInstanceId,
				projectId: clientEvent.projectId,
				workItemId: clientEvent.workItemId,
				role: clientEvent.role,
			};
			const finishActiveAssistant = (
				message: unknown,
				fallbackStatus: Exclude<AssistantMessageStatus, "streaming"> = "complete",
			): void => {
				const id = activeAssistantIds.current.get(agentInstanceId);
				if (!id) return;
				updateTranscript(agentInstanceId, (items) =>
					finalizeAssistantTranscript(items, id, message, fallbackStatus),
				);
				activeAssistantIds.current.delete(agentInstanceId);
			};
			if (type === "extension_ui_request") {
				const method = event.method;
				if (method === "notify" && typeof event.message === "string") {
					updateTranscript(agentInstanceId, (items) => [
						...items,
						{
							id: crypto.randomUUID(),
							type: "system",
							text: event.message as string,
							createdAt: new Date().toISOString(),
						},
					]);
					return;
				}
				if (
					typeof event.id === "string" &&
					(method === "select" || method === "confirm" || method === "input" || method === "editor")
				) {
					const request: PendingExtensionUiRequest = {
						agentInstanceId,
						projectId: clientEvent.projectId,
						workItemId: clientEvent.workItemId,
						role: clientEvent.role,
						requestId: event.id,
						method,
						title: typeof event.title === "string" ? event.title : "需要确认",
						message: typeof event.message === "string" ? event.message : "",
						options: Array.isArray(event.options)
							? event.options.filter((option): option is string => typeof option === "string")
							: [],
						placeholder: typeof event.placeholder === "string" ? event.placeholder : "",
						prefill: typeof event.prefill === "string" ? event.prefill : "",
						createdAt: new Date().toISOString(),
					};
					setPendingExtensionUiRequests((current) => ({ ...current, [agentInstanceId]: request }));
					setDeferredExtensionUiAgentId((current) => (current === agentInstanceId ? null : current));
					if (activeAgentId === agentInstanceId) setExtensionDialog(extensionDialogFromRequest(request));
					markAgentUnread(agentInstanceId);
					updateAgentStatus(clientEvent, "waiting");
					updateAgentActivity(agentInstanceId, { label: "等待扩展确认", kind: "waiting", queued: 0 });
				}
				return;
			}
			if (type === "agent_status" && typeof event.status === "string") {
				if (
					event.status === "idle" ||
					event.status === "running" ||
					event.status === "waiting" ||
					event.status === "completed" ||
					event.status === "failed"
				) {
					updateAgentStatus(clientEvent, event.status);
					if (event.status === "running") {
						updateAgentActivity(agentInstanceId, { label: "Pi 正在处理", kind: "working", queued: 0 });
					} else if (event.status !== "waiting") {
						updateAgentActivity(agentInstanceId, null);
						if (event.status === "failed") finishActiveAssistant(undefined, "error");
					}
				}
				return;
			}
			if (type === "agent_start" || type === "turn_start") {
				updateAgentStatus(clientEvent, "running");
				updateAgentActivity(agentInstanceId, { label: "Pi 正在思考", kind: "working", queued: 0 });
			}
			if (type === "agent_end") {
				const lastAssistant = Array.isArray(event.messages)
					? [...event.messages].reverse().find((message) => isRecord(message) && message.role === "assistant")
					: undefined;
				finishActiveAssistant(lastAssistant);
				updateAgentActivity(agentInstanceId, null);
				void refreshAgentSessionSnapshot(locator);
				return;
			}
			if (type === "agent_settled") {
				setPendingExtensionUiRequests((current) => {
					if (!(agentInstanceId in current)) return current;
					const next = { ...current };
					delete next[agentInstanceId];
					return next;
				});
				if (extensionDialog?.agentInstanceId === agentInstanceId) setExtensionDialog(null);
				finishActiveAssistant(undefined);
				const unresolvedToolFailure = pendingToolFailures.current.get(agentInstanceId);
				if (unresolvedToolFailure) {
					pendingToolFailures.current.delete(agentInstanceId);
					setToolRecoveryOffers((current) => ({ ...current, [agentInstanceId]: unresolvedToolFailure }));
					updateTranscript(agentInstanceId, (items) => [
						...items,
						{
							id: crypto.randomUUID(),
							type: "system",
							text: `本轮在 ${unresolvedToolFailure.toolName} 工具失败后结束，Pi 没有产生最终文本回复。你可以让 Pi 使用替代方案继续处理。`,
							createdAt: new Date().toISOString(),
						},
					]);
				}
				updateAgentActivity(agentInstanceId, null);
				updateAgentStatus(clientEvent, "idle");
				setAbortingAgents((current) => ({ ...current, [agentInstanceId]: false }));
				void refreshAgentSessionSnapshot(locator);
				const currentProject = projectRef.current;
				if (currentProject && "codepiddy" in window) {
					void window.codepiddy
						.refreshProject(currentProject.rootPath)
						.then(setProject)
						.catch(() => undefined);
				}
				return;
			}
			if (type === "agent_history" && Array.isArray(event.messages)) {
				// 保留仍在流式的本地 assistant 条目，避免历史快照把回复抹掉。
				setTranscripts((current) => ({
					...current,
					[agentInstanceId]: beginTranscriptHistoryMerge(
						current[agentInstanceId] ?? [],
						normalizeHistory(event.messages as unknown[]),
						activeAssistantIds.current.get(agentInstanceId),
					),
				}));
				return;
			}
			if (type === "message_start") {
				const message = event.message;
				if (isRecord(message) && message.role === "assistant") {
					const id = crypto.randomUUID();
					activeAssistantIds.current.set(agentInstanceId, id);
					updateAgentActivity(agentInstanceId, { label: "正在生成回复", kind: "working", queued: 0 });
					updateTranscript(agentInstanceId, (items) => [
						...items,
						{
							id,
							type: "assistant",
							text: "",
							thinking: "",
							status: "streaming",
							createdAt: new Date().toISOString(),
							streamStartedAt: Date.now(),
							...assistantModelRef(message),
						},
					]);
				}
				return;
			}
			if (type === "message_update") {
				const assistantEvent = event.assistantMessageEvent;
				if (isRecord(assistantEvent)) {
					const update = assistantEvent;
					if (update.type === "text_delta" && typeof update.delta === "string") {
						const delta = update.delta;
						pendingToolFailures.current.delete(agentInstanceId);
						setToolRecoveryOffers((current) => {
							if (!(agentInstanceId in current)) return current;
							const next = { ...current };
							delete next[agentInstanceId];
							return next;
						});
						const id = activeAssistantIds.current.get(agentInstanceId) ?? crypto.randomUUID();
						if (!activeAssistantIds.current.has(agentInstanceId))
							activeAssistantIds.current.set(agentInstanceId, id);
						updateTranscript(agentInstanceId, (items) => {
							const index = items.findIndex((item) => item.id === id);
							if (index === -1)
								return [
									...items,
									{
										id,
										type: "assistant",
										text: delta,
										status: "streaming",
										createdAt: new Date().toISOString(),
										streamStartedAt: Date.now(),
										...assistantModelRef(update.partial),
									},
								];
							return items.map((item) =>
								item.id === id && item.type === "assistant"
									? {
											...item,
											text: item.text + delta,
											status: "streaming",
											...(typeof item.streamStartedAt === "number" ? {} : { streamStartedAt: Date.now() }),
											...(item.modelId ? {} : assistantModelRef(update.partial)),
										}
									: item,
							);
						});
					}
					if (update.type === "thinking_delta" && typeof update.delta === "string") {
						const delta = update.delta;
						const id = activeAssistantIds.current.get(agentInstanceId) ?? crypto.randomUUID();
						if (!activeAssistantIds.current.has(agentInstanceId))
							activeAssistantIds.current.set(agentInstanceId, id);
						updateAgentActivity(agentInstanceId, { label: "Pi 正在思考", kind: "working", queued: 0 });
						updateTranscript(agentInstanceId, (items) => {
							const index = items.findIndex((item) => item.id === id);
							if (index === -1)
								return [
									...items,
									{
										id,
										type: "assistant",
										text: "",
										thinking: delta,
										status: "streaming",
										createdAt: new Date().toISOString(),
										streamStartedAt: Date.now(),
										...assistantModelRef(update.partial),
									},
								];
							return items.map((item) =>
								item.id === id && item.type === "assistant"
									? {
											...item,
											thinking: (item.thinking ?? "") + delta,
											status: "streaming",
											...(typeof item.streamStartedAt === "number" ? {} : { streamStartedAt: Date.now() }),
											...(item.modelId ? {} : assistantModelRef(update.partial)),
										}
									: item,
							);
						});
					}
				}
				return;
			}
			if (type === "message_end") {
				const message = event.message;
				if (isRecord(message) && message.role === "assistant") {
					finishActiveAssistant(message);
					if (extractMessageText(message.content)) markAgentUnread(agentInstanceId);
					const status = assistantMessageStatus(message);
					updateAgentActivity(
						agentInstanceId,
						status === "complete" ? { label: "正在处理后续步骤", kind: "working", queued: 0 } : null,
					);
				}
				return;
			}
			if (type === "turn_end" && isRecord(event.message)) {
				const status = assistantMessageStatus(event.message);
				if (status !== "complete") {
					finishActiveAssistant(event.message, status);
					updateAgentActivity(agentInstanceId, null);
				}
				return;
			}
			if (type === "tool_execution_start" && typeof event.toolCallId === "string") {
				pendingToolFailures.current.delete(agentInstanceId);
				const toolCallId = event.toolCallId;
				const toolName = typeof event.toolName === "string" ? event.toolName : "tool";
				updateAgentActivity(agentInstanceId, { label: `正在运行 ${toolName}`, kind: "tool", queued: 0 });
				updateTranscript(agentInstanceId, (items) => [
					...items,
					{
						id: toolCallId,
						type: "tool",
						name: toolName,
						args: event.args === undefined ? "" : JSON.stringify(event.args, null, 2),
						text: "",
						status: "running",
						isError: false,
						startedAt: Date.now(),
					},
				]);
				return;
			}
			if (type === "tool_execution_update" && typeof event.toolCallId === "string") {
				const toolCallId = event.toolCallId;
				updateTranscript(agentInstanceId, (items) =>
					items.map((item) =>
						item.id === toolCallId && item.type === "tool"
							? {
									...item,
									text: extractMessageText(event.partialResult) || item.text || "正在执行…",
									details: extractToolResultDetails(event.partialResult) ?? item.details,
								}
							: item,
					),
				);
				return;
			}
			if (type === "tool_execution_end" && typeof event.toolCallId === "string") {
				const toolCallId = event.toolCallId;
				if (event.isError === true) {
					pendingToolFailures.current.set(agentInstanceId, {
						toolName: typeof event.toolName === "string" ? event.toolName : "tool",
						reason: extractMessageText(event.result) || "工具执行失败",
					});
				}
				markAgentUnread(agentInstanceId);
				updateAgentActivity(
					agentInstanceId,
					event.isError === true
						? { label: "工具失败，Pi 正在处理错误", kind: "retry", queued: 0 }
						: { label: "正在继续处理", kind: "working", queued: 0 },
				);
				updateTranscript(agentInstanceId, (items) =>
					items.map((item) =>
						item.id === toolCallId && item.type === "tool"
							? {
									...item,
									status: "completed",
									text:
										extractToolResultPatch(event.result) ??
										(extractMessageText(event.result) || item.text || "已完成"),
									details: extractToolResultDetails(event.result) ?? item.details,
									isError: event.isError === true,
									completedAt: Date.now(),
								}
							: item,
					),
				);
				return;
			}
			if (type === "queue_update") {
				const steering = Array.isArray(event.steering) ? event.steering.length : 0;
				const followUp = Array.isArray(event.followUp) ? event.followUp.length : 0;
				const queued = steering + followUp;
				if (queued > 0)
					updateAgentActivity(agentInstanceId, { label: `已追加 ${queued} 条消息`, kind: "working", queued });
				return;
			}
			if (type === "compaction_start") {
				updateAgentActivity(agentInstanceId, { label: "正在压缩上下文", kind: "compaction", queued: 0 });
				return;
			}
			if (type === "compaction_end") {
				updateAgentActivity(agentInstanceId, null);
				void refreshAgentSessionSnapshot(locator);
				return;
			}
			if (type === "auto_retry_start") {
				const attempt = typeof event.attempt === "number" ? event.attempt : 1;
				const maxAttempts = typeof event.maxAttempts === "number" ? event.maxAttempts : 1;
				updateAgentActivity(agentInstanceId, {
					label: `请求失败，正在重试 ${attempt}/${maxAttempts}`,
					kind: "retry",
					queued: 0,
				});
				return;
			}
			if (type === "auto_retry_end") {
				updateAgentActivity(
					agentInstanceId,
					event.success === true
						? { label: "重试成功，正在恢复回复", kind: "working", queued: 0 }
						: { label: "重试失败，Pi 正在结束本轮", kind: "retry", queued: 0 },
				);
				return;
			}
			if (type === "rpc_timeout") {
				const command = typeof event.command === "string" ? event.command : "unknown";
				updateAgentActivity(agentInstanceId, {
					label: `Pi RPC 超时（${command}），可从 Agent 菜单重新连接`,
					kind: "retry",
					queued: 0,
				});
				updateTranscript(agentInstanceId, (items) => [
					...items,
					{
						id: crypto.randomUUID(),
						type: "system",
						text: `Pi RPC 命令 ${command} 响应超时。进程可能仍在运行；如果状态没有恢复，请使用“重新连接 Pi”。`,
						createdAt: new Date().toISOString(),
					},
				]);
				return;
			}
			if (type === "process_recovery_start") {
				setPendingExtensionUiRequests((current) => {
					if (!(agentInstanceId in current)) return current;
					const next = { ...current };
					delete next[agentInstanceId];
					return next;
				});
				if (extensionDialog?.agentInstanceId === agentInstanceId) setExtensionDialog(null);
				const attempt = typeof event.attempt === "number" ? event.attempt : 1;
				finishActiveAssistant(undefined, "error");
				updateAgentActivity(agentInstanceId, {
					label: event.manual === true ? "正在重新连接 Pi" : `Pi 意外退出，正在恢复连接（${attempt}/2）`,
					kind: "reconnecting",
					queued: 0,
				});
				return;
			}
			if (type === "process_recovered") {
				markAgentUnread(agentInstanceId);
				updateAgentActivity(agentInstanceId, null);
				updateAgentStatus(clientEvent, "idle");
				updateTranscript(agentInstanceId, (items) => [
					...items,
					{
						id: crypto.randomUUID(),
						type: "system",
						text:
							event.manual === true
								? "已重新连接 Pi，并恢复当前 Session。"
								: "Pi 进程已自动恢复并重新载入当前 Session。中断前尚未完成的请求需要重新发送。",
						createdAt: new Date().toISOString(),
					},
				]);
				void refreshAgentSessionSnapshot(locator);
				return;
			}
			if (type === "process_recovery_failed") {
				const attempt = typeof event.attempt === "number" ? event.attempt : 1;
				const maxAttempts = typeof event.maxAttempts === "number" ? event.maxAttempts : 2;
				if (attempt >= maxAttempts) {
					updateAgentActivity(agentInstanceId, null);
					updateAgentStatus(clientEvent, "failed");
					updateTranscript(agentInstanceId, (items) => [
						...items,
						{
							id: crypto.randomUUID(),
							type: "system",
							text: `Pi 自动恢复失败：${typeof event.error === "string" ? event.error : "未知错误"}。请使用 Agent 菜单手动重新连接。`,
							createdAt: new Date().toISOString(),
						},
					]);
				}
				return;
			}
			if (type === "agent_configuration_warning" && typeof event.error === "string") {
				const warning = event.error;
				updateTranscript(agentInstanceId, (items) => [
					...items,
					{ id: crypto.randomUUID(), type: "system", text: warning, createdAt: new Date().toISOString() },
				]);
				return;
			}
			if (type === "process_error" || type === "process_exit") {
				if (event.expected === true) return;
				finishActiveAssistant(undefined, "error");
				updateAgentActivity(agentInstanceId, {
					label: "Pi 连接已中断，等待自动恢复",
					kind: "reconnecting",
					queued: 0,
				});
			}
		},
		[
			activeAgentId,
			extensionDialog,
			refreshAgentSessionSnapshot,
			updateAgentActivity,
			updateAgentStatus,
			updateTranscript,
			markAgentUnread,
		],
	);

	useEffect(() => {
		if (!("codepiddy" in window)) return;
		return window.codepiddy.onAgentEvent(handleAgentEvent);
	}, [handleAgentEvent]);

	useEffect(() => {
		if (sessionPanel) return;
		setSessionCreateDraft(null);
		setSessionCreateError(null);
		setSessionDeleteDialog(null);
	}, [sessionPanel]);

	useEffect(() => {
		if (sessionPanel || selection.type !== "agent" || !activeAgentId) return;
		const frame = window.requestAnimationFrame(() => composerInputRef.current?.focus());
		return () => window.cancelAnimationFrame(frame);
	}, [activeAgentId, selection.type, sessionPanel]);

	useEffect(() => {
		if (!("codepiddy" in window) || demoMode) return;
		void (async () => {
			try {
				const restored = await window.codepiddy.getStartupProject();
				setRecentProjects(await window.codepiddy.listRecentProjects());
				if (!restored) return;
				setProject(restored);
				setSelection({ type: "project" });
				setExpanded(new Set([`project:${restored.id}`, "lane:requirements", "lane:bugs"]));
			} catch (caught) {
				setError(caught instanceof Error ? caught.message : "恢复项目失败");
			}
		})();
	}, []);

	useEffect(() => {
		if (!project) {
			setProjectTrustStatus(null);
			setProjectTrustPromptOpen(false);
			return;
		}
		if (demoMode || !("codepiddy" in window)) {
			setProjectTrustStatus({
				projectRoot: project.rootPath,
				decision: null,
				inheritedFrom: null,
				requiresTrust: true,
			});
			setProjectTrustPromptOpen(true);
			return;
		}
		let cancelled = false;
		void window.codepiddy
			.getProjectTrustStatus(project.rootPath)
			.then((status) => {
				if (cancelled) return;
				setProjectTrustStatus(status);
				if (status.requiresTrust && status.decision === null) setProjectTrustPromptOpen(true);
			})
			.catch((caught: unknown) => {
				if (!cancelled) setError(caught instanceof Error ? caught.message : "读取项目信任状态失败");
			});
		return () => {
			cancelled = true;
		};
	}, [project]);

	useEffect(() => {
		if (!("codepiddy" in window) || !project || !selectedWorkItem || selection.type !== "agent") {
			activatedAgentKey.current = null;
			return;
		}
		const slot = selectedWorkItem.agentSlots.find((candidate) => candidate.role === selection.role);
		if (!slot?.currentInstanceId) return;
		const key = `${project.id}:${slot.currentInstanceId}`;
		if (activatedAgentKey.current === key) return;
		activatedAgentKey.current = key;
		const locator = {
			agentInstanceId: slot.currentInstanceId,
			projectId: project.id,
			workItemId: selectedWorkItem.id,
			role: slot.role,
		};
		void window.codepiddy
			.activateAgent(locator)
			.then(async () => {
				const request = await window.codepiddy.getPendingExtensionUiRequest(locator);
				if (request) {
					setPendingExtensionUiRequests((current) => ({
						...current,
						[slot.currentInstanceId!]: request,
					}));
					setExtensionDialog(extensionDialogFromRequest(request));
				}
				const [modelResult, commandResult, snapshotResult] = await Promise.allSettled([
					window.codepiddy.getAgentModelSelection(locator),
					loadAgentCommands(locator),
					window.codepiddy.getAgentSessionSnapshot(locator),
				]);
				if (modelResult.status === "fulfilled") {
					setModelSelections((current) => ({ ...current, [slot.currentInstanceId!]: modelResult.value }));
				}
				if (snapshotResult.status === "fulfilled") {
					setAgentSessionSnapshots((current) => ({
						...current,
						[slot.currentInstanceId!]: snapshotResult.value,
					}));
				}

				if (modelResult.status === "rejected") {
					setError(modelResult.reason instanceof Error ? modelResult.reason.message : "读取 Pi 模型失败");
				} else if (commandResult.status === "rejected") {
					setError(commandResult.reason instanceof Error ? commandResult.reason.message : "读取 Pi 命令失败");
				} else if (snapshotResult.status === "rejected") {
					setError(
						snapshotResult.reason instanceof Error ? snapshotResult.reason.message : "读取 Session 状态失败",
					);
				}
			})
			.catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "恢复 Agent 失败"));
	}, [loadAgentCommands, project, selectedWorkItem, selection]);

	useEffect(() => {
		if (!activeAgentId) {
			setExtensionDialog(null);
			setDeferredExtensionUiAgentId(null);
			return;
		}
		if (deferredExtensionUiAgentId === activeAgentId) {
			setExtensionDialog(null);
			return;
		}
		const pending = pendingExtensionUiRequests[activeAgentId];
		setExtensionDialog((current) => {
			if (current?.agentInstanceId === activeAgentId) return current;
			return pending ? extensionDialogFromRequest(pending) : null;
		});
	}, [activeAgentId, deferredExtensionUiAgentId, pendingExtensionUiRequests]);

	useEffect(() => {
		if (
			demoMode ||
			!activeDraftStartsWithSlash ||
			!("codepiddy" in window) ||
			!project ||
			!selectedWorkItem ||
			selection.type !== "agent"
		)
			return;
		const slot = selectedWorkItem.agentSlots.find((candidate) => candidate.role === selection.role);
		if (!slot?.currentInstanceId || agentCommands[slot.currentInstanceId] !== undefined) return;
		void loadAgentCommands({
			agentInstanceId: slot.currentInstanceId,
			projectId: project.id,
			workItemId: selectedWorkItem.id,
			role: slot.role,
		}).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "读取 Pi 命令失败"));
	}, [activeDraftStartsWithSlash, agentCommands, loadAgentCommands, project, selectedWorkItem, selection]);

	useEffect(() => {
		if (!("codepiddy" in window) || !project || selection.type !== "agent") {
			setFileMatches([]);
			return;
		}
		const item = project.lanes
			.find((lane) => lane.kind === selection.lane)
			?.workItems.find((workItem) => workItem.id === selection.workItemId);
		const slot = item?.agentSlots.find((candidate) => candidate.role === selection.role);
		const draft = slot?.currentInstanceId ? (drafts[slot.currentInstanceId] ?? "") : "";
		const match = /(?:^|\s)@([^\s]*)$/.exec(draft);
		if (!match) {
			setFileMatches([]);
			return;
		}
		const timer = setTimeout(() => {
			void window.codepiddy.searchProjectFiles(project.rootPath, match[1] ?? "").then(setFileMatches);
		}, 120);
		return () => clearTimeout(timer);
	}, [drafts, project, selection]);

	useEffect(() => {
		if (!error) return;
		const timer = window.setTimeout(() => setError(null), 6500);
		return () => window.clearTimeout(timer);
	}, [error]);

	useEffect(() => {
		if (!sessionNotice) return;
		showSettingsToast(sessionNotice, "success");
		setSessionNotice(null);
	}, [sessionNotice]);

	useEffect(() => {
		if (!authDialogMode || !("codepiddy" in window)) return;
		const off = window.codepiddy.onAuthEvent((event: AuthClientEvent) => {
			if (event.requestId !== authRequestId) return;
			if (event.type === "prompt") {
				setAuthPrompt(event.prompt);
				setAuthPromptValue(event.prompt.options?.[0]?.id ?? "");
			} else if (event.type === "info" || event.type === "progress") {
				setAuthMessage(event.message);
			} else if (event.type === "auth_url") {
				setAuthMessage(event.instructions ?? `请在浏览器中打开：${event.url}`);
			} else if (event.type === "device_code") {
				setAuthMessage(`在 ${event.verificationUri} 输入代码：${event.userCode}`);
			} else if (event.type === "complete") {
				setAuthMessage("登录成功。");
				setAuthRequestId(null);
				setAuthPrompt(null);
				void refreshAfterAuthChange("login");
				void window.codepiddy
					.listAuthProviders()
					.then(setAuthProviders)
					.catch(() => undefined);
			} else if (event.type === "error") {
				setAuthError(event.error);
				setAuthRequestId(null);
				setAuthPrompt(null);
			}
		});
		return off;
	}, [authDialogMode, authRequestId, refreshAfterAuthChange]);

	// 按条目 id 跳转：定位条 marker 锚定的是 user 消息节点，节点一定已渲染。
	function jumpToTranscriptMarker(entryId: string): void {
		const agentId = activeAgentId;
		const element = activeTranscriptRef.current;
		if (!agentId || !element) return;
		const scrollToTarget = (): void => {
			const entry = element.querySelector<HTMLElement>(`[data-minimap-id="${CSS.escape(entryId)}"]`);
			if (!entry) return;
			const baseTop = element.getBoundingClientRect().top;
			const offset = entry.getBoundingClientRect().top - baseTop + element.scrollTop;
			const top = Math.max(0, offset - 24);
			element.scrollTo({ top, behavior: "smooth" });
		};
		// 先解除贴底，避免程序滚动后被 follow 逻辑拉回底部。
		const controller = paneControllersRef.current.get(agentId);
		if (controller) controller.runJump(scrollToTarget);
		else requestAnimationFrame(scrollToTarget);
	}

	async function openProject(): Promise<void> {
		setBusy(true);
		setError(null);
		try {
			const nextProject = await window.codepiddy.openProject();
			if (!nextProject) return;
			if (project && project.rootPath.toLowerCase() !== nextProject.rootPath.toLowerCase()) {
				await window.codepiddy.closeProject(project.rootPath);
			}
			setProject(nextProject);
			setRecentProjects(await window.codepiddy.listRecentProjects());
			setSelection({ type: "project" });
			setExpanded(new Set([`project:${nextProject.id}`, "lane:requirements", "lane:bugs"]));
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "打开项目失败");
		} finally {
			setBusy(false);
		}
	}

	async function switchProject(recent: RecentProject): Promise<void> {
		if (!recent.available) return;
		if (project?.rootPath.toLowerCase() === recent.rootPath.toLowerCase()) {
			setSelection({ type: "project" });
			return;
		}
		setBusy(true);
		setError(null);
		try {
			const previousProject = project;
			const nextProject = await window.codepiddy.openRecentProject(recent.rootPath);
			if (previousProject) await window.codepiddy.closeProject(previousProject.rootPath);
			setProject(nextProject);
			setRecentProjects(await window.codepiddy.listRecentProjects());
			setSelection({ type: "project" });
			setExpanded(new Set([`project:${nextProject.id}`, "lane:requirements", "lane:bugs"]));
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "切换项目失败");
			setRecentProjects(await window.codepiddy.listRecentProjects());
		} finally {
			setBusy(false);
		}
	}

	async function closeCurrentProject(): Promise<void> {
		if (!project) return;
		setBusy(true);
		setError(null);
		try {
			setRecentProjects(await window.codepiddy.closeProject(project.rootPath));
			setProject(null);
			setSelection({ type: "welcome" });
			setExpanded(new Set());
			setExtensionDialog(null);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "关闭项目失败");
		} finally {
			setBusy(false);
		}
	}

	async function refreshProjectTrust(showPrompt = false): Promise<ProjectTrustStatus | null> {
		if (!project) {
			setProjectTrustStatus(null);
			setProjectTrustPromptOpen(false);
			return null;
		}
		if (demoMode || !("codepiddy" in window)) {
			const status: ProjectTrustStatus = {
				projectRoot: project.rootPath,
				decision: null,
				inheritedFrom: null,
				requiresTrust: true,
			};
			setProjectTrustStatus(status);
			if (showPrompt) setProjectTrustPromptOpen(true);
			return status;
		}
		setProjectTrustBusy(true);
		try {
			const status = await window.codepiddy.getProjectTrustStatus(project.rootPath);
			setProjectTrustStatus(status);
			if (showPrompt && status.requiresTrust && status.decision === null) setProjectTrustPromptOpen(true);
			return status;
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "读取项目信任状态失败");
			return null;
		} finally {
			setProjectTrustBusy(false);
		}
	}

	async function setProjectTrust(decision: boolean, includeParent = false): Promise<void> {
		if (!project) return;
		if (demoMode || !("codepiddy" in window)) {
			setProjectTrustStatus({
				projectRoot: project.rootPath,
				decision,
				inheritedFrom: project.rootPath,
				requiresTrust: true,
			});
			setProjectTrustPromptOpen(false);
			setSessionNotice(decision ? "项目信任已保存。" : "已保存为不信任项目。");
			return;
		}
		setProjectTrustBusy(true);
		setError(null);
		try {
			const status = await window.codepiddy.setProjectTrust({
				projectRoot: project.rootPath,
				decision,
				...(includeParent ? { includeParent: true } : {}),
			});
			setProjectTrustStatus(status);
			setProjectTrustPromptOpen(false);
			const locator = lastActiveAgentLocatorRef.current;
			const agentStatus = locator ? findAgentStatus(projectRef.current, locator) : null;
			if (locator && agentStatus && agentStatus !== "running" && agentStatus !== "waiting") {
				await window.codepiddy.reconnectAgent(locator);
				const [modelSelection, snapshot] = await Promise.all([
					window.codepiddy.getAgentModelSelection(locator),
					window.codepiddy.getAgentSessionSnapshot(locator),
				]);
				setModelSelections((current) => ({ ...current, [locator.agentInstanceId]: modelSelection }));
				setAgentSessionSnapshots((current) => ({ ...current, [locator.agentInstanceId]: snapshot }));
				setSessionNotice("项目信任已保存，当前 Agent 已重新连接。");
			} else {
				setSessionNotice(decision ? "项目信任已保存；重新连接 Agent 后加载项目资源。" : "已保存为不信任项目。");
			}
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "保存项目信任失败");
		} finally {
			setProjectTrustBusy(false);
		}
	}

	async function forgetRecentProject(recent: RecentProject): Promise<void> {
		if (project?.rootPath.toLowerCase() === recent.rootPath.toLowerCase()) return;
		try {
			setRecentProjects(await window.codepiddy.forgetRecentProject(recent.rootPath));
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "移除最近项目失败");
		}
	}

	function toggle(key: string): void {
		setExpanded((current) => {
			const next = new Set(current);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}

	async function createWorkItem(): Promise<void> {
		if (!project || !dialog) return;
		setBusy(true);
		setError(null);
		try {
			const nextProject = await window.codepiddy.createWorkItem({
				projectRoot: project.rootPath,
				lane: dialog.lane,
				title: dialog.title,
				description: dialog.description,
			});
			const created = nextProject.lanes.find((lane) => lane.kind === dialog.lane)?.workItems[0];
			setProject(nextProject);
			setDialog(null);
			if (created) {
				setExpanded((current) => new Set([...current, `lane:${dialog.lane}`, `work-item:${created.id}`]));
				setSelection({ type: "work-item", lane: dialog.lane, workItemId: created.id });
			}
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "创建工作项失败");
		} finally {
			setBusy(false);
		}
	}

	async function archiveWorkItem(lane: LaneKind, item: WorkItemSummary): Promise<void> {
		if (!project) return;
		setBusy(true);
		try {
			const nextProject = await window.codepiddy.archiveWorkItem({
				projectRoot: project.rootPath,
				lane,
				workItemId: item.id,
			});
			setProject(nextProject);
			setSelection({ type: "lane", lane });
			showSettingsToast(`“${item.title}”已归档`, "success", {
				action: {
					label: "撤销",
					onClick: () => void restoreWorkItem(lane, item.id),
				},
			});
		} finally {
			setBusy(false);
		}
	}

	async function restoreWorkItem(lane: LaneKind, workItemId: string): Promise<void> {
		if (!project) return;
		setBusy(true);
		setError(null);
		try {
			const nextProject = await window.codepiddy.restoreWorkItem({
				projectRoot: project.rootPath,
				lane,
				workItemId,
			});
			setProject(nextProject);
			setExpanded((current) => new Set([...current, `lane:${lane}`, `work-item:${workItemId}`]));
			setSelection({ type: "work-item", lane, workItemId });
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "恢复工作项失败");
		} finally {
			setBusy(false);
		}
	}

	async function renameSelectedWorkItem(): Promise<void> {
		if (!project || !renameDialog || !renameDialog.title.trim()) return;
		setBusy(true);
		setError(null);
		try {
			setProject(
				await window.codepiddy.renameWorkItem({
					projectRoot: project.rootPath,
					lane: renameDialog.lane,
					workItemId: renameDialog.item.id,
					title: renameDialog.title,
				}),
			);
			setRenameDialog(null);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "重命名工作项失败");
		} finally {
			setBusy(false);
		}
	}

	async function permanentlyDeleteWorkItem(): Promise<void> {
		if (!project || !deleteDialog) return;
		setBusy(true);
		setError(null);
		try {
			setProject(
				await window.codepiddy.deleteWorkItem({
					projectRoot: project.rootPath,
					lane: deleteDialog.lane,
					workItemId: deleteDialog.item.id,
				}),
			);
			setDeleteDialog(null);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "永久删除工作项失败");
		} finally {
			setBusy(false);
		}
	}

	function renderWorkItem(lane: LaneKind, item: WorkItemSummary) {
		const key = `work-item:${item.id}`;
		const normalizedQuery = searchQuery.trim().toLowerCase();
		const itemMatches =
			item.id.toLowerCase().includes(normalizedQuery) || item.title.toLowerCase().includes(normalizedQuery);
		const agentMatches = item.agentSlots.some(
			(slot) => slot.displayName.toLowerCase().includes(normalizedQuery) || slot.role.includes(normalizedQuery),
		);
		const isExpanded = expanded.has(key) || Boolean(normalizedQuery && agentMatches && !itemMatches);
		const isSelected = selection.type === "work-item" && selection.workItemId === item.id;
		return (
			<div className="tree-group" key={item.id}>
				<div className={`tree-row work-item-row ${isSelected ? "selected" : ""}`}>
					<button className="chevron-button" type="button" onClick={() => toggle(key)} aria-label="展开工作项">
						<Chevron expanded={isExpanded} />
					</button>
					<button
						className="tree-label"
						type="button"
						onClick={() => setSelection({ type: "work-item", lane, workItemId: item.id })}
					>
						<AppIcon name="folder" className="folder-glyph" />
						<span className="truncate">
							{item.id}：{item.title}
						</span>
					</button>
					<IconButton label="重命名工作项" onClick={() => setRenameDialog({ lane, item, title: item.title })}>
						<AppIcon name="edit" />
					</IconButton>
					<IconButton label="归档工作项" onClick={() => void archiveWorkItem(lane, item)}>
						<AppIcon name="archive" />
					</IconButton>
				</div>
				{isExpanded ? (
					<div className="tree-children agent-children">
						{item.agentSlots.map((slot) => (
							<button
								className={`tree-row agent-row ${selection.type === "agent" && selection.workItemId === item.id && selection.role === slot.role ? "selected" : ""}`}
								type="button"
								key={slot.role}
								onClick={() => setSelection({ type: "agent", lane, workItemId: item.id, role: slot.role })}
							>
								<span className="truncate" title={slot.displayName}>
									{slot.displayName}
								</span>
								<span className={`agent-create status-${slot.status}`}>{statusLabels[slot.status]}</span>
								{slot.currentInstanceId && (unreadCounts[slot.currentInstanceId] ?? 0) > 0 ? (
									<span className="agent-unread">
										{Math.min(99, unreadCounts[slot.currentInstanceId] ?? 0)}
									</span>
								) : null}
							</button>
						))}
					</div>
				) : null}
			</div>
		);
	}

	function renderLane(lane: ProjectSummary["lanes"][number]) {
		const key = `lane:${lane.kind}`;
		const isExpanded = expanded.has(key);
		const normalizedQuery = searchQuery.trim().toLowerCase();
		const activeItems = lane.workItems
			.filter((item) => item.status === "active")
			.filter(
				(item) =>
					!normalizedQuery ||
					lane.displayName.toLowerCase().includes(normalizedQuery) ||
					item.id.toLowerCase().includes(normalizedQuery) ||
					item.title.toLowerCase().includes(normalizedQuery) ||
					item.agentSlots.some(
						(slot) =>
							slot.displayName.toLowerCase().includes(normalizedQuery) || slot.role.includes(normalizedQuery),
					),
			);
		const archivedItems = lane.workItems.filter(
			(item) =>
				item.status === "archived" &&
				(!normalizedQuery ||
					item.id.toLowerCase().includes(normalizedQuery) ||
					item.title.toLowerCase().includes(normalizedQuery)),
		);
		const archivedKey = `archived:${lane.kind}`;
		const archivedExpanded = expanded.has(archivedKey) || Boolean(normalizedQuery && archivedItems.length > 0);
		return (
			<div className="tree-group" key={lane.kind}>
				<div
					className={`tree-row lane-row ${selection.type === "lane" && selection.lane === lane.kind ? "selected" : ""}`}
				>
					<button className="chevron-button" type="button" onClick={() => toggle(key)} aria-label="展开工作类型">
						<Chevron expanded={isExpanded} />
					</button>
					<button
						className="tree-label"
						type="button"
						onClick={() => setSelection({ type: "lane", lane: lane.kind })}
					>
						<AppIcon name="folder" className="folder-glyph" />
						<span>{lane.displayName}</span>
					</button>
					<IconButton
						label={`创建${lane.displayName}`}
						onClick={() => setDialog({ lane: lane.kind, title: "", description: "" })}
					>
						<AppIcon name="plus" />
					</IconButton>
				</div>
				{isExpanded ? (
					<div className="tree-children">
						{activeItems.map((item) => renderWorkItem(lane.kind, item))}
						{activeItems.length === 0 ? <div className="tree-empty">暂无工作项</div> : null}
						{archivedItems.length > 0 ? (
							<div className="archived-section">
								<button className="archived-count" type="button" onClick={() => toggle(archivedKey)}>
									<Chevron expanded={archivedExpanded} />
									<span>已归档 {archivedItems.length}</span>
								</button>
								{archivedExpanded ? (
									<div className="archived-list">
										{archivedItems.map((item) => (
											<div className="archived-row" key={item.id}>
												<AppIcon name="folder" className="folder-glyph" />
												<span className="truncate">
													{item.id}：{item.title}
												</span>
												<IconButton
													label="恢复工作项"
													onClick={() => void restoreWorkItem(lane.kind, item.id)}
												>
													<AppIcon name="restore" />
												</IconButton>
												<IconButton
													label="永久删除工作项"
													onClick={() => setDeleteDialog({ lane: lane.kind, item })}
												>
													<AppIcon name="close" />
												</IconButton>
											</div>
										))}
									</div>
								) : null}
							</div>
						) : null}
					</div>
				) : null}
			</div>
		);
	}

	async function createAgent(slot: AgentSlotSummary): Promise<void> {
		if (!project || !selectedWorkItem || !("codepiddy" in window)) return;
		setBusy(true);
		setError(null);
		try {
			const nextProject = await window.codepiddy.createAgent({
				projectRoot: project.rootPath,
				projectId: project.id,
				workItemId: selectedWorkItem.id,
				workItemDirectory: selectedWorkItem.directoryPath,
				lane: selectedWorkItem.lane,
				role: slot.role,
			});
			setProject(nextProject);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "创建 Agent 失败");
		} finally {
			setBusy(false);
		}
	}

	async function addImageFiles(agentId: string, files: File[]): Promise<void> {
		const imageFiles = files.filter((file) => PROMPT_IMAGE_MIME_TYPES.has(file.type));
		if (imageFiles.length === 0) {
			setError("请选择 PNG、JPEG、WebP 或 GIF 图片");
			return;
		}
		const remaining = Math.max(0, MAX_PROMPT_IMAGES - (imageAttachments[agentId]?.length ?? 0));
		if (remaining === 0) {
			setError(`每条消息最多附加 ${MAX_PROMPT_IMAGES} 张图片`);
			return;
		}
		if (imageFiles.length > remaining) setError(`每条消息最多附加 ${MAX_PROMPT_IMAGES} 张图片`);
		try {
			const attachments = await Promise.all(imageFiles.slice(0, remaining).map(imageAttachmentFromFile));
			setImageAttachments((current) => ({
				...current,
				[agentId]: [...(current[agentId] ?? []), ...attachments].slice(0, MAX_PROMPT_IMAGES),
			}));
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "读取图片失败");
		}
	}

	function removeImageAttachment(agentId: string, attachmentId: string): void {
		setImageAttachments((current) => ({
			...current,
			[agentId]: (current[agentId] ?? []).filter((image) => image.id !== attachmentId),
		}));
	}

	async function sendPrompt(slot: AgentSlotSummary, explicitMessage?: string): Promise<void> {
		if (!project || !selectedWorkItem || !slot.currentInstanceId || (!demoMode && !("codepiddy" in window))) return;
		const agentId = slot.currentInstanceId;
		const message = explicitMessage?.trim() || drafts[agentId]?.trim() || "";
		const images = imageAttachments[agentId] ?? [];
		if (!message && images.length === 0) return;
		const locator = {
			agentInstanceId: agentId,
			projectId: project.id,
			workItemId: selectedWorkItem.id,
			role: slot.role,
		};
		const invocation = /^\/([^\s]+)(?:\s+([\s\S]*))?$/.exec(message);
		if (invocation) {
			const name = invocation[1] ?? "";
			const args = invocation[2]?.trim() ?? "";
			let command = (agentCommands[agentId] ?? []).find((candidate) => candidate.name === name);
			if (!command && "codepiddy" in window) {
				try {
					const commands = await loadAgentCommands(locator);
					command = commands.find((candidate) => candidate.name === name);
				} catch (caught) {
					setError(caught instanceof Error ? caught.message : "读取 Pi 命令失败");
					return;
				}
			}
			if (!command) {
				setError(`Pi 当前没有 /${name} 命令。请重新打开命令菜单或执行 /reload。`);
				return;
			}
			if (name === "llama") {
				setDrafts((current) => ({ ...current, [agentId]: "" }));
				await openSettings("llama");
				return;
			}
			if (name === "debug") {
				setDrafts((current) => ({ ...current, [agentId]: "" }));
				await openSettings("diagnostics");
				return;
			}
			if (command.source === "builtin") {
				if (name === "mcp") {
					setDrafts((current) => ({ ...current, [agentId]: "" }));
					await openSettings("mcp");
					return;
				}
				if (name === "settings") {
					setDrafts((current) => ({ ...current, [agentId]: "" }));
					await openSettings();
					return;
				}
				if (name === "model") {
					if (!args) {
						setDrafts((current) => ({ ...current, [agentId]: "" }));
						await openModelPicker(slot);
						return;
					}
					const selection = modelSelections[agentId];
					const model = selection?.availableModels.find(
						(candidate) => `${candidate.provider}/${candidate.id}` === args,
					);
					if (!model) {
						setError(`Pi 当前不可用模型：${args}`);
						return;
					}
					if (await chooseModel(slot, model.provider, model.id)) {
						setDrafts((current) => ({ ...current, [agentId]: "" }));
					}
					return;
				}
				if (name === "thinking") {
					if (!args) {
						setDrafts((current) => ({ ...current, [agentId]: "" }));
						await cycleThinking(slot);
						return;
					}
					const selection = modelSelections[agentId];
					if (!selection?.availableThinkingLevels.includes(args)) {
						setError(`Pi 当前模型不支持 Thinking Level：${args}`);
						return;
					}
					if (await chooseThinking(slot, args)) {
						setDrafts((current) => ({ ...current, [agentId]: "" }));
					}
					return;
				}
				if (name === "session") {
					setDrafts((current) => ({ ...current, [agentId]: "" }));
					await openSessionStats(locator, slot.displayName);
					return;
				}
				if (name === "share") {
					setDrafts((current) => ({ ...current, [agentId]: "" }));
					await openSessionShare(locator, slot.displayName);
					return;
				}
				if (name === "fork" || name === "tree") {
					setDrafts((current) => ({ ...current, [agentId]: "" }));
					await openSessionPanel(slot);
					return;
				}
				setBusy(true);
				setError(null);
				try {
					const result = await window.codepiddy.invokeAgentBuiltinCommand({ ...locator, name, args });
					if (result.copiedText) await navigator.clipboard.writeText(result.copiedText);
					setDrafts((current) => ({ ...current, [agentId]: "" }));
					if (result.sessionReset) setTranscripts((current) => ({ ...current, [agentId]: [] }));
					if (result.message) {
						updateTranscript(agentId, (items) => [
							...items,
							{
								id: crypto.randomUUID(),
								type: "system",
								text: result.message!,
								createdAt: new Date().toISOString(),
							},
						]);
					}
					if (result.commandsChanged || result.sessionReset) {
						const [modelSelection, commands] = await Promise.all([
							window.codepiddy.getAgentModelSelection(locator),
							window.codepiddy.getAgentCommands(locator),
						]);
						setModelSelections((current) => ({ ...current, [agentId]: modelSelection }));
						setAgentCommands((current) => ({ ...current, [agentId]: commands }));
					}
					void refreshAgentSessionSnapshot(locator);
				} catch (caught) {
					setError(caught instanceof Error ? caught.message : `执行 /${name} 失败`);
				} finally {
					setBusy(false);
				}
				return;
			}
		}
		try {
			await window.codepiddy.sendAgentPrompt({
				...locator,
				message,
				...(images.length > 0 ? { images } : {}),
				streamingBehavior: "steer",
			});
			setDrafts((current) => ({ ...current, [agentId]: "" }));
			setImageAttachments((current) => ({ ...current, [agentId]: [] }));
			pendingToolFailures.current.delete(agentId);
			setToolRecoveryOffers((current) => {
				if (!(agentId in current)) return current;
				const next = { ...current };
				delete next[agentId];
				return next;
			});
			const delivery = slot.status === "running" ? "steer" : undefined;
			updateTranscript(agentId, (items) => [
				...items,
				{
					id: crypto.randomUUID(),
					type: "user",
					text: message,
					...(images.length > 0 ? { images } : {}),
					...(delivery ? { delivery } : {}),
					createdAt: new Date().toISOString(),
				},
			]);
			if (delivery) updateAgentActivity(agentId, { label: "消息已追加到当前运行", kind: "working", queued: 1 });
		} catch (caught) {
			try {
				const leaseStatus = await window.codepiddy.getProjectWriteLeaseStatus(project.id);
				if (leaseStatus.lease && leaseStatus.stale) {
					setWriteLeaseDialog(leaseStatus);
					return;
				}
			} catch {}
			setError(clientErrorMessage(caught, "发送消息失败"));
		}
	}

	async function continueAfterToolFailure(slot: AgentSlotSummary): Promise<void> {
		if (!slot.currentInstanceId) return;
		const offer = toolRecoveryOffers[slot.currentInstanceId];
		if (!offer) return;
		await sendPrompt(
			slot,
			`上一个 ${offer.toolName} 工具调用失败了。请阅读失败原因，不要原样重复相同调用；优先使用允许的路径、替代工具或无工具方案继续处理。如果无法恢复，请明确说明阻塞原因。`,
		);
	}

	async function clearStaleWriteLease(): Promise<void> {
		if (!project) return;
		setBusy(true);
		setError(null);
		try {
			await window.codepiddy.clearStaleProjectWriteLease(project.id);
			setWriteLeaseDialog(null);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "清理写锁失败");
		} finally {
			setBusy(false);
		}
	}

	const abortAgent = useCallback(
		async (slot: AgentSlotSummary): Promise<void> => {
			if (!project || !selectedWorkItem || !slot.currentInstanceId || !("codepiddy" in window)) return;
			const agentId = slot.currentInstanceId;
			if (abortingAgents[agentId]) return;
			const locator: AgentInstanceLocator = {
				agentInstanceId: agentId,
				projectId: project.id,
				workItemId: selectedWorkItem.id,
				role: slot.role,
			};
			setAbortingAgents((current) => ({ ...current, [agentId]: true }));
			setError(null);
			updateAgentActivity(agentId, null);
			const assistantId = activeAssistantIds.current.get(agentId);
			if (assistantId) {
				updateTranscript(agentId, (items) => finalizeAssistantTranscript(items, assistantId, undefined, "aborted"));
				activeAssistantIds.current.delete(agentId);
			}
			try {
				if (extensionDialog?.agentInstanceId === agentId) {
					const requestId = extensionDialog.requestId;
					setExtensionDialog(null);
					await window.codepiddy.respondToExtensionUi({ ...locator, requestId, cancelled: true });
				}
				await window.codepiddy.abortAgent(locator);
				setPendingExtensionUiRequests((current) => {
					const next = { ...current };
					delete next[agentId];
					return next;
				});
				pendingToolFailures.current.delete(agentId);
				setToolRecoveryOffers((current) => {
					const next = { ...current };
					delete next[agentId];
					return next;
				});
				updateAgentStatus({ ...locator, event: {} }, "idle");
				void refreshAgentSessionSnapshot(locator);
			} catch (caught) {
				setError(clientErrorMessage(caught, "中断当前回复失败"));
			} finally {
				setAbortingAgents((current) => ({ ...current, [agentId]: false }));
			}
		},
		[
			abortingAgents,
			extensionDialog,
			project,
			refreshAgentSessionSnapshot,
			selectedWorkItem,
			updateAgentActivity,
			updateAgentStatus,
			updateTranscript,
		],
	);

	async function openSessionPanel(slot: AgentSlotSummary): Promise<void> {
		if (!project || !selectedWorkItem || !slot.currentInstanceId) return;
		setAgentActionsOpen(null);
		if (demoMode) {
			setSessionPanel({
				agentInstanceId: slot.currentInstanceId,
				projectId: project.id,
				workItemId: selectedWorkItem.id,
				role: slot.role,
				displayName: slot.displayName,
				snapshot: demoSessionSnapshot,
				sessions: [
					{
						sessionId: "demo-session",
						name: "登录功能实现",
						preview: "按照 design.md 和 tasks.md 实现登录功能。",
						messageCount: 6,
						createdAt: "2026-09-17T02:10:00.000Z",
						updatedAt: "2026-09-17T02:38:00.000Z",
						isCurrent: true,
					},
					{
						sessionId: "demo-session-old",
						name: "会话过期边界",
						preview: "修复 Review Agent 提出的会话过期边界问题。",
						messageCount: 12,
						createdAt: "2026-09-16T09:00:00.000Z",
						updatedAt: "2026-09-16T09:30:00.000Z",
						isCurrent: false,
					},
				],
			});
			return;
		}
		setSessionPanelLoading(true);
		setError(null);
		try {
			const locator = {
				agentInstanceId: slot.currentInstanceId,
				projectId: project.id,
				workItemId: selectedWorkItem.id,
				role: slot.role,
			};
			const [snapshot, sessions] = await Promise.all([
				window.codepiddy.getAgentSessionSnapshot(locator),
				window.codepiddy.listAgentSessions(locator),
			]);
			setSessionPanel({
				...locator,
				displayName: slot.displayName,
				snapshot,
				sessions,
			});
			setAgentSessionSnapshots((current) => ({ ...current, [slot.currentInstanceId!]: snapshot }));
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "读取会话树失败");
		} finally {
			setSessionPanelLoading(false);
		}
	}

	async function openSessionStats(locator: AgentInstanceLocator, displayName: string): Promise<void> {
		setSessionStatsDialog({ locator, displayName });
		setSessionStatsLoading(true);
		setSessionStats(demoMode ? demoSessionStats : null);
		if (demoMode || !("codepiddy" in window)) {
			setSessionStatsLoading(false);
			return;
		}
		try {
			setSessionStats(await window.codepiddy.getAgentSessionStats(locator));
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "读取 Session 统计失败");
			setSessionStatsDialog(null);
		} finally {
			setSessionStatsLoading(false);
		}
	}

	async function openSessionShare(
		locator: AgentInstanceLocator,
		displayName: string,
		sessionName?: string | null,
	): Promise<void> {
		setSessionShareDialog({
			locator,
			displayName,
			sessionName: sessionName ?? agentSessionSnapshots[locator.agentInstanceId]?.sessionName ?? null,
			result: null,
			error: null,
		});
	}

	async function shareAgentSession(): Promise<void> {
		if (!sessionShareDialog || sessionShareBusy) return;
		const dialog = sessionShareDialog;
		setSessionShareBusy(true);
		setSessionShareDialog({ ...dialog, error: null, result: null });
		try {
			if (demoMode || !("codepiddy" in window)) {
				setSessionShareDialog({
					...dialog,
					result: {
						provider: "github",
						viewerUrl: "https://pi.dev/session/#demo-share-gist",
						gistUrl: "https://gist.github.com/demo/demo-share-gist",
					},
				});
				showSettingsToast("分享链接已生成。", "success");
				return;
			}
			const result = await window.codepiddy.shareAgentSession(dialog.locator);
			setSessionShareDialog({ ...dialog, result, error: null });
			showSettingsToast("分享链接已生成。", "success");
		} catch (caught) {
			const message = caught instanceof Error ? caught.message : "分享会话失败";
			setSessionShareDialog({ ...dialog, result: null, error: message });
		} finally {
			setSessionShareBusy(false);
		}
	}

	function openExternalLink(url: string): void {
		if (demoMode || !("codepiddy" in window)) {
			window.open(url, "_blank", "noopener,noreferrer");
			return;
		}
		void window.codepiddy.openExternalUrl(url).catch((caught: unknown) => {
			setError(caught instanceof Error ? caught.message : "打开链接失败");
		});
	}

	async function importAgentSession(): Promise<void> {
		if (!sessionPanel) return;
		if (demoMode) {
			setSessionPanel((current) =>
				current
					? {
							...current,
							sessions: [
								{
									sessionId: `imported-${current.sessions.length + 1}`,
									name: "导入的会话",
									preview: "从 JSONL 文件导入",
									messageCount: 8,
									createdAt: new Date().toISOString(),
									updatedAt: new Date().toISOString(),
									isCurrent: true,
								},
								...current.sessions.map((session) => ({ ...session, isCurrent: false })),
							],
						}
					: current,
			);
			setSessionNotice("会话已导入。");
			return;
		}
		if (!("codepiddy" in window)) return;
		setSessionPanelLoading(true);
		setError(null);
		try {
			const result = await window.codepiddy.importAgentSession({
				agentInstanceId: sessionPanel.agentInstanceId,
				projectId: sessionPanel.projectId,
				workItemId: sessionPanel.workItemId,
				role: sessionPanel.role,
			});
			if (!result) return;
			setSessionPanel((current) =>
				current ? { ...current, snapshot: result.snapshot, sessions: result.sessions } : current,
			);
			setAgentSessionSnapshots((current) => ({
				...current,
				[sessionPanel.agentInstanceId]: result.snapshot,
			}));
			setDrafts((current) => ({ ...current, [sessionPanel.agentInstanceId]: "" }));
			setSessionNotice("会话已导入并切换。");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "导入会话失败");
		} finally {
			setSessionPanelLoading(false);
		}
	}

	async function renameAgentSession(): Promise<void> {
		if (!sessionRenameDialog) return;
		const name = sessionRenameDialog.name.trim();
		if (!name) return;
		const locator = sessionRenameDialog.locator;
		setSessionPanelLoading(true);
		setError(null);
		try {
			if (demoMode) {
				setSessionPanel((current) =>
					current
						? {
								...current,
								snapshot: { ...current.snapshot, sessionName: name },
								sessions: current.sessions.map((session) =>
									session.sessionId === current.snapshot.sessionId ? { ...session, name } : session,
								),
							}
						: current,
				);
				setAgentSessionSnapshots((current) => {
					const snapshot = current[locator.agentInstanceId];
					return snapshot
						? { ...current, [locator.agentInstanceId]: { ...snapshot, sessionName: name } }
						: current;
				});
				setSessionRenameDialog(null);
				setSessionNotice(`Session 已重命名为：${name}`);
				return;
			}
			if (!("codepiddy" in window)) return;
			await window.codepiddy.invokeAgentBuiltinCommand({ ...locator, name: "name", args: name });
			const [snapshot, sessions] = await Promise.all([
				window.codepiddy.getAgentSessionSnapshot(locator),
				window.codepiddy.listAgentSessions(locator),
			]);
			setSessionPanel((current) =>
				current && current.agentInstanceId === locator.agentInstanceId
					? { ...current, snapshot, sessions }
					: current,
			);
			setAgentSessionSnapshots((current) => ({ ...current, [locator.agentInstanceId]: snapshot }));
			setSessionRenameDialog(null);
			setSessionNotice(`Session 已重命名为：${name}`);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "重命名会话失败");
		} finally {
			setSessionPanelLoading(false);
		}
	}

	function closeAuthDialog(): void {
		if (authRequestId && "codepiddy" in window) void window.codepiddy.cancelAuthLogin(authRequestId);
		setAuthDialogMode(null);
		setAuthRequestId(null);
		setAuthPrompt(null);
		setAuthPromptValue("");
		setAuthMessage(null);
		setAuthError(null);
	}

	async function openAuthDialog(
		mode: "login" | "logout",
		providerArg?: string,
		scope: "all" | "provider" | "share" = "all",
	): Promise<void> {
		if (demoMode || !("codepiddy" in window)) {
			setError("Provider 登录只在桌面客户端中可用。");
			return;
		}
		setAuthDialogMode(mode);
		setAuthBusy(true);
		setAuthError(null);
		setAuthMessage(null);
		setAuthPrompt(null);
		setAuthPromptValue("");
		setAuthRequestId(null);
		try {
			const allProviders = await window.codepiddy.listAuthProviders();
			const providers =
				scope === "share"
					? allProviders.filter((provider) => provider.id === "radius")
					: scope === "provider"
						? allProviders.filter((provider) => provider.id !== "radius")
						: allProviders;
			const candidates =
				mode === "logout"
					? providers.filter((provider) => provider.configured && provider.source === "stored")
					: providers;
			setAuthProviders(candidates);
			const selected =
				candidates.find((provider) => provider.id === providerArg) ??
				candidates.find((provider) => provider.configured) ??
				candidates[0];
			setAuthProviderId(selected?.id ?? null);
			setAuthMethod(selected?.methods[0]?.type ?? null);
			if (candidates.length === 0) {
				setAuthError(mode === "logout" ? "没有已登录的 Provider。" : "Pi 当前没有可登录的 Provider。");
			}
		} catch (caught) {
			setAuthError(caught instanceof Error ? caught.message : "读取 Provider 失败");
		} finally {
			setAuthBusy(false);
		}
	}

	async function startAuthLogin(): Promise<void> {
		const provider = authProviders.find((candidate) => candidate.id === authProviderId);
		if (!provider || !authMethod || !("codepiddy" in window)) return;
		setAuthBusy(true);
		setAuthError(null);
		setAuthMessage("正在准备登录…");
		try {
			const requestId = await window.codepiddy.startAuthLogin({ providerId: provider.id, authType: authMethod });
			setAuthRequestId(requestId);
		} catch (caught) {
			setAuthError(caught instanceof Error ? caught.message : "启动登录失败");
			setAuthMessage(null);
		} finally {
			setAuthBusy(false);
		}
	}

	async function submitAuthPrompt(): Promise<void> {
		if (!authRequestId || !authPrompt || !("codepiddy" in window)) return;
		setAuthBusy(true);
		try {
			await window.codepiddy.respondAuthPrompt({
				requestId: authRequestId,
				promptId: authPrompt.promptId,
				value: authPromptValue,
			});
			setAuthPrompt(null);
			setAuthPromptValue("");
		} catch (caught) {
			setAuthError(caught instanceof Error ? caught.message : "提交登录信息失败");
		} finally {
			setAuthBusy(false);
		}
	}

	async function logoutAuthProvider(): Promise<void> {
		if (!authProviderId || !("codepiddy" in window)) return;
		setAuthBusy(true);
		setAuthError(null);
		try {
			await window.codepiddy.logoutAuthProvider(authProviderId);
			setAuthMessage("已退出该 Provider。");
			setAuthProviders(await window.codepiddy.listAuthProviders());
			void refreshAfterAuthChange("logout");
		} catch (caught) {
			setAuthError(caught instanceof Error ? caught.message : "退出登录失败");
		} finally {
			setAuthBusy(false);
		}
	}

	async function forkAgentSession(entryId: string, target?: AgentInstanceLocator): Promise<void> {
		const locator =
			target ??
			(sessionPanel
				? {
						agentInstanceId: sessionPanel.agentInstanceId,
						projectId: sessionPanel.projectId,
						workItemId: sessionPanel.workItemId,
						role: sessionPanel.role,
					}
				: null);
		if (!locator) return;
		setSessionPanelLoading(true);
		setForkingEntryId(entryId);
		setError(null);
		try {
			if (demoMode) {
				setSessionPanel(null);
				setSessionNotice("已从该节点创建分支，原消息已填回输入框");
				return;
			}
			const result = await window.codepiddy.forkAgentSession({ ...locator, entryId });
			if (result.cancelled) return;
			const sessions = await window.codepiddy.listAgentSessions(locator);
			setSessionPanel((current) =>
				current && current.agentInstanceId === locator.agentInstanceId
					? { ...current, snapshot: result.snapshot, sessions }
					: current,
			);
			setAgentSessionSnapshots((current) => ({ ...current, [locator.agentInstanceId]: result.snapshot }));
			setDrafts((current) => ({ ...current, [locator.agentInstanceId]: result.selectedText }));
			const modelSelection = await window.codepiddy.getAgentModelSelection(locator);
			setModelSelections((current) => ({ ...current, [locator.agentInstanceId]: modelSelection }));
			setSessionPanel(null);
			setSessionNotice("已从该节点创建分支，原消息已填回输入框");
			window.requestAnimationFrame(() => composerInputRef.current?.focus());
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Fork 会话失败");
		} finally {
			setSessionPanelLoading(false);
			setForkingEntryId(null);
		}
	}

	async function openAgentSessionCreate(): Promise<void> {
		if (!sessionPanel) return;
		const agentInstanceId = sessionPanel.agentInstanceId;
		const locator = {
			agentInstanceId,
			projectId: sessionPanel.projectId,
			workItemId: sessionPanel.workItemId,
			role: sessionPanel.role,
		};
		let selection = modelSelections[agentInstanceId];
		setSessionCreateError(null);
		if (!selection && !demoMode && "codepiddy" in window) {
			setSessionPanelLoading(true);
			try {
				selection = await window.codepiddy.getAgentModelSelection(locator);
				setModelSelections((current) => ({ ...current, [agentInstanceId]: selection }));
			} catch (caught) {
				setSessionCreateError(clientErrorMessage(caught, "读取模型失败"));
			} finally {
				setSessionPanelLoading(false);
			}
		}
		const models = selection?.availableModels ?? [];
		const modelIndex = Math.max(
			0,
			models.findIndex((model) => model.provider === selection?.model.provider && model.id === selection?.model.id),
		);
		setSessionCreateDraft({ name: "", modelIndex });
	}

	function closeAgentSessionCreate(): void {
		setSessionCreateDraft(null);
		setSessionCreateError(null);
	}

	async function createAgentSession(): Promise<void> {
		if (!sessionPanel || !sessionCreateDraft) return;
		const agentInstanceId = sessionPanel.agentInstanceId;
		const locator = {
			agentInstanceId,
			projectId: sessionPanel.projectId,
			workItemId: sessionPanel.workItemId,
			role: sessionPanel.role,
		};
		const selection = modelSelections[agentInstanceId];
		const model = selection?.availableModels[sessionCreateDraft.modelIndex];
		if (!model) {
			setSessionCreateError("请选择模型");
			return;
		}
		const name = sessionCreateDraft.name.trim();
		setSessionCreateError(null);
		if (demoMode) {
			setSessionPanel((current) => {
				if (!current) return current;
				const sessionId = `demo-session-${current.sessions.length + 1}`;
				return {
					...current,
					snapshot: {
						...current.snapshot,
						sessionId,
						sessionName: name || undefined,
						messageCount: 0,
						pendingMessageCount: 0,
						isStreaming: false,
						isCompacting: false,
						leafId: null,
						nodes: [],
					},
					sessions: [
						{
							sessionId,
							name: name || null,
							preview: "新会话",
							messageCount: 0,
							createdAt: new Date().toISOString(),
							updatedAt: new Date().toISOString(),
							isCurrent: true,
						},
						...current.sessions.map((session) => ({ ...session, isCurrent: false })),
					],
				};
			});
			if (selection) {
				setModelSelections((current) => ({ ...current, [agentInstanceId]: { ...selection, model } }));
			}
			setDrafts((current) => ({ ...current, [agentInstanceId]: "" }));
			setSessionCreateDraft(null);
			setSessionPanel(null);
			setSessionNotice(name ? `已创建会话：${name}` : "已创建新会话");
			window.requestAnimationFrame(() => composerInputRef.current?.focus());
			return;
		}
		if (!("codepiddy" in window)) return;
		setSessionPanelLoading(true);
		try {
			await window.codepiddy.newAgentSession(locator);
			const setupErrors: string[] = [];
			if (!selection || selection.model.provider !== model.provider || selection.model.id !== model.id) {
				try {
					const nextSelection = await window.codepiddy.setAgentModel({
						...locator,
						provider: model.provider,
						modelId: model.id,
					});
					setModelSelections((current) => ({ ...current, [agentInstanceId]: nextSelection }));
				} catch (caught) {
					setupErrors.push(`模型设置失败：${clientErrorMessage(caught, "未知错误")}`);
				}
			}
			if (name) {
				try {
					await window.codepiddy.invokeAgentBuiltinCommand({ ...locator, name: "name", args: name });
				} catch (caught) {
					setupErrors.push(`会话命名失败：${clientErrorMessage(caught, "未知错误")}`);
				}
			}
			const [snapshotResult, sessionsResult, selectionResult] = await Promise.allSettled([
				window.codepiddy.getAgentSessionSnapshot(locator),
				window.codepiddy.listAgentSessions(locator),
				window.codepiddy.getAgentModelSelection(locator),
			]);
			const snapshot = snapshotResult.status === "fulfilled" ? snapshotResult.value : null;
			const sessions = sessionsResult.status === "fulfilled" ? sessionsResult.value : null;
			setSessionPanel((current) =>
				current && current.agentInstanceId === agentInstanceId
					? {
							...current,
							...(snapshot ? { snapshot } : {}),
							...(sessions ? { sessions } : {}),
						}
					: current,
			);
			if (snapshot) {
				setAgentSessionSnapshots((current) => ({ ...current, [agentInstanceId]: snapshot }));
			}
			if (selectionResult.status === "fulfilled") {
				setModelSelections((current) => ({
					...current,
					[agentInstanceId]: selectionResult.value,
				}));
			}
			setDrafts((current) => ({ ...current, [agentInstanceId]: "" }));
			setSessionCreateDraft(null);
			setSessionPanel(null);
			if (setupErrors.length > 0) {
				setError(`新会话已创建，但${setupErrors.join("；")}`);
			} else {
				setSessionNotice(name ? `已创建会话：${name}` : "已创建新会话");
			}
			window.requestAnimationFrame(() => composerInputRef.current?.focus());
		} catch (caught) {
			setSessionCreateError(clientErrorMessage(caught, "新建会话失败"));
		} finally {
			setSessionPanelLoading(false);
		}
	}

	async function switchAgentSession(sessionId: string): Promise<void> {
		if (!sessionPanel || sessionPanel.snapshot.sessionId === sessionId) return;
		if (demoMode) {
			setSessionPanel((current) =>
				current
					? {
							...current,
							sessions: current.sessions.map((session) => ({
								...session,
								isCurrent: session.sessionId === sessionId,
							})),
						}
					: current,
			);
			return;
		}
		setSessionPanelLoading(true);
		setError(null);
		try {
			const result = await window.codepiddy.switchAgentSession({
				agentInstanceId: sessionPanel.agentInstanceId,
				projectId: sessionPanel.projectId,
				workItemId: sessionPanel.workItemId,
				role: sessionPanel.role,
				sessionId,
			});
			setSessionPanel((current) =>
				current ? { ...current, snapshot: result.snapshot, sessions: result.sessions } : current,
			);
			setDrafts((current) => ({ ...current, [sessionPanel.agentInstanceId]: "" }));
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "切换会话失败");
		} finally {
			setSessionPanelLoading(false);
		}
	}

	async function deleteAgentSession(): Promise<void> {
		const dialog = sessionDeleteDialog;
		if (!dialog) return;
		if (demoMode) {
			setSessionPanel((current) =>
				current
					? {
							...current,
							sessions: current.sessions.filter((session) => session.sessionId !== dialog.sessionId),
						}
					: current,
			);
			setSessionDeleteDialog(null);
			return;
		}
		setSessionPanelLoading(true);
		setError(null);
		try {
			const sessions = await window.codepiddy.deleteAgentSession({
				...dialog.locator,
				sessionId: dialog.sessionId,
			});
			setSessionPanel((current) =>
				current && current.agentInstanceId === dialog.locator.agentInstanceId ? { ...current, sessions } : current,
			);
			setSessionDeleteDialog(null);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "删除会话失败");
		} finally {
			setSessionPanelLoading(false);
		}
	}

	async function cloneAgentSession(slot: AgentSlotSummary): Promise<void> {
		if (!project || !selectedWorkItem || !slot.currentInstanceId) return;
		setBusy(true);
		setError(null);
		setAgentActionsOpen(null);
		try {
			await window.codepiddy.cloneAgentSession({
				agentInstanceId: slot.currentInstanceId,
				projectId: project.id,
				workItemId: selectedWorkItem.id,
				role: slot.role,
			});
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "克隆会话失败");
		} finally {
			setBusy(false);
		}
	}

	async function reconnectAgent(slot: AgentSlotSummary): Promise<void> {
		if (!project || !selectedWorkItem || !slot.currentInstanceId) return;
		setBusy(true);
		setError(null);
		setAgentActionsOpen(null);
		try {
			await window.codepiddy.reconnectAgent({
				agentInstanceId: slot.currentInstanceId,
				projectId: project.id,
				workItemId: selectedWorkItem.id,
				role: slot.role,
			});
		} catch (caught) {
			setError(clientErrorMessage(caught, "重新连接 Pi 失败"));
		} finally {
			setBusy(false);
		}
	}

	async function resetSelectedAgent(): Promise<void> {
		if (!project || !resetAgentDialog) return;
		const { workItem, slot } = resetAgentDialog;
		const oldAgentId = slot.currentInstanceId;
		if (!oldAgentId) return;
		setBusy(true);
		setError(null);
		try {
			const nextProject = await window.codepiddy.resetAgent({
				agentInstanceId: oldAgentId,
				projectRoot: project.rootPath,
				projectId: project.id,
				workItemId: workItem.id,
				workItemDirectory: workItem.directoryPath,
				lane: workItem.lane,
				role: slot.role,
			});
			setProject(nextProject);
			setTranscripts((current) => {
				const next = { ...current };
				delete next[oldAgentId];
				return next;
			});
			setDrafts((current) => {
				const next = { ...current };
				delete next[oldAgentId];
				return next;
			});
			setModelSelections((current) => {
				const next = { ...current };
				delete next[oldAgentId];
				return next;
			});
			setAgentSessionSnapshots((current) => {
				const next = { ...current };
				delete next[oldAgentId];
				return next;
			});
			setResetAgentDialog(null);
			setAgentActionsOpen(null);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "重置 Agent 失败");
		} finally {
			setBusy(false);
		}
	}

	async function respondToExtensionDialog(response: {
		value?: string;
		confirmed?: boolean;
		cancelled?: true;
	}): Promise<void> {
		if (!extensionDialog || !("codepiddy" in window)) return;
		const current = extensionDialog;
		if (extensionUiResponsesInFlight.current.has(current.requestId)) return;
		extensionUiResponsesInFlight.current.add(current.requestId);
		setExtensionDialog(null);
		try {
			await window.codepiddy.respondToExtensionUi({
				agentInstanceId: current.agentInstanceId,
				projectId: current.projectId,
				workItemId: current.workItemId,
				role: current.role,
				requestId: current.requestId,
				...response,
			});
			setPendingExtensionUiRequests((requests) => {
				const next = { ...requests };
				delete next[current.agentInstanceId];
				return next;
			});
			setDeferredExtensionUiAgentId((agentId) => (agentId === current.agentInstanceId ? null : agentId));
			updateAgentStatus(
				{
					agentInstanceId: current.agentInstanceId,
					projectId: current.projectId,
					workItemId: current.workItemId,
					role: current.role,
					event: {},
				},
				"running",
			);
		} catch (caught) {
			const message = caught instanceof Error ? caught.message : String(caught);
			if (!/request is no longer active|Agent process is not active/i.test(message)) {
				setExtensionDialog(current);
				setError(clientErrorMessage(caught, "提交扩展响应失败"));
			}
		} finally {
			extensionUiResponsesInFlight.current.delete(current.requestId);
		}
	}

	useLayoutEffect(() => {
		if (!modelPickerAgentId) {
			modelPickerInitializedRef.current = null;
			return;
		}
		if (modelPickerInitializedRef.current === modelPickerAgentId) return;
		const currentSelection = modelSelections[modelPickerAgentId];
		if (!currentSelection) return;
		const currentIndex = currentSelection
			? modelPickerOptions.findIndex(
					(model) => model.provider === currentSelection.model.provider && model.id === currentSelection.model.id,
				)
			: -1;
		const nextIndex = currentIndex >= 0 && !modelSearch ? currentIndex : 0;
		modelPickerSelectedIndexRef.current = nextIndex;
		modelPickerKeyboardScrollRef.current = true;
		modelPickerInitializedRef.current = modelPickerAgentId;
		setModelPickerSelectedIndex(nextIndex);
		modelSearchInputRef.current?.focus();
	}, [modelPickerAgentId, modelPickerOptions, modelSearch, modelSelections]);

	useEffect(() => {
		if (!modelPickerAgentId) return;
		// 之前模型选择器是居中对话框，靠一层全屏遮罩按钮来点外面关闭。
		// 改成贴着模型名向上弹的抽屉之后没有遮罩了，改成监听 document 上的
		// mousedown：点在抽屉和触发按钮之外才算关，点抽屉内部（搜索框、滚动）不算。
		const onPointerDown = (event: MouseEvent): void => {
			const target = event.target as Node;
			if (modelPickerRef.current?.contains(target)) return;
			if ((target as HTMLElement).closest?.(".model-picker-anchor")) return;
			setModelPickerAgentId(null);
			setModelSearch("");
		};
		document.addEventListener("mousedown", onPointerDown);
		return () => document.removeEventListener("mousedown", onPointerDown);
	}, [modelPickerAgentId]);

	useEffect(() => {
		if (!modelPickerAgentId || !modelPickerKeyboardScrollRef.current) return;
		const selected = modelListRef.current?.querySelector<HTMLElement>(
			`[data-model-index="${modelPickerSelectedIndex}"]`,
		);
		selected?.scrollIntoView({ block: "nearest" });
	}, [modelPickerAgentId, modelPickerSelectedIndex]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent): void => {
			if (event.key !== "Escape" || event.defaultPrevented) return;
			if (extensionDialog) return;
			if (sessionRenameDialog) {
				setSessionRenameDialog(null);
			} else if (sessionStatsDialog) {
				setSessionStatsDialog(null);
			} else if (sessionShareDialog) {
				if (!sessionShareBusy) setSessionShareDialog(null);
			} else if (projectTrustPromptOpen) {
				setProjectTrustPromptOpen(false);
			} else if (modelPickerAgentId) {
				setModelPickerAgentId(null);
				setModelSearch("");
			} else if (sessionDeleteDialog) setSessionDeleteDialog(null);
			else if (sessionPanel) setSessionPanel(null);
			else if (shellRestartDialog) setShellRestartDialog(false);
			else if (deleteDialog) setDeleteDialog(null);
			else if (resetAgentDialog) setResetAgentDialog(null);
			else if (renameDialog) setRenameDialog(null);
			else if (writeLeaseDialog) setWriteLeaseDialog(null);
			else if (dialog) setDialog(null);
			else if (selection.type === "agent" && selectedWorkItem) {
				const slot = selectedWorkItem.agentSlots.find((candidate) => candidate.role === selection.role);
				const agentId = slot?.currentInstanceId;
				if (
					slot &&
					agentId &&
					(slot.status === "running" || slot.status === "waiting" || agentActivities[agentId])
				) {
					event.preventDefault();
					void abortAgent(slot);
				}
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		agentActivities,
		deleteDialog,
		dialog,
		extensionDialog,
		modelPickerAgentId,
		projectTrustPromptOpen,
		renameDialog,
		resetAgentDialog,
		selectedWorkItem,
		selection,
		sessionPanel,
		sessionDeleteDialog,
		sessionRenameDialog,
		sessionStatsDialog,
		sessionShareDialog,
		sessionShareBusy,
		shellRestartDialog,
		writeLeaseDialog,
		abortAgent,
	]);

	async function openSettings(section: SettingsSectionId = "runtime"): Promise<void> {
		setSettingsSection(section);
		setSelection({ type: "settings" });
		if (!("codepiddy" in window)) return;
		const [status, skills, assignments, piRuntime] = await Promise.all([
			window.codepiddy.getSettingsStatus(),
			window.codepiddy.listAgentSkills(project?.rootPath),
			window.codepiddy.getRoleSkillAssignments(),
			window.codepiddy.getPiRuntimeStatus(),
		]);
		setSettingsStatus(status);
		setShellCommandPrefix(status.shellCommandPrefix ?? "");
		setShellCommandPrefixError(null);
		setPiRuntimeStatus(piRuntime);
		setAvailableSkills(skills);
		setRoleSkillAssignments(assignments);
	}

	/**
	 * `/thinking` 不带参数时循环到下一档。
	 *
	 * 以前这里是打开模型弹窗，因为强度那排按钮就住在弹窗里。弹窗移除强度之后，
	 * 再打开它就变成「打开模型选择器却什么都改不了」的死命令，所以改成循环 ——
	 * 和滑块控件表达的是同一个心智模型：强度是个可以连续往上调的量。
	 */
	async function cycleThinking(slot: AgentSlotSummary): Promise<void> {
		const agentId = slot.currentInstanceId;
		if (!agentId) return;
		const selection = modelSelections[agentId];
		const levels = selection?.availableThinkingLevels ?? [];
		if (levels.length === 0) {
			setError("当前模型不支持思考强度");
			return;
		}
		const index = selection ? levels.indexOf(selection.thinkingLevel) : -1;
		const next = levels[(index + 1) % levels.length];
		if (!next) return;
		const from = selection?.thinkingLevel;
		if (!(await chooseThinking(slot, next))) return;
		updateTranscript(agentId, (items) => [
			...items,
			{
				id: crypto.randomUUID(),
				type: "system",
				text: `思考强度：${from ? thinkingLevelLabel(from) : "未设置"} → ${thinkingLevelLabel(next)}`,
				createdAt: new Date().toISOString(),
			},
		]);
	}

	async function runPiRuntimeAction(action: "check" | "install" | "rollback"): Promise<void> {
		if (!("codepiddy" in window) || piRuntimeBusy) return;
		setPiRuntimeBusy(action);
		setPiUpdateConfirm(false);
		setError(null);
		try {
			const result =
				action === "check"
					? await window.codepiddy.checkPiRuntimeUpdate()
					: action === "install"
						? await window.codepiddy.installPiRuntimeUpdate(piRuntimeStatus?.latestVersion ?? "")
						: await window.codepiddy.rollbackPiRuntime();
			setPiRuntimeStatus(result);
		} catch (caught) {
			setError(
				caught instanceof Error
					? caught.message
					: action === "rollback"
						? "Pi 回退失败，当前版本保持不变"
						: "Pi 更新失败，原版本保持不变",
			);
		} finally {
			setPiRuntimeBusy(null);
		}
	}

	async function saveShellPath(value: string): Promise<void> {
		if (!("codepiddy" in window)) return;
		try {
			setSettingsStatus(await window.codepiddy.saveShellPath(value));
			setShellPath("");
			setShellRestartDialog(true);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "保存 Shell 路径失败");
		}
	}

	async function saveShellCommandPrefix(value: string): Promise<void> {
		if (!("codepiddy" in window) || shellCommandPrefixSaving) return;
		setShellCommandPrefixSaving(true);
		setShellCommandPrefixError(null);
		try {
			const next = await window.codepiddy.saveShellCommandPrefix(value);
			setSettingsStatus(next);
			setShellCommandPrefix(next.shellCommandPrefix ?? "");
			showSettingsToast(await refreshAfterShellCommandChange(), "success");
		} catch (caught) {
			setShellCommandPrefixError(caught instanceof Error ? caught.message : "保存 Shell 命令前缀失败");
		} finally {
			setShellCommandPrefixSaving(false);
		}
	}

	async function updateCacheWarmingSettings(patch: Partial<CacheWarmingSettings>): Promise<void> {
		if (!("codepiddy" in window) || cacheWarmingSaving) return;
		const previous = settingsStatus;
		if (!previous) return;
		const next: CacheWarmingSettings = { ...previous.cacheWarming, ...patch };
		setSettingsStatus({ ...previous, cacheWarming: next });
		setCacheWarmingSaving(true);
		try {
			setSettingsStatus(await window.codepiddy.saveCacheWarmingSettings(next));
		} catch (caught) {
			setSettingsStatus(previous);
			showSettingsToast(caught instanceof Error ? caught.message : "保存缓存预热设置失败", "error");
		} finally {
			setCacheWarmingSaving(false);
		}
	}

	async function toggleRoleSkill(role: AgentRole, skillId: string, enabled: boolean): Promise<void> {
		if (!("codepiddy" in window) || roleSkillSaving) return;
		const current = roleSkillAssignments[role];
		const skillIds = enabled
			? [...new Set([...current, skillId])]
			: current.filter((candidate) => candidate !== skillId);
		setRoleSkillSaving(role);
		setError(null);
		try {
			setRoleSkillAssignments(
				await window.codepiddy.setRoleSkillAssignments({
					role,
					skillIds,
					...(project ? { projectRoot: project.rootPath } : {}),
				}),
			);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "保存 Agent Skill 配置失败");
		} finally {
			setRoleSkillSaving(null);
		}
	}

	async function openProjectSkillsFolder(): Promise<void> {
		if (!project || !("codepiddy" in window)) return;
		try {
			await window.codepiddy.openProjectSkillsFolder(project.rootPath);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "打开项目 Skill 文件夹失败");
		}
	}

	async function openBuiltinSkillsFolder(): Promise<void> {
		if (!("codepiddy" in window)) return;
		try {
			await window.codepiddy.openBuiltinSkillsFolder();
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "打开内置 Skill 文件夹失败");
		}
	}

	async function openModelPicker(slot: AgentSlotSummary): Promise<void> {
		if (!project || !selectedWorkItem || !slot.currentInstanceId) return;
		// 点一下打开、再点一下收回。之前是居中对话框（有遮罩兜底关闭），
		// 改成贴着按钮的抽屉之后必须自己做这个切换。
		if (modelPickerAgentId === slot.currentInstanceId) {
			setModelPickerAgentId(null);
			setModelSearch("");
			return;
		}
		setModelPickerAgentId(slot.currentInstanceId);
		setModelSearch("");
		if (demoMode || !("codepiddy" in window)) return;
		// 已经有 selection 就直接开抽屉，把刷新放到后台做，不要顺手把工具栏禁用掉：
		// modelPickerBusy 会同时禁用思考强度按钮，disabled 一帧会让它换一套外观，
		// 用户看到的是「点模型按钮时右边闪一下」。
		if (!modelSelections[slot.currentInstanceId]) setModelPickerBusy(true);
		setError(null);
		try {
			const selection = await window.codepiddy.getAgentModelSelection({
				agentInstanceId: slot.currentInstanceId,
				projectId: project.id,
				workItemId: selectedWorkItem.id,
				role: slot.role,
			});
			setModelSelections((current) => ({ ...current, [slot.currentInstanceId!]: selection }));
		} catch (caught) {
			setError(clientErrorMessage(caught, "读取 Pi 模型失败"));
		} finally {
			setModelPickerBusy(false);
		}
	}

	async function chooseModel(slot: AgentSlotSummary, provider: string, modelId: string): Promise<boolean> {
		if (!project || !selectedWorkItem || !slot.currentInstanceId) return false;
		if (demoMode) {
			const current = modelSelections[slot.currentInstanceId];
			const model = current?.availableModels.find(
				(candidate) => candidate.provider === provider && candidate.id === modelId,
			);
			if (!current || !model) return false;
			setModelSelections((selections) => ({ ...selections, [slot.currentInstanceId!]: { ...current, model } }));
			setModelPickerAgentId(null);
			setModelSearch("");
			return true;
		}
		if (!("codepiddy" in window)) return false;
		setModelPickerBusy(true);
		setError(null);
		try {
			const nextSelection = await window.codepiddy.setAgentModel({
				agentInstanceId: slot.currentInstanceId,
				projectId: project.id,
				workItemId: selectedWorkItem.id,
				role: slot.role,
				provider,
				modelId,
			});
			setModelSelections((current) => ({ ...current, [slot.currentInstanceId!]: nextSelection }));
			void refreshAgentSessionSnapshot({
				agentInstanceId: slot.currentInstanceId,
				projectId: project.id,
				workItemId: selectedWorkItem.id,
				role: slot.role,
			});
			setModelPickerAgentId(null);
			setModelSearch("");
			return true;
		} catch (caught) {
			setError(clientErrorMessage(caught, "切换模型失败"));
			return false;
		} finally {
			setModelPickerBusy(false);
		}
	}

	async function chooseThinking(slot: AgentSlotSummary, level: string): Promise<boolean> {
		if (!project || !selectedWorkItem || !slot.currentInstanceId) return false;
		if (demoMode) {
			const current = modelSelections[slot.currentInstanceId];
			if (!current?.availableThinkingLevels.includes(level)) return false;
			setModelSelections((selections) => ({
				...selections,
				[slot.currentInstanceId!]: { ...current, thinkingLevel: level },
			}));
			return true;
		}
		if (!("codepiddy" in window)) return false;
		setModelPickerBusy(true);
		setError(null);
		try {
			const nextSelection = await window.codepiddy.setAgentThinking({
				agentInstanceId: slot.currentInstanceId,
				projectId: project.id,
				workItemId: selectedWorkItem.id,
				role: slot.role,
				level,
			});
			setModelSelections((current) => ({ ...current, [slot.currentInstanceId!]: nextSelection }));
			return true;
		} catch (caught) {
			setError(clientErrorMessage(caught, "切换 Thinking Level 失败"));
			return false;
		} finally {
			setModelPickerBusy(false);
		}
	}

	function renderMainContent() {
		if (selection.type === "settings") {
			return (
				<div className="settings-page">
					<aside className="settings-nav" aria-label="设置分类">
						{SETTINGS_NAV.map((group) => (
							<div className="settings-nav-group" key={group.label}>
								<span className="settings-nav-label">{group.label}</span>
								{group.items.map((item) => (
									<button
										key={item.id}
										type="button"
										className={`settings-nav-item${settingsSection === item.id ? " active" : ""}`}
										onClick={() => setSettingsSection(item.id)}
									>
										<AppIcon name={item.icon} size={14} />
										<span>{item.label}</span>
									</button>
								))}
							</div>
						))}
					</aside>
					<div className="settings-content">
						<section className="settings-card pi-runtime-card" hidden={settingsSection !== "runtime"}>
							<div className="settings-card-heading">
								<div>
									<h2>Pi 运行时</h2>
									<p>单独更新 Agent 内核，不替换 CodePIddy 客户端或项目文件。</p>
								</div>
								<div className="settings-status">{piRuntimeStatus?.restartRequired ? "待重启" : "运行中"}</div>
							</div>
							{piRuntimeStatus ? (
								<div className="pi-runtime-versions">
									<span>
										正在使用 <strong>v{piRuntimeStatus.runningVersion}</strong>
									</span>
									{piRuntimeStatus.restartRequired ? (
										<span>重启后 v{piRuntimeStatus.currentVersion}</span>
									) : null}
									<span>内置 v{piRuntimeStatus.bundledVersion}</span>
									{piRuntimeStatus.rollbackVersion ? (
										<span>可回退 v{piRuntimeStatus.rollbackVersion}</span>
									) : null}
									{piRuntimeStatus.latestVersion ? <span>可用 v{piRuntimeStatus.latestVersion}</span> : null}
								</div>
							) : null}
							{piRuntimeStatus?.warning ? <p className="pi-runtime-warning">{piRuntimeStatus.warning}</p> : null}
							{piUpdateConfirm ? (
								<div className="pi-runtime-confirm">
									<p>
										将从 npm 安装 Pi v{piRuntimeStatus?.latestVersion} 到独立目录。校验 RPC
										与内置扩展通过后才启用；现有会话不会自动中断。
									</p>
									<button className="secondary-button" type="button" onClick={() => setPiUpdateConfirm(false)}>
										取消
									</button>
									<button
										className="primary-button"
										type="button"
										onClick={() => void runPiRuntimeAction("install")}
									>
										确认安装
									</button>
								</div>
							) : null}
							<div className="settings-actions">
								<button
									className="secondary-button"
									type="button"
									disabled={piRuntimeBusy !== null}
									onClick={() => void runPiRuntimeAction("check")}
								>
									{piRuntimeBusy === "check" ? "检查中…" : "检查更新"}
								</button>
								{piRuntimeStatus?.updateAvailable ? (
									<button
										className="primary-button"
										type="button"
										disabled={piRuntimeBusy !== null || !piRuntimeStatus.npmAvailable}
										onClick={() => setPiUpdateConfirm(true)}
									>
										{piRuntimeBusy === "install"
											? "安装并校验中…"
											: `更新到 v${piRuntimeStatus.latestVersion}`}
									</button>
								) : null}
								{piRuntimeStatus && (piRuntimeStatus.rollbackVersion || piRuntimeStatus.warning) ? (
									<button
										className="secondary-button"
										type="button"
										disabled={piRuntimeBusy !== null}
										onClick={() => void runPiRuntimeAction("rollback")}
									>
										{piRuntimeBusy === "rollback"
											? "回退中…"
											: piRuntimeStatus.rollbackVersion
												? `回退到 v${piRuntimeStatus.rollbackVersion}`
												: "清除无效更新记录"}
									</button>
								) : null}
								{piRuntimeStatus?.restartRequired ? (
									<button
										className="secondary-button"
										type="button"
										disabled={piRuntimeBusy !== null}
										onClick={() => void window.codepiddy.restartCodePIddy()}
									>
										重启客户端以生效
									</button>
								) : null}
							</div>
							<small>
								{piRuntimeStatus?.npmAvailable
									? "更新失败时保持当前版本；新版运行异常时自动回退到上一个可用版本。"
									: "安装更新需要本机 Node.js/npm；当前内置版本仍可正常使用。"}
							</small>
						</section>
						{project ? (
							<div className="settings-section-slot" hidden={settingsSection !== "runtime"}>
								<ProjectTrustSettings
									status={projectTrustStatus}
									busy={projectTrustBusy}
									onRefresh={() => void refreshProjectTrust()}
									onSet={(decision, includeParent) => void setProjectTrust(decision, includeParent)}
								/>
							</div>
						) : null}
						<section className="settings-card" hidden={settingsSection !== "cache-warming"}>
							<div className="settings-card-heading">
								<div>
									<h2>缓存预热</h2>
									<p>
										Provider 支持 prompt caching 时，在缓存过期前用一次很小的请求把前缀续上，
										避免下一轮重新按全价读取上下文。只对支持 prompt caching 的模型有效。
									</p>
								</div>
								<div className="settings-status">{cacheWarmingSaving ? "保存中" : "已保存"}</div>
							</div>
							<div className="settings-field">
								<span>预热模式</span>
								<SelectMenu
									label="缓存预热模式"
									value={settingsStatus?.cacheWarming.mode ?? "streaming"}
									options={[
										{
											value: "off",
											label: "关闭",
											description: "不主动预热，缓存过期后按正常 cache miss 计费",
										},
										{
											value: "streaming",
											label: "仅运行中",
											description: "Agent 运行时续缓存，你空闲时不产生请求",
										},
										{
											value: "idle",
											label: "运行中 + 空闲",
											description: "空闲时只要继续续缓存仍然划算就预热",
										},
									]}
									onChange={(value) => void updateCacheWarmingSettings({ mode: value as CacheWarmingMode })}
								/>
							</div>
							<SettingsCheckbox
								className="cache-warming-checkbox"
								checked={settingsStatus?.cacheWarming.showCacheMissNotices ?? false}
								onChange={(checked) => void updateCacheWarmingSettings({ showCacheMissNotices: checked })}
							>
								<strong>显示缓存未命中提示</strong>
								<small>在转录流里显示显著的 cache miss 费用和 Provider 恢复通知</small>
							</SettingsCheckbox>
							<small>
								设置写入 Pi 原生 settings.json。修改后，新启动或重置后的 Agent 才会使用新设置；
								当前会话的预热状态可以在「会话统计」里查看。
							</small>
						</section>
						<div className="settings-section-slot" hidden={settingsSection !== "compaction"}>
							<CompactionSettingsPanel
								settings={settingsStatus?.contextCompaction ?? null}
								activeAgent={activeAgentLocator ?? lastActiveAgentLocatorRef.current}
								onStatusChange={setSettingsStatus}
							/>
						</div>
						<section className="settings-card" hidden={settingsSection !== "shell"}>
							<div className="settings-card-heading">
								<div>
									<h2>Shell</h2>
									<p>
										配置 Pi <code>bash</code> 工具使用的可执行文件，以及每条命令执行前追加的 shell
										初始化片段。
									</p>
								</div>
								<div className="settings-status">{settingsStatus?.shellPath ? "Bash 已配置" : "自动探测"}</div>
							</div>
							<div className="settings-shell-block">
								<div>
									<strong>Bash 可执行文件</strong>
									<p>
										留空则自动探测 Program Files 下的 Git Bash 和 PATH 上的 <code>bash.exe</code>。 请填{" "}
										<code>Git\bin\bash.exe</code> 或 <code>Git\usr\bin\bash.exe</code>，不要填{" "}
										<code>git-bash.exe</code>，后者会弹出可见终端窗口。
									</p>
								</div>
								{settingsStatus?.shellPath ? (
									<code className="settings-shell-current">{settingsStatus.shellPath}</code>
								) : null}
								<input
									type="text"
									value={shellPath}
									onChange={(event) => setShellPath(event.target.value)}
									placeholder="留空自动探测，或填 bash.exe 完整路径"
								/>
								<div className="settings-actions">
									<button
										className="primary-button"
										type="button"
										disabled={shellPath.trim().length === 0}
										onClick={() => void saveShellPath(shellPath)}
									>
										保存
									</button>
									<button
										className="secondary-button"
										type="button"
										disabled={!settingsStatus?.shellPath}
										onClick={() => void saveShellPath("")}
									>
										清除
									</button>
								</div>
								<small>修改后，新启动或重置后的 Agent 才会使用新路径。</small>
							</div>
							<div className="settings-shell-block">
								<div>
									<strong>命令前缀</strong>
									<p>
										Pi 会在每条 bash 命令前追加这段配置，适合启用 alias 展开或加载自己的 shell
										初始化文件。这里只写 Pi 原生 <code>settings.json</code> 的 <code>shellCommandPrefix</code>
										，不会维护第二套 alias 列表。
									</p>
								</div>
								<div className="settings-field">
									<span>shellCommandPrefix</span>
									<textarea
										rows={4}
										spellCheck={false}
										value={shellCommandPrefix}
										onChange={(event) => {
											setShellCommandPrefix(event.target.value);
											setShellCommandPrefixError(null);
										}}
										placeholder={"例如：\nshopt -s expand_aliases\nsource ~/.bashrc"}
									/>
								</div>
								<div className="settings-actions">
									<button
										className="primary-button"
										type="button"
										disabled={shellCommandPrefixSaving || shellCommandPrefix.trim().length === 0}
										onClick={() => void saveShellCommandPrefix(shellCommandPrefix)}
									>
										{shellCommandPrefixSaving ? "保存中…" : "保存前缀"}
									</button>
									<button
										className="secondary-button"
										type="button"
										disabled={shellCommandPrefixSaving || !settingsStatus?.shellCommandPrefix}
										onClick={() => void saveShellCommandPrefix("")}
									>
										清除
									</button>
								</div>
								{shellCommandPrefixError ? (
									<StateBlock compact tone="error" title={shellCommandPrefixError} />
								) : null}
								<small>
									前缀会在每条命令前单独占行；空值会从 <code>settings.json</code> 中删除该字段。
								</small>
							</div>
						</section>
						<div className="settings-section-slot" hidden={settingsSection !== "codemode"}>
							<CodemodeSettingsPanel
								settings={settingsStatus?.codemode ?? null}
								onStatusChange={setSettingsStatus}
							/>
						</div>
						<div className="settings-section-slot" hidden={settingsSection !== "tools"}>
							<ToolSettingsPanel
								settings={settingsStatus?.tools ?? null}
								projectRoot={project?.rootPath ?? null}
								onStatusChange={setSettingsStatus}
								onOpenMcp={() => setSettingsSection("mcp")}
								onSaved={refreshAfterToolChange}
							/>
						</div>
						<div className="settings-section-slot" hidden={settingsSection !== "diagnostics"}>
							<DiagnosticsSettings
								projectRoot={project?.rootPath ?? null}
								activeAgent={activeAgentLocator ?? lastActiveAgentLocatorRef.current}
								uiError={error}
							/>
						</div>

						<section className="settings-card skill-settings-card" hidden={settingsSection !== "skills"}>
							<div className="settings-card-heading">
								<div>
									<h2>Agent Skills</h2>
									<p>每种 Agent 独立选择 Skill。修改会应用到新启动或重置后的 Agent。</p>
								</div>
								<div className="skill-settings-actions">
									<div className="settings-status">{availableSkills.length} 个可用</div>
									<button
										className="secondary-button"
										type="button"
										onClick={() => void openBuiltinSkillsFolder()}
									>
										打开内置 Skill 文件夹
									</button>
									<button
										className="secondary-button"
										type="button"
										disabled={!project}
										onClick={() => void openProjectSkillsFolder()}
									>
										打开项目 Skill 文件夹
									</button>
								</div>
							</div>
							<div className="role-skill-grid">
								{(["requirement-analysis", "coding", "bug-fix", "review"] as const).map((role) => (
									<section className="role-skill-card" key={role}>
										<div className="role-skill-heading">
											<h3>{roleLabels[role]}</h3>
											<span>{roleSkillAssignments[role].length} 个</span>
										</div>
										<div className="role-skill-list">
											{availableSkills.map((skill) => {
												const checked = roleSkillAssignments[role].includes(skill.id);
												return (
													<SettingsCheckbox
														className={`role-skill-option ${checked ? "selected" : ""}`}
														key={skill.id}
														checked={checked}
														disabled={roleSkillSaving !== null}
														onChange={(enabled) => void toggleRoleSkill(role, skill.id, enabled)}
														trailing={<em>{skill.source}</em>}
													>
														<span className="role-skill-copy">
															<strong>{skill.name}</strong>
															<small>{skill.description || skill.filePath}</small>
														</span>
													</SettingsCheckbox>
												);
											})}
											{availableSkills.length === 0 ? (
												<div className="provider-empty">
													<AppIcon name="sparkles" size={15} />
													<span>未发现可用 Skill。将 Skill 放入项目或 Pi 的 skills 目录后刷新。</span>
												</div>
											) : null}
										</div>
									</section>
								))}
							</div>
						</section>
						<div className="settings-section-slot" hidden={settingsSection !== "prompts"}>
							<PromptTemplateSettings
								projectRoot={project?.rootPath ?? null}
								onUseTemplate={insertPromptTemplate}
								onConfigChanged={refreshAfterPromptTemplateChange}
							/>
						</div>
						<div className="settings-section-slot" hidden={settingsSection !== "packages"}>
							<PiPackageSettings
								projectRoot={project?.rootPath ?? null}
								onConfigChanged={refreshAfterPiPackageChange}
							/>
						</div>

						<div className="settings-section-slot" hidden={settingsSection !== "providers"}>
							<ProviderSettings
								refreshToken={providerSettingsRefreshToken}
								onOpenAuth={(mode, providerId) => void openAuthDialog(mode, providerId, "provider")}
								onProvidersChanged={() => void refreshAfterProviderChange("Provider 配置已更新")}
							/>
							<ModelScopeSettings
								activeAgent={activeAgentLocator ?? lastActiveAgentLocatorRef.current}
								refreshToken={providerSettingsRefreshToken}
								onSelectionChange={handleModelScopeSelectionChange}
							/>
						</div>
						<div className="settings-section-slot" hidden={settingsSection !== "mcp"}>
							<McpSettings
								projectRoot={project?.rootPath ?? null}
								activeAgent={activeAgentLocator}
								onConfigChanged={refreshAfterMcpChange}
							/>
						</div>
						<div className="settings-section-slot" hidden={settingsSection !== "llama"}>
							<Suspense fallback={<div className="provider-empty">正在加载 llama.cpp 设置…</div>}>
								<LlamaCppSettings activeAgent={activeAgentLocator ?? lastActiveAgentLocatorRef.current} />
							</Suspense>
						</div>
						<div className="settings-section-slot" hidden={settingsSection !== "share"}>
							<ShareSettings
								refreshToken={providerSettingsRefreshToken}
								onOpenAuth={(mode, providerId) => void openAuthDialog(mode, providerId, "share")}
								onOpenUrl={openExternalLink}
							/>
						</div>
					</div>
				</div>
			);
		}

		if (!project) {
			return (
				<div className="empty-state">
					<div className="empty-mark app-icon-mark">
						<img src="./codepiddy-icon.png" alt="CodePIddy" />
					</div>
					<h1>打开一个项目开始工作</h1>
					<p>一个便于管理、适合程序员的 Coding Agent。</p>
					<button className="primary-button" type="button" onClick={() => void openProject()} disabled={busy}>
						选择项目
					</button>
				</div>
			);
		}
		if (selection.type === "agent" && selectedWorkItem) {
			const slot = selectedWorkItem.agentSlots.find((candidate) => candidate.role === selection.role);
			if (!slot) return null;
			const agentId = slot.currentInstanceId;
			const items = agentId ? (transcripts[agentId] ?? []) : [];
			const draft = agentId ? (drafts[agentId] ?? "") : "";
			const attachments = agentId ? (imageAttachments[agentId] ?? []) : [];
			const activity = agentId ? agentActivities[agentId] : undefined;
			const toolRecoveryOffer = agentId ? toolRecoveryOffers[agentId] : undefined;
			const sessionSnapshot = agentId ? agentSessionSnapshots[agentId] : undefined;
			const canAbort = Boolean(agentId && (activity || slot.status === "running" || slot.status === "waiting"));
			const latestTurn = groupTranscriptIntoTurns(items).at(-1);
			const latestTurnToolItems =
				latestTurn?.entries
					.map((entry) => entry.item)
					.filter((item): item is Extract<TranscriptItem, { type: "tool" }> => item.type === "tool") ?? [];
			return (
				<div className="agent-pane">
					<header className="content-header">
						<div>
							<strong>{slot.displayName}</strong>
							<span>
								{selectedWorkItem.id} · {selectedWorkItem.title} · {statusLabels[slot.status]}
							</span>
						</div>
						{agentId ? (
							<div className="agent-header-actions">
								<IconButton
									label={workPanelVisible ? "隐藏文件管理器" : "显示文件管理器"}
									active={workPanelVisible}
									onClick={() => setWorkPanelVisible((current) => !current)}
								>
									<AppIcon name="panel" />
								</IconButton>
								<div className="agent-actions-menu-wrap">
									<IconButton
										label="Agent 操作"
										onClick={() => setAgentActionsOpen((current) => (current === agentId ? null : agentId))}
									>
										<AppIcon name="more" />
									</IconButton>
									{agentActionsOpen === agentId ? (
										<div className="agent-actions-menu" role="menu" aria-label="Agent 操作">
											<button
												type="button"
												role="menuitem"
												onClick={() => void openSessionPanel(slot)}
												disabled={sessionPanelLoading}
											>
												会话树与 Fork
											</button>
											<button
												role="menuitem"
												type="button"
												onClick={() => void cloneAgentSession(slot)}
												disabled={busy}
											>
												克隆当前会话
											</button>
											<button
												role="menuitem"
												type="button"
												onClick={() => void reconnectAgent(slot)}
												disabled={busy}
											>
												重新连接 Pi
											</button>
											<button
												type="button"
												role="menuitem"
												className="danger-menu-item"
												onClick={() => {
													setAgentActionsOpen(null);
													setResetAgentDialog({ workItem: selectedWorkItem, slot });
												}}
											>
												重置 Agent
											</button>
										</div>
									) : null}
								</div>
							</div>
						) : (
							<div className="agent-header-actions">
								<button
									className="secondary-button"
									type="button"
									onClick={() => void createAgent(slot)}
									disabled={busy || !("codepiddy" in window)}
								>
									创建 Agent
								</button>
							</div>
						)}
					</header>
					{agentId ? (
						<div className="transcript-stage">
							<TranscriptMinimap items={items} onJump={jumpToTranscriptMarker} scrollRef={activeTranscriptRef} />
							<div className="conversation-column">
								<div className="transcript-panes">
									{retainedAgentIds.map((paneAgentId) => {
										const paneSlot = agentSlotIndex.get(paneAgentId);
										const paneActivity = agentActivities[paneAgentId];
										const paneSnapshot = agentSessionSnapshots[paneAgentId];
										return (
											<TranscriptPane
												key={paneAgentId}
												agentId={paneAgentId}
												displayName={paneSlot?.displayName ?? "Agent"}
												kickoffPrompt={paneSlot?.kickoffPrompt}
												items={transcripts[paneAgentId] ?? []}
												activity={paneActivity}
												assistantModel={modelSelections[paneAgentId]?.model.name}
												modelLabels={buildModelLabels(modelSelections[paneAgentId]?.availableModels)}
												running={Boolean(paneActivity)}
												visible={paneAgentId === agentId}
												resetKey={paneSnapshot?.sessionId ?? "pending"}
												collapsedRounds={collapsedRounds}
												onToggleRound={(id, collapsed) =>
													setCollapsedRounds((current) => ({ ...current, [id]: collapsed }))
												}
												forkEntryIds={buildTurnForkEntryMap(transcripts[paneAgentId] ?? [], paneSnapshot)}
												forkingEntryId={forkingEntryId}
												onFork={(entryId) => {
													if (!paneSlot) return;
													void forkAgentSession(entryId, {
														agentInstanceId: paneAgentId,
														projectId: project.id,
														workItemId: paneSlot.workItemId,
														role: paneSlot.role,
													});
												}}
												initialOffset={scrollPositions.current[paneAgentId] ?? null}
												onScrollPosition={(offset) => rememberScrollPosition(paneAgentId, offset)}
												onElement={handlePaneElement}
												onShowJumpChange={(show) => handleShowJumpChange(paneAgentId, show)}
												onController={(controller) => handlePaneController(paneAgentId, controller)}
												onUseKickoff={() =>
													setDrafts((current) => ({
														...current,
														[paneAgentId]: paneSlot?.kickoffPrompt ?? "",
													}))
												}
											/>
										);
									})}
								</div>
								<div className="composer-shell">
									{activeShowJump ? (
										<button
											className="jump-to-latest"
											type="button"
											onClick={() => {
												if (!agentId) return;
												paneControllersRef.current.get(agentId)?.jumpToLatest();
												setUnreadCounts((current) => ({ ...current, [agentId]: 0 }));
											}}
										>
											{activeAgentId && (unreadCounts[activeAgentId] ?? 0) > 0
												? `${unreadCounts[activeAgentId]} 条新消息`
												: "跳到最新消息"}
											<AppIcon name="arrow-up" size={14} className="jump-arrow" />
										</button>
									) : null}
									<form
										className="composer composer-stacked"
										onDragOver={(event) => {
											if (
												event.dataTransfer.types.includes("Files") ||
												event.dataTransfer.types.includes(WORKSPACE_FILES_DRAG_TYPE)
											)
												event.preventDefault();
										}}
										onDrop={(event) => {
											const workspacePaths = workspacePathsFromDrag(event.dataTransfer);
											if (workspacePaths.length > 0) {
												event.preventDefault();
												setDrafts((current) => {
													const draft = current[agentId] ?? "";
													const separator = draft && !draft.endsWith(" ") ? " " : "";
													return {
														...current,
														[agentId]: `${draft}${separator}${workspacePaths
															.map((path) => `@${path}`)
															.join(" ")} `,
													};
												});
												composerInputRef.current?.focus();
												return;
											}
											const files = Array.from(event.dataTransfer.files);
											if (files.length === 0) return;
											event.preventDefault();
											void addImageFiles(agentId, files);
										}}
										onSubmit={(event) => {
											event.preventDefault();
											void sendPrompt(slot);
										}}
									>
										<SlashCommandMenu
											query={draft}
											commands={agentCommands[agentId] ?? []}
											loading={agentCommandsLoading[agentId] === true}
											modelSelection={modelSelections[agentId]}
											onSelect={(command) => setDrafts((current) => ({ ...current, [agentId]: command }))}
											onExecute={(command) => {
												setDrafts((current) => ({ ...current, [agentId]: "" }));
												void sendPrompt(slot, command);
											}}
										/>
										<FileMentionMenu
											query={draft}
											files={fileMatches}
											onSelect={(file) =>
												setDrafts((current) => ({
													...current,
													[agentId]: (current[agentId] ?? "").replace(/@[^\s]*$/, `@${file} `),
												}))
											}
										/>
										{toolRecoveryOffer ? (
											<div className="tool-recovery-offer">
												<div>
													<strong>工具失败后本轮已结束</strong>
													<span title={toolRecoveryOffer.reason}>
														{toolRecoveryOffer.toolName}：{toolRecoveryOffer.reason}
													</span>
												</div>
												<button type="button" onClick={() => void continueAfterToolFailure(slot)}>
													让 Pi 继续处理
												</button>
											</div>
										) : null}
										{attachments.length > 0 ? (
											<div className="composer-image-strip">
												{attachments.map((image) => (
													<figure key={image.id}>
														<img src={`data:${image.mimeType};base64,${image.data}`} alt={image.name} />
														<figcaption title={image.name}>{image.name}</figcaption>
														<button
															type="button"
															aria-label={`移除 ${image.name}`}
															onClick={() => removeImageAttachment(agentId, image.id)}
														>
															<AppIcon name="close" size={12} />
														</button>
													</figure>
												))}
											</div>
										) : null}
										<textarea
											ref={composerInputRef}
											value={draft}
											onChange={(event) =>
												setDrafts((current) => ({ ...current, [agentId]: event.target.value }))
											}
											onPaste={(event) => {
												const files = Array.from(event.clipboardData.files);
												if (files.length === 0) return;
												event.preventDefault();
												void addImageFiles(agentId, files);
											}}
											onKeyDown={(event) => {
												if (event.defaultPrevented || event.nativeEvent.isComposing) return;
												if (event.key === "Enter" && !event.shiftKey) {
													event.preventDefault();
													void sendPrompt(slot);
												}
											}}
											placeholder="输入消息或 / 命令；Shift+Enter 换行"
											rows={1}
										/>
										<div className="composer-toolbar">
											<div className="composer-tools">
												<input
													ref={imageInputRef}
													type="file"
													accept="image/png,image/jpeg,image/webp,image/gif"
													multiple
													hidden
													onChange={(event) => {
														void addImageFiles(agentId, Array.from(event.target.files ?? []));
														event.target.value = "";
													}}
												/>
												<button
													className="attach-button"
													type="button"
													aria-label="添加图片"
													title="添加图片，也可粘贴或拖入"
													onClick={() => imageInputRef.current?.click()}
												>
													<AppIcon name="paperclip" size={15} />
												</button>
												<div className="model-picker-anchor">
													<button
														className="model-seat"
														type="button"
														onClick={() => void openModelPicker(slot)}
													>
														{modelSelections[agentId]?.model.name ?? "选择模型"} ▾
													</button>
													{modelPickerAgentId === agentId && modelSelections[agentId]
														? (() => {
																const modelSelection = modelSelections[agentId];
																const filtered = modelPickerOptions;
																return (
																	<div
																		ref={modelPickerRef}
																		className="modal model-picker"
																		role="dialog"
																		aria-label="选择模型"
																		onKeyDown={(event) => {
																			if (event.key === "ArrowDown" && filtered.length > 0) {
																				event.preventDefault();
																				modelPickerKeyboardScrollRef.current = true;
																				setModelPickerSelectedIndex((current) => {
																					const next = (current + 1) % filtered.length;
																					modelPickerSelectedIndexRef.current = next;
																					return next;
																				});
																			} else if (event.key === "ArrowUp" && filtered.length > 0) {
																				event.preventDefault();
																				modelPickerKeyboardScrollRef.current = true;
																				setModelPickerSelectedIndex((current) => {
																					const next =
																						(current - 1 + filtered.length) % filtered.length;
																					modelPickerSelectedIndexRef.current = next;
																					return next;
																				});
																			} else if (
																				event.key === "Enter" &&
																				event.target === modelSearchInputRef.current &&
																				!modelPickerBusy
																			) {
																				const model = filtered[modelPickerSelectedIndexRef.current];
																				if (!model) return;
																				event.preventDefault();
																				void chooseModel(slot, model.provider, model.id);
																			}
																		}}
																	>
																		<input
																			ref={modelSearchInputRef}
																			value={modelSearch}
																			onChange={(event) => {
																				setModelSearch(event.target.value);
																				modelListRef.current?.scrollTo({ top: 0 });
																				modelPickerSelectedIndexRef.current = 0;
																				modelPickerKeyboardScrollRef.current = true;
																				setModelPickerSelectedIndex(0);
																			}}
																			placeholder="搜索模型"
																		/>
																		<div
																			className="model-list"
																			ref={modelListRef}
																			onWheel={() => {
																				modelPickerKeyboardScrollRef.current = false;
																			}}
																		>
																			{modelPickerSections.map((section) => (
																				<section key={section.key}>
																					<h3>{section.label}</h3>
																					{section.models.map((model) => {
																						const index =
																							modelPickerIndexById.get(
																								`${model.provider}/${model.id}`,
																							) ?? -1;
																						return (
																							<button
																								type="button"
																								className={[
																									model.id === modelSelection.model.id &&
																									model.provider ===
																										modelSelection.model.provider
																										? "selected"
																										: "",
																									index === modelPickerSelectedIndex
																										? "keyboard-selected"
																										: "",
																								]
																									.filter(Boolean)
																									.join(" ")}
																								data-model-index={index}
																								onMouseEnter={() => {
																									modelPickerKeyboardScrollRef.current = false;
																									modelPickerSelectedIndexRef.current = index;
																									setModelPickerSelectedIndex(index);
																								}}
																								key={section.key + model.id}
																								disabled={modelPickerBusy}
																								title={model.id}
																								onClick={() =>
																									void chooseModel(
																										slot,
																										model.provider,
																										model.id,
																									)
																								}
																							>
																								<span>{model.name}</span>
																							</button>
																						);
																					})}
																				</section>
																			))}
																		</div>
																		{modelPickerBusy ? (
																			<div className="model-picker-footer">
																				<span className="model-picker-status">
																					正在应用 Pi 模型设置…
																				</span>
																			</div>
																		) : null}
																	</div>
																);
															})()
														: null}
												</div>
												<ContextGauge
													snapshot={sessionSnapshot}
													onClick={() =>
														void openSessionStats(
															{
																agentInstanceId: agentId,
																projectId: project.id,
																workItemId: selectedWorkItem.id,
																role: slot.role,
															},
															slot.displayName,
														)
													}
												/>
											</div>
											<div className="composer-actions">
												<ThinkingControl
													levels={modelSelections[agentId]?.availableThinkingLevels ?? []}
													value={modelSelections[agentId]?.thinkingLevel ?? ""}
													disabled={modelPickerBusy}
													onChange={(level) => void chooseThinking(slot, level)}
												/>
												{canAbort ? (
													<button
														className="send-button stop-send-button"
														type="button"
														aria-label="中断当前回复"
														title="中断当前回复（Esc）"
														disabled={abortingAgents[agentId] === true}
														onClick={() => void abortAgent(slot)}
													>
														<AppIcon name="stop" size={15} />
													</button>
												) : (
													<button
														className="send-button"
														type="submit"
														aria-label="发送消息"
														disabled={!draft.trim() && attachments.length === 0}
													>
														<AppIcon name="arrow-up" />
													</button>
												)}
											</div>
										</div>
									</form>
								</div>
							</div>
							{workPanelVisible && project ? (
								<WorkPanel
									projectRoot={project.rootPath}
									projectId={project.id}
									workItemId={selectedWorkItem.id}
									agentRole={selection.role}
									turnId={latestTurn?.id ?? "turn-0"}
									turnStartedAt={latestTurn?.startedAt}
									toolItems={latestTurnToolItems}
									onInsertMention={(path) => {
										if (!agentId) return;
										setDrafts((current) => {
											const draft = current[agentId] ?? "";
											const separator = draft && !draft.endsWith(" ") ? " " : "";
											return { ...current, [agentId]: `${draft}${separator}@${path} ` };
										});
										composerInputRef.current?.focus();
									}}
								/>
							) : null}
						</div>
					) : (
						<>
							<div className="transcript-placeholder">
								<div className="state-mark state-mark-muted">
									<AppIcon name="plug" size={18} />
								</div>
								<h2>{slot.displayName}</h2>
								<p>这个 Slot 尚未创建 Agent Instance。</p>
							</div>
							<div className="composer disabled-composer">
								<span>创建 Agent 后即可开始对话</span>
								<button type="button" disabled>
									<AppIcon name="arrow-up" />
								</button>
							</div>
						</>
					)}
				</div>
			);
		}
		if (selectedWorkItem) {
			return (
				<div className="work-item-empty">
					<div className="work-item-heading">
						<div>
							<span>{selectedWorkItem.id}</span>
							<h1>{selectedWorkItem.title}</h1>
							<p>{selectedWorkItem.description || "暂无描述"}</p>
						</div>
						<div className="work-item-actions">
							<button
								className="secondary-button"
								type="button"
								onClick={() =>
									void window.codepiddy.openWorkItemFolder({
										projectRoot: project.rootPath,
										lane: selectedWorkItem.lane,
										workItemId: selectedWorkItem.id,
									})
								}
							>
								打开文件夹
							</button>
						</div>
					</div>
					<div className="agent-choice-list">
						{selectedWorkItem.agentSlots.map((slot) => (
							<button
								type="button"
								key={slot.role}
								onClick={() =>
									setSelection({
										type: "agent",
										lane: selectedWorkItem.lane,
										workItemId: selectedWorkItem.id,
										role: slot.role,
									})
								}
							>
								<span>
									<strong>{slot.displayName}</strong>
									<small>{statusLabels[slot.status]}</small>
								</span>
								<span className={`agent-create status-${slot.status}`}>{statusLabels[slot.status]}</span>
							</button>
						))}
					</div>
				</div>
			);
		}
		return (
			<div className="empty-state">
				<div className="state-mark state-mark-muted">
					<AppIcon name="folder" size={18} />
				</div>
				<h1>{project.name}</h1>
				<p>从左侧的新需求或修漏洞目录创建工作项。</p>
			</div>
		);
	}

	const useWindowOverlay = "codepiddy" in window && window.codepiddy.platform === "win32";
	const selectedAuthProvider = authProviders.find((provider) => provider.id === authProviderId) ?? null;
	return (
		<div
			className={`app-shell${useWindowOverlay ? " windows-overlay" : ""}`}
			style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
		>
			{useWindowOverlay ? (
				<header className="app-titlebar">
					<img src="./codepiddy-icon.png" alt="" />
					<span>CodePIddy</span>
				</header>
			) : null}
			<aside className="sidebar">
				<div className="brand-row">
					<div className="brand-title">CodePIddy</div>
					<IconButton
						label={searchOpen ? "关闭搜索" : "搜索"}
						onClick={() => {
							setSearchOpen((current) => !current);
							if (searchOpen) setSearchQuery("");
						}}
					>
						<AppIcon name="search" />
					</IconButton>
				</div>
				{searchOpen ? (
					<div className="sidebar-search">
						<AppIcon name="search" size={14} />
						<input
							value={searchQuery}
							onChange={(event) => setSearchQuery(event.target.value)}
							placeholder="搜索项目、工作项或 Agent"
							aria-label="搜索项目、工作项或 Agent"
						/>
						{searchQuery ? (
							<button type="button" onClick={() => setSearchQuery("")} aria-label="清除搜索">
								<AppIcon name="close" />
							</button>
						) : null}
					</div>
				) : null}
				<button className="new-action" type="button" onClick={() => void openProject()} disabled={busy}>
					<AppIcon name="plus" />
					{project ? "打开其他项目" : "打开项目"}
				</button>
				<div className="sidebar-section-label">项目</div>
				<div className="recent-project-list">
					{project ? (
						<div className="project-tree">
							<div className={`tree-row project-row ${selection.type === "project" ? "selected" : ""}`}>
								<button
									className="chevron-button"
									type="button"
									onClick={() => toggle(`project:${project.id}`)}
									aria-label="展开项目"
								>
									<Chevron expanded={expanded.has(`project:${project.id}`)} />
								</button>
								<button className="tree-label" type="button" onClick={() => setSelection({ type: "project" })}>
									<AppIcon name="folder" className="folder-glyph" />
									<span className="truncate">{project.name}</span>
								</button>
								<IconButton label="关闭项目" onClick={() => void closeCurrentProject()}>
									<AppIcon name="close" />
								</IconButton>
							</div>
						</div>
					) : null}
					{recentProjects
						.filter((recent) => recent.rootPath.toLowerCase() !== project?.rootPath.toLowerCase())
						.filter((recent) => {
							const query = searchQuery.trim().toLowerCase();
							return (
								!query ||
								recent.name.toLowerCase().includes(query) ||
								recent.rootPath.toLowerCase().includes(query)
							);
						})
						.map((recent) => (
							<div
								className={`recent-project-row ${recent.available ? "" : "unavailable"}`}
								key={recent.rootPath}
							>
								<button
									className="recent-project-open"
									type="button"
									disabled={!recent.available || busy}
									onClick={() => void switchProject(recent)}
									title={recent.available ? recent.rootPath : `路径不可用：${recent.rootPath}`}
								>
									{recent.available ? (
										<AppIcon name="folder" className="folder-glyph" />
									) : (
										<AppIcon name="warning" className="folder-glyph" />
									)}
									<span className="recent-project-copy">
										<span className="truncate">{recent.name}</span>
										<small>{recent.available ? recent.rootPath : "项目路径不可用"}</small>
									</span>
								</button>
								<IconButton label="从最近项目移除" onClick={() => void forgetRecentProject(recent)}>
									<AppIcon name="close" />
								</IconButton>
							</div>
						))}
					{project && expanded.has(`project:${project.id}`) ? (
						<div className="active-project-contents">
							<div className="active-project-label">当前项目工作流</div>
							<div className="tree-children project-children">{project.lanes.map(renderLane)}</div>
						</div>
					) : null}
					{!project && recentProjects.length === 0 ? <div className="sidebar-hint">尚未打开项目</div> : null}
				</div>
				<div className="sidebar-footer">
					<button type="button" onClick={() => void openSettings()}>
						<AppIcon name="settings" /> <span>设置</span>
					</button>
				</div>
			</aside>
			<PanelResizeHandle
				label="调整项目栏宽度"
				className="sidebar-resize"
				onResizeStart={startSidebarResize}
				onResize={resizeSidebar}
				onResizeEnd={finishSidebarResize}
				onReset={resetSidebarWidth}
			/>
			<main className="main-pane">
				{error ? (
					<StateBlock
						className="app-error-state"
						tone="error"
						title={error}
						actions={
							<IconButton label="关闭错误提示" onClick={() => setError(null)}>
								<AppIcon name="close" />
							</IconButton>
						}
					/>
				) : null}
				{renderMainContent()}
			</main>
			<SettingsToastHost />
			{sessionPanel ? (
				<ModalShell
					title={`${sessionPanel.displayName} 会话树`}
					description={`当前会话：${sessionPanel.snapshot.sessionName || "未命名会话"}`}
					onClose={() => setSessionPanel(null)}
					closeDisabled={sessionPanelLoading}
					width="xl"
					className="session-tree-modal"
				>
					<div className="session-picker">
						<div className="session-picker-heading">
							<strong>会话</strong>
							<div className="session-picker-actions">
								<button
									className="secondary-button"
									type="button"
									disabled={sessionPanelLoading || Boolean(sessionCreateDraft)}
									onClick={() =>
										void openSessionShare(
											{
												agentInstanceId: sessionPanel.agentInstanceId,
												projectId: sessionPanel.projectId,
												workItemId: sessionPanel.workItemId,
												role: sessionPanel.role,
											},
											sessionPanel.displayName,
											sessionPanel.snapshot.sessionName ?? null,
										)
									}
								>
									<AppIcon name="share" size={13} /> 分享
								</button>
								<button
									className="secondary-button"
									type="button"
									disabled={sessionPanelLoading || Boolean(sessionCreateDraft)}
									onClick={() =>
										setSessionRenameDialog({
											locator: {
												agentInstanceId: sessionPanel.agentInstanceId,
												projectId: sessionPanel.projectId,
												workItemId: sessionPanel.workItemId,
												role: sessionPanel.role,
											},
											displayName: sessionPanel.displayName,
											name: sessionPanel.snapshot.sessionName ?? "",
										})
									}
								>
									<AppIcon name="edit" size={13} /> 重命名
								</button>
								<button
									className="secondary-button"
									type="button"
									disabled={sessionPanelLoading || Boolean(sessionCreateDraft)}
									onClick={() =>
										void openSessionStats(
											{
												agentInstanceId: sessionPanel.agentInstanceId,
												projectId: sessionPanel.projectId,
												workItemId: sessionPanel.workItemId,
												role: sessionPanel.role,
											},
											sessionPanel.displayName,
										)
									}
								>
									<AppIcon name="checklist" size={13} /> 会话统计
								</button>
								<button
									className="secondary-button"
									type="button"
									disabled={sessionPanelLoading || Boolean(sessionCreateDraft)}
									onClick={() => void importAgentSession()}
								>
									<AppIcon name="restore" size={13} /> 导入会话
								</button>
								<button
									className={sessionCreateDraft ? "secondary-button" : "primary-button"}
									type="button"
									disabled={sessionPanelLoading}
									onClick={() =>
										sessionCreateDraft ? closeAgentSessionCreate() : void openAgentSessionCreate()
									}
								>
									<AppIcon name={sessionCreateDraft ? "close" : "plus"} size={13} />
									{sessionCreateDraft ? "取消新建" : "新建会话"}
								</button>
							</div>
						</div>
						{sessionCreateDraft ? (
							<SessionCreateForm
								draft={sessionCreateDraft}
								models={modelSelections[sessionPanel.agentInstanceId]?.availableModels ?? []}
								busy={sessionPanelLoading}
								error={sessionCreateError}
								onChange={(draft) => {
									setSessionCreateDraft(draft);
									setSessionCreateError(null);
								}}
								onCancel={closeAgentSessionCreate}
								onSubmit={() => void createAgentSession()}
							/>
						) : null}
						<div className="session-picker-list">
							{sessionPanel.sessions.map((session) => (
								<div
									key={session.sessionId}
									className={`session-picker-item${session.isCurrent ? " active" : ""}`}
								>
									<button
										type="button"
										className="session-picker-main"
										disabled={sessionPanelLoading || Boolean(sessionCreateDraft)}
										onClick={() => void switchAgentSession(session.sessionId)}
									>
										<span className="session-picker-copy">
											<strong>{session.name || "未命名会话"}</strong>
											<small>
												{session.messageCount} 条消息 ·{" "}
												{session.updatedAt ? new Date(session.updatedAt).toLocaleString() : "—"}
											</small>
										</span>
										{session.isCurrent ? <em>当前</em> : null}
									</button>
									{session.isCurrent ? null : (
										<button
											type="button"
											className="work-panel-icon-button"
											aria-label="删除会话"
											title="删除会话"
											disabled={sessionPanelLoading || Boolean(sessionCreateDraft)}
											onClick={() =>
												setSessionDeleteDialog({
													locator: {
														agentInstanceId: sessionPanel.agentInstanceId,
														projectId: sessionPanel.projectId,
														workItemId: sessionPanel.workItemId,
														role: sessionPanel.role,
													},
													sessionId: session.sessionId,
													name: session.name || "未命名会话",
												})
											}
										>
											<Trash2 size={13} strokeWidth={2} />
										</button>
									)}
								</div>
							))}
						</div>
					</div>
					<div className="session-summary">
						<span>{sessionPanel.snapshot.messageCount} 条消息</span>
						<span>{sessionPanel.snapshot.nodes.length} 个节点</span>
						{sessionPanel.snapshot.contextUsage ? (
							<span>
								上下文{" "}
								{sessionPanel.snapshot.contextUsage.tokens === null
									? "—"
									: formatTokenCount(sessionPanel.snapshot.contextUsage.tokens)}{" "}
								/ {formatTokenCount(sessionPanel.snapshot.contextUsage.contextWindow)}
								{sessionPanel.snapshot.contextUsage.percent === null
									? ""
									: ` · ${Math.round(sessionPanel.snapshot.contextUsage.percent)}%`}
							</span>
						) : null}
						{sessionPanel.snapshot.isCompacting ? (
							<strong className="summary-warning">正在压缩上下文</strong>
						) : null}
						{sessionPanel.snapshot.isStreaming ? (
							<strong className="summary-active">Agent 正在运行</strong>
						) : null}
					</div>
					<div className="session-tree-list">
						{sessionPanel.snapshot.nodes.length === 0 ? (
							<div className="session-tree-empty">
								<div className="state-mark state-mark-muted">
									<AppIcon name="branch" size={18} />
								</div>
								<strong>当前会话还没有节点</strong>
								<p>发送消息后，这里会显示可以回溯和分叉的会话路径。</p>
							</div>
						) : (
							sessionPanel.snapshot.nodes.map((node) => {
								const nodeLabel =
									node.label ||
									(node.role === "user" ? "你" : node.role === "assistant" ? "Pi" : node.role || node.type);
								return (
									<div
										className={`session-node ${node.isLeaf ? "current" : ""}`}
										key={node.entryId}
										style={{ "--session-depth": Math.min(node.depth, 8) } as CSSProperties}
									>
										<div className="session-node-rail">
											<AppIcon name="branch" size={14} />
										</div>
										<div className="session-node-copy">
											<div className="session-node-meta">
												<span>{nodeLabel}</span>
												{node.isLeaf ? <strong>当前节点</strong> : null}
												{node.timestamp ? <time>{new Date(node.timestamp).toLocaleString()}</time> : null}
											</div>
											<p>{node.text || node.type}</p>
										</div>
										{node.forkable ? (
											<button
												className="session-fork-button"
												type="button"
												disabled={sessionPanelLoading || Boolean(sessionCreateDraft)}
												aria-label={`从${nodeLabel}节点创建分支`}
												title="从此节点创建分支"
												onClick={() => void forkAgentSession(node.entryId)}
											>
												{sessionPanelLoading ? "处理中…" : "Fork"}
											</button>
										) : null}
									</div>
								);
							})
						)}
					</div>
					<div className="session-tree-footer">
						<code>{sessionPanel.snapshot.sessionName || `未命名会话 · ${sessionPanel.snapshot.sessionId}`}</code>
						<button className="secondary-button" type="button" onClick={() => setSessionPanel(null)}>
							关闭
						</button>
					</div>
				</ModalShell>
			) : null}
			{sessionDeleteDialog ? (
				<ModalShell
					title="删除这个会话？"
					description={`将永久删除“${sessionDeleteDialog.name}”。此操作不可撤销。`}
					onClose={() => setSessionDeleteDialog(null)}
					closeDisabled={sessionPanelLoading}
					width="sm"
					className="danger-modal"
					footer={
						<>
							<button type="button" onClick={() => setSessionDeleteDialog(null)}>
								取消
							</button>
							<button
								className="danger-button"
								type="button"
								disabled={sessionPanelLoading}
								onClick={() => void deleteAgentSession()}
							>
								{sessionPanelLoading ? "删除中…" : "删除会话"}
							</button>
						</>
					}
				/>
			) : null}
			{sessionRenameDialog ? (
				<ModalShell
					title="重命名会话"
					description={`为 ${sessionRenameDialog.displayName} 的当前会话设置一个便于识别的名称。留空不会清除名称。`}
					onClose={() => setSessionRenameDialog(null)}
					closeDisabled={sessionPanelLoading}
					width="sm"
					className="session-rename-modal"
					footer={
						<>
							<button type="button" onClick={() => setSessionRenameDialog(null)}>
								取消
							</button>
							<button
								className="primary-button"
								type="button"
								disabled={!sessionRenameDialog.name.trim() || sessionPanelLoading}
								onClick={() => void renameAgentSession()}
							>
								{sessionPanelLoading ? "保存中…" : "保存"}
							</button>
						</>
					}
				>
					<label>
						会话名称
						<input
							maxLength={200}
							placeholder="未命名会话"
							value={sessionRenameDialog.name}
							onChange={(event) =>
								setSessionRenameDialog({
									...sessionRenameDialog,
									name: event.target.value,
								})
							}
							onKeyDown={(event) => {
								if (event.key === "Enter") void renameAgentSession();
							}}
						/>
					</label>
				</ModalShell>
			) : null}
			{sessionStatsDialog ? (
				<SessionStatsDialog
					displayName={sessionStatsDialog.displayName}
					stats={sessionStats}
					loading={sessionStatsLoading}
					onClose={() => setSessionStatsDialog(null)}
				/>
			) : null}
			{sessionShareDialog ? (
				<SessionShareDialog
					displayName={sessionShareDialog.displayName}
					sessionName={sessionShareDialog.sessionName}
					busy={sessionShareBusy}
					result={sessionShareDialog.result}
					error={sessionShareDialog.error}
					onConfirm={() => void shareAgentSession()}
					onClose={() => {
						if (!sessionShareBusy) setSessionShareDialog(null);
					}}
					onOpenUrl={openExternalLink}
				/>
			) : null}
			{projectTrustPromptOpen && project ? (
				<ModalShell
					title="信任这个项目？"
					description={
						<>
							信任后 Pi 才会加载项目级 settings、extensions、skills 和 packages。决定写入{" "}
							<code>~/.pi/agent/trust.json</code>，当前 Agent 重新连接后生效。
						</>
					}
					onClose={() => setProjectTrustPromptOpen(false)}
					closeDisabled={projectTrustBusy}
					width="sm"
					className="project-trust-modal"
					footer={
						<div className="project-trust-actions">
							<button
								className="primary-button"
								type="button"
								disabled={projectTrustBusy}
								onClick={() => void setProjectTrust(true)}
							>
								信任当前项目
							</button>
							<button
								className="secondary-button"
								type="button"
								disabled={projectTrustBusy}
								onClick={() => void setProjectTrust(true, true)}
							>
								信任父目录
							</button>
							<button
								className="secondary-button"
								type="button"
								disabled={projectTrustBusy}
								onClick={() => void setProjectTrust(false)}
							>
								不信任
							</button>
							<button type="button" onClick={() => setProjectTrustPromptOpen(false)}>
								稍后
							</button>
						</div>
					}
				>
					<code className="project-trust-path">{project.rootPath}</code>
				</ModalShell>
			) : null}
			{writeLeaseDialog?.lease ? (
				<ModalShell
					title="发现失效的项目写锁"
					description={`${writeLeaseDialog.lease.workItemId} / ${writeLeaseDialog.lease.role} Agent 持有的写锁对应进程已经不存在。清理后可以重新发送当前消息。`}
					onClose={() => setWriteLeaseDialog(null)}
					width="sm"
					className="danger-modal"
					footer={
						<>
							<button type="button" onClick={() => setWriteLeaseDialog(null)}>
								取消
							</button>
							<button
								className="danger-button"
								type="button"
								disabled={busy}
								onClick={() => void clearStaleWriteLease()}
							>
								清理写锁
							</button>
						</>
					}
				>
					<div className="lease-details">
						<span>Agent：{writeLeaseDialog.lease.holderAgentInstanceId}</span>
						<span>最后心跳：{new Date(writeLeaseDialog.lease.heartbeatAt).toLocaleString()}</span>
					</div>
				</ModalShell>
			) : null}
			{shellRestartDialog ? (
				<ModalShell
					title="重启 CodePIddy？"
					description="Shell 路径已保存。重启客户端后，新启动的 Agent 会使用新的 bash 配置。"
					onClose={() => setShellRestartDialog(false)}
					width="sm"
					footer={
						<>
							<button type="button" onClick={() => setShellRestartDialog(false)}>
								稍后
							</button>
							<button
								className="primary-button"
								type="button"
								onClick={() => void window.codepiddy.restartCodePIddy()}
							>
								立即重启
							</button>
						</>
					}
				/>
			) : null}
			{resetAgentDialog ? (
				<ModalShell
					title={`重置 ${resetAgentDialog.slot.displayName}？`}
					description="当前会话会归档到本地运行目录，然后为这个 Slot 创建一个全新的 Agent Instance。项目文件不会被删除。"
					onClose={() => setResetAgentDialog(null)}
					closeDisabled={busy}
					width="sm"
					className="danger-modal"
					footer={
						<>
							<button type="button" onClick={() => setResetAgentDialog(null)}>
								取消
							</button>
							<button
								className="danger-button"
								type="button"
								disabled={busy}
								onClick={() => void resetSelectedAgent()}
							>
								重置 Agent
							</button>
						</>
					}
				/>
			) : null}
			{renameDialog ? (
				<ModalShell title="重命名工作项" onClose={() => setRenameDialog(null)} closeDisabled={busy} width="sm">
					<form
						onSubmit={(event) => {
							event.preventDefault();
							void renameSelectedWorkItem();
						}}
					>
						<label>
							标题
							<input
								value={renameDialog.title}
								onChange={(event) => setRenameDialog({ ...renameDialog, title: event.target.value })}
							/>
						</label>
						<div className="modal-actions">
							<button type="button" onClick={() => setRenameDialog(null)}>
								取消
							</button>
							<button className="primary-button" type="submit" disabled={!renameDialog.title.trim() || busy}>
								保存
							</button>
						</div>
					</form>
				</ModalShell>
			) : null}
			{deleteDialog ? (
				<ModalShell
					title="永久删除工作项？"
					description={`将删除“${deleteDialog.item.id}：${deleteDialog.item.title}”的项目文件、Agent 会话和本地运行记录。此操作无法撤销。`}
					onClose={() => setDeleteDialog(null)}
					closeDisabled={busy}
					width="sm"
					className="danger-modal"
				>
					<div className="modal-actions">
						<button type="button" onClick={() => setDeleteDialog(null)}>
							取消
						</button>
						<button
							className="danger-button"
							type="button"
							disabled={busy}
							onClick={() => void permanentlyDeleteWorkItem()}
						>
							永久删除
						</button>
					</div>
				</ModalShell>
			) : null}
			{dialog ? (
				<ModalShell
					title={dialog.lane === "requirements" ? "新建需求" : "新建修漏洞"}
					onClose={() => setDialog(null)}
					closeDisabled={busy}
					width="sm"
				>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							void createWorkItem();
						}}
					>
						<label>
							标题
							<input
								value={dialog.title}
								onChange={(event) => setDialog({ ...dialog, title: event.target.value })}
							/>
						</label>
						<label>
							初始描述
							<textarea
								rows={5}
								value={dialog.description}
								onChange={(event) => setDialog({ ...dialog, description: event.target.value })}
							/>
						</label>
						<div className="modal-actions">
							<button type="button" onClick={() => setDialog(null)}>
								取消
							</button>
							<button className="primary-button" type="submit" disabled={!dialog.title.trim() || busy}>
								创建
							</button>
						</div>
					</form>
				</ModalShell>
			) : null}
			{extensionDialog ? (
				<ModalShell
					title="扩展请求"
					onClose={() => void respondToExtensionDialog({ cancelled: true })}
					width="sm"
					className="permission-modal"
					backdropDismiss={false}
				>
					<pre className="permission-message">
						{extensionDialog.title}
						{extensionDialog.message ? `\n\n${extensionDialog.message}` : ""}
					</pre>
					<button
						className="permission-defer"
						type="button"
						onClick={() => {
							setDeferredExtensionUiAgentId(extensionDialog.agentInstanceId);
							setExtensionDialog(null);
						}}
					>
						稍后处理
					</button>
					{extensionDialog.method === "select" ? (
						<div className="permission-options">
							{extensionDialog.options.map((option, index) => (
								<button
									className={index === 0 ? "primary-button" : "secondary-button"}
									type="button"
									key={option}
									onClick={() => void respondToExtensionDialog({ value: option })}
								>
									{option}
								</button>
							))}
						</div>
					) : extensionDialog.method === "confirm" ? (
						<div className="modal-actions">
							<button type="button" onClick={() => void respondToExtensionDialog({ confirmed: false })}>
								拒绝
							</button>
							<button
								className="primary-button"
								type="button"
								onClick={() => void respondToExtensionDialog({ confirmed: true })}
							>
								允许
							</button>
						</div>
					) : (
						<form
							onSubmit={(event) => {
								event.preventDefault();
								void respondToExtensionDialog({ value: extensionDialog.value });
							}}
						>
							<textarea
								rows={extensionDialog.method === "editor" ? 8 : 3}
								placeholder={extensionDialog.placeholder}
								value={extensionDialog.value}
								onChange={(event) => setExtensionDialog({ ...extensionDialog, value: event.target.value })}
							/>
							<div className="modal-actions">
								<button type="button" onClick={() => void respondToExtensionDialog({ cancelled: true })}>
									取消
								</button>
								<button className="primary-button" type="submit">
									提交
								</button>
							</div>
						</form>
					)}
					{extensionDialog.method === "select" ? (
						<button
							className="permission-cancel"
							type="button"
							onClick={() => void respondToExtensionDialog({ cancelled: true })}
						>
							取消
						</button>
					) : null}
				</ModalShell>
			) : null}
			{authDialogMode ? (
				<ModalShell
					title={authDialogMode === "login" ? "Provider 登录" : "退出 Provider"}
					description={
						authDialogMode === "login"
							? "使用 Pi 原生登录流程配置订阅或 API Key，凭据写入 ~/.pi/agent/auth.json。"
							: "移除 Pi 已保存的 Provider 凭据；环境变量和 models.json 中的 Key 不受影响。"
					}
					onClose={closeAuthDialog}
					width="md"
					className="auth-modal"
				>
					<div className="auth-form">
						<div className="settings-field">
							<span>Provider</span>
							<SelectMenu
								label="Provider"
								value={authProviderId ?? ""}
								disabled={authBusy || authRequestId !== null}
								searchable={authDialogMode === "login"}
								searchPlaceholder="搜索 Provider 名称或 ID"
								placeholder={authBusy ? "正在读取 Provider…" : "没有可用 Provider"}
								options={authProviders.map((provider) => ({
									value: provider.id,
									label: provider.name,
									icon: <ProviderIcon providerId={provider.id} size={15} />,
									...(provider.configured ? { description: "已配置" } : {}),
								}))}
								onChange={(value) => {
									const provider = authProviders.find((candidate) => candidate.id === value);
									setAuthProviderId(provider?.id ?? null);
									setAuthMethod(provider?.methods[0]?.type ?? null);
								}}
							/>
						</div>
						{authDialogMode === "login" && selectedAuthProvider && selectedAuthProvider.methods.length > 1 ? (
							<div className="settings-field">
								<span>登录方式</span>
								<SelectMenu
									label="登录方式"
									value={authMethod ?? ""}
									disabled={authBusy || authRequestId !== null}
									options={selectedAuthProvider.methods.map((method) => ({
										value: method.type,
										label: method.name,
										...(method.isSubscription ? { description: "订阅登录" } : {}),
									}))}
									onChange={(value) => setAuthMethod(value as AuthMethodType)}
								/>
							</div>
						) : null}
						{authPrompt ? (
							<form
								onSubmit={(event) => {
									event.preventDefault();
									void submitAuthPrompt();
								}}
							>
								<label className="settings-field" htmlFor={`auth-prompt-${authPrompt.promptId}`}>
									<span>{authPrompt.message}</span>
									{authPrompt.type === "select" ? (
										<SelectMenu
											label={authPrompt.message}
											value={authPromptValue}
											disabled={authBusy}
											options={(authPrompt.options ?? []).map((option) => ({
												value: option.id,
												label: option.label,
												...(option.description ? { description: option.description } : {}),
											}))}
											onChange={setAuthPromptValue}
										/>
									) : (
										<input
											id={`auth-prompt-${authPrompt.promptId}`}
											type={authPrompt.type === "secret" ? "password" : "text"}
											value={authPromptValue}
											placeholder={authPrompt.placeholder}
											disabled={authBusy}
											onChange={(event) => setAuthPromptValue(event.target.value)}
										/>
									)}
								</label>
								<div className="modal-actions">
									<button type="button" disabled={authBusy} onClick={closeAuthDialog}>
										取消
									</button>
									<button className="primary-button" type="submit" disabled={authBusy}>
										继续
									</button>
								</div>
							</form>
						) : null}
						{authMessage ? <p className="auth-message">{authMessage}</p> : null}
						{authError ? <StateBlock compact tone="error" title={authError} /> : null}
						{!authPrompt ? (
							<div className="modal-actions">
								{authDialogMode === "login" && authRequestId === null ? (
									<button
										className="primary-button"
										type="button"
										disabled={authBusy || !selectedAuthProvider || !authMethod}
										onClick={() => void startAuthLogin()}
									>
										开始登录
									</button>
								) : null}
								{authDialogMode === "logout" ? (
									<button
										className="primary-button"
										type="button"
										disabled={authBusy || !selectedAuthProvider}
										onClick={() => void logoutAuthProvider()}
									>
										退出登录
									</button>
								) : null}
								<button type="button" onClick={closeAuthDialog}>
									关闭
								</button>
							</div>
						) : null}
					</div>
				</ModalShell>
			) : null}
		</div>
	);
}
