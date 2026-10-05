import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

console.log = (...values) => console.error(...values);
console.info = (...values) => console.error(...values);
console.debug = (...values) => console.error(...values);

const args = process.argv.slice(2);

function argument(name) {
	const index = args.indexOf(name);
	return index >= 0 ? args[index + 1] : undefined;
}

const packageDir = argument("--package-dir");
const agentDir = argument("--agent-dir");
const sessionFile = argument("--session-file");
const htmlFile = argument("--html-file");
const cwd = argument("--cwd");
const configuredGhPath = argument("--gh-path");

if (!packageDir || !agentDir || !sessionFile || !htmlFile || !cwd) {
	console.error("pi-share-helper requires --package-dir, --agent-dir, --session-file, --html-file and --cwd");
	process.exit(2);
}

process.env.PI_PACKAGE_DIR ??= packageDir;

const require = createRequire(import.meta.url);
const { ModelRuntime, SessionManager } = require(path.join(packageDir, "dist", "bundle", "index.js"));

function authCredential(auth) {
	if (auth?.auth?.apiKey) return auth.auth.apiKey;
	const authorization = Object.entries(auth?.auth?.headers ?? {}).find(
		([name]) => name.toLowerCase() === "authorization",
	)?.[1];
	return typeof authorization === "string" ? /^Bearer\s+(.+)$/iu.exec(authorization)?.[1] : undefined;
}

async function writeShareJsonl() {
	const tempDir = await mkdtemp(path.join(os.tmpdir(), "codepiddy-share-jsonl-"));
	const outputPath = path.join(tempDir, "session.jsonl");
	const manager = SessionManager.open(sessionFile);
	const header = manager.getHeader();
	if (!header || header.type !== "session") throw new Error("当前 Session 文件没有有效头信息");
	const branch = manager.getBranch();
	const timestamp = new Date().toISOString();
	const lines = [JSON.stringify({ ...header, cwd: header.cwd || cwd })];
	let parentId = null;
	for (const entry of branch) {
		lines.push(JSON.stringify({ ...entry, parentId }));
		parentId = entry.id;
	}
	lines.push(
		JSON.stringify({
			type: "custom",
			customType: "pi.share",
			id: randomUUID().slice(0, 8),
			parentId,
			timestamp,
			data: {
				systemPrompt: "",
				tools: [],
			},
		}),
	);
	await writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
	return { outputPath, tempDir };
}

async function uploadToRadius(jsonlPath) {
	const runtime = await ModelRuntime.create({
		authPath: path.join(agentDir, "auth.json"),
		modelsPath: path.join(agentDir, "models.json"),
		allowModelNetwork: false,
		refreshOnCreate: false,
	});
	await runtime.refresh({ allowNetwork: false });
	if (!runtime.getProvider("radius")) return null;
	const auth = await runtime.getAuth("radius", { minOAuthValidityMs: 5 * 60_000 });
	const token = authCredential(auth);
	if (!token) return null;

	const body = await readFile(jsonlPath);
	const url = new URL("/v1/artifacts", "https://radius.pi.dev");
	url.searchParams.set("visibility", "organization");
	url.searchParams.set("title", "Pi session");
	const response = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/x-ndjson",
			"Content-Length": String(body.byteLength),
		},
		body,
	});
	const result = await response.json().catch(() => null);
	if (!response.ok || !result?.artifact?.canonical_url) {
		throw new Error(`上传 Radius 失败：${result?.error || response.statusText || response.status}`);
	}
	return {
		provider: "radius",
		viewerUrl: result.artifact.canonical_url,
		artifactUrl: result.artifact.canonical_url,
	};
}

function resolveGhCommand(configuredPath) {
	if (configuredPath && existsSync(configuredPath)) return configuredPath;
	const configured = process.env.CODEPIDDY_GH_PATH?.trim();
	if (configured && existsSync(configured)) return configured;
	const command = process.platform === "win32" ? "where.exe" : "which";
	const lookup = spawnSync(command, ["gh"], { encoding: "utf8", windowsHide: true });
	const found = lookup.status === 0 ? lookup.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) : undefined;
	if (found && existsSync(found)) return found;
	if (process.platform !== "win32") return "gh";
	const home = os.homedir();
	const candidates = [
		path.join(process.env.ProgramFiles ?? "C:\\Program Files", "GitHub CLI", "gh.exe"),
		path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "GitHub CLI", "gh.exe"),
		path.join(process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"), "GitHubCLI", "gh.exe"),
		path.join(process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"), "Programs", "GitHub CLI", "gh.exe"),
		path.join(home, "scoop", "shims", "gh.exe"),
	];
	return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function uploadToGist(configuredPath) {
	const gh = resolveGhCommand(configuredPath);
	if (!gh) {
		throw new Error("未找到 GitHub CLI。请安装 gh，或设置 CODEPIDDY_GH_PATH 指向 gh.exe。");
	}
	try {
		execFileSync(gh, ["auth", "status"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
		});
	} catch {
		throw new Error("GitHub CLI 尚未登录。请先运行 gh auth login，再重试分享。");
	}
	let output;
	try {
		output = execFileSync(gh, ["gist", "create", "--public=false", htmlFile], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
			maxBuffer: 4 * 1024 * 1024,
		}).trim();
	} catch (error) {
		const stderr = error?.stderr?.toString?.().trim();
		throw new Error(stderr || (error instanceof Error ? error.message : "创建 GitHub Gist 失败"));
	}
	const gistUrl = output.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
	const gistId = gistUrl ? new URL(gistUrl).pathname.split("/").filter(Boolean).pop() : undefined;
	if (!gistUrl || !gistId) throw new Error("无法从 GitHub CLI 输出中解析 Gist ID");
	const viewerBase = process.env.PI_SHARE_VIEWER_URL || "https://pi.dev/session/";
	return {
		provider: "github",
		viewerUrl: `${viewerBase}#${gistId}`,
		gistUrl,
	};
}

async function main() {
	const { outputPath, tempDir } = await writeShareJsonl();
	try {
		const radiusResult = await uploadToRadius(outputPath);
		process.stdout.write(`${JSON.stringify(radiusResult ?? uploadToGist(configuredGhPath))}\n`);
	} finally {
		await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
