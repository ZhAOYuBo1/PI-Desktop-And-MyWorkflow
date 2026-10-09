import { ChevronRight, FileDiff, Files, FileText, type LucideIcon, SquareTerminal } from "lucide-react";
import {
	lazy,
	memo,
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
	Suspense,
	useCallback,
	useEffect,
	useId,
	useMemo,
	useState,
} from "react";
import { PanelIconButton } from "./panel-icon-button.tsx";
import { StateBlock } from "./state-block.tsx";
import { WorkspaceFilesView } from "./WorkspaceFilesView.tsx";
import {
	extractPanelPath,
	inferPanelPathFromText,
	type PanelDiffLine,
	type ProjectableToolItem,
	panelDiffLines,
	projectToolToPanel,
	summarizePanelDiff,
	type WorkPanelEntry,
} from "./work-panel.ts";

const PANEL_MIN_WIDTH = 280;
const PANEL_MAX_WIDTH = 720;
const PANEL_DEFAULT_WIDTH = 480;
const DIFF_LINE_LIMIT = 800;
const CHANGE_HISTORY_LIMIT = 80;
const CHANGE_BODY_LIMIT = 160_000;

const TerminalPane = lazy(() => import("./terminal-pane.tsx").then((module) => ({ default: module.TerminalPane })));

type WorkPanelTab = "files" | "changes" | "terminal";

function clampWidth(value: number): number {
	return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, Math.round(value)));
}

function loadPanelWidth(): number {
	try {
		const stored = Number(window.localStorage.getItem("codepiddy.work-panel.width"));
		if (Number.isFinite(stored) && stored > 0) return clampWidth(stored);
	} catch {}
	return PANEL_DEFAULT_WIDTH;
}

function basename(path: string): string {
	return path.split("/").filter(Boolean).at(-1) ?? path;
}

function projectRelativePath(path: string, projectRoot: string): string {
	const normalizedPath = path.replace(/\\/g, "/");
	const normalizedRoot = projectRoot.replace(/\\/g, "/").replace(/\/+$/, "");
	return normalizedPath.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)
		? normalizedPath.slice(normalizedRoot.length + 1)
		: normalizedPath;
}

function workItemChangeHistoryStorageKey(projectRoot: string, workItemId: string, agentRole: string): string {
	return `codepiddy.work-panel.changes.${projectRoot.replace(/\\/g, "/").toLowerCase()}.${workItemId}.${agentRole}`;
}

function changeHistoryStorageKey(projectRoot: string, workItemId: string, agentRole: string, turnId: string): string {
	return `${workItemChangeHistoryStorageKey(projectRoot, workItemId, agentRole)}.${turnId}`;
}

function isPersistedChangeEntry(value: unknown): value is WorkPanelEntry {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const entry = value as Record<string, unknown>;
	return (
		typeof entry.id === "string" &&
		typeof entry.toolName === "string" &&
		typeof entry.title === "string" &&
		(entry.path === null || typeof entry.path === "string") &&
		typeof entry.timestamp === "number" &&
		(entry.view === "file" || entry.view === "terminal" || entry.view === "review") &&
		typeof entry.renderName === "string" &&
		typeof entry.body === "string" &&
		typeof entry.isError === "boolean" &&
		typeof entry.running === "boolean"
	);
}

function loadPersistedChangeEntries(
	projectRoot: string,
	workItemId: string,
	agentRole: string,
	turnId: string,
	turnStartedAt: string | undefined,
): WorkPanelEntry[] {
	try {
		const raw = window.localStorage.getItem(changeHistoryStorageKey(projectRoot, workItemId, agentRole, turnId));
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		const turnStart = turnStartedAt ? Date.parse(turnStartedAt) : Number.NaN;
		const entries = parsed
			.filter(isPersistedChangeEntry)
			.map((entry) => ({
				...entry,
				path: entry.path ?? inferPanelPathFromText(entry.body),
				running: false,
			}))
			.filter((entry): entry is WorkPanelEntry & { path: string } => entry.path !== null);
		return Number.isFinite(turnStart) ? entries.filter((entry) => entry.timestamp >= turnStart) : entries;
	} catch {
		return [];
	}
}

