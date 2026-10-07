import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PiRuntimeStatus } from "@codepiddy/shared";

const PACKAGE_NAME = "@earendil-works/pi-coding-agent";
// 查版本和装版本必须用同一个源。之前查版本硬编码 registry.npmjs.org，而子 npm 会读到
// 用户 .npmrc 的 registry（npmmirror），两个源有同步延迟，迟早出现「查到最新版
// 但镜像还没同步」而失败。
const REGISTRY_URL = "https://registry.npmjs.org";
const REGISTRY_API_URL = "https://registry.npmjs.org/@earendil-works%2Fpi-coding-agent/latest";
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const INSTALL_ID_PATTERN = /^v\d+\.\d+\.\d+-[0-9a-f-]{36}$/;
const INSTALL_TIMEOUT_MS = 5 * 60_000;
const STDERR_LIMIT = 8192;

export interface InstalledPiRuntime {
	version: string;
	packageDir: string;
	cliPath: string;
}

type RollbackEntry = { kind: "bundled" } | { kind: "installed"; installId: string; version: string };

interface ActiveRecord {
	installId: string;
	version: string;
	history: RollbackEntry[];
}

interface UpdaterOptions {
	userDataPath: string;
	bundledVersion: string;
	nodeExecutable: string;
	probe(runtime: InstalledPiRuntime, stagingRoot: string): Promise<void>;
	requestLatest?: () => Promise<string>;
	installPackage?: (stagingRoot: string, version: string) => Promise<void>;
	npmCliPath?: string;
}

function parseVersion(value: unknown): string {
	if (typeof value !== "string" || !VERSION_PATTERN.test(value)) throw new Error("Pi 版本号无效");
	return value;
}

function compareVersions(left: string, right: string): number {
	const a = left.split(".").map(Number);
	const b = right.split(".").map(Number);
	for (let index = 0; index < 3; index++) {
		const difference = (a[index] ?? 0) - (b[index] ?? 0);
		if (difference !== 0) return Math.sign(difference);
	}
	return 0;
}

async function requestRegistryLatest(): Promise<string> {
	const response = await fetch(REGISTRY_API_URL, {
		signal: AbortSignal.timeout(15_000),
		headers: { accept: "application/json" },
	});
	if (!response.ok) throw new Error(`检查 Pi 更新失败：npm registry 返回 ${response.status}`);
	const data = (await response.json()) as unknown;
	if (typeof data !== "object" || data === null || !("version" in data))
		throw new Error("npm registry 未返回 Pi 版本");
	return parseVersion(data.version);
}

async function findNpmCli(): Promise<string | null> {
	const candidates = [
		process.env.CODEPIDDY_NPM_CLI,
		process.env.npm_execpath,
		...(process.env.PATH ?? "")
			.split(path.delimiter)
			.filter(Boolean)
			.map((directory) => path.join(directory, "node_modules", "npm", "bin", "npm-cli.js")),
	];
	for (const candidate of candidates) {
		if (!candidate || !candidate.endsWith("npm-cli.js")) continue;
		try {
			await access(candidate);
			return path.resolve(candidate);
		} catch {
			/* Try the next Node installation. */
		}
	}
	return null;
}

/**
 * 剥掉继承自父进程 npm 的 `npm_config_*` / `npm_*` 环境变量。
 *
 * 应用通常由 `npm start` 启动，npm 会把项目 `.npmrc` 的设置转成环境变量注入子进程
 * （`min-release-age=2` → `npm_config_min_release_age=2`，`registry=...` → `npm_config_registry`）。
 * 这些是**项目依赖策略**，不是运行时更新该继承的东西：仓库里为了供应链安全设了
 * `min-release-age=2`，结果「安装刚发布的最新版 Pi」被子 npm 自己拒绝，报 ETARGET。
 *
 * 同时 `npm_config_prefix` 会把安装目标劫持到全局 prefix，所以一并清掉。
 */
function buildInstallEnv(): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = {};
	for (const [key, value] of Object.entries(process.env)) {
		const lower = key.toLowerCase();
		// npm_config_* 是 CLI flag 的环境变量形式；npm_* 是 npm 自己的运行时变量。
		// 两者都会影响安装行为，必须让子 npm 只认我们显式传的 CLI 参数。
		if (lower.startsWith("npm_config_") || lower.startsWith("npm_")) continue;
		env[key] = value;
	}
	env.ELECTRON_RUN_AS_NODE = "1";
	return env;
}

