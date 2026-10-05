import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import type { AgentImageAttachment } from "@codepiddy/shared";

interface PendingRequest {
	resolve(value: Record<string, unknown>): void;
	reject(error: Error): void;
	timer: NodeJS.Timeout;
}

const STDERR_LIMIT = 64 * 1024;

export function rpcRequestTimeoutMs(commandType: string): number {
	if (commandType === "compact") return 10 * 60_000;
	if (commandType === "abort") return 2 * 60_000;
	if (commandType === "prompt") return 90_000;
	if (commandType === "new_session" || commandType === "clone" || commandType === "export_html") {
		return 2 * 60_000;
	}
	if (commandType.startsWith("get_") || commandType === "set_model" || commandType === "set_thinking_level") {
		return 30_000;
	}
	return 60_000;
}

export interface PiRpcProcessOptions {
	command: string;
	args: string[];
	cwd: string;
	env?: NodeJS.ProcessEnv;
}

export class PiRpcProcess {
	private readonly options: PiRpcProcessOptions;
	private child: ChildProcessWithoutNullStreams | null = null;
	private readonly listeners = new Set<(event: Record<string, unknown>) => void>();
	private readonly pending = new Map<string, PendingRequest>();
	private requestId = 0;
	private stderr = "";
	private stopping = false;

	constructor(options: PiRpcProcessOptions) {
		this.options = options;
	}

