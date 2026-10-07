import { WORKSPACE_TRASH_DIR_NAME, type WorkspaceDirEntry, type WorkspaceFileContent } from "@codepiddy/shared";
import {
	ChevronRight,
	Copy,
	Eye,
	File,
	FileArchive,
	FileCode2,
	FileText,
	Folder,
	FolderOpen,
	Image,
	LocateFixed,
	Pencil,
	RefreshCw,
	Save,
	Search,
	Settings2,
	Undo2,
	WrapText,
	X,
} from "lucide-react";
import { type CSSProperties, memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { highlightFileCode } from "../file-syntax.ts";
import { WORKSPACE_FILES_DRAG_TYPE } from "../workspace-drag.ts";
import { MessageContent } from "./message-content.tsx";
import { ModalShell } from "./modal-shell.tsx";
import { PanelIconButton } from "./panel-icon-button.tsx";
import { PanelResizeHandle } from "./panel-resize-handle.tsx";
import { showSettingsToast } from "./settings-toast-store.ts";
import { StateBlock } from "./state-block.tsx";

const FILE_REFRESH_MS = 2500;
const FILE_SEARCH_DEBOUNCE_MS = 180;
const HIGHLIGHT_MAX_BYTES = 64 * 1024;
const TAB_DRAG_TYPE = "application/x-codepiddy-workspace-tab";
const MIN_TREE_WIDTH = 150;
const MIN_PREVIEW_WIDTH = 220;
const UNDO_LIMIT = 30;

type EntryKind = "file" | "dir";

interface DirState {
	entries: WorkspaceDirEntry[];
	loading?: boolean;
	error?: string;
}

interface FileTabState {
	status: "loading" | "ready" | "error";
	kind?: WorkspaceFileContent["kind"];
	content: string;
	draft: string;
	dataUrl?: string;
	size: number;
	mtimeMs: number;
	dirty: boolean;
	diskChanged: boolean;
	view: "rendered" | "source";
	error?: string;
}

interface ClipboardState {
	mode: "copy" | "cut";
	paths: string[];
}

type UndoEntry =
	| { kind: "copy"; label: string; from: string; to: string; parent: string }
	| { kind: "move"; label: string; from: string; to: string; parent: string }
	| { kind: "rename"; label: string; from: string; to: string; parent: string }
	| { kind: "create"; label: string; path: string; parent: string }
	| { kind: "delete"; label: string; path: string; trash: string; parent: string };

const undoStacks = new Map<string, UndoEntry[]>();

interface ContextMenuState {
	x: number;
	y: number;
	relativePath: string;
	kind: EntryKind | "blank";
}

type DialogState =
	| { type: "create-file"; parent: string; value: string }
	| { type: "create-dir"; parent: string; value: string }
	| { type: "rename"; relativePath: string; value: string }
	| { type: "delete"; paths: string[] }
	| {
			type: "overwrite";
			sourcePaths: string[];
			targetDir: string;
	  };

interface WorkspaceFilesViewProps {
	projectRoot: string;
	projectId: string;
	followPath: string | null;
	requestedPath: { path: string; nonce: number } | null;
	onInsertMention(path: string): void;
}

function normalizePath(value: string): string {
	return value
		.replace(/\\/g, "/")
		.replace(/^\.\/+/, "")
		.replace(/^\/+/, "");
}

function basename(value: string): string {
	const normalized = normalizePath(value).replace(/\/+$/, "");
	return normalized.split("/").filter(Boolean).at(-1) ?? normalized;
}

function dirname(value: string): string {
	const parts = normalizePath(value).split("/").filter(Boolean);
	parts.pop();
	return parts.join("/");
}

function joinPath(parent: string, name: string): string {
	const normalizedParent = normalizePath(parent).replace(/\/+$/, "");
	return normalizedParent ? `${normalizedParent}/${name}` : name;
}

function isMarkdownPath(value: string): boolean {
	return /\.(?:md|markdown)$/i.test(value);
}

function formatSize(size: number): string {
	if (!Number.isFinite(size) || size < 0) return "—";
	if (size < 1024) return `${size} B`;
	if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
	return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function storageKey(projectRoot: string, suffix: string): string {
	return `codepiddy.workspace.${suffix}.${projectRoot.replace(/\\/g, "/").toLowerCase()}`;
}

function loadStoredTabs(projectRoot: string): string[] {
	try {
		const raw = window.localStorage.getItem(storageKey(projectRoot, "tabs"));
		const parsed: unknown = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
	} catch {
		return [];
	}
}

function loadStoredExpanded(projectRoot: string): Set<string> {
	try {
		const raw = window.localStorage.getItem(storageKey(projectRoot, "expanded"));
		const parsed: unknown = raw ? JSON.parse(raw) : [];
		return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
	} catch {
		return new Set();
	}
}

function loadStoredTreeWidth(projectRoot: string): number | null {
	try {
		const raw = window.localStorage.getItem(storageKey(projectRoot, "tree-width"));
		const parsed = raw ? Number(raw) : Number.NaN;
		return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
	} catch {
		return null;
	}
}

function persistTabs(projectRoot: string, tabs: string[]): void {
	try {
		window.localStorage.setItem(storageKey(projectRoot, "tabs"), JSON.stringify(tabs));
	} catch {}
}

function persistExpanded(projectRoot: string, expanded: Set<string>): void {
	try {
		window.localStorage.setItem(storageKey(projectRoot, "expanded"), JSON.stringify([...expanded]));
	} catch {}
}

function persistTreeWidth(projectRoot: string, width: number | null): void {
	try {
		const key = storageKey(projectRoot, "tree-width");
		if (width === null) window.localStorage.removeItem(key);
		else window.localStorage.setItem(key, String(Math.round(width)));
	} catch {}
}

function pathIsInside(parent: string, candidate: string): boolean {
	const normalizedParent = normalizePath(parent).toLowerCase();
	const normalizedCandidate = normalizePath(candidate).toLowerCase();
	return normalizedCandidate === normalizedParent || normalizedCandidate.startsWith(`${normalizedParent}/`);
}

function mapWorkspacePath(value: string, from: string, to: string): string {
	if (value === from) return to;
	if (pathIsInside(from, value)) return `${to}${value.slice(from.length)}`;
	return value;
}

function pathDepth(value: string): number {
	return normalizePath(value).split("/").filter(Boolean).length;
}

function isMissingPathError(error: unknown): boolean {
	const code =
		typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
			? error.code
			: "";
	if (code === "ENOENT") return true;
	const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
	return message.includes("does not exist") || message.includes("not found") || message.includes("不存在");
}

function fileCategory(path: string): string {
	const extension = path.split(".").pop()?.toLowerCase() ?? "";
	if (["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "rs", "go", "java", "cs", "cpp", "c", "h"].includes(extension))
		return "code";
	if (["json", "jsonc", "yaml", "yml", "toml", "xml"].includes(extension)) return "config";
	if (["md", "mdx", "txt", "log"].includes(extension)) return "text";
	if (["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "svg"].includes(extension)) return "image";
	if (["zip", "tar", "gz", "7z", "rar"].includes(extension)) return "archive";
	return "file";
}

function WorkspaceFileIcon({ kind, path, open = false }: { kind: EntryKind; path: string; open?: boolean }) {
	if (kind === "dir") {
		const Icon = open ? FolderOpen : Folder;
		return <Icon className="workspace-file-icon is-dir" size={14} strokeWidth={2} aria-hidden="true" />;
	}
	const category = fileCategory(path);
	if (category === "code")
		return <FileCode2 className="workspace-file-icon is-code" size={14} strokeWidth={2} aria-hidden="true" />;
	if (category === "config")
		return <Settings2 className="workspace-file-icon is-config" size={14} strokeWidth={2} aria-hidden="true" />;
	if (category === "image")
		return <Image className="workspace-file-icon is-image" size={14} strokeWidth={2} aria-hidden="true" />;
	if (category === "archive")
		return <FileArchive className="workspace-file-icon is-archive" size={14} strokeWidth={2} aria-hidden="true" />;
	if (category === "text")
		return <FileText className="workspace-file-icon is-text" size={14} strokeWidth={2} aria-hidden="true" />;
	return <File className="workspace-file-icon" size={14} strokeWidth={2} aria-hidden="true" />;
}

function FileViewerSkeleton() {
	return (
		<output className="workspace-file-state is-loading" aria-live="polite">
			<span className="sr-only">正在读取文件</span>
			<span className="workspace-file-skeleton" aria-hidden="true">
				<span />
				<span />
				<span />
				<span />
			</span>
		</output>
	);
}

function WorkspaceTextEditor({
	path,
	value,
	wrapLines,
	onChange,
	onSave,
}: {
	path: string;
	value: string;
	wrapLines: boolean;
	onChange(value: string): void;
	onSave(): void;
}) {
	const lineNumbersRef = useRef<HTMLPreElement>(null);
	const highlightRef = useRef<HTMLPreElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const highlighted = useMemo(
		() => (value.length <= HIGHLIGHT_MAX_BYTES ? highlightFileCode(value, path) : null),
		[path, value],
	);
	const lineNumbers = useMemo(() => {
		const count = value.split("\n").length;
		return Array.from({ length: count }, (_, index) => index + 1).join("\n");
	}, [value]);

	return (
		<div className={`workspace-file-editor${wrapLines ? " wrapped" : ""}${highlighted ? " highlighted" : ""}`}>
			<pre ref={lineNumbersRef} className="workspace-file-line-numbers" aria-hidden="true">
				{lineNumbers}
			</pre>
			<div className="workspace-file-code">
				{highlighted ? (
					<pre ref={highlightRef} className="workspace-file-highlight" aria-hidden="true">
						{/* biome-ignore lint/security/noDangerouslySetInnerHtml: highlight.js escapes source text before emitting token markup */}
						<code dangerouslySetInnerHTML={{ __html: highlighted }} />
					</pre>
				) : null}
				<textarea
					ref={textareaRef}
					value={value}
					spellCheck={false}
					wrap={wrapLines ? "soft" : "off"}
					onChange={(event) => onChange(event.target.value)}
					onScroll={(event) => {
						if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = event.currentTarget.scrollTop;
						if (highlightRef.current) {
							highlightRef.current.scrollTop = event.currentTarget.scrollTop;
							highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
						}
					}}
					onKeyDown={(event) => {
						if (event.key === "Tab") {
							event.preventDefault();
							const textarea = event.currentTarget;
							const start = textarea.selectionStart;
							const end = textarea.selectionEnd;
							onChange(`${value.slice(0, start)}\t${value.slice(end)}`);
							window.requestAnimationFrame(() => {
								const nextPosition = start + 1;
								textarea.setSelectionRange(nextPosition, nextPosition);
							});
							return;
						}
						if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
							event.preventDefault();
							onSave();
						}
					}}
				/>
			</div>
		</div>
	);
}

function fileTabFromContent(content: WorkspaceFileContent, mtimeMs: number, path: string): FileTabState {
	const text = content.kind === "text" ? (content.content ?? "") : "";
	return {
		status: "ready",
		kind: content.kind,
		content: text,
		draft: text,
		...(content.kind === "image" && content.dataUrl ? { dataUrl: content.dataUrl } : {}),
		size: content.size,
		mtimeMs,
		dirty: false,
		diskChanged: false,
		view: content.kind === "text" && isMarkdownPath(path) ? "rendered" : "source",
	};
}

export const WorkspaceFilesView = memo(function WorkspaceFilesView({
	projectRoot,
	projectId,
	followPath,
	requestedPath,
	onInsertMention,
}: WorkspaceFilesViewProps) {
	const [dirs, setDirs] = useState<Record<string, DirState>>({});
	const [expanded, setExpanded] = useState<Set<string>>(() => loadStoredExpanded(projectRoot));
	const [tabs, setTabs] = useState<string[]>(() => loadStoredTabs(projectRoot));
	const [activePath, setActivePath] = useState<string | null>(null);
	const [files, setFiles] = useState<Record<string, FileTabState>>({});
	const [query, setQuery] = useState("");
	const [searchResults, setSearchResults] = useState<string[] | null>(null);
	const [selected, setSelected] = useState<Record<string, EntryKind>>({});
	const [undoByProject, setUndoByProject] = useState<Record<string, UndoEntry[]>>(() =>
		Object.fromEntries(undoStacks.entries()),
	);
	const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
	const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
	const [dialog, setDialog] = useState<DialogState | null>(null);
	const [wrapLines, setWrapLines] = useState(true);
	const [dropTarget, setDropTarget] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [draggedTab, setDraggedTab] = useState<string | null>(null);
	const [treePaneWidth, setTreePaneWidth] = useState<number | null>(() => loadStoredTreeWidth(projectRoot));
	const loadedDirsRef = useRef<Set<string>>(new Set());
	const filesRef = useRef(files);
	const tabsRef = useRef(tabs);
	const dragPathsRef = useRef<string[]>([]);
	const draggedTabRef = useRef<string | null>(null);
	const bodyRef = useRef<HTMLDivElement>(null);
	const treePaneRef = useRef<HTMLDivElement>(null);
	const treeResizeStartRef = useRef(0);
	const treeResizeLatestRef = useRef(0);
	const dialogInputRef = useRef<HTMLInputElement>(null);
	const contextMenuRef = useRef<HTMLDivElement>(null);

	const undoEntries = undoByProject[projectRoot] ?? undoStacks.get(projectRoot) ?? [];

	useEffect(() => {
		filesRef.current = files;
	}, [files]);

	useEffect(() => {
		tabsRef.current = tabs;
	}, [tabs]);

	useEffect(() => {
		setDirs({});
		setExpanded(loadStoredExpanded(projectRoot));
		setTabs(loadStoredTabs(projectRoot));
		setActivePath(null);
		setFiles({});
		setSelected({});
		setClipboard(null);
		setContextMenu(null);
		setDialog(null);
		setQuery("");
		setSearchResults(null);
		setDropTarget(null);
		setTreePaneWidth(loadStoredTreeWidth(projectRoot));
		loadedDirsRef.current = new Set();
	}, [projectRoot]);

	useEffect(() => {
		persistTabs(projectRoot, tabs);
		if (tabs.length > 0 && (!activePath || !tabs.includes(activePath))) setActivePath(tabs[0] ?? null);
		if (tabs.length === 0) setActivePath(null);
	}, [activePath, projectRoot, tabs]);

	useEffect(() => {
		persistExpanded(projectRoot, expanded);
	}, [expanded, projectRoot]);

	const loadDir = useCallback(
		async (relative: string, force = false) => {
			if (!force && loadedDirsRef.current.has(relative)) return;
			if (!("codepiddy" in window)) {
				setDirs((current) => ({ ...current, [relative]: { entries: [], error: "演示模式没有文件接口" } }));
				return;
			}
			loadedDirsRef.current.add(relative);
			setDirs((current) => ({
				...current,
				[relative]: { entries: current[relative]?.entries ?? [], loading: true },
			}));
			try {
				const entries = await window.codepiddy.listWorkspaceDir(projectRoot, relative);
				setDirs((current) => ({ ...current, [relative]: { entries } }));
			} catch (error) {
				loadedDirsRef.current.delete(relative);
				setDirs((current) => ({
					...current,
					[relative]: {
						entries: current[relative]?.entries ?? [],
						error: error instanceof Error ? error.message : "目录读取失败",
					},
				}));
			}
		},
		[projectRoot],
	);

	const loadFile = useCallback(
		async (path: string, force = false) => {
			const existing = filesRef.current[path];
			if (existing?.status === "loading" && !force) return;
			if (existing?.status === "ready" && !force) return;
			if (!("codepiddy" in window)) {
				setFiles((current) => ({
					...current,
					[path]: {
						status: "error",
						content: "",
						draft: "",
						size: 0,
						mtimeMs: 0,
						dirty: false,
						diskChanged: false,
						view: "source",
						error: "演示模式没有文件接口",
					},
				}));
				return;
			}
			setFiles((current) => ({
				...current,
				[path]: {
					status: "loading",
					content: current[path]?.content ?? "",
					draft: current[path]?.draft ?? "",
					size: current[path]?.size ?? 0,
					mtimeMs: current[path]?.mtimeMs ?? 0,
					dirty: current[path]?.dirty ?? false,
					diskChanged: current[path]?.diskChanged ?? false,
					view: current[path]?.view ?? (isMarkdownPath(path) ? "rendered" : "source"),
				},
			}));
			try {
				const [content, metadata] = await Promise.all([
					window.codepiddy.readWorkspaceFile(projectRoot, path),
					window.codepiddy.statWorkspaceFile(projectRoot, path),
				]);
				setFiles((current) => ({ ...current, [path]: fileTabFromContent(content, metadata.mtimeMs, path) }));
			} catch (error) {
				setFiles((current) => ({
					...current,
					[path]: {
						status: "error",
						content: "",
						draft: "",
						size: 0,
						mtimeMs: 0,
						dirty: false,
						diskChanged: false,
						view: "source",
						error: error instanceof Error ? error.message : "文件读取失败",
					},
				}));
			}
		},
		[projectRoot],
	);

	const expandAncestors = useCallback(
		(path: string) => {
			const ancestors: string[] = [];
			const parts = normalizePath(path).split("/").slice(0, -1);
			let current = "";
			for (const part of parts) {
				current = current ? `${current}/${part}` : part;
				ancestors.push(current);
			}
			if (ancestors.length === 0) return;
			setExpanded((current) => new Set([...current, ...ancestors]));
			for (const ancestor of ancestors) void loadDir(ancestor);
		},
		[loadDir],
	);

	const openTab = useCallback(
		(path: string) => {
			const normalized = normalizePath(path);
			expandAncestors(normalized);
			setTabs((current) => (current.includes(normalized) ? current : [...current, normalized]));
			setActivePath(normalized);
			void loadFile(normalized);
		},
		[expandAncestors, loadFile],
	);

	useEffect(() => {
		void loadDir("", true);
		for (const directory of expanded) void loadDir(directory);
	}, [expanded, loadDir]);

	useEffect(() => {
		for (const path of tabs) {
			if (!filesRef.current[path]) void loadFile(path);
		}
	}, [loadFile, tabs]);

	useEffect(() => {
		if (followPath) openTab(followPath);
	}, [followPath, openTab]);

	useEffect(() => {
		if (requestedPath?.path) openTab(requestedPath.path);
	}, [openTab, requestedPath]);

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
		}, FILE_SEARCH_DEBOUNCE_MS);
		return () => window.clearTimeout(timer);
	}, [projectRoot, query]);

	useEffect(() => {
		const timer = window.setInterval(() => {
			const visibleDirectories = ["", ...expanded];
			for (const directory of visibleDirectories) void loadDir(directory, true);
			for (const path of tabsRef.current) {
				const state = filesRef.current[path];
				if (!state || state.status !== "ready" || !["text", "image"].includes(state.kind ?? "")) continue;
				if (!("codepiddy" in window)) continue;
				void window.codepiddy
					.statWorkspaceFile(projectRoot, path)
					.then((metadata) => {
						if (metadata.mtimeMs === state.mtimeMs) return;
						if (state.dirty) {
							setFiles((current) => ({
								...current,
								[path]: { ...current[path]!, diskChanged: true },
							}));
							return;
						}
						void loadFile(path, true);
					})
					.catch(() => {});
			}
		}, FILE_REFRESH_MS);
		return () => window.clearInterval(timer);
	}, [expanded, loadDir, loadFile, projectRoot]);

	useEffect(() => {
		if (!contextMenu) return;
		const close = (event?: Event): void => {
			if (event?.target instanceof Node && contextMenuRef.current?.contains(event.target)) return;
			setContextMenu(null);
		};
		const onKeyDown = (event: KeyboardEvent): void => {
			if (event.key === "Escape") close();
		};
		document.addEventListener("mousedown", close);
		document.addEventListener("keydown", onKeyDown);
		window.addEventListener("blur", close);
		return () => {
			document.removeEventListener("mousedown", close);
			document.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("blur", close);
		};
	}, [contextMenu]);

	useEffect(() => {
		if (!dialog || !("value" in dialog)) return;
		const frame = window.requestAnimationFrame(() => {
			dialogInputRef.current?.focus();
			dialogInputRef.current?.select();
		});
		return () => window.cancelAnimationFrame(frame);
	}, [dialog]);

	const refreshFiles = useCallback(
		(nextTabs: string[] = tabs, reloadTabs = true) => {
			loadedDirsRef.current = new Set();
			setDirs({});
			void loadDir("", true);
			for (const directory of expanded) void loadDir(directory, true);
			if (reloadTabs) for (const path of nextTabs) void loadFile(path, true);
		},
		[expanded, loadDir, loadFile, tabs],
	);

	const closeTab = useCallback(
		(path: string) => {
			setTabs((current) => {
				const index = current.indexOf(path);
				const next = current.filter((item) => item !== path);
				if (activePath === path) setActivePath(next[Math.min(index, next.length - 1)] ?? null);
				return next;
			});
		},
		[activePath],
	);

	const moveTab = useCallback((dragged: string, target: string) => {
		if (dragged === target) return;
		setTabs((current) => {
			const from = current.indexOf(dragged);
			const to = current.indexOf(target);
			if (from < 0 || to < 0) return current;
			const next = [...current];
			next.splice(from, 1);
			next.splice(to, 0, dragged);
			return next;
		});
	}, []);

	const startTreeResize = useCallback(() => {
		const measured = treePaneRef.current?.getBoundingClientRect().width ?? MIN_TREE_WIDTH;
		treeResizeStartRef.current = measured;
		treeResizeLatestRef.current = measured;
	}, []);

	const resizeTreePane = useCallback((delta: number) => {
		const bodyWidth = bodyRef.current?.getBoundingClientRect().width ?? 0;
		const maxWidth = Math.max(MIN_TREE_WIDTH, bodyWidth - MIN_PREVIEW_WIDTH);
		const next = Math.min(maxWidth, Math.max(MIN_TREE_WIDTH, treeResizeStartRef.current + delta));
		treeResizeLatestRef.current = next;
		setTreePaneWidth(next);
	}, []);

	const finishTreeResize = useCallback(() => {
		persistTreeWidth(projectRoot, treeResizeLatestRef.current);
	}, [projectRoot]);

	const resetTreeWidth = useCallback(() => {
		treeResizeStartRef.current = 0;
		treeResizeLatestRef.current = 0;
		setTreePaneWidth(null);
		persistTreeWidth(projectRoot, null);
	}, [projectRoot]);

	const setDraft = useCallback((path: string, value: string) => {
		setFiles((current) => {
			const state = current[path];
			if (!state || state.status !== "ready") return current;
			return {
				...current,
				[path]: {
					...state,
					draft: value,
					dirty: value !== state.content,
					diskChanged: state.diskChanged,
				},
			};
		});
	}, []);

	const saveActive = useCallback(async () => {
		if (!activePath || saving) return;
		const state = filesRef.current[activePath];
		if (!state || state.status !== "ready" || state.kind !== "text" || !state.dirty) return;
		if (!("codepiddy" in window)) {
			showSettingsToast("演示模式不能保存文件", "error");
			return;
		}
		setSaving(true);
		try {
			const metadata = await window.codepiddy.writeWorkspaceFile({
				projectId,
				projectRoot,
				relativePath: activePath,
				content: state.draft,
			});
			setFiles((current) => {
				const latest = current[activePath];
				if (!latest) return current;
				return {
					...current,
					[activePath]: {
						...latest,
						content: state.draft,
						size: metadata.size,
						mtimeMs: metadata.mtimeMs,
						dirty: false,
						diskChanged: false,
					},
				};
			});
			showSettingsToast("文件已保存", "success");
		} catch (error) {
			showSettingsToast(error instanceof Error ? error.message : "保存文件失败", "error");
		} finally {
			setSaving(false);
		}
	}, [activePath, projectId, projectRoot, saving]);

	const copyValue = useCallback(async (value: string, message: string) => {
		try {
			await navigator.clipboard.writeText(value);
			showSettingsToast(message, "success");
		} catch {
			showSettingsToast("复制失败", "error");
		}
	}, []);

	const toggleDir = useCallback(
		(path: string) => {
			setExpanded((current) => {
				const next = new Set(current);
				if (next.has(path)) next.delete(path);
				else next.add(path);
				return next;
			});
			void loadDir(path);
		},
		[loadDir],
	);

	const selectedPaths = useMemo(() => Object.keys(selected), [selected]);

	const retargetOpenPaths = useCallback((from: string, to: string) => {
		const nextTabs = tabsRef.current.map((tab) => mapWorkspacePath(tab, from, to));
		tabsRef.current = nextTabs;
		setTabs(nextTabs);
		setActivePath((current) => (current ? mapWorkspacePath(current, from, to) : current));
		setFiles((current) => {
			const next: Record<string, FileTabState> = {};
			for (const [path, state] of Object.entries(current)) {
				next[mapWorkspacePath(path, from, to)] = state;
			}
			filesRef.current = next;
			return next;
		});
		setExpanded((current) => {
			const next = new Set<string>();
			for (const path of current) next.add(mapWorkspacePath(path, from, to));
			return next;
		});
	}, []);

	const closeTabsUnder = useCallback((path: string) => {
		setTabs((current) => {
			const index = current.findIndex((tab) => tab === path || pathIsInside(path, tab));
			const next = current.filter((tab) => tab !== path && !pathIsInside(path, tab));
			if (index >= 0) setActivePath(next[Math.min(index, next.length - 1)] ?? null);
			return next;
		});
	}, []);

	const removeWorkspacePath = useCallback(
		async (relativePath: string) => {
			if (!("codepiddy" in window)) return;
			await window.codepiddy.deleteWorkspaceEntry({ projectId, projectRoot, relativePath });
		},
		[projectId, projectRoot],
	);

	const trashPath = useCallback(
		async (relativePath: string): Promise<{ trash: string; parent: string }> => {
			if (!("codepiddy" in window)) throw new Error("演示模式不能移动文件");
			const parent = dirname(relativePath);
			const trashDir = joinPath(parent, WORKSPACE_TRASH_DIR_NAME);
			try {
				await window.codepiddy.createWorkspaceEntry({
					projectId,
					projectRoot,
					relativePath: trashDir,
					kind: "dir",
				});
			} catch {
				// The hidden trash directory already exists after the first delete.
			}
			const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}-${basename(relativePath)}`;
			const trash = joinPath(trashDir, unique);
			const result = await window.codepiddy.renameWorkspaceEntry({
				projectId,
				projectRoot,
				relativePath,
				nextRelativePath: trash,
			});
			return { trash: result.relativePath, parent };
		},
		[projectId, projectRoot],
	);

	const recordUndo = useCallback(
		(entry: UndoEntry) => {
			const current = undoStacks.get(projectRoot) ?? [];
			const next = [...current, entry];
			const evicted = next.length > UNDO_LIMIT ? next.shift() : undefined;
			undoStacks.set(projectRoot, next);
			setUndoByProject((projects) => ({ ...projects, [projectRoot]: next }));
			if (evicted?.kind === "delete") {
				void removeWorkspacePath(evicted.trash).catch(() => {
					// The trash entry may already be gone; eviction is best effort.
				});
			}
		},
		[projectRoot, removeWorkspacePath],
	);

	const popUndo = useCallback((): UndoEntry | undefined => {
		const current = undoStacks.get(projectRoot) ?? [];
		const entry = current.at(-1);
		if (!entry) return undefined;
		const next = current.slice(0, -1);
		undoStacks.set(projectRoot, next);
		setUndoByProject((projects) => ({ ...projects, [projectRoot]: next }));
		return entry;
	}, [projectRoot]);

	const moveEntries = useCallback(
		async (paths: string[], targetDir: string) => {
			const filtered = paths.filter((path) => {
				if (!path || path === targetDir) return false;
				return !pathIsInside(path, targetDir);
			});
			if (filtered.length === 0) return;
			if (!("codepiddy" in window)) {
				showSettingsToast("演示模式不能移动文件", "error");
				return;
			}
			let moved = 0;
			for (const path of filtered) {
				const target = joinPath(targetDir, basename(path));
				try {
					const result = await window.codepiddy.renameWorkspaceEntry({
						projectId,
						projectRoot,
						relativePath: path,
						nextRelativePath: target,
					});
					moved += 1;
					retargetOpenPaths(path, result.relativePath);
					recordUndo({
						kind: "move",
						label: `移动 ${basename(path)}`,
						from: path,
						to: result.relativePath,
						parent: targetDir,
					});
				} catch (error) {
					showSettingsToast(error instanceof Error ? error.message : `移动 ${basename(path)} 失败`, "error");
				}
			}
			if (moved > 0) {
				setSelected({});
				showSettingsToast(`已移动 ${moved} 项`, "success");
				refreshFiles(tabsRef.current, false);
			}
		},
		[projectId, projectRoot, recordUndo, refreshFiles, retargetOpenPaths],
	);

	const copyEntries = useCallback(
		async (paths: string[], targetDir: string, overwrite = false): Promise<boolean> => {
			if (!("codepiddy" in window)) {
				showSettingsToast("演示模式不能复制文件", "error");
				return false;
			}
			let copied = 0;
			let collision = false;
			for (const path of paths) {
				const target = joinPath(targetDir, basename(path));
				try {
					const result = await window.codepiddy.copyWorkspaceEntry({
						projectId,
						projectRoot,
						sourceRelativePath: path,
						targetRelativePath: target,
						overwrite,
					});
					if (result.exists) {
						collision = true;
						continue;
					}
					copied += 1;
					if (!overwrite) {
						recordUndo({
							kind: "copy",
							label: `复制 ${basename(path)}`,
							from: path,
							to: result.relativePath,
							parent: targetDir,
						});
					}
				} catch (error) {
					showSettingsToast(error instanceof Error ? error.message : `复制 ${basename(path)} 失败`, "error");
				}
			}
			if (copied > 0) {
				showSettingsToast(`已复制 ${copied} 项`, "success");
				refreshFiles();
			}
			return collision;
		},
		[projectId, projectRoot, recordUndo, refreshFiles],
	);

	const pasteInto = useCallback(
		async (targetDir: string) => {
			if (!clipboard || clipboard.paths.length === 0) return;
			if (clipboard.mode === "cut") {
				await moveEntries(clipboard.paths, targetDir);
				setClipboard(null);
				return;
			}
			const collision = await copyEntries(clipboard.paths, targetDir, false);
			if (collision) setDialog({ type: "overwrite", sourcePaths: clipboard.paths, targetDir });
		},
		[clipboard, copyEntries, moveEntries],
	);

	const deletePaths = useCallback(
		async (paths: string[]) => {
			if (!("codepiddy" in window)) {
				showSettingsToast("演示模式不能删除文件", "error");
				return;
			}
			const entries = paths
				.map((path) => ({ path, kind: selected[path] ?? "file" }))
				.sort((left, right) => pathDepth(right.path) - pathDepth(left.path));
			let deleted = 0;
			const trashedPrefixes: string[] = [];
			for (const { path, kind } of entries) {
				if (trashedPrefixes.some((prefix) => pathIsInside(prefix, path))) continue;
				try {
					const { trash, parent } = await trashPath(path);
					deleted += 1;
					if (kind === "dir") trashedPrefixes.push(path);
					closeTabsUnder(path);
					recordUndo({
						kind: "delete",
						label: `删除 ${basename(path)}`,
						path,
						trash,
						parent,
					});
				} catch (error) {
					showSettingsToast(error instanceof Error ? error.message : `删除 ${basename(path)} 失败`, "error");
				}
			}
			if (deleted > 0) {
				setSelected({});
				showSettingsToast(`已移入回收站 ${deleted} 项`, "success");
				refreshFiles();
			}
		},
		[closeTabsUnder, recordUndo, refreshFiles, selected, trashPath],
	);

	const performUndo = useCallback(async () => {
		const entry = popUndo();
		if (!entry) return;
		try {
			if (entry.kind === "copy") {
				await removeWorkspacePath(entry.to);
				closeTabsUnder(entry.to);
			} else if (entry.kind === "move" || entry.kind === "rename") {
				if (!("codepiddy" in window)) throw new Error("演示模式不能撤销文件操作");
				const result = await window.codepiddy.renameWorkspaceEntry({
					projectId,
					projectRoot,
					relativePath: entry.to,
					nextRelativePath: entry.from,
				});
				retargetOpenPaths(entry.to, result.relativePath);
				expandAncestors(entry.from);
			} else if (entry.kind === "create") {
				await trashPath(entry.path);
				closeTabsUnder(entry.path);
			} else if (entry.kind === "delete") {
				if (!("codepiddy" in window)) throw new Error("演示模式不能撤销文件操作");
				const result = await window.codepiddy.renameWorkspaceEntry({
					projectId,
					projectRoot,
					relativePath: entry.trash,
					nextRelativePath: entry.path,
				});
				expandAncestors(result.relativePath);
			}
			setSelected({});
			refreshFiles(tabsRef.current, !(entry.kind === "move" || entry.kind === "rename"));
			showSettingsToast(`已撤销：${entry.label}`, "success");
		} catch (error) {
			if (!(entry.kind === "delete" && isMissingPathError(error))) recordUndo(entry);
			showSettingsToast(error instanceof Error ? error.message : `撤销“${entry.label}”失败`, "error");
		}
	}, [
		closeTabsUnder,
		expandAncestors,
		popUndo,
		projectId,
		projectRoot,
		recordUndo,
		refreshFiles,
		removeWorkspacePath,
		retargetOpenPaths,
		trashPath,
	]);

	const selectAllVisible = useCallback(() => {
		const next: Record<string, EntryKind> = {};
		const collect = (relative: string): void => {
			const entries = dirs[relative]?.entries ?? [];
			for (const entry of entries) {
				const child = joinPath(relative, entry.name);
				next[child] = entry.kind;
				if (entry.kind === "dir" && expanded.has(child)) collect(child);
			}
		};
		collect("");
		setSelected(next);
	}, [dirs, expanded]);

	const revealEntry = useCallback(
		async (relativePath: string, kind: EntryKind) => {
			if (!("codepiddy" in window)) {
				showSettingsToast("演示模式不能打开资源管理器", "error");
				return;
			}
			try {
				await window.codepiddy.revealWorkspaceEntry({ projectRoot, relativePath, kind });
			} catch (error) {
				showSettingsToast(error instanceof Error ? error.message : "打开资源管理器失败", "error");
			}
		},
		[projectRoot],
	);

	const createEntry = useCallback(
		async (parent: string, name: string, kind: EntryKind) => {
			const trimmed = name.trim();
			if (!trimmed) {
				showSettingsToast("名称不能为空", "error");
				return;
			}
			if (!("codepiddy" in window)) {
				showSettingsToast("演示模式不能创建文件", "error");
				return;
			}
			try {
				const result = await window.codepiddy.createWorkspaceEntry({
					projectId,
					projectRoot,
					relativePath: joinPath(parent, trimmed),
					kind,
				});
				if (parent) {
					setExpanded((current) => new Set([...current, parent]));
					void loadDir(parent, true);
				} else {
					refreshFiles();
				}
				recordUndo({
					kind: "create",
					label: `${kind === "file" ? "新建文件" : "新建文件夹"} ${trimmed}`,
					path: result.relativePath,
					parent,
				});
				if (kind === "file") openTab(result.relativePath);
				showSettingsToast(kind === "file" ? "文件已创建" : "文件夹已创建", "success");
			} catch (error) {
				showSettingsToast(error instanceof Error ? error.message : "创建失败", "error");
			}
		},
		[loadDir, openTab, projectId, projectRoot, recordUndo, refreshFiles],
	);

	const renameEntry = useCallback(
		async (relativePath: string, nextName: string) => {
			const trimmed = nextName.trim();
			if (!trimmed) {
				showSettingsToast("名称不能为空", "error");
				return;
			}
			const target = joinPath(dirname(relativePath), trimmed);
			if (!("codepiddy" in window)) {
				showSettingsToast("演示模式不能重命名", "error");
				return;
			}
			try {
				const result = await window.codepiddy.renameWorkspaceEntry({
					projectId,
					projectRoot,
					relativePath,
					nextRelativePath: target,
				});
				retargetOpenPaths(relativePath, result.relativePath);
				recordUndo({
					kind: "rename",
					label: `重命名 ${basename(relativePath)}`,
					from: relativePath,
					to: result.relativePath,
					parent: dirname(relativePath),
				});
				setSelected({});
				refreshFiles(tabsRef.current, false);
				showSettingsToast("重命名完成", "success");
			} catch (error) {
				showSettingsToast(error instanceof Error ? error.message : "重命名失败", "error");
			}
		},
		[projectId, projectRoot, recordUndo, refreshFiles, retargetOpenPaths],
	);

	const onTreeKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			const modifier = event.ctrlKey || event.metaKey;
			const key = event.key.toLowerCase();
			if (modifier && key === "c" && selectedPaths.length > 0) {
				event.preventDefault();
				setClipboard({ mode: "copy", paths: selectedPaths });
				return;
			}
			if (modifier && key === "x" && selectedPaths.length > 0) {
				event.preventDefault();
				setClipboard({ mode: "cut", paths: selectedPaths });
				return;
			}
			if (modifier && key === "v" && clipboard) {
				event.preventDefault();
				const target = selectedPaths.length === 1 && selected[selectedPaths[0]!] === "dir" ? selectedPaths[0]! : "";
				void pasteInto(target);
				return;
			}
			if (modifier && key === "a") {
				event.preventDefault();
				selectAllVisible();
				return;
			}
			if (modifier && key === "z" && !event.shiftKey) {
				if (undoEntries.length === 0) return;
				event.preventDefault();
				void performUndo();
				return;
			}
			if (event.key === "Delete" && selectedPaths.length > 0) {
				event.preventDefault();
				setDialog({ type: "delete", paths: selectedPaths });
				return;
			}
			if (event.key === "Escape") {
				setSelected({});
				setContextMenu(null);
			}
		},
		[clipboard, pasteInto, performUndo, selectAllVisible, selected, selectedPaths, undoEntries.length],
	);

	const renderRow = (entry: WorkspaceDirEntry, relativeDir: string, depth: number): ReactNode => {
		const path = joinPath(relativeDir, entry.name);
		const open = entry.kind === "dir" && expanded.has(path);
		const isSelected = Boolean(selected[path]);
		const isActive = entry.kind === "file" && activePath === path;
		const cut = clipboard?.mode === "cut" && clipboard.paths.includes(path);
		return (
			<div key={path}>
				<button
					type="button"
					className={`workspace-file-row${isSelected || isActive ? " active" : ""}${cut ? " is-cut" : ""}${
						dropTarget === path ? " is-drop-target" : ""
					}`}
					data-kind={entry.kind}
					style={{ "--tree-depth": depth } as CSSProperties}
					title={path}
					draggable
					onClick={(event) => {
						event.stopPropagation();
						const modifier = event.ctrlKey || event.metaKey;
						setSelected((current) => {
							if (modifier) {
								const next = { ...current };
								if (next[path]) delete next[path];
								else next[path] = entry.kind;
								return next;
							}
							return { [path]: entry.kind };
						});
						if (entry.kind === "dir") toggleDir(path);
						else openTab(path);
					}}
					onContextMenu={(event) => {
						event.preventDefault();
						event.stopPropagation();
						setSelected((current) => (current[path] ? current : { [path]: entry.kind }));
						setContextMenu({ x: event.clientX, y: event.clientY, relativePath: path, kind: entry.kind });
					}}
					onDragStart={(event) => {
						const paths = selected[path] ? selectedPaths : [path];
						dragPathsRef.current = paths;
						event.dataTransfer.effectAllowed = "copyMove";
						event.dataTransfer.setData("text/plain", paths.join("\n"));
						event.dataTransfer.setData(WORKSPACE_FILES_DRAG_TYPE, JSON.stringify(paths));
					}}
					onDragEnd={() => {
						dragPathsRef.current = [];
						setDropTarget(null);
					}}
					onDragOver={(event) => {
						if (entry.kind !== "dir" || dragPathsRef.current.length === 0) return;
						event.preventDefault();
						event.dataTransfer.dropEffect = "move";
						setDropTarget(path);
					}}
					onDragLeave={() => setDropTarget(null)}
					onDrop={(event) => {
						if (entry.kind !== "dir") return;
						event.preventDefault();
						event.stopPropagation();
						setDropTarget(null);
						const paths = dragPathsRef.current;
						dragPathsRef.current = [];
						void moveEntries(paths, path);
					}}
				>
					<span className={`workspace-file-caret${open ? " open" : ""}`} aria-hidden="true">
						{entry.kind === "dir" ? <ChevronRight size={12} strokeWidth={2} /> : null}
					</span>
					<WorkspaceFileIcon kind={entry.kind} path={path} open={open} />
					<span className="workspace-file-name">{entry.name}</span>
					{entry.kind === "file" ? <span className="workspace-file-size">{formatSize(entry.size)}</span> : null}
				</button>
				{entry.kind === "dir" && open ? renderDir(path, depth + 1) : null}
			</div>
		);
	};

	const renderDir = (relativeDir: string, depth: number): ReactNode => {
		const state = dirs[relativeDir];
		if (!state || state.loading) {
			return (
				<div
					className="workspace-file-note"
					key={`${relativeDir}:loading`}
					style={{ "--tree-depth": depth } as CSSProperties}
				>
					加载中…
				</div>
			);
		}
		if (state.error) {
			return (
				<div
					className="workspace-file-note is-error"
					key={`${relativeDir}:error`}
					style={{ "--tree-depth": depth } as CSSProperties}
					role="alert"
				>
					{state.error}
				</div>
			);
		}
		if (state.entries.length === 0) {
			return (
				<div
					className="workspace-file-note"
					key={`${relativeDir}:empty`}
					style={{ "--tree-depth": depth } as CSSProperties}
				>
					空目录
				</div>
			);
		}
		return state.entries.map((entry) => renderRow(entry, relativeDir, depth));
	};

	const renderTree = (): ReactNode => (
		<div
			className="workspace-file-tree"
			role="tree"
			aria-label="项目文件"
			tabIndex={0}
			onKeyDown={onTreeKeyDown}
			onContextMenu={(event) => {
				event.preventDefault();
				setContextMenu({ x: event.clientX, y: event.clientY, relativePath: "", kind: "blank" });
			}}
			onDragOver={(event) => {
				if (dragPathsRef.current.length === 0) return;
				event.preventDefault();
				event.dataTransfer.dropEffect = "move";
				setDropTarget("");
			}}
			onDragLeave={() => setDropTarget(null)}
			onDrop={(event) => {
				if (dragPathsRef.current.length === 0) return;
				event.preventDefault();
				const paths = dragPathsRef.current;
				dragPathsRef.current = [];
				setDropTarget(null);
				void moveEntries(paths, "");
			}}
		>
			{clipboard ? (
				<output className="workspace-clipboard-bar">
					<span>
						{clipboard.mode === "cut"
							? `已剪切 ${clipboard.paths.length} 项`
							: `已复制 ${clipboard.paths.length} 项`}
					</span>
					<PanelIconButton label="清除剪贴板" onClick={() => setClipboard(null)}>
						<X size={13} strokeWidth={2} />
					</PanelIconButton>
				</output>
			) : null}
			{query.trim() && searchResults !== null ? (
				searchResults.length === 0 ? (
					<div className="workspace-file-note">无匹配文件</div>
				) : (
					searchResults.map((path) => (
						<button
							key={path}
							type="button"
							className={`workspace-file-row${activePath === path ? " active" : ""}`}
							data-kind="file"
							style={{ "--tree-depth": 0 } as CSSProperties}
							onClick={() => openTab(path)}
							title={path}
						>
							<span className="workspace-file-caret" aria-hidden="true" />
							<WorkspaceFileIcon kind="file" path={path} />
							<span className="workspace-file-name">{path}</span>
						</button>
					))
				)
			) : (
				renderDir("", 0)
			)}
		</div>
	);

	const renderPreview = (): ReactNode => {
		if (!activePath) return null;
		const state = files[activePath];
		if (!state || state.status === "loading") return <FileViewerSkeleton />;
		if (state.status === "error") {
			return (
				<StateBlock tone="error" title="文件读取失败">
					{state.error ?? "文件可能已被移动或删除。"}
				</StateBlock>
			);
		}
		if (state.kind === "image" && state.dataUrl) {
			return (
				<div className="workspace-file-image">
					<img src={state.dataUrl} alt={activePath} />
				</div>
			);
		}
		if (state.kind !== "text") {
			return (
				<StateBlock
					tone={state.kind === "tooLarge" ? "warning" : "neutral"}
					title={state.kind === "tooLarge" ? "文件过大无法预览" : "二进制文件无法预览"}
				>
					{formatSize(state.size)}
				</StateBlock>
			);
		}
		if (isMarkdownPath(activePath) && state.view === "rendered") {
			return (
				<div className="workspace-file-markdown">
					<MessageContent text={state.draft} />
				</div>
			);
		}
		return (
			<WorkspaceTextEditor
				key={activePath}
				path={activePath}
				value={state.draft}
				wrapLines={wrapLines}
				onChange={(value) => setDraft(activePath, value)}
				onSave={() => void saveActive()}
			/>
		);
	};

	const renderActiveFile = (): ReactNode => {
		if (!activePath) return null;
		const state = files[activePath];
		return (
			<div className="workspace-file-viewer">
				<div className="workspace-file-viewer-header">
					<span className="workspace-file-viewer-title">
						<strong>{basename(activePath)}</strong>
						<small title={activePath}>{dirname(activePath) || "."}</small>
					</span>
					<div className="workspace-file-viewer-actions">
						{state?.kind === "text" && isMarkdownPath(activePath) ? (
							<PanelIconButton
								label={state.view === "rendered" ? "编辑 Markdown" : "预览 Markdown"}
								active={state.view === "rendered"}
								onClick={() =>
									setFiles((current) => ({
										...current,
										[activePath]: {
											...current[activePath]!,
											view: current[activePath]!.view === "rendered" ? "source" : "rendered",
										},
									}))
								}
							>
								{state.view === "rendered" ? (
									<Pencil size={14} strokeWidth={2} />
								) : (
									<Eye size={14} strokeWidth={2} />
								)}
							</PanelIconButton>
						) : null}
						{state?.kind === "text" ? (
							<PanelIconButton
								label={wrapLines ? "关闭自动换行" : "开启自动换行"}
								active={wrapLines}
								onClick={() => setWrapLines((current) => !current)}
							>
								<WrapText size={14} strokeWidth={2} />
							</PanelIconButton>
						) : null}
						{state?.kind === "text" && state.dirty ? (
							<PanelIconButton label="保存文件" active onClick={() => void saveActive()} disabled={saving}>
								<Save size={14} strokeWidth={2} />
							</PanelIconButton>
						) : null}
						<PanelIconButton
							label="复制文件内容"
							onClick={() => void copyValue(state?.kind === "text" ? state.draft : activePath, "文件内容已复制")}
						>
							<Copy size={14} strokeWidth={2} />
						</PanelIconButton>
						<PanelIconButton label="在资源管理器中显示" onClick={() => void revealEntry(activePath, "file")}>
							<LocateFixed size={14} strokeWidth={2} />
						</PanelIconButton>
					</div>
				</div>
				{state?.diskChanged ? (
					<div className="workspace-file-disk-notice">
						<span>文件已在磁盘上变化，当前草稿未覆盖。</span>
						<button type="button" onClick={() => void loadFile(activePath, true)}>
							重新加载
						</button>
					</div>
				) : null}
				<div className="workspace-file-viewer-body">{renderPreview()}</div>
			</div>
		);
	};

	const menuItems = (): Array<
		{ label: string; danger?: boolean; disabled?: boolean; onClick(): void } | "divider"
	> => {
		if (!contextMenu) return [];
		const path = contextMenu.relativePath;
		const kind = contextMenu.kind;
		const singleDir =
			kind === "dir"
				? path
				: selectedPaths.length === 1 && selected[selectedPaths[0]!] === "dir"
					? selectedPaths[0]!
					: "";
		if (kind === "file") {
			return [
				{ label: "在消息中引用", onClick: () => onInsertMention(path) },
				{ label: "打开预览", onClick: () => openTab(path) },
				"divider",
				{
					label: "复制",
					onClick: () => setClipboard({ mode: "copy", paths: selectedPaths.length ? selectedPaths : [path] }),
				},
				{
					label: "剪切",
					onClick: () => setClipboard({ mode: "cut", paths: selectedPaths.length ? selectedPaths : [path] }),
				},
				"divider",
				{ label: "复制路径", onClick: () => void copyValue(path, "相对路径已复制") },
				{ label: "在资源管理器中显示", onClick: () => void revealEntry(path, "file") },
				"divider",
				{
					label: "重命名",
					onClick: () => setDialog({ type: "rename", relativePath: path, value: basename(path) }),
				},
				{
					label: "删除",
					danger: true,
					onClick: () => setDialog({ type: "delete", paths: selectedPaths.length ? selectedPaths : [path] }),
				},
			];
		}
		if (kind === "dir") {
			return [
				{ label: "新建文件", onClick: () => setDialog({ type: "create-file", parent: path, value: "" }) },
				{ label: "新建文件夹", onClick: () => setDialog({ type: "create-dir", parent: path, value: "" }) },
				"divider",
				{
					label: "复制",
					onClick: () => setClipboard({ mode: "copy", paths: selectedPaths.length ? selectedPaths : [path] }),
				},
				{
					label: "剪切",
					onClick: () => setClipboard({ mode: "cut", paths: selectedPaths.length ? selectedPaths : [path] }),
				},
				{ label: "粘贴", disabled: !clipboard, onClick: () => void pasteInto(path) },
				"divider",
				{ label: "复制路径", onClick: () => void copyValue(path, "相对路径已复制") },
				{ label: "在资源管理器中显示", onClick: () => void revealEntry(path, "dir") },
				{ label: "刷新", onClick: () => void loadDir(path, true) },
				"divider",
				{
					label: "重命名",
					onClick: () => setDialog({ type: "rename", relativePath: path, value: basename(path) }),
				},
				{
					label: "删除",
					danger: true,
					onClick: () => setDialog({ type: "delete", paths: selectedPaths.length ? selectedPaths : [path] }),
				},
			];
		}
		return [
			{ label: "新建文件", onClick: () => setDialog({ type: "create-file", parent: singleDir, value: "" }) },
			{ label: "新建文件夹", onClick: () => setDialog({ type: "create-dir", parent: singleDir, value: "" }) },
			{ label: "粘贴", disabled: !clipboard, onClick: () => void pasteInto(singleDir) },
			"divider",
			{ label: "全选", onClick: selectAllVisible },
			{
				label: undoEntries.length > 0 ? `撤销：${undoEntries.at(-1)?.label}` : "撤销",
				disabled: undoEntries.length === 0,
				onClick: () => void performUndo(),
			},
			{ label: "刷新", onClick: refreshFiles },
			"divider",
			{ label: "复制路径", onClick: () => void copyValue(singleDir || ".", "相对路径已复制") },
			{ label: "在资源管理器中显示", onClick: () => void revealEntry(singleDir, "dir") },
		];
	};

	const renderDialog = (): ReactNode => {
		if (!dialog) return null;
		if (dialog.type === "delete") {
			return (
				<ModalShell
					title="删除文件"
					description={`将把 ${dialog.paths.length} 项移入隐藏回收目录，可在本次会话中撤销。`}
					onClose={() => setDialog(null)}
					width="sm"
					footer={
						<>
							<button type="button" className="secondary-button" onClick={() => setDialog(null)}>
								取消
							</button>
							<button
								type="button"
								className="danger-button"
								onClick={() => {
									const paths = dialog.paths;
									setDialog(null);
									void deletePaths(paths);
								}}
							>
								删除
							</button>
						</>
					}
				>
					<div className="workspace-dialog-list">
						{dialog.paths.slice(0, 8).map((path) => (
							<code key={path}>{path}</code>
						))}
						{dialog.paths.length > 8 ? <span>以及另外 {dialog.paths.length - 8} 项</span> : null}
					</div>
				</ModalShell>
			);
		}
		if (dialog.type === "overwrite") {
			return (
				<ModalShell
					title="目标已存在"
					description="复制目标中存在同名文件或文件夹，是否覆盖？"
					onClose={() => setDialog(null)}
					width="sm"
					footer={
						<>
							<button type="button" className="secondary-button" onClick={() => setDialog(null)}>
								取消
							</button>
							<button
								type="button"
								className="primary-button"
								onClick={() => {
									const next = dialog;
									setDialog(null);
									void copyEntries(next.sourcePaths, next.targetDir, true);
								}}
							>
								覆盖
							</button>
						</>
					}
				>
					<p className="workspace-dialog-copy">覆盖会替换目标中的同名内容。</p>
				</ModalShell>
			);
		}
		const title = dialog.type === "create-file" ? "新建文件" : dialog.type === "create-dir" ? "新建文件夹" : "重命名";
		return (
			<ModalShell
				title={title}
				onClose={() => setDialog(null)}
				width="sm"
				footer={
					<>
						<button type="button" className="secondary-button" onClick={() => setDialog(null)}>
							取消
						</button>
						<button
							type="button"
							className="primary-button"
							onClick={() => {
								const current = dialog;
								setDialog(null);
								if (current.type === "create-file") void createEntry(current.parent, current.value, "file");
								else if (current.type === "create-dir") void createEntry(current.parent, current.value, "dir");
								else if (current.type === "rename") void renameEntry(current.relativePath, current.value);
							}}
						>
							确定
						</button>
					</>
				}
			>
				<label className="workspace-dialog-field">
					<span>{dialog.type === "rename" ? "新名称" : "名称"}</span>
					<input
						ref={dialogInputRef}
						value={dialog.value}
						onChange={(event) =>
							setDialog((current) =>
								current && "value" in current ? { ...current, value: event.target.value } : current,
							)
						}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								const current = dialog;
								setDialog(null);
								if (current.type === "create-file") void createEntry(current.parent, current.value, "file");
								else if (current.type === "create-dir") void createEntry(current.parent, current.value, "dir");
								else if (current.type === "rename") void renameEntry(current.relativePath, current.value);
							}
						}}
					/>
				</label>
			</ModalShell>
		);
	};

	return (
		<div className="workspace-files-view">
			<div className="workspace-files-toolbar">
				<div className="workspace-file-search">
					<Search size={14} strokeWidth={2} aria-hidden="true" />
					<input
						type="search"
						value={query}
						placeholder="搜索文件…"
						aria-label="搜索文件"
						onChange={(event) => setQuery(event.target.value)}
					/>
				</div>
				<PanelIconButton
					label={undoEntries.length > 0 ? `撤销：${undoEntries.at(-1)?.label}` : "撤销"}
					disabled={undoEntries.length === 0}
					onClick={() => void performUndo()}
				>
					<Undo2 size={14} strokeWidth={2} />
				</PanelIconButton>
				<PanelIconButton label="刷新文件树" onClick={refreshFiles}>
					<RefreshCw size={14} strokeWidth={2} />
				</PanelIconButton>
				<PanelIconButton label="在资源管理器中显示项目" onClick={() => void revealEntry("", "dir")}>
					<LocateFixed size={14} strokeWidth={2} />
				</PanelIconButton>
			</div>
			<div ref={bodyRef} className={`workspace-files-body${activePath ? " has-active-file" : ""}`}>
				<div
					ref={treePaneRef}
					className="workspace-file-tree-pane"
					style={treePaneWidth === null ? undefined : { flexBasis: `${treePaneWidth}px` }}
				>
					{renderTree()}
				</div>
				{activePath ? (
					<PanelResizeHandle
						label="调整文件树和文件预览宽度"
						className="is-inline"
						onResizeStart={startTreeResize}
						onResize={resizeTreePane}
						onResizeEnd={finishTreeResize}
						onReset={resetTreeWidth}
					/>
				) : null}
				{activePath ? (
					<div className="workspace-file-preview-pane">
						{tabs.length > 0 ? (
							<div className="workspace-file-tabs" role="tablist" aria-label="打开的文件">
								{tabs.map((path) => {
									const state = files[path];
									return (
										<div
											key={path}
											className={`workspace-file-tab${path === activePath ? " active" : ""}${
												draggedTab === path ? " is-dragging" : ""
											}`}
										>
											<button
												type="button"
												className="workspace-file-tab-main"
												draggable
												onClick={() => setActivePath(path)}
												title={path}
												onDragStart={(event) => {
													draggedTabRef.current = path;
													setDraggedTab(path);
													event.dataTransfer.effectAllowed = "move";
													event.dataTransfer.setData(TAB_DRAG_TYPE, path);
												}}
												onDragEnter={(event) => {
													const dragged = draggedTabRef.current ?? draggedTab;
													if (!dragged || dragged === path) return;
													event.preventDefault();
													moveTab(dragged, path);
												}}
												onDragOver={(event) => {
													const dragged = draggedTabRef.current ?? draggedTab;
													if (!dragged || dragged === path) return;
													event.preventDefault();
													event.dataTransfer.dropEffect = "move";
												}}
												onDrop={(event) => {
													const dragged =
														event.dataTransfer.getData(TAB_DRAG_TYPE) ||
														draggedTabRef.current ||
														draggedTab;
													if (!dragged) return;
													event.preventDefault();
													moveTab(dragged, path);
													draggedTabRef.current = null;
													setDraggedTab(null);
												}}
												onDragEnd={() => {
													draggedTabRef.current = null;
													setDraggedTab(null);
												}}
											>
												<WorkspaceFileIcon kind="file" path={path} />
												<span>{basename(path)}</span>
												{state?.dirty ? (
													<span className="workspace-file-dirty-dot" title="未保存">
														<span className="sr-only">未保存</span>
													</span>
												) : null}
											</button>
											{state?.diskChanged ? (
												<button
													type="button"
													className="workspace-file-tab-action"
													title="磁盘内容已变化，重新加载"
													onClick={() => void loadFile(path, true)}
												>
													<RefreshCw size={12} strokeWidth={2} />
												</button>
											) : null}
											<button
												type="button"
												className="workspace-file-tab-action"
												title="关闭"
												onClick={() => closeTab(path)}
											>
												<X size={12} strokeWidth={2} />
											</button>
										</div>
									);
								})}
								<PanelIconButton
									label="在资源管理器中显示当前文件"
									onClick={() => void revealEntry(activePath, "file")}
								>
									<LocateFixed size={14} strokeWidth={2} />
								</PanelIconButton>
							</div>
						) : null}
						{renderActiveFile()}
					</div>
				) : null}
			</div>
			{contextMenu ? (
				<div
					ref={contextMenuRef}
					className="workspace-context-menu"
					role="menu"
					style={{ left: contextMenu.x, top: contextMenu.y }}
					onContextMenu={(event) => event.preventDefault()}
				>
					{menuItems().map((item, index) =>
						item === "divider" ? (
							// biome-ignore lint/suspicious/noArrayIndexKey: context menu dividers are static separators whose order never changes
							<div key={`divider-${index}`} className="workspace-context-divider" />
						) : (
							<button
								key={item.label}
								type="button"
								role="menuitem"
								className={item.danger ? "danger" : ""}
								disabled={item.disabled}
								onClick={() => {
									setContextMenu(null);
									item.onClick();
								}}
							>
								{item.label}
							</button>
						),
					)}
				</div>
			) : null}
			{renderDialog()}
		</div>
	);
});
