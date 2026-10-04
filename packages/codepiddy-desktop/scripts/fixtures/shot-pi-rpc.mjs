/**
 * 截图专用的 Pi RPC 假实现：给 get_messages 返回一段固定的多轮历史（含工具调用与代码块），
 * 让 README 截图内容稳定可复现。其余命令够用即可，不做 e2e 断言。
 */
import readline from "node:readline";

const BASE = Date.parse("2026-09-17T09:30:00.000Z");
const model = { provider: "openai", id: "gpt-5.5", name: "GPT-5.5", reasoning: true, contextWindow: 400000 };

const messages = [
	{ role: "user", content: [{ type: "text", text: "按照交接文档实现登录功能，并给出关键修改。" }], timestamp: BASE },
	{
		role: "assistant",
		content: [{ type: "toolCall", id: "shot-read-1", name: "read", arguments: { path: "src/auth/login.ts" } }],
		timestamp: BASE + 4_000,
	},
	{
		role: "toolResult",
		toolCallId: "shot-read-1",
		toolName: "read",
		content: [
			{
				type: "text",
				text: "1  export async function login(input: LoginInput) {\n2    return authService.authenticate(input);\n3  }\n",
			},
		],
		isError: false,
		timestamp: BASE + 11_000,
	},
	{
		role: "assistant",
		content: [
			{ type: "text", text: "已完成核心实现：" },
			{
				type: "text",
				text: [
					"```ts",
					"export async function login(input: LoginInput) {",
					"  const user = await userStore.findByName(input.username);",
					"  if (!user) throw new AuthError('账号不存在');",
					"  return sessionStore.issue(await authService.verify(user, input.password));",
					"}",
					"```",
				].join("\n"),
			},
			{
				type: "text",
				text: "同时在 `routes` 注册了 `/login` 入口，第三方登录扩展点留在 `AuthProvider` 接口。",
			},
		],
		api: "openai-responses",
		provider: "openai",
		model: "gpt-5.5",
		stopReason: "stop",
		usage: { input: 12480, output: 612, cacheRead: 0, cacheWrite: 0, cost: { total: 0.041 } },
		timestamp: BASE + 38_000,
	},
];

function output(value) {
	process.stdout.write(`${JSON.stringify(value)}\n`);
}

function reply(command, id, data) {
	output({ type: "response", command, success: true, ...(id ? { id } : {}), ...(data === undefined ? {} : { data }) });
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
	let command;
	try {
		command = JSON.parse(line);
	} catch {
		return;
	}
	const id = command.id;
	switch (command.type) {
		case "get_state":
			reply("get_state", id, {
				sessionId: "shot-session",
				sessionName: "Coding Agent",
				sessionFile: "shot-session.jsonl",
				messageCount: messages.length,
				pendingMessageCount: 0,
				isStreaming: false,
				isCompacting: false,
				model,
				thinkingLevel: "medium",
			});
			break;
		case "get_messages":
			reply("get_messages", id, { messages });
			break;
		case "get_available_models":
			reply("get_available_models", id, { models: [model] });
			break;
		case "get_available_thinking_levels":
			reply("get_available_thinking_levels", id, { levels: ["off", "low", "medium", "high"] });
			break;
		case "get_commands":
			reply("get_commands", id, { commands: [] });
			break;
		case "get_session_stats":
			reply("get_session_stats", id, {
				sessionId: "shot-session",
				sessionFile: "shot-session.jsonl",
				userMessages: 1,
				assistantMessages: 2,
				toolCalls: 1,
				toolResults: 1,
				totalMessages: messages.length,
				tokens: { input: 12480, output: 612, cacheRead: 0, cacheWrite: 0, total: 13092 },
				cost: 0.041,
				contextUsage: { tokens: 13092, contextWindow: 400000, percent: 3.273 },
			});
			break;
		case "get_tree":
			reply("get_tree", id, { tree: [], leafId: null });
			break;
		case "get_fork_messages":
			reply("get_fork_messages", id, { messages: [] });
			break;
		case "switch_session":
		case "new_session":
		case "clone":
			reply(command.type, id, { cancelled: false });
			break;
		default:
			reply(command.type, id, {});
	}
});