function loadLegacyChangeEntries(
	projectRoot: string,
	workItemId: string,
	agentRole: string,
	turnStartedAt: string | undefined,
): WorkPanelEntry[] {
	try {
		const raw =
			window.localStorage.getItem(workItemChangeHistoryStorageKey(projectRoot, workItemId, agentRole)) ??
			window.localStorage.getItem(
				`codepiddy.work-panel.changes.${projectRoot.replace(/\\/g, "/").toLowerCase()}.${workItemId}`,
			);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		const turnStart = turnStartedAt ? Date.parse(turnStartedAt) : Number.NaN;
		return parsed
			.filter(isPersistedChangeEntry)
			.map((entry) => ({ ...entry, path: entry.path ?? inferPanelPathFromText(entry.body), running: false }))
			.filter((entry): entry is WorkPanelEntry & { path: string } => entry.path !== null)
			.filter((entry) => !Number.isFinite(turnStart) || entry.timestamp >= turnStart);
	} catch {
		return [];
	}
}

function persistChangeEntries(
	projectRoot: string,
	workItemId: string,
	agentRole: string,
	turnId: string,
	entries: WorkPanelEntry[],
): void {
	try {
		const compact = entries
			.filter((entry) => !entry.running && entry.view !== "terminal" && entry.path !== null)
			.slice(-CHANGE_HISTORY_LIMIT)
			.map((entry) => ({ ...entry, running: false, body: entry.body.slice(0, CHANGE_BODY_LIMIT) }));
		window.localStorage.setItem(
			changeHistoryStorageKey(projectRoot, workItemId, agentRole, turnId),
			JSON.stringify(compact),
		);
	} catch {}
}

function mergeChangeEntries(live: WorkPanelEntry[], persisted: WorkPanelEntry[]): WorkPanelEntry[] {
	const merged = new Map<string, WorkPanelEntry>();
	for (const entry of persisted) merged.set(entry.id, entry);
	for (const entry of live) merged.set(entry.id, entry);
	return [...merged.values()].sort((left, right) => left.timestamp - right.timestamp).slice(-CHANGE_HISTORY_LIMIT);
}

function WorkPanelEmpty({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
	return (
		<div className="work-panel-empty">
			<div className="state-mark">
				<Icon size={18} strokeWidth={2} aria-hidden="true" />
			</div>
			<strong>{title}</strong>
			<p>{description}</p>
		</div>
	);
}

interface ChangeFileGroup {
	key: string;
	path: string | null;
	displayPath: string;
	name: string;
	entries: WorkPanelEntry[];
}

interface NumberedDiffLine extends PanelDiffLine {
	lineNumber: number | null;
}

function buildChangeFileGroups(entries: WorkPanelEntry[], projectRoot: string): ChangeFileGroup[] {
	const groups = new Map<string, ChangeFileGroup>();
	for (const entry of entries) {
		const key = entry.path ?? `unknown:${entry.id}`;
		const existing = groups.get(key);
		if (existing) {
			existing.entries.push(entry);
			continue;
		}
		const path = entry.path;
		groups.set(key, {
			key,
			path,
			displayPath: path ? projectRelativePath(path, projectRoot) : "历史记录未保存文件路径",
			name: path ? basename(projectRelativePath(path, projectRoot)) : "文件变更",
			entries: [entry],
		});
	}
	return [...groups.values()];
}

function numberedDiffLines(lines: PanelDiffLine[]): NumberedDiffLine[] {
	let oldLine = 0;
	let newLine = 0;
	return lines.map((line) => {
		if (line.type === "hunk") {
			const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line.text);
			if (match) {
				oldLine = Number.parseInt(match[1]!, 10);
				newLine = Number.parseInt(match[2]!, 10);
			}
			return { ...line, lineNumber: null };
		}
		if (line.type === "add") {
			newLine += 1;
			return { ...line, lineNumber: newLine };
		}
		if (line.type === "remove") {
			oldLine += 1;
			return { ...line, lineNumber: oldLine };
		}
		oldLine += 1;
		newLine += 1;
		return { ...line, lineNumber: newLine };
	});
}

