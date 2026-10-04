import type {
	AgentClientEvent,
	AgentCommandOption,
	AgentImageAttachment,
	AgentInstanceLocator,
	AgentModelSelection,
	AgentRole,
	AgentSessionSnapshot,
	AgentSessionSummary,
	AgentSkillSummary,
	AgentSlotSummary,
	AgentStatus,
	AuthClientEvent,
	AuthMethodType,
	AuthPromptRequest,
	AuthProviderSummary,
	LaneKind,
	PendingPermissionRequest,
	PermissionDefaults,
	PermissionState,
	PiRuntimeStatus,
	ProjectSummary,
	ProjectUiState,
	ProjectWriteLeaseStatus,
	RecentProject,
	RoleSkillAssignments,
	SettingsStatus,
	WorkItemSummary,
} from "@codepiddy/shared";
import { Check, Eye, EyeOff, Trash2 } from "lucide-react";
import { type CSSProperties, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AppIcon, type AppIconName } from "./components/app-icon.tsx";
import { FileMentionMenu } from "./components/FileMentionMenu.tsx";
import { McpSettings } from "./components/McpSettings.tsx";
import { MessageContent } from "./components/message-content.tsx";
import { ProviderSettings } from "./components/ProviderSettings.tsx";
import { SlashCommandMenu } from "./components/SlashCommandMenu.tsx";
import { StreamStats } from "./components/StreamStats.tsx";
import { SelectMenu } from "./components/select-menu.tsx";
import { SettingsToastHost } from "./components/settings-toast-host.tsx";
import { showSettingsToast } from "./components/settings-toast-store.ts";
import { estimateTokens, extractUsageOutput, type FinalStreamStats, formatElapsed } from "./components/stream-stats.ts";
import { ThinkingControl } from "./components/ThinkingControl.tsx";
import { ToolCallCard } from "./components/ToolCallCard.tsx";
import { thinkingLevelLabel } from "./components/thinking-levels.ts";
import {
	formatTurnElapsed,
	groupTranscriptIntoTurns,
	resolveTurnCollapsed,
	splitTurnEntries,
	turnElapsedMs,
} from "./components/turn-group.ts";
import { WorkPanel } from "./components/WorkPanel.tsx";
import { demoProject } from "./demo-project.ts";
import { permissionChoicePresentation } from "./permission-choices.ts";

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

interface WorkItemDialogState {
	lane: LaneKind;
	title: string;
	description: string;
}

interface ArchiveToast {
	lane: LaneKind;
	workItemId: string;
	title: string;
}

interface RenameDialogState {
	lane: LaneKind;
	item: WorkItemSummary;
	title: string;
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
	  }
	| { id: string; type: "system"; text: string; createdAt?: string }
	| {
			id: string;
			type: "tool";
			name: string;
			args: string;
			text: string;
			status: "running" | "completed";
			isError: boolean;
	  };

interface ToolRecoveryOffer {
	toolName: string;
	reason: string;
}

