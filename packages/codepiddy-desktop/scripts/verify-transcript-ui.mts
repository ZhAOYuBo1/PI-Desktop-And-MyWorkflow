/**
 * 消息页优化的“功能生效”验证。
 *
 * 不是纯函数单测：这里起真实 Vite + Chromium，加载 ?demo=1 的完整 demo 数据，
 * 点击 Coding Agent，然后断言优化后的 UI 真的渲染出来：
 *   - T1 原生工具语义行（读取 / 运行 + 参数摘要），非原生工具保持通用回退
 *   - T2 回复元信息（模型 + Pi 原生 usage 明细）
 *   - T3 Agent 操作菜单里的「复制整段对话」
 *
 *   node --import tsx packages/codepiddy-desktop/scripts/verify-transcript-ui.mts
 */
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "@playwright/test";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(desktopRoot, "..", "..");
const PORT = 5181;
const DEV_SERVER_URL = `http://127.0.0.1:${PORT}`;
const VIEWPORT = { width: 1600, height: 900 };

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

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

async function visibleText(page: Page, selector: string, text: string, label: string): Promise<void> {
	const locator = page.locator(selector, { hasText: text }).first();
	await locator.waitFor({ state: "visible", timeout: 6000 });
	assert((await locator.count()) > 0, `${label}: 没有找到「${text}」`);
}

async function verifyTranscriptUi(page: Page): Promise<void> {
	await page.goto(`${DEV_SERVER_URL}/?demo=1`, { waitUntil: "networkidle" });
	await page.waitForTimeout(700);
	// demo 首屏会弹项目信任弹窗；先点「稍后」，避免它拦截点击。
	const trustLater = page.locator(".project-trust-modal").getByRole("button", { name: "稍后" });
	if ((await trustLater.count()) > 0) {
		await trustLater.click();
		await page.waitForTimeout(300);
	}
	await page.locator(".agent-row").filter({ hasText: "Coding Agent" }).first().click();
	await page.waitForTimeout(700);

	// T1：原生工具语义行
	await visibleText(page, ".tool-action", "读取", "T1 read 动作");
	await visibleText(page, ".tool-summary-text", "WorkPanel.tsx", "T1 read 摘要");
	await visibleText(page, ".tool-action", "运行", "T1 bash 动作");
	await visibleText(page, ".tool-summary-text", "npm run check", "T1 bash 摘要");

	// 非原生工具（codemode）保持通用回退：不显示原生摘要行
	const codemodeRow = page.locator(".tool-block", { hasText: "codemode" }).first();
	await codemodeRow.waitFor({ state: "visible", timeout: 6000 });
	assert(
		(await codemodeRow.locator(".tool-summary-text").count()) === 0,
		"T1 codemode 不应出现原生工具摘要",
	);

	// T2：回复元信息
	await visibleText(page, ".message-meta-chip", "GPT-5.5", "T2 模型 chip");
	await visibleText(page, ".message-meta-chip", "输入", "T2 usage chip");

	// T3：复制整段对话入口
	await page.getByRole("button", { name: "Agent 操作" }).first().click();
	const copyItem = page.getByRole("menuitem", { name: "复制整段对话" }).first();
	await copyItem.waitFor({ state: "visible", timeout: 6000 });
}

async function main(): Promise<void> {
	let vite: ChildProcess | null = null;
	let browser: Browser | null = null;
	try {
		vite = spawn(
			process.execPath,
			[
				path.join(repositoryRoot, "node_modules", "vite", "bin", "vite.js"),
				"--host",
				"127.0.0.1",
				"--port",
				String(PORT),
			],
			{ cwd: desktopRoot, stdio: "ignore" },
		);
		await waitForServer(`${DEV_SERVER_URL}/?demo=1`);
		browser = await chromium.launch();
		const page = await browser.newPage({ viewport: VIEWPORT });
		await verifyTranscriptUi(page);
		console.log("transcript UI verification passed: T1 tool rows, T2 message meta, T3 copy entry");
	} finally {
		await browser?.close();
		vite?.kill();
	}
}

await main();
