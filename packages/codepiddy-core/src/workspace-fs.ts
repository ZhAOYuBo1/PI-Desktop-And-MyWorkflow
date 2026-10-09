import { cp, mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
	WorkspaceDirEntry,
	WorkspaceDocumentFormat,
	WorkspaceFileContent,
	WorkspaceFileMetadata,
	WorkspaceMutationResult,
} from "@codepiddy/shared";
import { WORKSPACE_TRASH_DIR_NAME } from "@codepiddy/shared";

const TEXT_LIMIT_BYTES = 512 * 1024;
const IMAGE_LIMIT_BYTES = 8 * 1024 * 1024;
/** 文档预览要把整份文件读进渲染进程，超过这个体积只提示过大。 */
const DOCUMENT_LIMIT_BYTES = 32 * 1024 * 1024;
const PDF_MIME = "application/pdf";

const imageMimeByExtension = new Map([
	[".png", "image/png"],
	[".jpg", "image/jpeg"],
	[".jpeg", "image/jpeg"],
	[".gif", "image/gif"],
	[".webp", "image/webp"],
	[".svg", "image/svg+xml"],
	[".bmp", "image/bmp"],
	[".ico", "image/x-icon"],
]);

/**
 * 只登记 Pi 客户端能离线渲染的文档格式。
 * 老的二进制 Office 格式（.doc / .ppt）没有可用的纯前端渲染器，走系统默认程序。
 */
const documentByExtension = new Map<string, { format: WorkspaceDocumentFormat; mime: string }>([
	[
		".docx",
		{
			format: "docx",
			mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		},
	],
	[
		".xlsx",
		{
			format: "xlsx",
			mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		},
	],
	[".xls", { format: "xlsx", mime: "application/vnd.ms-excel" }],
	[
		".pptx",
		{
			format: "pptx",
			mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
		},
	],
]);

/** 相对路径钳制在项目根内，越界抛错（主进程透传给渲染进程展示）。 */
function resolveInside(projectRoot: string, relativePath: string): string {
	const root = path.resolve(projectRoot);
	const absolute = path.resolve(root, relativePath || ".");
	if (absolute !== root && !absolute.startsWith(root + path.sep))
		throw new Error(`路径超出项目范围：${relativePath || "."}`);
	return absolute;
}

function isInside(parentPath: string, candidatePath: string): boolean {
	const relative = path.relative(parentPath, candidatePath);
	return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

/**
 * 写操作前沿最近的已存在祖先做 realpath 校验，避免项目内符号链接把操作带到项目外。
 * 新文件/新目录本身尚不存在时，检查其最近的已存在父目录即可。
 */
async function assertRealPathInside(projectRoot: string, absolutePath: string): Promise<void> {
	const realRoot = await realpath(path.resolve(projectRoot));
	let cursor = absolutePath;
	for (;;) {
		try {
			const realCursor = await realpath(cursor);
			if (!isInside(realRoot, realCursor))
				throw new Error(`路径超出项目范围：${path.relative(realRoot, realCursor)}`);
			return;
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== "ENOENT") throw error;
			const parent = path.dirname(cursor);
			if (parent === cursor) throw error;
			cursor = parent;
		}
	}
}

function relativeWorkspacePath(projectRoot: string, absolutePath: string): string {
	return path.relative(path.resolve(projectRoot), absolutePath).split(path.sep).join("/");
}

function isLockError(error: unknown): boolean {
	const code = (error as NodeJS.ErrnoException).code;
	return code === "EBUSY" || code === "EPERM";
}

async function withLockRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
	for (let attempt = 1; ; attempt += 1) {
		try {
			return await operation();
		} catch (error) {
			if (!isLockError(error) || attempt >= attempts) throw error;
			await new Promise((resolve) => setTimeout(resolve, attempt * 150));
		}
	}
}

/** 列单层目录：目录优先、名称不区分大小写排序，附文件大小。 */
export async function listWorkspaceDir(projectRoot: string, relativeDir: string): Promise<WorkspaceDirEntry[]> {
	const directory = resolveInside(projectRoot, relativeDir);
	const dirents = await readdir(directory, { withFileTypes: true });
	const entries: WorkspaceDirEntry[] = [];
	for (const dirent of dirents) {
		if (dirent.name === WORKSPACE_TRASH_DIR_NAME) continue;
		if (dirent.isDirectory()) {
			entries.push({ name: dirent.name, kind: "dir", size: 0 });
			continue;
		}
		if (!dirent.isFile()) continue;
		let size = 0;
		try {
			size = (await stat(path.join(directory, dirent.name))).size;
		} catch {}
		entries.push({ name: dirent.name, kind: "file", size });
	}
	return entries.sort(
		(left, right) =>
			(left.kind === right.kind ? 0 : left.kind === "dir" ? -1 : 1) ||
			left.name.toLowerCase().localeCompare(right.name.toLowerCase()),
	);
}

/**
 * 读单个文件：图片转 dataUrl；pdf / OOXML 文档返回 base64 原始字节给渲染层解码；
 * 其余大文件与二进制只报 kind 不给内容（调用方展示空态，避免渲染进程载入乱码与巨内容）。
 */
