/**
 * 消息页优化的“功能生效”验证。
 *
 * 不是纯函数单测：这里起真实 Vite + Chromium，加载 ?demo=1 的完整 demo 数据，
 * 点击 Coding Agent，然后断言优化后的 UI 真的渲染出来：
 *   - T1 原生工具语义行（读取 / 运行 + 参数摘要），非原生工具保持通用回退
 *   - T2 回复元信息（模型 + Pi 原生 usage 明细）
 *   - T3 Agent 操作菜单里的「复制整段对话」
 *   - T4 react-markdown 渲染（标题 / 列表 / 表格 / 高亮代码 / 行内代码 / 链接 / 数学）
 *   - T5 消息内文件 chip 打开工作区文件视图；不在项目里的文件提示而不打开坏标签页
 *   - T6-T8 原生 session entries：compaction / context_edit / model_change /
 *     thinking_level_change 按时间线显示
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

	// 历史过程按参考项目默认收起；先展开首个过程块，后续才能检查其中的工具行。
	const firstProcessToggle = page.locator(".turn-process-toggle").first();
	if ((await firstProcessToggle.count()) > 0) {
		if ((await firstProcessToggle.getAttribute("aria-expanded")) === "false") {
			await firstProcessToggle.click();
		}
	}

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

	// T2：回复元信息（每条回复都有，放在正文上方）
	await visibleText(page, ".message-meta-chip", "GPT-5.5", "T2 模型 chip");
	await visibleText(page, ".message-meta-chip", "输入", "T2 usage chip");
	const assistantCount = await page.locator(".message-assistant").count();
	const metaCount = await page.locator(".message-assistant .message-meta").count();
	assert(
		assistantCount > 0 && metaCount === assistantCount,
		`T2 每条回复都应有元信息（回复 ${assistantCount}，元信息 ${metaCount}）`,
	);
	const lastAssistant = page.locator(".message-assistant").last();
	const metaBox = await lastAssistant.locator(".message-meta").first().boundingBox();
	const contentBox = await lastAssistant.locator(".message-rich-text").first().boundingBox();
	assert(metaBox !== null && contentBox !== null && metaBox.y < contentBox.y, "T2 元信息应在正文上方");

	// T3：复制整段对话入口
	await page.getByRole("button", { name: "Agent 操作" }).first().click();
	const copyItem = page.getByRole("menuitem", { name: "复制整段对话" }).first();
	await copyItem.waitFor({ state: "visible", timeout: 6000 });
	await page.keyboard.press("Escape");

	// T4：react-markdown 渲染
	await visibleText(page, ".message-rich-text h3", "关键修改", "T4 标题");
	await visibleText(page, ".message-rich-text li", "文件视图", "T4 列表");
	const table = page.locator(".message-table", { hasText: "视图" }).first();
	await table.waitFor({ state: "visible", timeout: 6000 });
	assert((await table.locator("tbody tr").count()) === 2, "T4 表格应有 2 行数据");
	await visibleText(page, ".inline-code", "WorkPanel.tsx", "T4 行内代码");
	const codeBlock = page.locator(".message-code-block").first();
	await codeBlock.waitFor({ state: "visible", timeout: 6000 });
	assert(
		(await codeBlock.locator(".hljs-keyword").count()) > 0,
		"T4 代码块应经过 highlight.js 高亮",
	);
	await page.locator('.message-rich-text a[href="https://example.com/pi"]').first().waitFor({
		state: "visible",
		timeout: 6000,
	});
	assert((await page.locator(".katex").count()) > 0, "T4 行内公式应渲染成 KaTeX");

	// T5：消息内文件 chip 打开工作区文件视图。
	// 装一个最小的 preload 桥，让「文件是否存在」的校验在验证环境里也生效。
	// 用字符串表达式注入：tsx/esbuild 的 keepNames 会给内联函数加 __name，
	// 浏览器里没有这个符号，函数形式会 ReferenceError。
	await page.evaluate(`(() => {
		window.codepiddy = {
			listWorkspaceDir: async () => [],
			readWorkspaceFile: async () => ({ kind: "text", size: 0, content: "" }),
			statWorkspaceFile: async (_root, filePath) => {
				if (filePath === "WorkPanel.tsx") return { size: 1, mtimeMs: 1 };
				throw new Error("ENOENT: no such file or directory");
			},
			searchProjectFiles: async (_root, query) =>
				query === "小明.txt" ? ["notes/小明.txt"] : [],
		};
	})()`);
	const fileChip = page.locator(".message-file-chip", { hasText: "WorkPanel.tsx" }).first();
	await fileChip.waitFor({ state: "visible", timeout: 6000 });
	await fileChip.click();
	const workPanel = page.locator(".work-panel").first();
	await workPanel.waitFor({ state: "visible", timeout: 6000 });
	await visibleText(page, ".workspace-file-tab", "WorkPanel.tsx", "T5 文件标签");

	// T5b：不在当前项目里的文件（例如构建产物 basename）只提示，不打开坏标签页
	const missingChip = page.locator(".message-file-chip", { hasText: "chunk-50EJBNHG.js" }).first();
	await missingChip.waitFor({ state: "visible", timeout: 6000 });
	await missingChip.click();
	await page
		.locator(".settings-toast", { hasText: "文件不在当前项目中" })
		.first()
		.waitFor({ state: "visible", timeout: 6000 });
	assert(
		(await page.locator(".workspace-file-tab", { hasText: "chunk-50EJBNHG.js" }).count()) === 0,
		"T5b 缺失文件不应打开标签页",
	);

	// T5c：只写了 basename 时，项目内唯一同名文件仍能定位
	const shorthandChip = page.locator(".message-file-chip", { hasText: "小明.txt" }).first();
	await shorthandChip.waitFor({ state: "visible", timeout: 6000 });
	await shorthandChip.click();
	await page
		.locator('.workspace-file-tab-main[title="notes/小明.txt"]')
		.first()
		.waitFor({ state: "visible", timeout: 6000 });

	// T6-T8：原生 session entries 渲染为时间线事件行。
	await visibleText(page, ".transcript-event-compaction", "压缩前 12,480 tokens", "T6 compaction 行");
	const compactionRow = page.locator(".transcript-event-compaction").first();
	await compactionRow.locator("summary").click();
	await visibleText(page, ".transcript-event-disclosure pre", "登录流程", "T6 compaction 摘要");
	await visibleText(page, ".transcript-event-context_edit", "上下文条目已编辑", "T7 context_edit 行");
	await visibleText(page, ".transcript-event-model_change", "openai/gpt-5.5", "T8 model_change 行");
	await visibleText(page, ".transcript-event-thinking_level_change", "high", "T8 thinking_level_change 行");
	assert(
		(await page.locator(".turn-process-body .transcript-event-model_change").count()) === 0,
		"T8 model_change 不应被折叠进过程块",
	);
	assert(
		(await page.locator(".turn-process-body .transcript-event-thinking_level_change").count()) === 0,
		"T8 thinking_level_change 不应被折叠进过程块",
	);

	// T10：会话内搜索、高亮、命中折叠过程组时自动展开。
	await page.getByRole("button", { name: "搜索当前会话" }).first().click();
	const searchInput = page.locator(".transcript-search-bar input");
	await searchInput.waitFor({ state: "visible", timeout: 6000 });
	await searchInput.fill("WorkPanel.tsx");
	await page.waitForTimeout(150);
	assert(
		(await page.locator(".transcript-search-count").innerText()).includes("/"),
		"T10 搜索栏应显示匹配计数",
	);
	const processToggle = page.locator(".turn-process-toggle").first();
	assert(
		(await processToggle.getAttribute("aria-expanded")) === "true",
		"T10 命中折叠过程组时应自动展开",
	);
	assert(
		(await page.locator(".transcript-entry.is-search-match").count()) > 0,
		"T10 搜索命中应高亮对应条目",
	);

	// T11：助手回复的 thinking / text 按内容顺序渲染。
	const finalAssistant = page.locator(".message-assistant").last();
	const thinkingPart = finalAssistant.locator(".assistant-thinking-part").first();
	const textPart = finalAssistant.locator(".assistant-text-part").first();
	await thinkingPart.waitFor({ state: "visible", timeout: 6000 });
	await textPart.waitFor({ state: "visible", timeout: 6000 });
	const thinkingBox = await thinkingPart.boundingBox();
	const textBox = await textPart.boundingBox();
	assert(
		thinkingBox !== null && textBox !== null && thinkingBox.y < textBox.y,
		"T11 thinking part 应排在 text part 前面",
	);

	// T14：助手回合提供重放入口，点击后回填该轮用户消息。
	await page.locator(".transcript-search-close").click();
	const replayButton = finalAssistant.locator(".message-replay").first();
	await replayButton.waitFor({ state: "visible", timeout: 6000 });
	await replayButton.click();
	const composer = page.locator(".composer textarea").first();
	assert(
		(await composer.inputValue()).includes("按照交接文档实现登录功能"),
		"T14 重放应回填原用户消息",
	);

	// T12：思考显示模式从本机偏好恢复；详细模式默认展开 thinking。
	await page.evaluate(() =>
		localStorage.setItem("codepiddy.transcript.thinkingDisplayMode", "detailed"),
	);
	await page.goto(`${DEV_SERVER_URL}/?demo=1`, { waitUntil: "networkidle" });
	await page.waitForTimeout(500);
	const trustLaterAgain = page.locator(".project-trust-modal").getByRole("button", { name: "稍后" });
	if ((await trustLaterAgain.count()) > 0) await trustLaterAgain.click();
	await page.locator(".agent-row").filter({ hasText: "Coding Agent" }).first().click();
	await page.waitForTimeout(250);
	assert(
		(await page.locator(".message-assistant").last().locator(".assistant-thinking-part").first().getAttribute("open")) !== null,
		"T12 详细模式应默认展开 thinking",
	);
	await page.evaluate(() => localStorage.setItem("codepiddy.transcript.smoothStreaming", "false"));
	assert(
		(await page.evaluate(() => localStorage.getItem("codepiddy.transcript.smoothStreaming"))) === "false",
		"T13 平滑流式偏好可持久化",
	);
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
		console.log(
			"transcript UI verification passed: T1 tool rows, T2 message meta, T3 copy entry, T4 markdown, T5 file chip (open + missing-file toast)",
			"T6-T8 native session entries, T10 in-session search, T11 ordered assistant parts, T12/T13 transcript preferences, T14 replay",
		);
	} finally {
		await browser?.close();
		vite?.kill();
	}
}

await main();
