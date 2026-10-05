import type { WorkspaceDirEntry, WorkspaceFileContent } from "@codepiddy/shared";
import {
	Check,
	ChevronLeft,
	ChevronRight,
	Copy,
	FileDiff,
	FileQuestion,
	Files,
	FileText,
	Folder,
	LocateFixed,
	type LucideIcon,
	RefreshCw,
	Search,
	SquareTerminal,
	WrapText,
} from "lucide-react";
import {
	type CSSProperties,
	lazy,
	memo,
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
	Suspense,
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { MessageContent } from "./message-content.tsx";
import { PanelIconButton } from "./panel-icon-button.tsx";
import { StateBlock } from "./state-block.tsx";
import {
	extractPanelPath,
	formatPanelSize,
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

function isMarkdownPath(path: string): boolean {
	return /\.(?:md|markdown)$/i.test(path);
}

function basename(path: string): string {
	return path.split("/").filter(Boolean).at(-1) ?? path;
}

function dirname(path: string): string {
	const parts = path.split("/").filter(Boolean);
	parts.pop();
	return parts.join("/");
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

function PanelGlyph({ kind }: { kind: "dir" | "file" }) {
	const Icon = kind === "dir" ? Folder : FileText;
	return <Icon className="file-tree-icon" size={14} strokeWidth={2} aria-hidden="true" />;
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

interface DirState {
	entries: WorkspaceDirEntry[];
	error?: boolean;
}

type FileState = { status: "loading" } | { status: "ready"; content: WorkspaceFileContent } | { status: "error" };

export const WorkPanel = memo(function WorkPanel({
	projectRoot,
	workItemId,
	agentRole,
	turnId,
	turnStartedAt,
	toolItems,
}: {
	projectRoot: string;
	workItemId: string;
	agentRole: string;
	turnId: string;
	turnStartedAt?: string;
	toolItems: ProjectableToolItem[];
}) {
	const [width, setWidth] = useState(loadPanelWidth);
	const [activeView, setActiveView] = useState<WorkPanelTab>("files");
	const [dirs, setDirs] = useState<Record<string, DirState>>({});
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [query, setQuery] = useState("");
	const [searchResults, setSearchResults] = useState<string[] | null>(null);
	const [fileState, setFileState] = useState<FileState | null>(null);
	const [reloadSeq, setReloadSeq] = useState(0);
	const [wrapLines, setWrapLines] = useState(true);
	const [copiedViewer, setCopiedViewer] = useState(false);
	const [terminalMounted, setTerminalMounted] = useState(false);
	const historyKey = changeHistoryStorageKey(projectRoot, workItemId, agentRole, turnId);
	const [changeHistory, setChangeHistory] = useState<{ key: string; entries: WorkPanelEntry[] }>(() => ({
		key: historyKey,
		entries: loadPersistedChangeEntries(projectRoot, workItemId, agentRole, turnId, turnStartedAt),
	}));
	// null = 跟随最新工具产物；"" = 显式回到文件树。
	const [manualPath, setManualPath] = useState<string | null>(null);
	const loadedRef = useRef<Set<string>>(new Set());

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
	const activePath = manualPath === "" ? null : (manualPath ?? followPath);

	const loadDir = useCallback(
		async (relative: string) => {
			if (loadedRef.current.has(relative)) return;
			if (!("codepiddy" in window)) {
				setDirs((current) => ({ ...current, [relative]: { entries: [], error: true } }));
				return;
			}
			loadedRef.current.add(relative);
			try {
				const entries = await window.codepiddy.listWorkspaceDir(projectRoot, relative);
				setDirs((current) => ({ ...current, [relative]: { entries } }));
			} catch {
				loadedRef.current.delete(relative);
				setDirs((current) => ({ ...current, [relative]: { entries: [], error: true } }));
			}
		},
		[projectRoot],
	);

	// 工作区切换：重置全部浏览状态。
	useEffect(() => {
		loadedRef.current = new Set();
		setActiveView("files");
		setDirs({});
		setExpanded(new Set());
		setManualPath(null);
		setFileState(null);
		setQuery("");
		setSearchResults(null);
		setWrapLines(true);
		setCopiedViewer(false);
		setTerminalMounted(false);
		void loadDir("");
	}, [loadDir]);

	// 选中文件（含跟随打开）时展开祖先目录并读文件。
	// biome-ignore lint/correctness/useExhaustiveDependencies: reloadSeq 不参与读取，只作为「刷新」按钮的重跑信号
	useEffect(() => {
		if (!activePath) {
			setFileState(null);
			return;
		}
		const ancestors: string[] = [];
		const parts = activePath.split("/").slice(0, -1);
		let acc = "";
		for (const part of parts) {
			acc = acc ? `${acc}/${part}` : part;
			ancestors.push(acc);
		}
		setExpanded((current) => new Set([...current, ...ancestors]));
		for (const dir of ancestors) void loadDir(dir);
		if (!("codepiddy" in window)) {
			setFileState({ status: "error" });
			return;
		}
		let cancelled = false;
		setFileState({ status: "loading" });
		window.codepiddy
			.readWorkspaceFile(projectRoot, activePath)
			.then((content) => {
				if (!cancelled) setFileState({ status: "ready", content });
			})
			.catch(() => {
				if (!cancelled) setFileState({ status: "error" });
			});
		return () => {
			cancelled = true;
		};
	}, [activePath, projectRoot, loadDir, reloadSeq]);

	// 文件名搜索（复用既有 searchProjectFiles）。
	useEffect(() => {
		const keyword = query.trim();
		if (!keyword) {
			setSearchResults(null);
			return;
		}
		if (!("codepiddy" in window)) {
			setSearchResults([]);
			return;
		}
		const timer = window.setTimeout(() => {
			window.codepiddy
				.searchProjectFiles(projectRoot, keyword)
				.then(setSearchResults)
				.catch(() => setSearchResults([]));
		}, 200);
		return () => window.clearTimeout(timer);
	}, [query, projectRoot]);

	const toggleDir = useCallback(
		(relative: string) => {
			setExpanded((current) => {
				const next = new Set(current);
				if (next.has(relative)) next.delete(relative);
				else next.add(relative);
				return next;
			});
			void loadDir(relative);
		},
		[loadDir],
	);

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

	function refreshFiles(): void {
		const reopen = [...expanded, ""];
		loadedRef.current = new Set();
		setDirs({});
		setReloadSeq((seq) => seq + 1);
		for (const dir of reopen) void loadDir(dir);
	}

	function openFile(path: string): void {
		setActiveView("files");
		setManualPath(path);
	}

	async function copyViewerValue(): Promise<void> {
		const value =
			fileState?.status === "ready" && fileState.content.kind === "text" ? fileState.content.content : activePath;
		if (!value) return;
		try {
			await navigator.clipboard.writeText(value);
			setCopiedViewer(true);
			window.setTimeout(() => setCopiedViewer(false), 1400);
		} catch {}
	}

	const renderDir = (relative: string, depth: number): ReactNode => {
		const state = dirs[relative];
		if (!state) {
			return (
				<output
					className="file-tree-note is-loading"
					style={{ "--tree-depth": depth } as CSSProperties}
					key={`${relative}:loading`}
				>
					加载中…
				</output>
			);
		}
		if (state.entries.length === 0) {
			return (
				<div
					className={`file-tree-note ${state.error ? "is-error" : "is-empty"}`}
					style={{ "--tree-depth": depth } as CSSProperties}
					key={`${relative}:empty`}
					role={state.error ? "alert" : undefined}
				>
					{state.error ? "目录读取失败" : "空目录"}
				</div>
			);
		}
		return state.entries.map((entry) => {
			const child = relative ? `${relative}/${entry.name}` : entry.name;
			if (entry.kind === "dir") {
				const open = expanded.has(child);
				return (
					<div key={child}>
						<button
							type="button"
							className="file-tree-row"
							data-kind="dir"
							style={{ "--tree-depth": depth } as CSSProperties}
							onClick={() => toggleDir(child)}
						>
							<span className={`file-tree-caret${open ? " open" : ""}`} aria-hidden="true">
								<ChevronRight size={12} strokeWidth={2} />
							</span>
							<PanelGlyph kind="dir" />
							<span className="file-tree-name">{entry.name}</span>
						</button>
						{open ? renderDir(child, depth + 1) : null}
					</div>
				);
			}
			return (
				<button
					key={child}
					type="button"
					className={`file-tree-row${activePath === child ? " active" : ""}`}
					data-kind="file"
					style={{ "--tree-depth": depth } as CSSProperties}
					onClick={() => setManualPath(child)}
					title={child}
				>
					<PanelGlyph kind="file" />
					<span className="file-tree-name">{entry.name}</span>
					<span className="file-tree-size">{formatPanelSize(entry.size)}</span>
				</button>
			);
		});
	};

	const renderPreview = (): ReactNode => {
		if (!fileState || fileState.status === "loading") {
			return (
				<output className="file-viewer-state is-loading" aria-live="polite">
					<span className="sr-only">正在读取文件</span>
					<span className="file-viewer-skeleton" aria-hidden="true">
						<span />
						<span />
						<span />
						<span />
					</span>
				</output>
			);
		}
		if (fileState.status === "error")
			return (
				<StateBlock tone="error" title="文件读取失败">
					文件可能已被移动或删除，刷新目录树后重试。
				</StateBlock>
			);
		const { content } = fileState;
		if (content.kind === "image" && content.dataUrl)
			return (
				<div className="file-viewer-image">
					<img src={content.dataUrl} alt={activePath ?? ""} />
				</div>
			);
		if (content.kind === "text" && content.content !== undefined) {
			if (activePath && isMarkdownPath(activePath))
				return (
					<div className="file-viewer-markdown">
						<MessageContent text={content.content} />
					</div>
				);
			return (
				<div className={`file-lines${wrapLines ? " wrapped" : ""}`}>
					{content.content.split("\n").map((line, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: 文件视图的行身份就是行号，内容不会重排；按内容做 key 反而会因重复行/空行撞 key
						<div className="file-line" key={`line-${index}`}>
							<span className="file-line-no">{index + 1}</span>
							<span className="file-line-text">{line || " "}</span>
						</div>
					))}
				</div>
			);
		}
		return (
			<div className={`work-panel-empty ${content.kind === "tooLarge" ? "is-warning" : "is-muted"}`}>
				<div className="state-mark">
					<FileQuestion size={18} strokeWidth={2} aria-hidden="true" />
				</div>
				<strong>{content.kind === "tooLarge" ? "文件过大无法预览" : "二进制文件无法预览"}</strong>
				<p>
					{formatPanelSize(content.size)}
					{content.kind === "binary" ? " · docx/xlsx/pdf 等格式暂不支持打开" : ""}
				</p>
			</div>
		);
	};

	const renderFilesView = (): ReactNode => {
		if (activePath) {
			const textContent =
				fileState?.status === "ready" && fileState.content.kind === "text" ? fileState.content.content : null;
			return (
				<div className="work-panel-view file-browser">
					<div className="file-viewer">
						<div className="file-viewer-header">
							<PanelIconButton label="返回文件树" onClick={() => setManualPath("")}>
								<ChevronLeft size={15} strokeWidth={2} />
							</PanelIconButton>
							<span className="file-viewer-title">
								<strong title={activePath}>{basename(activePath)}</strong>
								<small title={activePath}>{dirname(activePath) || "."}</small>
							</span>
							<div className="file-viewer-actions">
								{textContent !== null ? (
									<PanelIconButton
										label={wrapLines ? "关闭自动换行" : "开启自动换行"}
										active={wrapLines}
										onClick={() => setWrapLines((current) => !current)}
									>
										<WrapText size={14} strokeWidth={2} />
									</PanelIconButton>
								) : null}
								<PanelIconButton
									label={textContent !== null ? "复制文件内容" : "复制文件路径"}
									onClick={() => void copyViewerValue()}
								>
									{copiedViewer ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={2} />}
								</PanelIconButton>
								{fileState?.status === "ready" ? (
									<span className="file-viewer-size">{formatPanelSize(fileState.content.size)}</span>
								) : null}
							</div>
						</div>
						<div className="file-viewer-body">{renderPreview()}</div>
					</div>
				</div>
			);
		}

		return (
			<div className="work-panel-view file-browser">
				<div className="work-panel-search">
					<Search size={14} strokeWidth={2} aria-hidden="true" />
					<input
						type="search"
						value={query}
						placeholder="按文件名搜索…"
						aria-label="按文件名搜索"
						onChange={(event) => setQuery(event.target.value)}
					/>
				</div>
				<div className="file-tree">
					{query.trim() && searchResults !== null ? (
						searchResults.length === 0 ? (
							<div className="file-tree-note">无匹配文件</div>
						) : (
							searchResults.map((rel) => (
								<button
									key={rel}
									type="button"
									className={`file-tree-row${activePath === rel ? " active" : ""}`}
									data-kind="file"
									style={{ "--tree-depth": 0 } as CSSProperties}
									onClick={() => setManualPath(rel)}
									title={rel}
								>
									<PanelGlyph kind="file" />
									<span className="file-tree-name">{rel}</span>
								</button>
							))
						)
					) : (
						renderDir("", 0)
					)}
				</div>
			</div>
		);
	};

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
				<div className="work-panel-actions">
					{activeView === "files" && manualPath !== null ? (
						<PanelIconButton label="跟随最新文件" onClick={() => setManualPath(null)}>
							<LocateFixed size={14} strokeWidth={2} />
						</PanelIconButton>
					) : null}
					{activeView === "files" ? (
						<PanelIconButton label="刷新文件树" onClick={refreshFiles}>
							<RefreshCw size={14} strokeWidth={2} />
						</PanelIconButton>
					) : null}
				</div>
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
