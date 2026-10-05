import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LlamaCppManager } from "../src/main/llama-cpp-manager.ts";

interface MockModel {
	id: string;
	status: { value: string };
	failed?: boolean;
	exit_code?: number;
	progress?: Record<string, { done: number; total: number }>;
}

interface MockRouter {
	server: Server;
	url: string;
	models: Map<string, MockModel>;
}

async function startMockRouter(): Promise<MockRouter> {
	const models = new Map<string, MockModel>([
		["demo-model", { id: "demo-model", status: { value: "unloaded" } }],
		["second-model", { id: "second-model", status: { value: "unloaded" } }],
	]);
	const server = createServer((request, response) => {
		const url = new URL(request.url ?? "/", "http://127.0.0.1");
		if (request.method === "GET" && url.pathname === "/models") {
			response.setHeader("content-type", "application/json");
			response.end(JSON.stringify({ data: [...models.values()] }));
			return;
		}
		if (request.method === "GET" && url.pathname === "/props") {
			response.setHeader("content-type", "application/json");
			response.end(JSON.stringify({ models_autoload: true }));
			return;
		}
		if (request.method === "POST" && url.pathname === "/models/load") {
			let body = "";
			request.on("data", (chunk: Buffer) => {
				body += chunk.toString("utf8");
			});
			request.on("end", () => {
				const modelId = (JSON.parse(body) as { model?: string }).model ?? "";
				const model = models.get(modelId);
				if (model) model.status.value = "loaded";
				response.setHeader("content-type", "application/json");
				response.end("{}");
			});
			return;
		}
		if (request.method === "POST" && url.pathname === "/models/unload") {
			let body = "";
			request.on("data", (chunk: Buffer) => {
				body += chunk.toString("utf8");
			});
			request.on("end", () => {
				const modelId = (JSON.parse(body) as { model?: string }).model ?? "";
				const model = models.get(modelId);
				if (model) model.status.value = "unloaded";
				response.setHeader("content-type", "application/json");
				response.end("{}");
			});
			return;
		}
		if (request.method === "POST" && url.pathname === "/models") {
			let body = "";
			request.on("data", (chunk: Buffer) => {
				body += chunk.toString("utf8");
			});
			request.on("end", () => {
				const modelId = (JSON.parse(body) as { model?: string }).model ?? "";
				const model = models.get(modelId);
				if (model) {
					model.status.value = "downloading";
					model.progress = { "model.gguf": { done: 50, total: 100 } };
					setTimeout(() => {
						model.status.value = "unloaded";
						delete model.progress;
					}, 80);
				}
				response.setHeader("content-type", "application/json");
				response.end("{}");
			});
			return;
		}
		response.statusCode = 404;
		response.end();
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Mock router did not bind");
	return { server, url: `http://127.0.0.1:${address.port}`, models };
}

const temporaryDirectories: string[] = [];
const routers: MockRouter[] = [];

afterEach(async () => {
	await Promise.all(
		routers.splice(0).map(
			(router) =>
				new Promise<void>((resolve) => {
					router.server.close(() => resolve());
				}),
		),
	);
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

describe("LlamaCppManager", () => {
	it("persists the Pi-native llama.cpp credential and manages router models", async () => {
		const router = await startMockRouter();
		routers.push(router);
		const agentDir = await mkdtemp(path.join(tmpdir(), "codepiddy-llama-"));
		temporaryDirectories.push(agentDir);
		const manager = new LlamaCppManager(agentDir);

		await manager.saveConfig({ serverUrl: router.url, apiKey: "local-token" });
		expect(await manager.getConfig()).toMatchObject({
			configured: true,
			serverUrl: router.url,
			apiKeyConfigured: true,
			source: "stored",
		});
		const auth = JSON.parse(await readFile(path.join(agentDir, "auth.json"), "utf8")) as {
			"llama.cpp"?: { key?: string; env?: Record<string, string> };
		};
		expect(auth["llama.cpp"]?.key).toBe("local-token");
		expect(auth["llama.cpp"]?.env?.LLAMA_BASE_URL).toBe(router.url);

		const initial = await manager.getStatus();
		expect(initial.connected).toBe(true);
		expect(initial.routerAutoload).toBe(true);
		expect(initial.models.find((model) => model.id === "demo-model")?.status).toBe("unloaded");

		await manager.runAction({ action: "load", modelId: "demo-model" }, () => undefined);
		expect((await manager.getStatus()).models.find((model) => model.id === "demo-model")?.status).toBe("loaded");

		await manager.runAction({ action: "unload", modelId: "demo-model" }, () => undefined);
		expect((await manager.getStatus()).models.find((model) => model.id === "demo-model")?.status).toBe("unloaded");

		const progress: string[] = [];
		await manager.runAction({ action: "download", modelId: "second-model" }, (entry) => {
			progress.push(entry.message);
		});
		expect(progress.length).toBeGreaterThan(0);
		expect((await manager.getStatus()).models.find((model) => model.id === "second-model")?.status).toBe("unloaded");
	});

	it("keeps an existing key when saving without a replacement and can clear it", async () => {
		const router = await startMockRouter();
		routers.push(router);
		const agentDir = await mkdtemp(path.join(tmpdir(), "codepiddy-llama-"));
		temporaryDirectories.push(agentDir);
		const manager = new LlamaCppManager(agentDir);

		await manager.saveConfig({ serverUrl: router.url, apiKey: "keep-me" });
		await manager.saveConfig({ serverUrl: router.url });
		expect((await manager.getConfig()).apiKeyConfigured).toBe(true);
		await manager.saveConfig({ serverUrl: router.url, clearApiKey: true });
		expect((await manager.getConfig()).apiKeyConfigured).toBe(false);
	});
});