function diffLineClass(type: PanelDiffLine["type"]): string {
	if (type === "add") return "diff-line add";
	if (type === "remove") return "diff-line remove";
	if (type === "hunk") return "diff-line hunk";
	return "diff-line context";
}

const ChangeStackCard = memo(function ChangeStackCard({
	group,
	onOpenFile,
}: {
	group: ChangeFileGroup;
	onOpenFile(path: string): void;
}) {
	const [open, setOpen] = useState(false);
	const detailsId = useId();
	const lines = useMemo(() => numberedDiffLines(group.entries.flatMap((entry) => panelDiffLines(entry))), [group]);
	const summary = useMemo(() => summarizePanelDiff(lines), [lines]);
	const visibleLines = lines.slice(0, DIFF_LINE_LIMIT);
	const path = group.path;

	return (
		<section className={`change-stack-card${open ? " is-open" : ""}`}>
			<div className="change-stack-header">
				<button
					type="button"
					className="change-stack-toggle"
					aria-expanded={open}
					aria-controls={detailsId}
					title={group.displayPath}
					onClick={() => setOpen((current) => !current)}
				>
					<span className="change-stack-caret" aria-hidden="true">
						<ChevronRight size={13} strokeWidth={2} />
					</span>
					<FileText size={14} strokeWidth={2} aria-hidden="true" />
					<span className="change-stack-copy">
						<strong>{group.name}</strong>
						<small>{group.displayPath}</small>
					</span>
					<span className="diff-counts">
						{summary.additions > 0 ? <span className="diff-count-add">+{summary.additions}</span> : null}
						{summary.deletions > 0 ? <span className="diff-count-del">−{summary.deletions}</span> : null}
					</span>
				</button>
				{path ? (
					<PanelIconButton label="在文件中打开" onClick={() => onOpenFile(path)}>
						<FileText size={14} strokeWidth={2} />
					</PanelIconButton>
				) : null}
			</div>
			{open ? (
				<div className="change-stack-body" id={detailsId}>
					{visibleLines.length > 0 ? (
						<div className="diff-view">
							{visibleLines.map((line, index) => (
								<div className={diffLineClass(line.type)} key={`${line.type}-${index}`}>
									<span className="diff-line-number" aria-hidden="true">
										{line.lineNumber ?? ""}
									</span>
									<span className="diff-line-sign" aria-hidden="true">
										{line.type === "add"
											? "+"
											: line.type === "remove"
												? "−"
												: line.type === "hunk"
													? ""
													: " "}
									</span>
									<span className="diff-line-text">{line.text || " "}</span>
								</div>
							))}
						</div>
					) : (
						<p className="work-change-note">没有可展示的行级差异。</p>
					)}
					{lines.length > visibleLines.length ? (
						<p className="work-change-note">仅显示前 {DIFF_LINE_LIMIT} 行差异。</p>
					) : null}
				</div>
			) : null}
		</section>
	);
});

const ChangeStack = memo(function ChangeStack({
	groups,
	onOpenFile,
}: {
	groups: ChangeFileGroup[];
	onOpenFile(path: string): void;
}) {
	return (
		<div className="change-stack">
			{groups.map((group) => (
				<ChangeStackCard key={group.key} group={group} onOpenFile={onOpenFile} />
			))}
		</div>
	);
});