export async function readWorkspaceFile(projectRoot: string, relativePath: string): Promise<WorkspaceFileContent> {
	const absolute = resolveInside(projectRoot, relativePath);
	const fileStat = await stat(absolute);
	if (!fileStat.isFile()) throw new Error(`不是文件：${relativePath}`);
	const size = fileStat.size;
	const extension = path.extname(absolute).toLowerCase();
	const mime = imageMimeByExtension.get(extension);
	if (mime) {
		if (size > IMAGE_LIMIT_BYTES) return { kind: "tooLarge", size };
		const buffer = await readFile(absolute);
		return { kind: "image", size, dataUrl: `data:${mime};base64,${buffer.toString("base64")}` };
	}
	if (extension === ".pdf") {
		if (size > DOCUMENT_LIMIT_BYTES) return { kind: "tooLarge", size };
		const buffer = await readFile(absolute);
		return { kind: "pdf", size, mime: PDF_MIME, data: buffer.toString("base64") };
	}
	const document = documentByExtension.get(extension);
	if (document) {
		if (size > DOCUMENT_LIMIT_BYTES) return { kind: "tooLarge", size };
		const buffer = await readFile(absolute);
		return { kind: "document", size, mime: document.mime, format: document.format, data: buffer.toString("base64") };
	}
	if (size > TEXT_LIMIT_BYTES) return { kind: "tooLarge", size };
	const buffer = await readFile(absolute);
	if (buffer.subarray(0, 8192).includes(0)) return { kind: "binary", size };
	return { kind: "text", size, content: buffer.toString("utf8") };
}

export async function statWorkspaceFile(projectRoot: string, relativePath: string): Promise<WorkspaceFileMetadata> {
	const absolute = resolveInside(projectRoot, relativePath);
	await assertRealPathInside(projectRoot, absolute);
	const fileStat = await stat(absolute);
	if (!fileStat.isFile()) throw new Error(`不是文件：${relativePath}`);
	return { size: fileStat.size, mtimeMs: fileStat.mtimeMs };
}

export async function writeWorkspaceFile(
	projectRoot: string,
	relativePath: string,
	content: string,
): Promise<WorkspaceFileMetadata> {
	const absolute = resolveInside(projectRoot, relativePath);
	await assertRealPathInside(projectRoot, absolute);
	await writeFile(absolute, content, "utf8");
	const fileStat = await stat(absolute);
	return { size: fileStat.size, mtimeMs: fileStat.mtimeMs };
}

export async function createWorkspaceEntry(
	projectRoot: string,
	relativePath: string,
	kind: "file" | "dir",
): Promise<WorkspaceMutationResult> {
	const absolute = resolveInside(projectRoot, relativePath);
	await assertRealPathInside(projectRoot, absolute);
	if (kind === "file") await writeFile(absolute, "", { encoding: "utf8", flag: "wx" });
	else await mkdir(absolute);
	return { relativePath: relativeWorkspacePath(projectRoot, absolute) };
}

export async function renameWorkspaceEntry(
	projectRoot: string,
	relativePath: string,
	nextRelativePath: string,
): Promise<WorkspaceMutationResult> {
	const source = resolveInside(projectRoot, relativePath);
	const target = resolveInside(projectRoot, nextRelativePath);
	await assertRealPathInside(projectRoot, source);
	await assertRealPathInside(projectRoot, target);
	try {
		await stat(target);
		throw new Error("目标已存在");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	await withLockRetry(() => rename(source, target));
	return { relativePath: relativeWorkspacePath(projectRoot, target) };
}

export async function deleteWorkspaceEntry(
	projectRoot: string,
	relativePath: string,
): Promise<WorkspaceMutationResult> {
	const absolute = resolveInside(projectRoot, relativePath);
	await assertRealPathInside(projectRoot, absolute);
	const entryStat = await stat(absolute);
	await withLockRetry(() => rm(absolute, { recursive: entryStat.isDirectory(), force: false }));
	return { relativePath: relativeWorkspacePath(projectRoot, absolute) };
}

export async function copyWorkspaceEntry(
	projectRoot: string,
	sourceRelativePath: string,
	targetRelativePath: string,
	overwrite: boolean,
): Promise<WorkspaceMutationResult> {
	const source = resolveInside(projectRoot, sourceRelativePath);
	const target = resolveInside(projectRoot, targetRelativePath);
	await assertRealPathInside(projectRoot, source);
	await assertRealPathInside(projectRoot, target);
	const sourceStat = await stat(source);
	if (source.toLowerCase() === target.toLowerCase()) throw new Error("源路径和目标路径相同");
	if (sourceStat.isDirectory() && target.toLowerCase().startsWith(`${source.toLowerCase()}${path.sep}`)) {
		throw new Error("不能把目录复制到自身内部");
	}
	try {
		await cp(source, target, { recursive: sourceStat.isDirectory(), force: overwrite, errorOnExist: !overwrite });
		return { relativePath: relativeWorkspacePath(projectRoot, target) };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ERR_FS_CP_EEXIST") {
			return { relativePath: relativeWorkspacePath(projectRoot, target), exists: true };
		}
		throw error;
	}
}

/** 解析项目内条目绝对路径，供资源管理器定位或系统打开使用。 */
export async function resolveWorkspaceEntryPath(projectRoot: string, relativePath: string): Promise<string> {
	const absolute = resolveInside(projectRoot, relativePath);
	await assertRealPathInside(projectRoot, absolute);
	return absolute;
}
