import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type {
	HuggingFaceModelDetails,
	HuggingFaceModelSummary,
	HuggingFaceQuantization,
	LlamaCppConfigStatus,
	LlamaCppModelStatus,
	LlamaCppModelSummary,
	LlamaCppRuntimeStatus,
	RunLlamaCppActionInput,
	SaveLlamaCppConfigInput,
} from "@codepiddy/shared";

const LLAMA_CPP_PROVIDER_ID = "llama.cpp";
const DEFAULT_LLAMA_CPP_SERVER_URL = "http://127.0.0.1:8080";
const DEFAULT_HUGGING_FACE_URL = "https://huggingface.co";
const QUANTIZATION_PATTERN =
	/(?:^|[-_.])((?:UD-)?(?:IQ\d(?:_[A-Z0-9]+)+|Q\d(?:_[A-Z0-9]+)+|BF16|F16|F32|MXFP\d(?:_[A-Z0-9]+)*))$/iu;
const SHARD_SUFFIX_PATTERN = /-\d{5}-of-\d{5}$/u;

interface StoredLlamaCppCredential {
	type: "api_key";
	key?: string;
	env?: Record<string, string>;
}

interface LlamaCppClientOptions {
	serverUrl: string;
	apiKey?: string;
}

interface LlamaCppModelInfo {
	id: string;
	aliases?: string[];
	status: {
		value: string;
		args?: string[];
		failed?: boolean;
		exit_code?: number;
		progress?: Record<string, { done: number; total: number }>;
	};
	architecture?: {
		input_modalities?: string[];
		output_modalities?: string[];
	};
	source?: string;
	meta?: {
		n_ctx?: number;
		n_ctx_train?: number;
		size?: number;
		ftype?: string;
	};
}

interface LlamaCppProgress {
	message: string;
	ratio?: number;
	detail?: string;
}

interface LlamaCppModelEvent {
	model: string;
	event: string;
	data?: unknown;
}

