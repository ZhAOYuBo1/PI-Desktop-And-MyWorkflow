/**
 * 重新生成 README 用的界面截图。
 *
 * 浏览器 demo（?demo=1）负责有完整演示数据的视图（会话 + 更改 diff、设置页）；
 * Electron + shot-pi-rpc 假实现负责需要真实 IPC 的视图（文件预览、内置终端）。
 * 项目目录、工作项和会话历史全部由脚本自己造，不依赖本机任何真实项目。
 *
 *   npm run build:codepiddy
 *   node --import tsx packages/codepiddy-desktop/scripts/capture-screenshots.mts
 *
 * 脚本会临时起一个 Vite（端口 5179）和一个 Electron 实例，结束时都会关掉。
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, chromium, type Page } from "@playwright/test";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(desktopRoot, "..", "..");
const outputDirectory = path.join(repositoryRoot, "docs", "images");
const fixture = path.join(scriptDirectory, "fixtures", "shot-pi-rpc.mjs");

const DEV_SERVER_PORT = 5179;
const DEV_SERVER_URL = `http://127.0.0.1:${DEV_SERVER_PORT}`;
const VIEWPORT = { width: 1600, height: 900 };

const SAMPLE_FILES: Array<[string, string]> = [
	["README.md", "# 登录服务\n\n支持账号密码登录，并为后续第三方登录预留扩展点。\n"],
	["package.json", '{\n  "name": "login-service",\n  "private": true\n}\n'],
	[
		"src/auth/login.ts",
		"export async function login(input: LoginInput) {\n  return authService.authenticate(input);\n}\n",
	],
	[
		"src/auth/session.ts",
		"export function issueSession(userId: string) {\n  return { userId, issuedAt: Date.now() };\n}\n",
	],
	[
		"src/auth/provider.ts",
		"export interface AuthProvider {\n  login(input: LoginInput): Promise<Session>;\n}\n",
	],
	["docs/api.md", "# API\n\n## POST /login\n\n请求体 `{ username, password }`。\n"],
];

async function waitForServer(url: string): Promise<void> {
	for (let attempt = 0; attempt < 80; attempt += 1) {
		try {
			const response = await fetch(url);
			if (response.ok) return;
		} catch {
			// 还没起来，继续等。
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`Vite dev server did not start at ${url}`);
}

/** 工作区面板启动默认收起，截图脚本显式打开。 */
async function ensureWorkPanelOpen(page: Page): Promise<void> {
	const openButton = page.getByRole("button", { name: "显示文件管理器" });
	if ((await openButton.count()) > 0) {
		await openButton.first().click();
		await page.waitForTimeout(300);
	}
}

async function dismissProjectTrustPrompt(page: Page): Promise<void> {
	const later = page.locator(".project-trust-modal").getByRole("button", { name: "稍后" });
	if ((await later.count()) > 0) {
		await later.first().click();
		await page.waitForTimeout(300);
	}
}

async function captureDemoViews(): Promise<void> {
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage({ viewport: VIEWPORT });
		await page.goto(`${DEV_SERVER_URL}/?demo=1`, { waitUntil: "networkidle" });
		await page.waitForTimeout(900);
		await dismissProjectTrustPrompt(page);
		await page.locator(".agent-row").filter({ hasText: "Coding Agent" }).first().click();
		await page.waitForTimeout(800);
		await ensureWorkPanelOpen(page);

		await page.locator(".work-panel-tab").filter({ hasText: "更改" }).first().click();
		await page.waitForTimeout(600);
		const firstChangeCard = page.locator(".change-stack-toggle").first();
		if ((await firstChangeCard.count()) > 0) {
			await firstChangeCard.click();
			await page.waitForTimeout(250);
		}
		await page.screenshot({ path: path.join(outputDirectory, "codepiddy-overview.png") });

		await page.getByRole("button", { name: "设置", exact: true }).first().click();
		await page.waitForTimeout(700);
		await page.screenshot({ path: path.join(outputDirectory, "codepiddy-settings.png") });
	} finally {
		await browser.close();
	}
}