function extensionDialogFromPermission(request: PendingPermissionRequest): ExtensionDialogState {
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

/** 统计行只保留一条：该 assistant 消息之后是否还有更新的 assistant 消息。 */
function hasLaterAssistant(items: TranscriptItem[], index: number): boolean {
	for (let i = index + 1; i < items.length; i += 1) if (items[i]?.type === "assistant") return true;
	return false;
}

function formatMessageTime(value: string | undefined): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
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
				const renderEntry = (entry: TranscriptItem, index: number) => (
					<div className={`transcript-entry entry-${entry.type}`} data-transcript-index={index} key={entry.id}>
						{entry.type === "tool" ? (
							<ToolCallCard item={entry} />
						) : (
							<TranscriptMessage
								item={entry}
								assistantModel={assistantModel}
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

function readStoredScrollPositions(): Record<string, number> {
	try {
		const value = JSON.parse(localStorage.getItem("codepiddy:agent-scroll-positions") ?? "{}") as unknown;
		if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
		return Object.fromEntries(
			Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
		);
	} catch {
		return {};
	}
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

const permissionChoices: { value: PermissionState; label: string }[] = [
	{ value: "allow", label: "直接允许" },
	{ value: "ask", label: "每次询问" },
	{ value: "deny", label: "禁止" },
];

function PermissionSettingRow({
	label,
	description,
	value,
	onChange,
}: {
	label: string;
	description: string;
	value: PermissionState;
	onChange(value: PermissionState): void;
}) {
	const [open, setOpen] = useState(false);
	const [highlighted, setHighlighted] = useState(0);
	const rootRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!open) return;
		const closeOnOutside = (event: PointerEvent): void => {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener("pointerdown", closeOnOutside);
		return () => document.removeEventListener("pointerdown", closeOnOutside);
	}, [open]);
	useEffect(() => {
		if (open) listRef.current?.querySelectorAll<HTMLButtonElement>("[role=option]")[highlighted]?.focus();
	}, [open, highlighted]);
	function choose(next: PermissionState): void {
		onChange(next);
		setOpen(false);
		triggerRef.current?.focus();
	}
	function handleKeys(event: React.KeyboardEvent): void {
		if (event.key === "Escape" && open) {
			event.preventDefault();
			event.stopPropagation();
			setOpen(false);
			triggerRef.current?.focus();
		} else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			setHighlighted((current) =>
				open
					? (current + (event.key === "ArrowDown" ? 1 : 2)) % 3
					: permissionChoices.findIndex((choice) => choice.value === value),
			);
			setOpen(true);
		}
	}
	return (
		<div className="permission-setting-row">
			<span>
				<strong>{label}</strong>
				<small>{description}</small>
			</span>
			<div className="permission-picker" ref={rootRef}>
				<button
					ref={triggerRef}
					type="button"
					className="permission-picker-trigger"
					onKeyDown={handleKeys}
					aria-label={`${label}：${permissionChoices.find((choice) => choice.value === value)?.label}`}
					aria-haspopup="listbox"
					aria-expanded={open}
					onClick={() => {
						setHighlighted(permissionChoices.findIndex((choice) => choice.value === value));
						setOpen((current) => !current);
					}}
				>
					{permissionChoices.find((choice) => choice.value === value)?.label}
					<AppIcon name="chevron" size={14} />
				</button>
				{open ? (
					<div
						className="permission-picker-list"
						ref={listRef}
						role="listbox"
						onKeyDown={handleKeys}
						aria-label={`${label}权限`}
					>
						{permissionChoices.map((choice) => (
							<button
								key={choice.value}
								type="button"
								className={value === choice.value ? "is-selected" : ""}
								role="option"
								aria-selected={value === choice.value}
								onClick={() => choose(choice.value)}
							>
								<span>{choice.label}</span>
								{value === choice.value ? <Check size={13} strokeWidth={2} aria-hidden="true" /> : null}
							</button>
						))}
					</div>
				) : null}
			</div>
		</div>
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

interface TranscriptTurn {
	id: string;
	startIndex: number;
	endIndex: number;
	request: string;
	response: string;
	hasError: boolean;
}

function compactTranscriptText(value: string, maximum: number): string {
	const normalized = value.replace(/\s+/g, " ").trim();
	return normalized.length > maximum ? `${normalized.slice(0, maximum)}…` : normalized;
}

function buildTranscriptTurns(items: TranscriptItem[]): TranscriptTurn[] {
	const turns: TranscriptTurn[] = [];
	let current: TranscriptTurn | null = null;
	for (const [index, item] of items.entries()) {
		if (item.type === "user") {
			if (current) turns.push(current);
			current = {
				id: item.id,
				startIndex: index,
				endIndex: index,
				request: compactTranscriptText(item.text, 80) || "图片消息",
				response: "",
				hasError: false,
			};
			continue;
		}
		if (!current) continue;
		current.endIndex = index;
		if (!current.response) {
			if (item.type === "tool") {
				current.response = `工具：${item.name}${item.isError ? "（失败）" : ""}`;
			} else {
				current.response = compactTranscriptText(item.text, 92);
			}
		}
		if (item.type === "tool" && item.isError) current.hasError = true;
		if (item.type === "assistant" && item.status === "error") current.hasError = true;
	}
	if (current) turns.push(current);
	return turns;
}

const MINIMAP_MAGNIFY_RADIUS = 46;
const MINIMAP_MAGNIFY_BOOST = 1.35;

function TranscriptMinimap({
	items,
	activeIndex,
	onJump,
	scrollRef,
}: {
	items: TranscriptItem[];
	activeIndex: number;
	onJump(index: number): void;
	scrollRef: { current: HTMLDivElement | null };
}) {
	const turns = buildTranscriptTurns(items);
	const tickRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const railRef = useRef<HTMLElement | null>(null);
	const frameRef = useRef(0);
	// 先显示再测量：测量失败时宁可多显示一条定位条，也不要整条消失。
	const [overflowing, setOverflowing] = useState(true);

	useEffect(() => {
		const element = scrollRef.current;
		if (!element) return;
		const update = (): void => setOverflowing(element.scrollHeight - element.clientHeight > 1);
		update();
		const resizeObserver = new ResizeObserver(update);
		const mutationObserver = new MutationObserver(update);
		resizeObserver.observe(element);
		mutationObserver.observe(element, { childList: true, subtree: true, characterData: true });
		return () => {
			resizeObserver.disconnect();
			mutationObserver.disconnect();
		};
	}, [scrollRef]);

	if (turns.length < 2 || !overflowing) return null;
	const activeTurnIndex = Math.max(
		0,
		turns.findIndex((turn) => activeIndex >= turn.startIndex && activeIndex <= turn.endIndex),
	);
	const maximumVisibleTurns = 20;
	const visibleStart = Math.max(
		0,
		Math.min(turns.length - maximumVisibleTurns, activeTurnIndex - Math.floor(maximumVisibleTurns / 2)),
	);
	const visibleTurns = turns.slice(visibleStart, visibleStart + maximumVisibleTurns);

	function applyMagnify(clientY: number): void {
		const rail = railRef.current;
		if (!rail) return;
		const y = clientY - rail.getBoundingClientRect().top;
		cancelAnimationFrame(frameRef.current);
		frameRef.current = requestAnimationFrame(() => {
			for (const tick of tickRefs.current) {
				if (!tick) continue;
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
		for (const tick of tickRefs.current) tick?.style.setProperty("--minimap-magnify", "1");
	}

	return (
		<nav
			className="transcript-minimap"
			aria-label="对话快速定位"
			ref={railRef}
			onMouseMove={(event) => applyMagnify(event.clientY)}
			onMouseLeave={resetMagnify}
		>
			{visibleTurns.map((turn, visibleIndex) => {
				const turnIndex = visibleStart + visibleIndex;
				const offset = visibleIndex - (visibleTurns.length - 1) / 2;
				const label = `第 ${turnIndex + 1} 轮：${turn.request}`;
				return (
					<button
						key={turn.id}
						type="button"
						ref={(element) => {
							tickRefs.current[visibleIndex] = element;
						}}
						className={`transcript-minimap-tick ${turn.hasError ? "tick-error" : ""} ${turnIndex === activeTurnIndex ? "active" : ""}`}
						style={{ top: `calc(50% + ${offset * 20}px)` }}
						onClick={() => onJump(turn.startIndex)}
						aria-label={label}
					>
						<span className="transcript-minimap-preview" role="tooltip">
							<strong>第 {turnIndex + 1} 轮</strong>
							<span>{turn.request}</span>
							<small>{turn.response || "Pi 正在处理这一轮"}</small>
						</span>
					</button>
				);
			})}
		</nav>
	);
}

const demoMode = import.meta.env.DEV && new URLSearchParams(window.location.search).has("demo");

type SettingsSectionId = "runtime" | "shell" | "providers" | "mcp" | "search" | "permissions" | "skills";

const SETTINGS_NAV: { label: string; items: { id: SettingsSectionId; label: string; icon: AppIconName }[] }[] = [
	{
		label: "常规",
		items: [
			{ id: "runtime", label: "Pi 运行时", icon: "settings" },
			{ id: "shell", label: "Shell", icon: "terminal" },
		],
	},
	{
		label: "集成",
		items: [
			{ id: "providers", label: "Provider 与模型", icon: "globe" },
			{ id: "mcp", label: "MCP 服务", icon: "plug" },
			{ id: "search", label: "Tavily Search", icon: "search" },
		],
	},
	{
		label: "Agent",
		items: [
			{ id: "permissions", label: "默认权限", icon: "shield" },
			{ id: "skills", label: "Agent Skills", icon: "sparkles" },
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
	{ name: "copy", command: "/copy", description: "Copy last agent message to clipboard", source: "builtin" },
	{
		name: "name",
		command: "/name",
		description: "Set session display name",
		argumentHint: "<name>",
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
	availableModels: [
		{ provider: "openai", id: "gpt-5.5", name: "GPT-5.5", reasoning: true },
		{ provider: "openai", id: "gpt-5.4-mini", name: "GPT-5.4 Mini", reasoning: true },
		{ provider: "anthropic", id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", reasoning: true },
		{ provider: "custom-team", id: "deepseek-v3", name: "DeepSeek V3", reasoning: false },
	],
};

export function App() {
	const [project, setProject] = useState<ProjectSummary | null>(demoMode ? demoProject : null);
	const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
	const [selection, setSelection] = useState<Selection>(demoMode ? { type: "project" } : { type: "welcome" });
	const [expanded, setExpanded] = useState<Set<string>>(
		new Set(demoMode ? ["project:demo-project", "lane:requirements", "lane:bugs", "work-item:FEAT-001"] : []),
	);
	const [dialog, setDialog] = useState<WorkItemDialogState | null>(null);
	const [archiveToast, setArchiveToast] = useState<ArchiveToast | null>(null);
	const [sessionNotice, setSessionNotice] = useState<string | null>(null);
	const [renameDialog, setRenameDialog] = useState<RenameDialogState | null>(null);
	const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null);
	const [resetAgentDialog, setResetAgentDialog] = useState<ResetAgentDialogState | null>(null);
	const [agentActionsOpen, setAgentActionsOpen] = useState<string | null>(null);
	const [sessionPanel, setSessionPanel] = useState<SessionPanelState | null>(null);
	const [sessionPanelLoading, setSessionPanelLoading] = useState(false);
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
	const [piRuntimeStatus, setPiRuntimeStatus] = useState<PiRuntimeStatus | null>(null);
	const [piRuntimeBusy, setPiRuntimeBusy] = useState<"check" | "install" | "rollback" | null>(null);
	const [settingsSection, setSettingsSection] = useState<SettingsSectionId>("runtime");
	const [piUpdateConfirm, setPiUpdateConfirm] = useState(false);
	const [permissionDefaults, setPermissionDefaults] = useState<PermissionDefaults>({
		read: "allow",
		write: "allow",
		bash: "ask",
		mcp: "ask",
		skills: "ask",
		otherTools: "ask",
		externalDirectory: "ask",
	});
	const [permissionSaving, setPermissionSaving] = useState(false);
	// 权限卡自己的错误位。设置页通用的 error 横幅固定在 main pane 顶部，
	// 页面滚到下面就看不见，而这里恰恰是最需要立刻看到失败的地方。
	const [tavilyApiKey, setTavilyApiKey] = useState("");
	const [tavilyKeyRevealed, setTavilyKeyRevealed] = useState(false);
	const [shellPath, setShellPath] = useState("");
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
	const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
	const [agentActivities, setAgentActivities] = useState<Record<string, AgentActivity>>(
		demoMode ? { "CODE-001": { label: "Pi 正在处理", kind: "working", queued: 0 } } : {},
	);
	const [pendingPermissionRequests, setPendingPermissionRequests] = useState<Record<string, PendingPermissionRequest>>(
		{},
	);
	const [deferredPermissionAgentId, setDeferredPermissionAgentId] = useState<string | null>(null);
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
	const permissionResponsesInFlight = useRef(new Set<string>());
	const agentCommandLoads = useRef(new Map<string, Promise<AgentCommandOption[]>>());
	const activatedAgentKey = useRef<string | null>(null);
	const projectRef = useRef<ProjectSummary | null>(project);
	const transcriptRef = useRef<HTMLDivElement | null>(null);
	const imageInputRef = useRef<HTMLInputElement | null>(null);
	const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
	const modelSearchInputRef = useRef<HTMLInputElement | null>(null);
	const modelListRef = useRef<HTMLDivElement | null>(null);
	const modelPickerRef = useRef<HTMLDivElement | null>(null);
	const modelPickerInitializedRef = useRef<string | null>(null);
	const modelPickerKeyboardScrollRef = useRef(false);
	const modelPickerSelectedIndexRef = useRef(0);
	const scrollPositions = useRef<Record<string, number>>(readStoredScrollPositions());
	const restoredProjectUiRoots = useRef(new Set<string>());
	const restoringProjectUiRoots = useRef(new Set<string>());
	const restoredAgentUiIds = useRef(new Set<string>());
	const restoringAgentUiIds = useRef(new Set<string>());
	const agentUiSaveTimers = useRef(new Map<string, number>());
	const [showJumpToLatest, setShowJumpToLatest] = useState(false);
	const [activeTranscriptIndex, setActiveTranscriptIndex] = useState(0);

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

	const updateTranscriptViewport = useCallback((): void => {
		const element = transcriptRef.current;
		if (!element) {
			setActiveTranscriptIndex(0);
			return;
		}
		const entries = [...element.querySelectorAll<HTMLElement>("[data-transcript-index]")];
		const viewportCenter = element.scrollTop + element.clientHeight / 2;
		let activeIndex = 0;
		let nearestDistance = Number.POSITIVE_INFINITY;
		for (const entry of entries) {
			const index = Number.parseInt(entry.dataset.transcriptIndex ?? "0", 10);
			const center = entry.offsetTop + entry.offsetHeight / 2;
			const distance = Math.abs(center - viewportCenter);
			if (distance < nearestDistance) {
				nearestDistance = distance;
				activeIndex = index;
			}
		}
		setActiveTranscriptIndex((current) => (current === activeIndex ? current : activeIndex));
	}, []);

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

	const activeAgentLocator = useMemo<AgentInstanceLocator | null>(() => {
		if (!project || !selectedWorkItem || selection.type !== "agent" || !activeAgentId) return null;
		return {
			agentInstanceId: activeAgentId,
			projectId: project.id,
			workItemId: selectedWorkItem.id,
			role: selection.role,
		};
	}, [activeAgentId, project, selectedWorkItem, selection]);

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
		if (!activeAgentId || showJumpToLatest) return;
		setUnreadCounts((current) =>
			(current[activeAgentId] ?? 0) === 0 ? current : { ...current, [activeAgentId]: 0 },
		);
	}, [activeAgentId, showJumpToLatest]);

	const activeDraftStartsWithSlash = Boolean(
		activeAgentId && (drafts[activeAgentId] ?? "").trimStart().startsWith("/"),
	);

	const modelPickerOptions = useMemo(() => {
		if (!modelPickerAgentId) return [];
		const modelSelection = modelSelections[modelPickerAgentId];
		if (!modelSelection) return [];
		const normalizedSearch = modelSearch.trim().toLowerCase();
		return modelSelection.availableModels.filter((model) =>
			`${model.provider} ${model.name} ${model.id}`.toLowerCase().includes(normalizedSearch),
		);
	}, [modelPickerAgentId, modelSearch, modelSelections]);

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
			if (agentId === activeAgentId && !showJumpToLatest) return;
			setUnreadCounts((current) => ({ ...current, [agentId]: (current[agentId] ?? 0) + 1 }));
		},
		[activeAgentId, showJumpToLatest],
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
					const request: PendingPermissionRequest = {
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
					setPendingPermissionRequests((current) => ({ ...current, [agentInstanceId]: request }));
					setDeferredPermissionAgentId((current) => (current === agentInstanceId ? null : current));
					if (activeAgentId === agentInstanceId) setExtensionDialog(extensionDialogFromPermission(request));
					markAgentUnread(agentInstanceId);
					updateAgentStatus(clientEvent, "waiting");
					updateAgentActivity(agentInstanceId, { label: "等待权限确认", kind: "waiting", queued: 0 });
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
				setPendingPermissionRequests((current) => {
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
				activeAssistantIds.current.delete(agentInstanceId);
				setTranscripts((current) => ({
					...current,
					[agentInstanceId]: normalizeHistory(event.messages as unknown[]),
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
									},
								];
							return items.map((item) =>
								item.id === id && item.type === "assistant"
									? {
											...item,
											text: item.text + delta,
											status: "streaming",
											...(typeof item.streamStartedAt === "number" ? {} : { streamStartedAt: Date.now() }),
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
									},
								];
							return items.map((item) =>
								item.id === id && item.type === "assistant"
									? {
											...item,
											thinking: (item.thinking ?? "") + delta,
											status: "streaming",
											...(typeof item.streamStartedAt === "number" ? {} : { streamStartedAt: Date.now() }),
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
							? { ...item, text: extractMessageText(event.partialResult) || item.text || "正在执行…" }
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
				setPendingPermissionRequests((current) => {
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
				const permission = await window.codepiddy.getPendingPermissionRequest(locator);
				if (permission) {
					setPendingPermissionRequests((current) => ({
						...current,
						[slot.currentInstanceId!]: permission,
					}));
					setExtensionDialog(extensionDialogFromPermission(permission));
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
			setDeferredPermissionAgentId(null);
			return;
		}
		if (deferredPermissionAgentId === activeAgentId) {
			setExtensionDialog(null);
			return;
		}
		const pending = pendingPermissionRequests[activeAgentId];
		setExtensionDialog((current) => {
			if (current?.agentInstanceId === activeAgentId) return current;
			return pending ? extensionDialogFromPermission(pending) : null;
		});
	}, [activeAgentId, deferredPermissionAgentId, pendingPermissionRequests]);

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
		if (demoMode || selection.type !== "settings" || settingsSection !== "search" || !("codepiddy" in window)) {
			return;
		}
		let cancelled = false;
		void window.codepiddy
			.getSettingsStatus()
			.then((status) => {
				if (!cancelled) setSettingsStatus(status);
			})
			.catch((caught: unknown) => {
				if (!cancelled) setError(caught instanceof Error ? caught.message : "读取 Tavily 配置状态失败");
			});
		return () => {
			cancelled = true;
		};
	}, [selection.type, settingsSection]);

	useEffect(() => {
		if (!archiveToast) return;
		const timer = window.setTimeout(() => setArchiveToast(null), 4500);
		return () => window.clearTimeout(timer);
	}, [archiveToast]);

	useEffect(() => {
		if (!sessionNotice) return;
		const timer = window.setTimeout(() => setSessionNotice(null), 3200);
		return () => window.clearTimeout(timer);
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
				setSessionNotice("Provider 登录成功");
				setProviderSettingsRefreshToken((current) => current + 1);
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
	}, [authDialogMode, authRequestId]);

	useEffect(() => {
		const element = transcriptRef.current;
		if (!element || !activeAgentId) {
			setShowJumpToLatest(false);
			return;
		}
		const frame = requestAnimationFrame(() => {
			const stored = scrollPositions.current[activeAgentId];
			element.scrollTop = stored ?? element.scrollHeight;
			setShowJumpToLatest(element.scrollHeight - element.scrollTop - element.clientHeight > 160);
			updateTranscriptViewport();
		});
		return () => cancelAnimationFrame(frame);
	}, [activeAgentId, updateTranscriptViewport]);

	useEffect(() => {
		const element = transcriptRef.current;
		if (!element || !activeAgentId || showJumpToLatest) return;
		const scrollToBottom = (): void => {
			const frame = requestAnimationFrame(() => {
				element.scrollTop = element.scrollHeight;
				scrollPositions.current[activeAgentId] = element.scrollTop;
				updateTranscriptViewport();
			});
			requestAnimationFrame(() => cancelAnimationFrame(frame));
		};
		scrollToBottom();
		const observer = new MutationObserver(scrollToBottom);
		observer.observe(element, { childList: true, subtree: true, characterData: true });
		return () => observer.disconnect();
	}, [activeAgentId, showJumpToLatest, updateTranscriptViewport]);

	useEffect(() => {
		const element = transcriptRef.current;
		if (!element || !activeAgentId) return;
		let frame = 0;
		const scheduleUpdate = (): void => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(updateTranscriptViewport);
		};
		const mutationObserver = new MutationObserver(scheduleUpdate);
		const resizeObserver = new ResizeObserver(scheduleUpdate);
		mutationObserver.observe(element, { childList: true, subtree: true, characterData: true });
		resizeObserver.observe(element);
		scheduleUpdate();
		return () => {
			cancelAnimationFrame(frame);
			mutationObserver.disconnect();
			resizeObserver.disconnect();
		};
	}, [activeAgentId, updateTranscriptViewport]);

	function handleTranscriptScroll(): void {
		const element = transcriptRef.current;
		if (!element || !activeAgentId) return;
		scrollPositions.current[activeAgentId] = element.scrollTop;
		localStorage.setItem("codepiddy:agent-scroll-positions", JSON.stringify(scrollPositions.current));
		if ("codepiddy" in window) {
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
			}, 200);
			agentUiSaveTimers.current.set(activeAgentId, timer);
		}
		const awayFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight > 160;
		setShowJumpToLatest(awayFromBottom);
		updateTranscriptViewport();
		if (!awayFromBottom) {
			setUnreadCounts((current) =>
				(current[activeAgentId] ?? 0) === 0 ? current : { ...current, [activeAgentId]: 0 },
			);
		}
	}

	function jumpToTranscriptItem(index: number): void {
		const element = transcriptRef.current;
		const entry = element?.querySelector<HTMLElement>(`[data-transcript-index="${index}"]`);
		if (!element || !entry) return;
		const top = Math.max(0, entry.offsetTop - Math.max(24, element.clientHeight * 0.28));
		element.scrollTo({ top, behavior: "smooth" });
	}

	function jumpToLatest(): void {
		const element = transcriptRef.current;
		if (!element) return;
		element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
		setShowJumpToLatest(false);
		if (activeAgentId) setUnreadCounts((current) => ({ ...current, [activeAgentId]: 0 }));
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
			setArchiveToast({ lane, workItemId: item.id, title: item.title });
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

	async function restoreArchived(): Promise<void> {
		if (!archiveToast) return;
		const toast = archiveToast;
		setArchiveToast(null);
		await restoreWorkItem(toast.lane, toast.workItemId);
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
				if (name === "fork" || name === "tree" || name === "session") {
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
				setPendingPermissionRequests((current) => {
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

	function closeAuthDialog(): void {
		if (authRequestId && "codepiddy" in window) void window.codepiddy.cancelAuthLogin(authRequestId);
		setAuthDialogMode(null);
		setAuthRequestId(null);
		setAuthPrompt(null);
		setAuthPromptValue("");
		setAuthMessage(null);
		setAuthError(null);
	}

	async function openAuthDialog(mode: "login" | "logout", providerArg?: string): Promise<void> {
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
			const providers = await window.codepiddy.listAuthProviders();
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
			setProviderSettingsRefreshToken((current) => current + 1);
			setAuthProviders(await window.codepiddy.listAuthProviders());
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

	async function createAgentSession(): Promise<void> {
		if (!sessionPanel) return;
		if (demoMode) {
			setSessionPanel((current) =>
				current
					? {
							...current,
							sessions: [
								{
									sessionId: `demo-session-${current.sessions.length + 1}`,
									name: null,
									preview: "新会话",
									messageCount: 0,
									createdAt: new Date().toISOString(),
									updatedAt: new Date().toISOString(),
									isCurrent: true,
								},
								...current.sessions.map((session) => ({ ...session, isCurrent: false })),
							],
						}
					: current,
			);
			return;
		}
		setSessionPanelLoading(true);
		setError(null);
		try {
			const result = await window.codepiddy.newAgentSession({
				agentInstanceId: sessionPanel.agentInstanceId,
				projectId: sessionPanel.projectId,
				workItemId: sessionPanel.workItemId,
				role: sessionPanel.role,
			});
			setSessionPanel((current) =>
				current ? { ...current, snapshot: result.snapshot, sessions: result.sessions } : current,
			);
			setDrafts((current) => ({ ...current, [sessionPanel.agentInstanceId]: "" }));
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "新建会话失败");
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

	async function deleteAgentSession(sessionId: string): Promise<void> {
		if (!sessionPanel || sessionPanel.snapshot.sessionId === sessionId) return;
		if (!window.confirm("确定删除这个会话？此操作不可撤销。")) return;
		if (demoMode) {
			setSessionPanel((current) =>
				current
					? { ...current, sessions: current.sessions.filter((session) => session.sessionId !== sessionId) }
					: current,
			);
			return;
		}
		setSessionPanelLoading(true);
		setError(null);
		try {
			const sessions = await window.codepiddy.deleteAgentSession({
				agentInstanceId: sessionPanel.agentInstanceId,
				projectId: sessionPanel.projectId,
				workItemId: sessionPanel.workItemId,
				role: sessionPanel.role,
				sessionId,
			});
			setSessionPanel((current) => (current ? { ...current, sessions } : current));
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
		if (permissionResponsesInFlight.current.has(current.requestId)) return;
		permissionResponsesInFlight.current.add(current.requestId);
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
			setPendingPermissionRequests((permissions) => {
				const next = { ...permissions };
				delete next[current.agentInstanceId];
				return next;
			});
			setDeferredPermissionAgentId((agentId) => (agentId === current.agentInstanceId ? null : agentId));
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
			if (!/Permission request is no longer active|Agent process is not active/i.test(message)) {
				setExtensionDialog(current);
				setError(clientErrorMessage(caught, "提交权限响应失败"));
			}
		} finally {
			permissionResponsesInFlight.current.delete(current.requestId);
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
			if (modelPickerAgentId) {
				setModelPickerAgentId(null);
				setModelSearch("");
			} else if (sessionPanel) setSessionPanel(null);
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
		renameDialog,
		resetAgentDialog,
		selectedWorkItem,
		selection,
		sessionPanel,
		writeLeaseDialog,
		abortAgent,
	]);

	async function openSettings(section: SettingsSectionId = "runtime"): Promise<void> {
		setSettingsSection(section);
		setSelection({ type: "settings" });
		if (!("codepiddy" in window)) return;
		const [status, permissions, skills, assignments, piRuntime] = await Promise.all([
			window.codepiddy.getSettingsStatus(),
			window.codepiddy.getPermissionDefaults(),
			window.codepiddy.listAgentSkills(project?.rootPath),
			window.codepiddy.getRoleSkillAssignments(),
			window.codepiddy.getPiRuntimeStatus(),
		]);
		setSettingsStatus(status);
		setPiRuntimeStatus(piRuntime);
		setPermissionDefaults(permissions);
		setAvailableSkills(skills);
		setRoleSkillAssignments(assignments);
	}

	/**
	 * 改一项就落一次盘，不再要按「保存权限」。
	 *
	 * 同一个设置页里原本混着三套保存模型：权限和 Tavily/Shell 要点保存，
	 * Skills 勾选即存，运行时是即时执行。用户得记三套规则，而且前两者
	 * 改完直接切走就静默丢失。统一成即时保存后，权限这一项的行为和 Skills 一致，
	 * 也和权限本身「下一次工具调用就生效」的事实一致（扩展按 mtime 失效缓存）。
	 *
	 * 先乐观更新再回滚：写盘是本地操作，失败时把界面退回去并在卡片内报错，
	 * 而不是把错误塞到页面顶部的全局横幅里（长页面滚下去看不见）。
	 */
	async function updatePermissionDefaults(patch: Partial<PermissionDefaults>): Promise<void> {
		if (!("codepiddy" in window) || permissionSaving) return;
		const previous = permissionDefaults;
		const next = { ...previous, ...patch };
		setPermissionDefaults(next);
		setPermissionSaving(true);
		try {
			setPermissionDefaults(await window.codepiddy.setPermissionDefaults(next));
		} catch (caught) {
			setPermissionDefaults(previous);
			showSettingsToast(caught instanceof Error ? caught.message : "保存默认权限失败", "error");
		} finally {
			setPermissionSaving(false);
		}
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

	async function saveTavilyKey(): Promise<void> {
		if (!("codepiddy" in window)) return;
		try {
			setSettingsStatus(await window.codepiddy.saveTavilyApiKey(tavilyApiKey));
			setTavilyApiKey("");
			setTavilyKeyRevealed(false);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "保存 Tavily API Key 失败");
		}
	}

	async function clearTavilyKey(): Promise<void> {
		if (!("codepiddy" in window)) return;
		setSettingsStatus(await window.codepiddy.clearTavilyApiKey());
		setTavilyApiKey("");
		setTavilyKeyRevealed(false);
	}

	async function toggleTavilyKeyReveal(): Promise<void> {
		if (!("codepiddy" in window)) return;
		if (tavilyKeyRevealed) {
			setTavilyKeyRevealed(false);
			return;
		}
		if (tavilyApiKey) {
			setTavilyKeyRevealed(true);
			return;
		}
		if (!settingsStatus?.tavilyApiKeyConfigured) return;
		try {
			const apiKey = await window.codepiddy.getTavilyApiKey();
			if (apiKey) {
				setTavilyApiKey(apiKey);
				setTavilyKeyRevealed(true);
			}
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "读取 Tavily API Key 失败");
		}
	}

	async function saveShellPath(value: string): Promise<void> {
		if (!("codepiddy" in window)) return;
		try {
			setSettingsStatus(await window.codepiddy.saveShellPath(value));
			setShellPath("");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "保存 Shell 路径失败");
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

	async function openPermissionPolicyFolder(): Promise<void> {
		try {
			await window.codepiddy.openPermissionPolicyFolder();
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "打开权限配置目录失败");
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
						<section
							className="settings-card permission-settings-card"
							hidden={settingsSection !== "permissions"}
						>
							<div className="settings-card-heading">
								<div>
									<h2>默认权限</h2>
									<p>所有 Agent 共用。按工具类型分别设置；“修改文件”不包含 Bash 命令。</p>
								</div>
								<div className="skill-settings-actions">
									<div className="settings-status">全局</div>
									<button
										className="secondary-button"
										type="button"
										onClick={() => void openPermissionPolicyFolder()}
									>
										打开权限配置目录
									</button>
								</div>
							</div>
							<div className="permission-setting-list">
								<PermissionSettingRow
									label="读取文件"
									description="read、grep、find 和 ls"
									value={permissionDefaults.read}
									onChange={(read) => void updatePermissionDefaults({ read })}
								/>
								<PermissionSettingRow
									label="修改文件"
									description="write 和 edit"
									value={permissionDefaults.write}
									onChange={(write) => void updatePermissionDefaults({ write })}
								/>
								<PermissionSettingRow
									label="命令执行"
									description="Bash，可执行任意命令；Coding Agent 常用"
									value={permissionDefaults.bash}
									onChange={(bash) => void updatePermissionDefaults({ bash })}
								/>
								<PermissionSettingRow
									label="MCP 工具"
									description="调用已配置的 MCP 服务"
									value={permissionDefaults.mcp}
									onChange={(mcp) => void updatePermissionDefaults({ mcp })}
								/>
								<PermissionSettingRow
									label="Skill"
									description="读取和使用 Agent Skill"
									value={permissionDefaults.skills}
									onChange={(skills) => void updatePermissionDefaults({ skills })}
								/>
								<PermissionSettingRow
									label="其他工具"
									description="未单独列出的工具"
									value={permissionDefaults.otherTools}
									onChange={(otherTools) => void updatePermissionDefaults({ otherTools })}
								/>
								<PermissionSettingRow
									label="项目外路径"
									description="通过文件工具访问项目目录之外"
									value={permissionDefaults.externalDirectory}
									onChange={(externalDirectory) =>
										setPermissionDefaults((current) => ({ ...current, externalDirectory }))
									}
								/>
							</div>
							<div className="permission-settings-footer">
								<small>
									直接允许命令执行可运行任意命令。改动即时保存，对所有 Agent
									的后续工具调用生效；已弹出的请求仍需处理。
								</small>
								<span className="settings-status">{permissionSaving ? "保存中" : "已保存"}</span>
							</div>
						</section>
						<section className="settings-card" hidden={settingsSection !== "search"}>
							<div>
								<h2>Tavily Search</h2>
								<p>API Key 使用 Electron safeStorage 加密保存在本机，不会写入项目或日志。</p>
							</div>
							<div className="settings-status">
								{settingsStatus?.tavilyApiKeyConfigured ? "已配置" : "未配置"}
							</div>
							<div className="settings-secret-field">
								<input
									type={tavilyKeyRevealed ? "text" : "password"}
									value={tavilyApiKey}
									onChange={(event) => setTavilyApiKey(event.target.value)}
									placeholder={settingsStatus?.tavilyApiKeyConfigured ? "••••••••••••••••" : "tvly-…"}
								/>
								<button
									className="settings-secret-toggle"
									type="button"
									aria-label={tavilyKeyRevealed ? "隐藏 Tavily API Key" : "显示 Tavily API Key"}
									title={tavilyKeyRevealed ? "隐藏 Key" : "显示 Key"}
									disabled={!settingsStatus?.tavilyApiKeyConfigured && !tavilyApiKey}
									onClick={() => void toggleTavilyKeyReveal()}
								>
									{tavilyKeyRevealed ? (
										<EyeOff size={14} strokeWidth={2} />
									) : (
										<Eye size={14} strokeWidth={2} />
									)}
								</button>
							</div>
							<div className="settings-actions">
								<button
									className="primary-button"
									type="button"
									onClick={() => void saveTavilyKey()}
									disabled={!tavilyApiKey.trim()}
								>
									保存
								</button>
								<button
									className="secondary-button"
									type="button"
									onClick={() => void clearTavilyKey()}
									disabled={!settingsStatus?.tavilyApiKeyConfigured}
								>
									清除
								</button>
							</div>
							<small>修改后，新启动或重新启动的 Agent 才会使用新 Key。</small>
						</section>

						<section className="settings-card" hidden={settingsSection !== "shell"}>
							<div>
								<h2>Shell</h2>
								<p>
									Agent 的 <code>bash</code> 工具需要一个 bash 可执行文件。留空则自动探测（Program Files 下的
									Git Bash、PATH 上的 bash.exe）；Git for Windows 装在非标准目录时填这里，否则工具会报 “No bash
									shell found”。
								</p>
							</div>
							<div className="settings-status">{settingsStatus?.shellPath ? "已配置" : "自动探测"}</div>
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
						</section>

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
													<label
														className={`role-skill-option ${checked ? "selected" : ""}`}
														key={skill.id}
													>
														<input
															type="checkbox"
															checked={checked}
															disabled={roleSkillSaving !== null}
															onChange={(event) =>
																void toggleRoleSkill(role, skill.id, event.target.checked)
															}
														/>
														<span>
															<strong>{skill.name}</strong>
															<small>{skill.description || skill.filePath}</small>
														</span>
														<em>{skill.source}</em>
													</label>
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

						<div className="settings-section-slot" hidden={settingsSection !== "providers"}>
							<ProviderSettings
								refreshToken={providerSettingsRefreshToken}
								onOpenAuth={(mode, providerId) => void openAuthDialog(mode, providerId)}
							/>
						</div>
						<div className="settings-section-slot" hidden={settingsSection !== "mcp"}>
							<McpSettings projectRoot={project?.rootPath ?? null} activeAgent={activeAgentLocator} />
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
			const forkEntryIds = buildTurnForkEntryMap(items, sessionSnapshot);
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
							<TranscriptMinimap
								items={items}
								activeIndex={activeTranscriptIndex}
								onJump={jumpToTranscriptItem}
								scrollRef={transcriptRef}
							/>
							<div className="conversation-column">
								<div className="transcript" ref={transcriptRef} onScroll={handleTranscriptScroll}>
									{items.length === 0 ? (
										<div className="transcript-placeholder compact">
											<div className="state-mark state-mark-conversation">
												<AppIcon name="message-question" size={18} />
											</div>
											<h2>{slot.displayName}</h2>
											<p>发送一条消息开始工作。Agent 会检查当前工作目录中实际存在的材料。</p>
											{slot.kickoffPrompt ? (
												<button
													className="quick-start-button"
													type="button"
													onClick={() =>
														setDrafts((current) => ({ ...current, [agentId]: slot.kickoffPrompt! }))
													}
												>
													使用默认交接提示
												</button>
											) : null}
										</div>
									) : (
										<TranscriptTurns
											items={items}
											assistantModel={modelSelections[agentId]?.model.name}
											idPrefix={agentId}
											running={Boolean(activity)}
											collapsedRounds={collapsedRounds}
											onToggleRound={(id, collapsed) =>
												setCollapsedRounds((current) => ({ ...current, [id]: collapsed }))
											}
											forkEntryIds={forkEntryIds}
											forkingEntryId={forkingEntryId}
											onFork={(entryId) =>
												void forkAgentSession(entryId, {
													agentInstanceId: agentId,
													projectId: project.id,
													workItemId: selectedWorkItem.id,
													role: slot.role,
												})
											}
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
								<div className="composer-shell">
									{showJumpToLatest ? (
										<button className="jump-to-latest" type="button" onClick={jumpToLatest}>
											{activeAgentId && (unreadCounts[activeAgentId] ?? 0) > 0
												? `${unreadCounts[activeAgentId]} 条新消息`
												: "跳到最新消息"}
											<AppIcon name="arrow-up" size={14} className="jump-arrow" />
										</button>
									) : null}
									<form
										className="composer composer-stacked"
										onDragOver={(event) => {
											if (event.dataTransfer.types.includes("Files")) event.preventDefault();
										}}
										onDrop={(event) => {
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
																const providers = [...new Set(filtered.map((model) => model.provider))];
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
																			{providers.map((provider) => (
																				<section key={provider}>
																					<h3>{provider}</h3>
																					{filtered
																						.map((model, index) => ({ model, index }))
																						.filter((entry) => entry.model.provider === provider)
																						.map(({ model, index }) => (
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
																								key={provider + model.id}
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
																						))}
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
													onClick={() => void openSessionPanel(slot)}
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
									workItemId={selectedWorkItem.id}
									agentRole={selection.role}
									turnId={latestTurn?.id ?? "turn-0"}
									turnStartedAt={latestTurn?.startedAt}
									toolItems={latestTurnToolItems}
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
		<div className={`app-shell${useWindowOverlay ? " windows-overlay" : ""}`}>
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
			<main className="main-pane">
				{error ? (
					<div className="error-banner" role="alert">
						<AppIcon name="warning" size={15} />
						<span>{error}</span>
						<button type="button" aria-label="关闭错误提示" onClick={() => setError(null)}>
							<AppIcon name="close" />
						</button>
					</div>
				) : null}
				{renderMainContent()}
			</main>
			<SettingsToastHost />
			{sessionPanel ? (
				<div className="modal-backdrop" role="presentation">
					<button
						className="modal-backdrop-dismiss"
						type="button"
						aria-label="关闭会话树"
						onClick={() => setSessionPanel(null)}
					/>
					<div className="modal session-tree-modal" role="dialog" aria-modal="true" aria-label="Agent 会话树">
						<div className="session-tree-heading">
							<div>
								<h2>{sessionPanel.displayName} 会话树</h2>
								<p>点用户消息右侧的 Fork 从此处创建分支；原消息会填回输入框，原会话不会被修改。</p>
							</div>
							<IconButton label="关闭会话树" onClick={() => setSessionPanel(null)}>
								<AppIcon name="close" />
							</IconButton>
						</div>
						<div className="session-picker">
							<div className="session-picker-heading">
								<strong>会话</strong>
								<button
									className="secondary-button"
									type="button"
									disabled={sessionPanelLoading}
									onClick={() => void createAgentSession()}
								>
									<AppIcon name="plus" size={13} /> 新建会话
								</button>
							</div>
							<div className="session-picker-list">
								{sessionPanel.sessions.map((session) => (
									<div
										key={session.sessionId}
										className={`session-picker-item${session.isCurrent ? " active" : ""}`}
									>
										<button
											type="button"
											className="session-picker-main"
											disabled={sessionPanelLoading}
											onClick={() => void switchAgentSession(session.sessionId)}
										>
											<span className="session-picker-copy">
												<strong>{session.name || session.preview || "新会话"}</strong>
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
												disabled={sessionPanelLoading}
												onClick={() => void deleteAgentSession(session.sessionId)}
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
													{node.timestamp ? (
														<time>{new Date(node.timestamp).toLocaleString()}</time>
													) : null}
												</div>
												<p>{node.text || node.type}</p>
											</div>
											{node.forkable ? (
												<button
													className="session-fork-button"
													type="button"
													disabled={sessionPanelLoading}
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
							<code>{sessionPanel.snapshot.sessionName || sessionPanel.snapshot.sessionId}</code>
							<button className="secondary-button" type="button" onClick={() => setSessionPanel(null)}>
								关闭
							</button>
						</div>
					</div>
				</div>
			) : null}
			{writeLeaseDialog?.lease ? (
				<div className="modal-backdrop" role="presentation">
					<button
						className="modal-backdrop-dismiss"
						type="button"
						aria-label="取消清理写锁"
						onClick={() => setWriteLeaseDialog(null)}
					/>
					<div className="modal danger-modal" role="dialog" aria-modal="true" aria-label="清理失效写锁">
						<h2>发现失效的项目写锁</h2>
						<p>
							{writeLeaseDialog.lease.workItemId} / {writeLeaseDialog.lease.role} Agent
							持有的写锁对应进程已经不存在。 清理后可以重新发送当前消息。
						</p>
						<div className="lease-details">
							<span>Agent：{writeLeaseDialog.lease.holderAgentInstanceId}</span>
							<span>最后心跳：{new Date(writeLeaseDialog.lease.heartbeatAt).toLocaleString()}</span>
						</div>
						<div className="modal-actions">
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
						</div>
					</div>
				</div>
			) : null}
			{resetAgentDialog ? (
				<div className="modal-backdrop" role="presentation">
					<button
						className="modal-backdrop-dismiss"
						type="button"
						aria-label="取消重置 Agent"
						onClick={() => setResetAgentDialog(null)}
					/>
					<div className="modal danger-modal" role="dialog" aria-modal="true" aria-label="重置 Agent">
						<h2>重置 {resetAgentDialog.slot.displayName}？</h2>
						<p>
							当前会话会归档到本地运行目录，然后为这个 Slot 创建一个全新的 Agent Instance。项目文件不会被删除。
						</p>
						<div className="modal-actions">
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
						</div>
					</div>
				</div>
			) : null}
			{renameDialog ? (
				<div className="modal-backdrop" role="presentation">
					<button
						className="modal-backdrop-dismiss"
						type="button"
						aria-label="取消重命名"
						onClick={() => setRenameDialog(null)}
					/>
					<form
						className="modal"
						onSubmit={(event) => {
							event.preventDefault();
							void renameSelectedWorkItem();
						}}
					>
						<h2>重命名工作项</h2>
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
				</div>
			) : null}
			{deleteDialog ? (
				<div className="modal-backdrop" role="presentation">
					<button
						className="modal-backdrop-dismiss"
						type="button"
						aria-label="取消永久删除"
						onClick={() => setDeleteDialog(null)}
					/>
					<div className="modal danger-modal" role="dialog" aria-modal="true" aria-label="永久删除工作项">
						<h2>永久删除工作项？</h2>
						<p>
							将删除“{deleteDialog.item.id}：{deleteDialog.item.title}”的项目文件、Agent 会话和本地运行记录。
							此操作无法撤销。
						</p>
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
					</div>
				</div>
			) : null}
			{dialog ? (
				<div className="modal-backdrop" role="presentation">
					<button
						className="modal-backdrop-dismiss"
						type="button"
						aria-label="取消创建工作项"
						onClick={() => setDialog(null)}
					/>
					<form
						className="modal"
						onSubmit={(event) => {
							event.preventDefault();
							void createWorkItem();
						}}
					>
						<h2>{dialog.lane === "requirements" ? "新建需求" : "新建修漏洞"}</h2>
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
				</div>
			) : null}
			{extensionDialog ? (
				<div className="modal-backdrop" role="presentation">
					<div className="modal permission-modal" role="dialog" aria-modal="true" aria-label="权限请求">
						<h2>权限请求</h2>
						<pre className="permission-message">
							{extensionDialog.title}
							{extensionDialog.message ? `\n\n${extensionDialog.message}` : ""}
						</pre>
						<button
							className="permission-defer"
							type="button"
							onClick={() => {
								setDeferredPermissionAgentId(extensionDialog.agentInstanceId);
								setExtensionDialog(null);
							}}
						>
							稍后处理
						</button>
						{extensionDialog.method === "select" ? (
							<div className="permission-options">
								{extensionDialog.options.map((option) => (
									<button
										className={permissionChoicePresentation(option).className}
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
					</div>
				</div>
			) : null}
			{authDialogMode ? (
				<div className="modal-backdrop" role="presentation">
					<button
						className="modal-backdrop-dismiss"
						type="button"
						aria-label="关闭 Provider 登录"
						onClick={closeAuthDialog}
					/>
					<div className="modal auth-modal" role="dialog" aria-modal="true" aria-label="Provider 登录">
						<div className="session-tree-heading">
							<div>
								<h2>{authDialogMode === "login" ? "Provider 登录" : "退出 Provider"}</h2>
								<p>
									{authDialogMode === "login"
										? "使用 Pi 原生登录流程配置订阅或 API Key，凭据写入 ~/.pi/agent/auth.json。"
										: "移除 Pi 已保存的 Provider 凭据；环境变量和 models.json 中的 Key 不受影响。"}
								</p>
							</div>
							<IconButton label="关闭" onClick={closeAuthDialog}>
								<AppIcon name="close" />
							</IconButton>
						</div>
						<div className="auth-form">
							<div className="settings-field">
								<span>Provider</span>
								<SelectMenu
									label="Provider"
									value={authProviderId ?? ""}
									disabled={authBusy || authRequestId !== null}
									placeholder={authBusy ? "正在读取 Provider…" : "没有可用 Provider"}
									options={authProviders.map((provider) => ({
										value: provider.id,
										label: provider.name,
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
							{authError ? (
								<p className="permission-settings-error" role="alert">
									{authError}
								</p>
							) : null}
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
					</div>
				</div>
			) : null}
			{archiveToast ? (
				<output className="toast" aria-live="polite">
					“{archiveToast.title}”已归档
					<button type="button" onClick={() => void restoreArchived()}>
						撤销
					</button>
				</output>
			) : null}
			{sessionNotice ? (
				<output className="toast" aria-live="polite">
					{sessionNotice}
				</output>
			) : null}
		</div>
	);
}