	async start(): Promise<void> {
		if (this.child) return;
		this.stderr = "";
		this.stopping = false;
		const child = spawn(this.options.command, this.options.args, {
			cwd: this.options.cwd,
			env: { ...process.env, ...this.options.env },
			stdio: ["pipe", "pipe", "pipe"],
		});
		this.child = child;
		child.stderr.on("data", (chunk: Buffer) => {
			this.stderr = `${this.stderr}${chunk.toString("utf8")}`.slice(-STDERR_LIMIT);
		});
		const decoder = new StringDecoder("utf8");
		let buffer = "";
		child.stdout.on("data", (chunk: Buffer) => {
			buffer += decoder.write(chunk);
			let newline = buffer.indexOf("\n");
			while (newline !== -1) {
				const line = buffer.slice(0, newline);
				buffer = buffer.slice(newline + 1);
				this.handleLine(line);
				newline = buffer.indexOf("\n");
			}
		});
		child.once("exit", (code, signal) => {
			if (this.child !== child) return;
			const expected = this.stopping;
			const error = new Error(
				expected
					? "Pi RPC process stopped."
					: `Pi RPC exited (code=${code} signal=${signal}). ${this.stderr.slice(-4096)}`,
			);
			this.rejectPending(error);
			this.child = null;
			this.emit({ type: "process_exit", code, signal, expected, error: error.message });
		});
		child.once("error", (error) => {
			this.rejectPending(error);
			this.emit({ type: "process_error", expected: this.stopping, error: error.message });
		});
		await new Promise((resolve) => setTimeout(resolve, 100));
		if (child.exitCode !== null) throw new Error(`Pi RPC failed to start. ${this.stderr.slice(-4096)}`);
		try {
			await this.send({ type: "get_state" }, 90_000);
		} catch (error) {
			await this.stop().catch(() => undefined);
			throw new Error(`Pi RPC startup handshake failed. ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	get isRunning(): boolean {
		return this.child !== null && this.child.exitCode === null && !this.child.killed;
	}

	onEvent(listener: (event: Record<string, unknown>) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	async getState(): Promise<Record<string, unknown>> {
		return this.send({ type: "get_state" });
	}

	async cloneCurrentSession(): Promise<void> {
		await this.send({ type: "clone" });
	}

	async switchSession(sessionPath: string): Promise<{ cancelled: boolean }> {
		const response = await this.send({ type: "switch_session", sessionPath });
		const data = response.data;
		return {
			cancelled:
				typeof data !== "object" ||
				data === null ||
				Array.isArray(data) ||
				(data as Record<string, unknown>).cancelled !== false,
		};
	}

	async getSessionTree(): Promise<{ tree: unknown[]; leafId: string | null }> {
		const response = await this.send({ type: "get_tree" });
		const data = response.data;
		if (typeof data !== "object" || data === null || Array.isArray(data)) return { tree: [], leafId: null };
		const record = data as Record<string, unknown>;
		return {
			tree: Array.isArray(record.tree) ? record.tree : [],
			leafId: typeof record.leafId === "string" ? record.leafId : null,
		};
	}

	async getForkMessages(): Promise<Array<{ entryId: string; text: string }>> {
		const response = await this.send({ type: "get_fork_messages" });
		const data = response.data;
		if (typeof data !== "object" || data === null || Array.isArray(data)) return [];
		const messages = (data as Record<string, unknown>).messages;
		if (!Array.isArray(messages)) return [];
		return messages.flatMap((message) => {
			if (typeof message !== "object" || message === null || Array.isArray(message)) return [];
			const record = message as Record<string, unknown>;
			return typeof record.entryId === "string" && typeof record.text === "string"
				? [{ entryId: record.entryId, text: record.text }]
				: [];
		});
	}

	async forkAt(entryId: string): Promise<{ text: string; cancelled: boolean }> {
		const response = await this.send({ type: "fork", entryId });
		const data = response.data;
		if (typeof data !== "object" || data === null || Array.isArray(data)) return { text: "", cancelled: true };
		const record = data as Record<string, unknown>;
		return {
			text: typeof record.text === "string" ? record.text : "",
			cancelled: record.cancelled !== false,
		};
	}

	async getCommands(): Promise<
		Array<{
			name: string;
			description: string;
			argumentHint?: string;
			source: "builtin" | "extension" | "prompt" | "skill";
		}>
	> {
		const response = await this.send({ type: "get_commands" });
		const data = response.data;
		if (typeof data !== "object" || data === null || Array.isArray(data)) return [];
		const commands = (data as Record<string, unknown>).commands;
		if (!Array.isArray(commands)) return [];
		return commands.flatMap((command) => {
			if (typeof command !== "object" || command === null || Array.isArray(command)) return [];
			const record = command as Record<string, unknown>;
			if (typeof record.name !== "string") return [];
			const source = record.source;
			if (source !== "builtin" && source !== "extension" && source !== "prompt" && source !== "skill") return [];
			return [
				{
					name: record.name,
					description: typeof record.description === "string" ? record.description : "",
					...(typeof record.argumentHint === "string" ? { argumentHint: record.argumentHint } : {}),
					source,
				},
			];
		});
	}

	async getAvailableModels(): Promise<unknown[]> {
		const response = await this.send({ type: "get_available_models" });
		const data = response.data as Record<string, unknown> | undefined;
		return Array.isArray(data?.models) ? data.models : [];
	}

	async getAvailableThinkingLevels(): Promise<string[]> {
		const response = await this.send({ type: "get_available_thinking_levels" });
		const data = response.data as Record<string, unknown> | undefined;
		return Array.isArray(data?.levels)
			? data.levels.filter((level): level is string => typeof level === "string")
			: [];
	}

	async setModel(provider: string, modelId: string): Promise<void> {
		await this.send({ type: "set_model", provider, modelId });
	}

	async setThinkingLevel(level: string): Promise<void> {
		await this.send({ type: "set_thinking_level", level });
	}

	async getMessages(): Promise<unknown[]> {
		const response = await this.send({ type: "get_messages" });
		const data = response.data;
		if (typeof data !== "object" || data === null || Array.isArray(data)) return [];
		const record = data as Record<string, unknown>;
		return Array.isArray(record.messages) ? record.messages : [];
	}

	/**
	 * 完整会话条目（SessionManager.getEntries），包含压缩前的历史。
	 * getMessages 返回的是压缩后的 LLM 上下文，压缩后前缀会消失，不能用于
	 * 界面历史展示。参考项目 PI-Desktop 用的也是 SessionManager 条目。
	 */
	async getEntries(): Promise<unknown[]> {
		const response = await this.send({ type: "get_entries" });
		const data = response.data;
		if (typeof data !== "object" || data === null || Array.isArray(data)) return [];
		const record = data as Record<string, unknown>;
		return Array.isArray(record.entries) ? record.entries : [];
	}

	async getSessionStats(): Promise<Record<string, unknown>> {
		const response = await this.send({ type: "get_session_stats" });
		const data = response.data;
		return typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
	}

	async bash(command: string): Promise<Record<string, unknown>> {
		return this.send({ type: "bash", command });
	}

	async prompt(
		message: string,
		streamingBehavior?: "steer" | "followUp",
		images?: AgentImageAttachment[],
	): Promise<void> {
		await this.send({
			type: "prompt",
			message,
			...(images?.length
				? { images: images.map((image) => ({ type: "image", data: image.data, mimeType: image.mimeType })) }
				: {}),
			...(streamingBehavior ? { streamingBehavior } : {}),
		});
	}

	async respondToExtensionUi(response: {
		id: string;
		value?: string;
		confirmed?: boolean;
		cancelled?: true;
	}): Promise<void> {
		this.write({ type: "extension_ui_response", ...response });
	}

	async abort(): Promise<void> {
		await this.send({ type: "abort" });
	}

	async compact(customInstructions?: string): Promise<void> {
		await this.send({ type: "compact", ...(customInstructions ? { customInstructions } : {}) });
	}

	async getLastAssistantText(): Promise<string | null> {
		const response = await this.send({ type: "get_last_assistant_text" });
		const data = response.data;
		if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
		return typeof (data as Record<string, unknown>).text === "string"
			? ((data as Record<string, unknown>).text as string)
			: null;
	}

	async setSessionName(name: string): Promise<void> {
		await this.send({ type: "set_session_name", name });
	}

	async newSession(): Promise<{ cancelled: boolean }> {
		const response = await this.send({ type: "new_session" });
		const data = response.data;
		return {
			cancelled:
				typeof data !== "object" ||
				data === null ||
				Array.isArray(data) ||
				(data as Record<string, unknown>).cancelled !== false,
		};
	}

	async exportHtml(outputPath?: string): Promise<string> {
		const response = await this.send({ type: "export_html", ...(outputPath ? { outputPath } : {}) });
		const data = response.data;
		if (typeof data !== "object" || data === null || Array.isArray(data))
			throw new Error("Pi did not return an export path");
		const exportedPath = (data as Record<string, unknown>).path;
		if (typeof exportedPath !== "string") throw new Error("Pi did not return an export path");
		return exportedPath;
	}

	async stop(): Promise<void> {
		const child = this.child;
		if (!child) return;
		this.stopping = true;
		child.kill("SIGTERM");
		await new Promise<void>((resolve) => {
			const timer = setTimeout(() => {
				child.kill("SIGKILL");
				resolve();
			}, 1500);
			child.once("exit", () => {
				clearTimeout(timer);
				resolve();
			});
		});
		this.rejectPending(new Error("Pi RPC process stopped."));
		if (this.child === child) this.child = null;
	}

	private write(command: Record<string, unknown>): void {
		const child = this.child;
		if (!child || child.stdin.destroyed || !child.stdin.writable) throw new Error("Pi RPC process is not available");
		child.stdin.write(`${JSON.stringify(command)}\n`);
	}

	private async send(command: Record<string, unknown>, timeoutOverride?: number): Promise<Record<string, unknown>> {
		const child = this.child;
		if (!child || child.stdin.destroyed || !child.stdin.writable) throw new Error("Pi RPC process is not available");
		const id = `codepiddy_${++this.requestId}`;
		const commandType = typeof command.type === "string" ? command.type : "unknown";
		const timeoutMs = timeoutOverride ?? rpcRequestTimeoutMs(commandType);
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				const error = new Error(
					`Timed out waiting for Pi RPC response to ${commandType} after ${Math.round(timeoutMs / 1000)}s. ${this.stderr.slice(-4096)}`,
				);
				this.emit({
					type: "rpc_timeout",
					command: commandType,
					timeoutMs,
					pendingRequestCount: this.pending.size,
					error: error.message,
				});
				reject(error);
			}, timeoutMs);
			this.pending.set(id, { resolve, reject, timer });
			child.stdin.write(`${JSON.stringify({ ...command, id })}\n`);
		});
	}

	private rejectPending(error: Error): void {
		for (const request of this.pending.values()) {
			clearTimeout(request.timer);
			request.reject(error);
		}
		this.pending.clear();
	}

	private handleLine(line: string): void {
		if (!line.trim()) return;
		let value: unknown;
		try {
			value = JSON.parse(line) as unknown;
		} catch {
			return;
		}
		if (typeof value !== "object" || value === null || Array.isArray(value)) return;
		const event = value as Record<string, unknown>;
		if (event.type === "response" && typeof event.id === "string") {
			const request = this.pending.get(event.id);
			if (request) {
				clearTimeout(request.timer);
				this.pending.delete(event.id);
				if (event.success === false)
					request.reject(new Error(typeof event.error === "string" ? event.error : "Pi RPC error"));
				else request.resolve(event);
			}
			return;
		}
		this.emit(event);
	}

	private emit(event: Record<string, unknown>): void {
		for (const listener of this.listeners) listener(event);
	}
}