async function runNpmInstall(
	nodeExecutable: string,
	npmCliPath: string,
	stagingRoot: string,
	version: string,
): Promise<void> {
	const args = [
		npmCliPath,
		"install",
		"--prefix",
		stagingRoot,
		"--ignore-scripts",
		"--omit=dev",
		"--no-audit",
		"--no-fund",
		"--no-package-lock",
		"--no-save",
		// 与 requestRegistryLatest 同一个源，避免镜像同步延迟导致 ETARGET。
		`--registry=${REGISTRY_URL}`,
		// Pi 自身的自更新也带这个（packages/coding-agent/src/config.ts）：
		// 更新运行时就是在装刚发布的版本，不该被依赖年龄策略拦下。
		"--min-release-age=0",
		`${PACKAGE_NAME}@${version}`,
	];
	await new Promise<void>((resolve, reject) => {
		const child = spawn(nodeExecutable, args, {
			cwd: stagingRoot,
			env: buildInstallEnv(),
			stdio: ["ignore", "pipe", "pipe"],
		});
		// npm 的原始输出可能带 registry 凭据与本机 npm 配置，不直接进 UI。
		// 但完全丢弃会让失败无法诊断（曾把一个 ETARGET 报成「请检查 npm 网络与配置」），
		// 所以只提取 npm 的错误码，它不含凭据。
		let stderr = "";
		child.stdout.resume();
		child.stderr.on("data", (chunk: Buffer) => {
			if (stderr.length < STDERR_LIMIT) stderr = `${stderr}${chunk.toString("utf8")}`.slice(-STDERR_LIMIT);
		});
		const timer = setTimeout(() => {
			child.kill();
			reject(new Error("Pi 安装超时，原版本保持不变"));
		}, INSTALL_TIMEOUT_MS);
		child.once("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
		child.once("exit", (code) => {
			clearTimeout(timer);
			if (code === 0) resolve();
			else {
				const npmError = /^npm error code ([A-Z0-9_]+)$/m.exec(stderr)?.[1];
				reject(
					new Error(
						`Pi 安装失败（退出码 ${code}${npmError ? `，${npmError}` : ""}），原版本未变更。${
							npmError ? "" : "请检查 npm 网络与配置。"
						}`,
					),
				);
			}
		});
	});
}

export class PiRuntimeUpdater {
	private readonly root: string;
	private readonly versionsDir: string;
	private readonly activeFile: string;
	private readonly options: UpdaterOptions;
	private selected: InstalledPiRuntime | null = null;
	private selectedId: string | null = null;
	private history: RollbackEntry[] = [];
	private launched: InstalledPiRuntime | null = null;
	private latest: string | null = null;
	private warning: string | null = null;
	private npmCli: string | null = null;
	private installing = false;

	constructor(options: UpdaterOptions) {
		this.options = options;
		this.root = path.join(options.userDataPath, "pi-updates");
		this.versionsDir = path.join(this.root, "versions");
		this.activeFile = path.join(this.root, "active.json");
		parseVersion(options.bundledVersion);
	}

	async initialize(): Promise<void> {
		if (this.options.installPackage) this.npmCli = "test-installer";
		else {
			try {
				if (!this.options.npmCliPath) throw new Error("No bundled npm");
				await access(this.options.npmCliPath);
				this.npmCli = this.options.npmCliPath;
			} catch {
				this.npmCli = await findNpmCli();
			}
		}
		try {
			const raw = JSON.parse(await readFile(this.activeFile, "utf8")) as unknown;
			if (
				typeof raw !== "object" ||
				raw === null ||
				!("installId" in raw) ||
				!("version" in raw) ||
				typeof raw.installId !== "string" ||
				!INSTALL_ID_PATTERN.test(raw.installId)
			)
				throw new Error("无效的更新记录");
			this.selected = await this.validateInstallation(raw.installId, parseVersion(raw.version));
			this.selectedId = raw.installId;
			this.history = await this.loadHistory("history" in raw ? raw.history : undefined, this.selected.version);
		} catch (error) {
			if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) {
				this.selected = null;
				this.selectedId = null;
				this.history = [];
				this.warning = "已安装的 Pi 更新不可用，已回退至内置版本。";
			}
		}
		this.launched = this.selected;
	}

	getLaunchRuntime(): InstalledPiRuntime | null {
		return this.launched;
	}

	status(): PiRuntimeStatus {
		const currentVersion = this.selected?.version ?? this.options.bundledVersion;
		const rollbackTarget = this.history.at(-1);
		return {
			bundledVersion: this.options.bundledVersion,
			currentVersion,
			rollbackVersion: rollbackTarget
				? rollbackTarget.kind === "bundled"
					? this.options.bundledVersion
					: rollbackTarget.version
				: null,
			runningVersion: this.launched?.version ?? this.options.bundledVersion,
			latestVersion: this.latest,
			updateAvailable: this.latest !== null && compareVersions(this.latest, currentVersion) > 0,
			restartRequired: this.selected?.packageDir !== this.launched?.packageDir,
			npmAvailable: this.npmCli !== null,
			warning: this.warning,
		};
	}

	async checkLatest(): Promise<PiRuntimeStatus> {
		this.latest = await (this.options.requestLatest ?? requestRegistryLatest)();
		parseVersion(this.latest);
		return this.status();
	}

	async installLatest(expectedVersion?: string): Promise<PiRuntimeStatus> {
		if (this.installing) throw new Error("Pi 更新正在进行中");
		if (!this.npmCli)
			throw new Error("未找到 npm。请先安装 Node.js/npm，或使用包含新版 Pi 的 CodePIddy 客户端。当前版本未变更。");
		this.installing = true;
		let stagingRoot: string | null = null;
		try {
			const version = await (this.options.requestLatest ?? requestRegistryLatest)();
			parseVersion(version);
			if (expectedVersion && version !== parseVersion(expectedVersion))
				throw new Error("Pi 最新版本已变化，请重新检查并确认后更新");
			if (compareVersions(version, this.selected?.version ?? this.options.bundledVersion) <= 0) {
				this.latest = version;
				return this.status();
			}
			await mkdir(this.root, { recursive: true });
			const installId = `v${version}-${randomUUID()}`;
			stagingRoot = path.join(this.root, `staging-${randomUUID()}`);
			await mkdir(stagingRoot);
			if (this.options.installPackage) await this.options.installPackage(stagingRoot, version);
			else await runNpmInstall(this.options.nodeExecutable, this.npmCli, stagingRoot, version);
			const packageDir = path.join(stagingRoot, "node_modules", "@earendil-works", "pi-coding-agent");
			const runtime = { version, packageDir, cliPath: path.join(packageDir, "dist", "bundle", "cli.js") };
			await this.validatePackage(runtime);
			await this.options.probe(runtime, stagingRoot);
			await mkdir(this.versionsDir, { recursive: true });
			const destination = path.join(this.versionsDir, installId);
			this.assertStagingPath(stagingRoot);
			await rename(stagingRoot, destination);
			stagingRoot = null;
			const selected = await this.validateInstallation(installId, version);
			const previous: RollbackEntry =
				this.selected && this.selectedId
					? { kind: "installed", installId: this.selectedId, version: this.selected.version }
					: { kind: "bundled" };
			const history = [...this.history, previous];
			await this.writeActive({ installId, version, history });
			this.selected = selected;
			this.selectedId = installId;
			this.history = history;
			this.latest = version;
			this.warning = null;
			return this.status();
		} finally {
			if (stagingRoot) {
				this.assertStagingPath(stagingRoot);
				await rm(stagingRoot, { recursive: true, force: true });
			}
			this.installing = false;
		}
	}

	async fallbackAfterStartupFailure(): Promise<boolean> {
		if (!this.launched) return false;
		try {
			await this.rollback();
		} catch {
			await rm(this.activeFile, { force: true });
			this.selected = null;
			this.selectedId = null;
			this.history = [];
		}
		this.launched = this.selected;
		this.warning = `新版 Pi 无法启动，已自动回退到 v${this.status().currentVersion}。`;
		return true;
	}

	async rollback(): Promise<PiRuntimeStatus> {
		if (this.installing) throw new Error("Pi 更新进行中，请稍后重试");
		const previous = this.history[this.history.length - 1];
		if (!previous) {
			if (this.warning && !this.selected) {
				await rm(this.activeFile, { force: true });
				this.warning = null;
				return this.status();
			}
			throw new Error("没有可回退的 Pi 版本");
		}
		const history = this.history.slice(0, -1);
		if (previous.kind === "bundled") {
			await rm(this.activeFile, { force: true });
			this.selected = null;
			this.selectedId = null;
		} else {
			const selected = await this.validateInstallation(previous.installId, previous.version);
			await this.writeActive({ installId: previous.installId, version: previous.version, history });
			this.selected = selected;
			this.selectedId = previous.installId;
		}
		this.history = history;
		this.warning = null;
		return this.status();
	}

	private async loadHistory(raw: unknown, currentVersion: string): Promise<RollbackEntry[]> {
		// Records written before rolling rollback existed imply a single fallback to the bundled runtime.
		if (raw === undefined) return [{ kind: "bundled" }];
		if (!Array.isArray(raw) || raw.length === 0 || raw.length > 50) {
			this.warning = "Pi 回退记录无效，已将内置版本作为回退目标。";
			return [{ kind: "bundled" }];
		}
		const history: RollbackEntry[] = [];
		for (const value of raw) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
			if ("kind" in value && value.kind === "bundled") {
				if (history.length === 0) history.push({ kind: "bundled" });
				continue;
			}
			if (
				!("kind" in value) ||
				value.kind !== "installed" ||
				!("installId" in value) ||
				!("version" in value) ||
				typeof value.installId !== "string"
			)
				continue;
			try {
				const version = parseVersion(value.version);
				if (compareVersions(version, currentVersion) >= 0) continue;
				await this.validateInstallation(value.installId, version);
				history.push({ kind: "installed", installId: value.installId, version });
			} catch {
				/* A deleted or invalid older installation cannot be a rollback target. */
			}
		}
		if (history.length === 0) {
			this.warning = "以前的 Pi 回退版本不可用，已将内置版本作为回退目标。";
			return [{ kind: "bundled" }];
		}
		if (history.length !== raw.length) this.warning = "部分旧版 Pi 已不可用，已跳过这些回退记录。";
		return history;
	}

	private assertStagingPath(target: string): void {
		const relative = path.relative(this.root, path.resolve(target));
		if (!/^staging-[0-9a-f-]{36}$/.test(relative)) throw new Error("Pi 临时更新目录超出预期范围");
	}

	private async validatePackage(runtime: InstalledPiRuntime): Promise<void> {
		const manifest = JSON.parse(await readFile(path.join(runtime.packageDir, "package.json"), "utf8")) as unknown;
		if (
			typeof manifest !== "object" ||
			manifest === null ||
			!("name" in manifest) ||
			!("version" in manifest) ||
			manifest.name !== PACKAGE_NAME ||
			manifest.version !== runtime.version
		)
			throw new Error("下载的 Pi 包名称或版本不匹配");
		await access(runtime.cliPath);
		await access(path.join(runtime.packageDir, "dist", "index.js"));
		await access(path.join(runtime.packageDir, "dist", "core", "slash-commands.js"));
		await this.assertDependencyFile(runtime.packageDir, "@earendil-works/pi-agent-core", "dist/index.js");
		await this.assertDependencyFile(runtime.packageDir, "@earendil-works/pi-ai", "dist/compat.js");
		await this.assertDependencyFile(runtime.packageDir, "@earendil-works/pi-tui", "dist/index.js");
		await this.assertDependencyFile(runtime.packageDir, "@earendil-works/chord", "dist/index.js");
		await this.assertDependencyFile(runtime.packageDir, "quickjs-wasi", "quickjs.wasm");
		const [actualCli, actualPackage] = await Promise.all([realpath(runtime.cliPath), realpath(runtime.packageDir)]);
		if (!actualCli.startsWith(`${actualPackage}${path.sep}`)) throw new Error("Pi 可执行文件超出安装目录");
	}

	private async validateInstallation(installId: string, version: string): Promise<InstalledPiRuntime> {
		if (!INSTALL_ID_PATTERN.test(installId) || !installId.startsWith(`v${version}-`))
			throw new Error("Pi 更新记录无效");
		const root = path.join(this.versionsDir, installId);
		const packageDir = path.join(root, "node_modules", "@earendil-works", "pi-coding-agent");
		const actual = await realpath(packageDir);
		const expectedRoot = await realpath(root);
		if (!actual.startsWith(`${expectedRoot}${path.sep}`)) throw new Error("Pi 更新目录超出预期范围");
		const runtime = { version, packageDir, cliPath: path.join(packageDir, "dist", "bundle", "cli.js") };
		await this.validatePackage(runtime);
		return runtime;
	}

	private async assertDependencyFile(packageDir: string, packageName: string, relativePath: string): Promise<void> {
		const parts = packageName.split("/");
		const candidates = [
			path.join(packageDir, "node_modules", ...parts, relativePath),
			path.join(path.dirname(path.dirname(packageDir)), ...parts, relativePath),
		];
		for (const candidate of candidates) {
			try {
				await access(candidate);
				return;
			} catch {
				/* Try the next likely npm layout. */
			}
		}
		throw new Error(`Pi runtime dependency is incomplete: ${packageName}/${relativePath}`);
	}

	private async writeActive(value: ActiveRecord): Promise<void> {
		const temporary = `${this.activeFile}.${randomUUID()}`;
		await writeFile(temporary, `${JSON.stringify(value)}\n`, { encoding: "utf8", flag: "wx" });
		try {
			await rename(temporary, this.activeFile);
		} catch (error) {
			await rm(temporary, { force: true });
			throw error;
		}
	}
}