export const WorkPanel = memo(function WorkPanel({
	projectRoot,
	projectId,
	workItemId,
	agentRole,
	turnId,
	turnStartedAt,
	toolItems,
	onInsertMention,
	requestedPath,
	onRequestedPathHandled,
}: {
	projectRoot: string;
	projectId: string;
	workItemId: string;
	agentRole: string;
	turnId: string;
	turnStartedAt?: string;
	toolItems: ProjectableToolItem[];
	onInsertMention(path: string): void;
	/** 外部（消息里的文件 chip）发来的打开请求。 */
	requestedPath?: { path: string; nonce: number } | null;
	/** 外部请求已交给文件视图后回调，宿主据此清掉请求，避免面板再次打开时重放。 */
	onRequestedPathHandled?(): void;
}) {
	const [width, setWidth] = useState(loadPanelWidth);
	const [activeView, setActiveView] = useState<WorkPanelTab>("files");
	const [fileOpenRequest, setFileOpenRequest] = useState<{ path: string; nonce: number } | null>(null);
	const [terminalMounted, setTerminalMounted] = useState(false);
	// 内部（更改视图）和外部（消息文件 chip）的请求取 nonce 更新的那个。
	const effectiveFileRequest = useMemo(() => {
		if (requestedPath && (!fileOpenRequest || requestedPath.nonce >= fileOpenRequest.nonce)) return requestedPath;
		return fileOpenRequest;
	}, [fileOpenRequest, requestedPath]);

	useEffect(() => {
		if (!requestedPath) return;
		setActiveView("files");
		onRequestedPathHandled?.();
	}, [requestedPath, onRequestedPathHandled]);
	const historyKey = changeHistoryStorageKey(projectRoot, workItemId, agentRole, turnId);
	const [changeHistory, setChangeHistory] = useState<{ key: string; entries: WorkPanelEntry[] }>(() => ({
		key: historyKey,
		entries: loadPersistedChangeEntries(projectRoot, workItemId, agentRole, turnId, turnStartedAt),
	}));
	const projectedEntries = useMemo(
		() => toolItems.map(projectToolToPanel).filter((entry): entry is WorkPanelEntry => entry !== null),
		[toolItems],
	);
	const liveChangeEntries = useMemo(
		() => projectedEntries.filter((entry) => entry.view === "review" || entry.toolName.toLowerCase() === "write"),
		[projectedEntries],
	);
	const persistedHistory = changeHistory.key === historyKey ? changeHistory.entries : [];
	const legacyHistory = useMemo(
		() =>
			persistedHistory.length === 0 && liveChangeEntries.length === 0
				? loadLegacyChangeEntries(projectRoot, workItemId, agentRole, turnStartedAt)
				: [],
		[agentRole, liveChangeEntries.length, persistedHistory.length, projectRoot, turnStartedAt, workItemId],
	);
	const persistedChangeEntries = persistedHistory.length > 0 ? persistedHistory : legacyHistory;
	const changeEntries = useMemo(
		() => mergeChangeEntries(liveChangeEntries, persistedChangeEntries),
		[liveChangeEntries, persistedChangeEntries],
	);
	const changeGroups = useMemo(() => buildChangeFileGroups(changeEntries, projectRoot), [changeEntries, projectRoot]);
	const changeSummary = useMemo(
		() => summarizePanelDiff(changeEntries.flatMap((entry) => panelDiffLines(entry))),
		[changeEntries],
	);

	useEffect(() => {
		setChangeHistory({
			key: historyKey,
			entries: loadPersistedChangeEntries(projectRoot, workItemId, agentRole, turnId, turnStartedAt),
		});
	}, [agentRole, historyKey, projectRoot, turnId, turnStartedAt, workItemId]);

	useEffect(() => {
		if (!("codepiddy" in window) || changeHistory.key !== historyKey) return;
		persistChangeEntries(projectRoot, workItemId, agentRole, turnId, changeEntries);
	}, [agentRole, changeEntries, changeHistory.key, historyKey, projectRoot, turnId, workItemId]);

	// 跟随：最近一条成功的文件工具决定自动打开的路径。
	const followPath = useMemo(() => {
		for (let index = toolItems.length - 1; index >= 0; index -= 1) {
			const item = toolItems[index]!;
			if (item.status !== "completed" || item.isError) continue;
			const path = extractPanelPath(item.name, item.args);
			if (path) return path;
		}
		return null;
	}, [toolItems]);

	const startResize = useCallback(
		(event: ReactMouseEvent) => {
			event.preventDefault();
			const startX = event.clientX;
			const startWidth = width;
			let latest = startWidth;
			const onMove = (move: MouseEvent): void => {
				latest = clampWidth(startWidth + startX - move.clientX);
				setWidth(latest);
			};
			const onUp = (): void => {
				window.removeEventListener("mousemove", onMove);
				window.removeEventListener("mouseup", onUp);
				try {
					window.localStorage.setItem("codepiddy.work-panel.width", String(latest));
				} catch {}
			};
			window.addEventListener("mousemove", onMove);
			window.addEventListener("mouseup", onUp);
		},
		[width],
	);

	function openFile(path: string): void {
		setActiveView("files");
		setFileOpenRequest({ path, nonce: Date.now() });
	}

	const renderFilesView = (): ReactNode => (
		<div className="work-panel-view file-browser">
			<WorkspaceFilesView
				projectRoot={projectRoot}
				projectId={projectId}
				followPath={followPath}
				requestedPath={effectiveFileRequest}
				onInsertMention={onInsertMention}
			/>
		</div>
	);

	const renderChangesView = (): ReactNode => {
		if (changeGroups.length === 0) {
			return (
				<WorkPanelEmpty
					icon={FileDiff}
					title="本轮还没有文件更改"
					description="Agent 执行 edit 或 write 后，文件差异会显示在这里。"
				/>
			);
		}
		return (
			<div className="work-panel-view change-view">
				<div className="work-panel-summary">
					<span>{changeGroups.length} 个文件</span>
					<span className="diff-counts">
						{changeSummary.additions > 0 ? (
							<span className="diff-count-add">+{changeSummary.additions}</span>
						) : null}
						{changeSummary.deletions > 0 ? (
							<span className="diff-count-del">−{changeSummary.deletions}</span>
						) : null}
					</span>
				</div>
				<ChangeStack
					key={`${projectRoot}:${workItemId}:${agentRole}:${turnId}`}
					groups={changeGroups}
					onOpenFile={openFile}
				/>
			</div>
		);
	};

	const renderTerminalView = (): ReactNode => (
		<Suspense fallback={<StateBlock tone="loading" title="正在加载终端…" />}>
			<TerminalPane projectRoot={projectRoot} />
		</Suspense>
	);

	const tabItems = [
		{ id: "files" as const, label: "文件", icon: Files, count: null },
		{ id: "changes" as const, label: "更改", icon: FileDiff, count: changeGroups.length },
		{ id: "terminal" as const, label: "终端", icon: SquareTerminal, count: null },
	];

	return (
		<aside className="work-panel" aria-label="工作区面板" style={{ width }}>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: 纯鼠标拖拽手柄，键盘调整宽度属于后续独立功能 */}
			<div className="work-panel-resize" onMouseDown={startResize} title="拖拽调整宽度" />
			<header className="work-panel-headbar">
				<div className="work-panel-tabs" role="tablist" aria-label="工作区视图">
					{tabItems.map((tab) => {
						const Icon = tab.icon;
						const selected = activeView === tab.id;
						return (
							<button
								key={tab.id}
								type="button"
								role="tab"
								id={`work-panel-tab-${tab.id}`}
								aria-selected={selected}
								aria-controls={`work-panel-surface-${tab.id}`}
								className={`work-panel-tab${selected ? " active" : ""}`}
								onClick={() => {
									setActiveView(tab.id);
									if (tab.id === "terminal") setTerminalMounted(true);
								}}
							>
								<Icon size={13} strokeWidth={2} aria-hidden="true" />
								<span>{tab.label}</span>
								{tab.count !== null && tab.count > 0 ? (
									<span className="work-panel-tab-count">{tab.count}</span>
								) : null}
							</button>
						);
					})}
				</div>
				<div className="work-panel-actions" />
			</header>
			<div
				className="work-panel-body"
				id={`work-panel-surface-${activeView}`}
				role="tabpanel"
				aria-labelledby={`work-panel-tab-${activeView}`}
			>
				{activeView === "files" ? renderFilesView() : activeView === "changes" ? renderChangesView() : null}
				{terminalMounted ? (
					<div className={`work-panel-view terminal-view${activeView === "terminal" ? "" : " is-hidden"}`}>
						{renderTerminalView()}
					</div>
				) : null}
			</div>
		</aside>
	);
});