interface LlamaCppProps {
	models_autoload?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(payload: unknown, fallback: string): string {
	if (!isRecord(payload)) return fallback;
	const error = payload.error;
	if (!isRecord(error) || typeof error.message !== "string" || !error.message) return fallback;
	return error.message;
}

function normalizeStatus(value: string): LlamaCppModelStatus {
	if (
		value === "unloaded" ||
		value === "loading" ||
		value === "loaded" ||
		value === "downloading" ||
		value === "sleeping"
	) {
		return value;
	}
	return "unloaded";
}

function toModelSummary(model: LlamaCppModelInfo): LlamaCppModelSummary {
	const contextWindow = model.meta?.n_ctx ?? model.meta?.n_ctx_train ?? null;
	return {
		id: model.id,
		status: normalizeStatus(model.status.value),
		failed: model.status.failed === true,
		exitCode: typeof model.status.exit_code === "number" ? model.status.exit_code : null,
		contextWindow: typeof contextWindow === "number" && contextWindow > 0 ? contextWindow : null,
		size: typeof model.meta?.size === "number" ? model.meta.size : null,
		source: typeof model.source === "string" ? model.source : null,
		input: model.architecture?.input_modalities?.includes("image") ? ["text", "image"] : ["text"],
		progress: model.status.progress ?? null,
	};
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KiB", "MiB", "GiB", "TiB"];
	let value = bytes / 1024;
	let unit = units[0]!;
	for (let index = 1; index < units.length && value >= 1024; index++) {
		value /= 1024;
		unit = units[index]!;
	}
	return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${unit}`;
}

function parseRateLimitDelay(value: string | null): number | undefined {
	const match = value?.match(/(?:^|;)t=(\d+)/u);
	return match ? Number(match[1]) : undefined;
}

function parseLoadProgress(data: unknown): LlamaCppProgress | undefined {
	if (!isRecord(data)) return undefined;
	const progress = data.progress;
	if (!isRecord(progress)) return undefined;
	const stage =
		typeof progress.current === "string"
			? progress.current
			: typeof progress.stage === "string"
				? progress.stage
				: "";
	const stages = Array.isArray(progress.stages)
		? progress.stages.filter((entry): entry is string => typeof entry === "string")
		: [];
	const stageRatio = typeof progress.value === "number" ? Math.max(0, Math.min(1, progress.value)) : undefined;
	let ratio = stageRatio;
	if (stage && stages.length > 0) {
		const index = stages.indexOf(stage);
		if (index >= 0) ratio = (index + (stageRatio ?? 0)) / stages.length;
	}
	return {
		message: stage ? `正在加载 ${stage.replaceAll("_", " ")}` : "正在加载模型",
		...(ratio === undefined ? {} : { ratio }),
	};
}

function parseDownloadProgress(data: unknown): LlamaCppProgress | undefined {
	if (!isRecord(data)) return undefined;
	const nested = isRecord(data.progress) ? data.progress : data;
	let done = 0;
	let total = 0;
	for (const value of Object.values(nested)) {
		if (!isRecord(value) || typeof value.done !== "number" || typeof value.total !== "number") continue;
		done += value.done;
		total += value.total;
	}
	if (total <= 0) return undefined;
	return {
		message: "正在下载模型",
		ratio: done / total,
		detail: `${formatBytes(done)} / ${formatBytes(total)}`,
	};
}

function linkSignal(source: AbortSignal | undefined, target: AbortController): () => void {
	if (!source) return () => {};
	if (source.aborted) {
		target.abort(source.reason);
		return () => {};
	}
	const abort = (): void => target.abort(source.reason);
	source.addEventListener("abort", abort, { once: true });
	return () => source.removeEventListener("abort", abort);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason ?? new Error("操作已取消"));
			return;
		}
		const timeout = setTimeout(() => {
			signal?.removeEventListener("abort", abort);
			resolve();
		}, ms);
		const abort = (): void => {
			clearTimeout(timeout);
			reject(signal?.reason ?? new Error("操作已取消"));
		};
		signal?.addEventListener("abort", abort, { once: true });
	});
}

export function normalizeLlamaCppServerUrl(value: string): string {
	const url = new URL(value.trim());
	if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("llama.cpp 地址必须使用 http 或 https");
	url.hash = "";
	url.search = "";
	url.pathname = url.pathname.replace(/\/+$/u, "").replace(/\/v1$/u, "") || "/";
	return url.toString().replace(/\/$/u, "");
}

class LlamaCppClient {
	private readonly serverUrl: string;
	private readonly apiKey: string | undefined;

	constructor(options: LlamaCppClientOptions) {
		this.serverUrl = normalizeLlamaCppServerUrl(options.serverUrl);
		this.apiKey = options.apiKey?.trim() || undefined;
	}

	private async request(pathname: string, init: RequestInit = {}): Promise<unknown> {
		const headers = new Headers(init.headers);
		if (init.body !== undefined) headers.set("Content-Type", "application/json");
		if (this.apiKey) headers.set("Authorization", `Bearer ${this.apiKey}`);
		const timeout = AbortSignal.timeout(15_000);
		const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
		const response = await fetch(`${this.serverUrl}${pathname}`, { ...init, headers, signal });
		let payload: unknown;
		try {
			payload = await response.json();
		} catch {
			payload = undefined;
		}
		if (!response.ok) throw new Error(errorMessage(payload, `llama.cpp 返回 HTTP ${response.status}`));
		return payload;
	}

	async list(options: { reload?: boolean; signal?: AbortSignal } = {}): Promise<LlamaCppModelInfo[]> {
		const payload = await this.request(`/models${options.reload ? "?reload=1" : ""}`, { signal: options.signal });
		if (!isRecord(payload) || !Array.isArray(payload.data)) throw new Error("llama.cpp 返回了无效的模型列表");
		const models = payload.data.filter(
			(value): value is LlamaCppModelInfo =>
				isRecord(value) && typeof value.id === "string" && isRecord(value.status),
		);
		if (models.length !== payload.data.length) throw new Error("llama.cpp server 不是 router 模式");
		return models;
	}

	async props(options: { signal?: AbortSignal } = {}): Promise<LlamaCppProps> {
		const payload = await this.request("/props", { signal: options.signal });
		if (!isRecord(payload) || typeof payload.models_autoload !== "boolean") return {};
		return { models_autoload: payload.models_autoload };
	}

	async load(model: string, signal?: AbortSignal): Promise<void> {
		await this.request("/models/load", { method: "POST", body: JSON.stringify({ model }), signal });
	}

	async unload(model: string, signal?: AbortSignal): Promise<void> {
		await this.request("/models/unload", { method: "POST", body: JSON.stringify({ model }), signal });
	}

	async download(model: string, signal?: AbortSignal): Promise<void> {
		await this.request("/models", { method: "POST", body: JSON.stringify({ model }), signal });
	}

	async unloadAndWait(model: string, signal?: AbortSignal): Promise<void> {
		await this.unload(model, signal);
		for (;;) {
			const entry = (await this.list({ signal })).find((candidate) => candidate.id === model);
			if (!entry || entry.status.value === "unloaded") return;
			await sleep(100, signal);
		}
	}

	async loadAndWait(
		model: string,
		onProgress: (progress: LlamaCppProgress) => void,
		signal?: AbortSignal,
	): Promise<void> {
		const watcher = new AbortController();
		const unlink = linkSignal(signal, watcher);
		let eventLoaded = false;
		let eventError: string | undefined;
		void this.watch((event) => {
			if (event.model !== model) return;
			if (event.event !== "model_status" && event.event !== "status_change") return;
			const data = isRecord(event.data) ? event.data : undefined;
			if (data?.status === "loaded") eventLoaded = true;
			if (data?.status === "unloaded") eventError = "模型加载失败";
			const progress = parseLoadProgress(event.data);
			if (progress) onProgress(progress);
		}, watcher.signal).catch(() => undefined);
		try {
			await this.load(model, signal);
			onProgress({ message: "正在加载模型" });
			for (;;) {
				if (signal?.aborted) throw signal.reason ?? new Error("操作已取消");
				const entry = (await this.list({ signal })).find((candidate) => candidate.id === model);
				if (entry?.status.value === "loaded") return;
				if (eventLoaded && !entry) return;
				if (entry?.status.failed || eventError) {
					throw new Error(
						entry?.status.exit_code === undefined
							? (eventError ?? "模型加载失败")
							: `模型进程退出，代码 ${entry.status.exit_code}`,
					);
				}
				await sleep(250, signal);
			}
		} finally {
			unlink();
			watcher.abort();
		}
	}

	async downloadAndWait(
		model: string,
		onProgress: (progress: LlamaCppProgress) => void,
		signal?: AbortSignal,
	): Promise<void> {
		const watcher = new AbortController();
		const unlink = linkSignal(signal, watcher);
		let finished = false;
		let failure: string | undefined;
		let sawDownloading = false;
		let polls = 0;
		void this.watch((event) => {
			if (event.model !== model) return;
			if (event.event === "download_finished") finished = true;
			if (event.event === "download_failed") failure = errorMessage(event.data, "模型下载失败");
			if (event.event === "download_progress") {
				sawDownloading = true;
				const progress = parseDownloadProgress(event.data);
				if (progress) onProgress(progress);
			}
		}, watcher.signal).catch(() => undefined);
		try {
			await this.download(model, signal);
			onProgress({ message: "正在下载模型" });
			for (;;) {
				if (signal?.aborted) throw signal.reason ?? new Error("操作已取消");
				if (failure) throw new Error(failure);
				const models = await this.list({ signal });
				polls += 1;
				const entry = models.find((candidate) => candidate.id === model);
				if (entry?.status.value === "downloading") {
					sawDownloading = true;
					const progress = parseDownloadProgress(entry.status.progress);
					if (progress) onProgress(progress);
				} else if (finished || (entry && (sawDownloading || polls >= 2))) {
					return;
				}
				await sleep(500, signal);
			}
		} finally {
			unlink();
			watcher.abort();
		}
	}

	private async watch(onEvent: (event: LlamaCppModelEvent) => void, signal?: AbortSignal): Promise<void> {
		const headers = new Headers();
		if (this.apiKey) headers.set("Authorization", `Bearer ${this.apiKey}`);
		const response = await fetch(`${this.serverUrl}/models/sse`, { headers, signal });
		if (!response.ok || !response.body) throw new Error(`llama.cpp SSE 返回 HTTP ${response.status}`);
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		for (;;) {
			const chunk = await reader.read();
			if (chunk.done) return;
			buffer += decoder.decode(chunk.value, { stream: true }).replaceAll("\r\n", "\n");
			let boundary = buffer.indexOf("\n\n");
			while (boundary >= 0) {
				const frame = buffer.slice(0, boundary);
				buffer = buffer.slice(boundary + 2);
				const data = frame
					.split("\n")
					.filter((line) => line.startsWith("data:"))
					.map((line) => line.slice(5).trimStart())
					.join("\n");
				if (data) {
					try {
						const event = JSON.parse(data) as LlamaCppModelEvent;
						if (typeof event.model === "string" && typeof event.event === "string") onEvent(event);
					} catch {
						// 轮询仍会校正状态，单条 SSE 解析失败不终止操作。
					}
				}
				boundary = buffer.indexOf("\n\n");
			}
		}
	}
}

class LlamaCppConfigStore {
	private readonly authPath: string;

	constructor(agentDir: string) {
		this.authPath = path.join(agentDir, "auth.json");
	}

	private async readAuth(): Promise<Record<string, unknown>> {
		try {
			const parsed: unknown = JSON.parse(await readFile(this.authPath, "utf8"));
			if (!isRecord(parsed)) throw new Error("auth.json 必须是对象");
			return parsed;
		} catch (error) {
			if (isRecord(error) && error.code === "ENOENT") return {};
			throw error;
		}
	}

	private async writeAuth(value: Record<string, unknown>): Promise<void> {
		await mkdir(path.dirname(this.authPath), { recursive: true });
		const temporaryPath = `${this.authPath}.${randomUUID()}.tmp`;
		await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
		await rename(temporaryPath, this.authPath);
	}

	private credentialFrom(auth: Record<string, unknown>): StoredLlamaCppCredential | null {
		const value = auth[LLAMA_CPP_PROVIDER_ID];
		if (!isRecord(value) || value.type !== "api_key") return null;
		const env = isRecord(value.env)
			? Object.fromEntries(
					Object.entries(value.env).flatMap(([key, entry]) => (typeof entry === "string" ? [[key, entry]] : [])),
				)
			: undefined;
		return {
			type: "api_key",
			...(typeof value.key === "string" && value.key ? { key: value.key } : {}),
			...(env ? { env } : {}),
		};
	}

	async getStatus(): Promise<LlamaCppConfigStatus> {
		const auth = await this.readAuth();
		const credential = this.credentialFrom(auth);
		const storedUrl = credential?.env?.LLAMA_BASE_URL?.trim();
		const environmentUrl = process.env.LLAMA_BASE_URL?.trim();
		const serverUrl = storedUrl || environmentUrl || null;
		const apiKeyConfigured = Boolean(credential?.key || process.env.LLAMA_API_KEY?.trim());
		return {
			configured: Boolean(serverUrl),
			serverUrl,
			apiKeyConfigured,
			source: storedUrl ? "stored" : environmentUrl ? "environment" : "none",
		};
	}

	async save(input: SaveLlamaCppConfigInput): Promise<LlamaCppConfigStatus> {
		const serverUrl = normalizeLlamaCppServerUrl(input.serverUrl);
		const auth = await this.readAuth();
		const current = this.credentialFrom(auth);
		const next: StoredLlamaCppCredential = {
			type: "api_key",
			...(input.clearApiKey
				? {}
				: input.apiKey?.trim()
					? { key: input.apiKey.trim() }
					: current?.key
						? { key: current.key }
						: {}),
			env: { ...(current?.env ?? {}), LLAMA_BASE_URL: serverUrl },
		};
		await this.writeAuth({ ...auth, [LLAMA_CPP_PROVIDER_ID]: next });
		return this.getStatus();
	}

	async clear(): Promise<LlamaCppConfigStatus> {
		const auth = await this.readAuth();
		delete auth[LLAMA_CPP_PROVIDER_ID];
		await this.writeAuth(auth);
		return this.getStatus();
	}

	async resolve(): Promise<{ serverUrl: string; apiKey?: string }> {
		const status = await this.getStatus();
		if (!status.serverUrl) {
			throw new Error(`尚未配置 llama.cpp。默认地址是 ${DEFAULT_LLAMA_CPP_SERVER_URL}`);
		}
		const credential = this.credentialFrom(await this.readAuth());
		return {
			serverUrl: status.serverUrl,
			...(credential?.key || process.env.LLAMA_API_KEY?.trim()
				? { apiKey: credential?.key || process.env.LLAMA_API_KEY?.trim() }
				: {}),
		};
	}
}

class HuggingFaceClient {
	private readonly token: string | undefined;
	private readonly baseUrl = DEFAULT_HUGGING_FACE_URL;

	constructor(token?: string) {
		this.token = token;
	}

	private async request(pathname: string, signal?: AbortSignal): Promise<unknown> {
		const headers = new Headers();
		if (this.token) headers.set("Authorization", `Bearer ${this.token}`);
		const timeout = AbortSignal.timeout(15_000);
		const response = await fetch(`${this.baseUrl}${pathname}`, {
			headers,
			signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
		});
		let payload: unknown;
		try {
			payload = await response.json();
		} catch {
			payload = undefined;
		}
		if (!response.ok) {
			if (response.status === 429) {
				const delay =
					Number(response.headers.get("retry-after")) || parseRateLimitDelay(response.headers.get("ratelimit"));
				throw new Error(delay ? `Hugging Face 限流，请 ${delay} 秒后重试` : "Hugging Face 限流");
			}
			throw new Error(errorMessage(payload, `Hugging Face 返回 HTTP ${response.status}`));
		}
		return payload;
	}

	async search(query: string, signal?: AbortSignal): Promise<HuggingFaceModelSummary[]> {
		const params = new URLSearchParams({
			search: query,
			filter: "gguf",
			sort: "downloads",
			direction: "-1",
			limit: "20",
		});
		const payload = await this.request(`/api/models?${params}`, signal);
		if (!Array.isArray(payload)) throw new Error("Hugging Face 返回了无效搜索结果");
		return payload.flatMap((value) => {
			if (!isRecord(value) || typeof value.id !== "string") return [];
			return [{ id: value.id, downloads: typeof value.downloads === "number" ? value.downloads : 0 }];
		});
	}

	async details(id: string, signal?: AbortSignal): Promise<HuggingFaceModelDetails> {
		const encodedId = id.split("/").map(encodeURIComponent).join("/");
		const payload = await this.request(`/api/models/${encodedId}?blobs=true`, signal);
		if (!isRecord(payload)) throw new Error("Hugging Face 返回了无效模型详情");
		const sizes = new Map<string, { total: number; complete: boolean }>();
		if (Array.isArray(payload.siblings)) {
			for (const value of payload.siblings) {
				if (!isRecord(value) || typeof value.rfilename !== "string") continue;
				if (!value.rfilename.toLowerCase().endsWith(".gguf")) continue;
				const filename = value.rfilename.split("/").at(-1) ?? "";
				if (filename.toLowerCase().startsWith("mmproj")) continue;
				const stem = filename.slice(0, -5).replace(SHARD_SUFFIX_PATTERN, "");
				const quantization = stem.match(QUANTIZATION_PATTERN)?.[1]?.toUpperCase();
				if (!quantization) continue;
				const current = sizes.get(quantization) ?? { total: 0, complete: true };
				if (typeof value.size === "number") current.total += value.size;
				else current.complete = false;
				sizes.set(quantization, current);
			}
		}
		const quantizations: HuggingFaceQuantization[] = [...sizes]
			.map(([name, size]) => ({ name, ...(size.complete ? { size: size.total } : {}) }))
			.sort((left, right) => {
				if (left.name === "Q4_K_M") return -1;
				if (right.name === "Q4_K_M") return 1;
				return (
					(left.size ?? Number.MAX_SAFE_INTEGER) - (right.size ?? Number.MAX_SAFE_INTEGER) ||
					left.name.localeCompare(right.name)
				);
			});
		return {
			id: typeof payload.id === "string" ? payload.id : id,
			gated: payload.gated === "auto" || payload.gated === "manual" ? payload.gated : false,
			quantizations,
		};
	}
}

async function readHuggingFaceToken(): Promise<string | undefined> {
	const fromEnvironment = process.env.HF_TOKEN?.trim();
	if (fromEnvironment) return fromEnvironment;
	const paths = [
		process.env.HF_TOKEN_PATH,
		process.env.HF_HOME ? path.join(process.env.HF_HOME, "token") : undefined,
		process.env.XDG_CACHE_HOME ? path.join(process.env.XDG_CACHE_HOME, "huggingface", "token") : undefined,
		path.join(homedir(), ".cache", "huggingface", "token"),
	].filter((entry): entry is string => Boolean(entry));
	for (const tokenPath of new Set(paths)) {
		try {
			const token = (await readFile(tokenPath, "utf8")).trim();
			if (token) return token;
		} catch {
			// Try the next standard token location.
		}
	}
	return undefined;
}

export class LlamaCppManager {
	private readonly config: LlamaCppConfigStore;

	constructor(agentDir: string) {
		this.config = new LlamaCppConfigStore(agentDir);
	}

	getConfig(): Promise<LlamaCppConfigStatus> {
		return this.config.getStatus();
	}

	saveConfig(input: SaveLlamaCppConfigInput): Promise<LlamaCppConfigStatus> {
		return this.config.save(input);
	}

	clearConfig(): Promise<LlamaCppConfigStatus> {
		return this.config.clear();
	}

	private async client(): Promise<LlamaCppClient> {
		const resolved = await this.config.resolve();
		return new LlamaCppClient(resolved);
	}

	async getStatus(): Promise<LlamaCppRuntimeStatus> {
		const config = await this.config.getStatus();
		if (!config.serverUrl) {
			return { ...config, connected: false, routerAutoload: false, models: [], error: null };
		}
		try {
			const client = await this.client();
			const [models, props] = await Promise.all([client.list(), client.props()]);
			return {
				...config,
				connected: true,
				routerAutoload: props.models_autoload === true,
				models: models.map(toModelSummary),
				error: null,
			};
		} catch (error) {
			return {
				...config,
				connected: false,
				routerAutoload: false,
				models: [],
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	async runAction(
		input: RunLlamaCppActionInput,
		onProgress: (progress: LlamaCppProgress) => void,
	): Promise<LlamaCppRuntimeStatus> {
		if (input.action === "refresh") return this.getStatus();
		const modelId = input.modelId?.trim();
		if (!modelId) throw new Error("缺少模型 ID");
		const client = await this.client();
		if (input.action === "load") await client.loadAndWait(modelId, onProgress);
		else if (input.action === "unload") await client.unloadAndWait(modelId);
		else if (input.action === "download") await client.downloadAndWait(modelId, onProgress);
		return this.getStatus();
	}

	async searchModels(query: string): Promise<HuggingFaceModelSummary[]> {
		const normalized = query.trim();
		if (normalized.length < 2) throw new Error("请输入至少 2 个字符");
		return new HuggingFaceClient(await readHuggingFaceToken()).search(normalized);
	}

	async getModelDetails(modelId: string): Promise<HuggingFaceModelDetails> {
		const normalized = modelId.trim();
		if (!normalized) throw new Error("缺少 Hugging Face 模型 ID");
		return new HuggingFaceClient(await readHuggingFaceToken()).details(normalized);
	}
}