async function captureElectronViews(): Promise<void> {
	const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "codepiddy-shots-"));
	const projectRoot = path.join(temporaryRoot, "login-service");
	const userDataRoot = path.join(temporaryRoot, "user-data");
	await Promise.all([mkdir(projectRoot, { recursive: true }), mkdir(userDataRoot)]);
	for (const [relative, content] of SAMPLE_FILES) {
		const target = path.join(projectRoot, ...relative.split("/"));
		await mkdir(path.dirname(target), { recursive: true });
		await writeFile(target, content, "utf8");
	}

	const app = await electron.launch({
		args: [desktopRoot],
		cwd: desktopRoot,
		env: {
			...process.env,
			CODEPIDDY_REPO_ROOT: repositoryRoot,
			CODEPIDDY_PI_CLI: fixture,
			CODEPIDDY_NODE_EXECUTABLE: process.execPath,
			CODEPIDDY_USER_DATA: userDataRoot,
			CODEPIDDY_TEST_PROJECT_ROOT: projectRoot,
			CODEPIDDY_DISABLE_SINGLE_INSTANCE: "1",
			CODEPIDDY_DISABLE_PROJECT_DISCOVERY: "1",
		},
	});
	try {
		const page = await app.firstWindow();
		await page.waitForLoadState("domcontentloaded");
		await app.evaluate(({ BrowserWindow }, size) => {
			BrowserWindow.getAllWindows()[0]?.setSize(size.width, size.height);
		}, VIEWPORT);

		await page.getByRole("button", { name: "打开项目", exact: true }).click();
		await dismissProjectTrustPrompt(page);
		await page.getByRole("button", { name: "创建新需求" }).click();
		await page.getByLabel("标题", { exact: true }).fill("增加登录功能");
		await page.getByLabel("初始描述").fill("支持账号密码登录，并为后续第三方登录预留扩展点。");
		await page.getByRole("button", { name: "创建", exact: true }).click();
		const workItem = page.locator(".work-item-row").filter({ hasText: "FEAT-001" });
		await workItem.waitFor();
		const codingRow = page.locator(".agent-row").filter({ hasText: "Coding Agent" }).first();
		if (!(await codingRow.isVisible())) {
			await workItem.locator(".chevron-button").click();
			await codingRow.waitFor();
		}
		await codingRow.click();
		const createAgent = page.getByRole("button", { name: "创建 Agent" });
		if (await createAgent.isVisible()) await createAgent.click();
		await page.locator(".composer textarea").waitFor();
		await page.waitForTimeout(1500);
		await ensureWorkPanelOpen(page);

		const fileRow = page.locator(".file-tree-row").filter({ hasText: "README.md" }).first();
		if ((await fileRow.count()) > 0 && (await fileRow.isVisible())) {
			await fileRow.click();
			await page.waitForTimeout(700);
		}
		await page.screenshot({ path: path.join(outputDirectory, "codepiddy-files.png") });

		await page.locator(".work-panel-tab").filter({ hasText: "终端" }).first().click();
		await page.locator(".terminal-host .xterm").waitFor();
		await page.waitForTimeout(3000);
		await page.locator(".xterm-helper-textarea").focus();
		await page.keyboard.type("Get-ChildItem");
		await page.keyboard.press("Enter");
		await page.waitForTimeout(1600);
		await page.screenshot({ path: path.join(outputDirectory, "codepiddy-terminal.png") });
	} finally {
		await app.close().catch(() => undefined);
		await rm(temporaryRoot, { recursive: true, force: true });
	}
}

async function main(): Promise<void> {
	await mkdir(outputDirectory, { recursive: true });
	let vite: ChildProcess | null = null;
	try {
		vite = spawn(
			process.execPath,
			[
				path.join(repositoryRoot, "node_modules", "vite", "bin", "vite.js"),
				"--host",
				"127.0.0.1",
				"--port",
				String(DEV_SERVER_PORT),
			],
			{
			cwd: desktopRoot,
			stdio: "ignore",
			},
		);
		await waitForServer(`${DEV_SERVER_URL}/?demo=1`);
		await captureDemoViews();
	} finally {
		vite?.kill();
	}
	await captureElectronViews();
	console.log(`screenshots written to ${outputDirectory}`);
}

await main();
