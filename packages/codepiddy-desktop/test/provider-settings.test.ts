import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
	safeStorage: {
		isEncryptionAvailable: () => false,
		decryptString: () => "",
		encryptString: () => Buffer.from(""),
	},
}));

import { parseProviderInput } from "../src/main/ipc-validation.ts";
import { AppSettingsStore } from "../src/main/settings-store.ts";

describe("provider settings", () => {
	let agentDirectory: string;
	let userDataDirectory: string;
	let modelsPath: string;

	beforeEach(async () => {
		agentDirectory = await mkdtemp(path.join(tmpdir(), "codepiddy-provider-agent-"));
		userDataDirectory = await mkdtemp(path.join(tmpdir(), "codepiddy-provider-userdata-"));
		modelsPath = path.join(agentDirectory, "models.json");
		process.env.PI_CODING_AGENT_DIR = agentDirectory;
	});

	afterEach(async () => {
		delete process.env.PI_CODING_AGENT_DIR;
		await rm(agentDirectory, { recursive: true, force: true });
		await rm(userDataDirectory, { recursive: true, force: true });
	});

	async function writeModels(value: unknown): Promise<void> {
		await writeFile(modelsPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
	}

	async function readModels(): Promise<Record<string, unknown>> {
		return JSON.parse(await readFile(modelsPath, "utf8")) as Record<string, unknown>;
	}

	it("lists unknown provider and model fields without rebuilding them away", async () => {
		await writeModels({
			providers: {
				custom: {
					name: "Custom",
					baseUrl: "https://api.example.com",
					api: "custom-wire-api",
					headers: { "x-provider": "yes" },
					authHeader: true,
					customProviderField: { enabled: true },
					modelOverrides: {
						"model-1": {
							maxTokens: 42,
							customOverrideField: "kept",
						},
					},
					models: [
						{
							id: "model-1",
							name: "Model 1",
							reasoning: true,
							contextWindow: 4096,
							inputLimits: { maxRequestBytes: 1234 },
							customModelField: { marker: "kept" },
						},
					],
				},
			},
		});
		const store = new AppSettingsStore(userDataDirectory);

		const [provider] = await store.listProviders();

		expect(provider?.api).toBe("custom-wire-api");
		expect(provider?.advanced).toMatchObject({
			headers: { "x-provider": "yes" },
			authHeader: true,
			customProviderField: { enabled: true },
			modelOverrides: {
				"model-1": {
					maxTokens: 42,
					customOverrideField: "kept",
				},
			},
		});
		expect(provider?.models[0]?.advanced).toMatchObject({
			inputLimits: { maxRequestBytes: 1234 },
			customModelField: { marker: "kept" },
		});
	});

	it("patches provider and model fields while preserving untouched unknown fields", async () => {
		await writeModels({
			providers: {
				custom: {
					api: "pi-messages",
					headers: { "x-old": "1" },
					authHeader: true,
					customProviderField: { nested: { old: true }, keep: "yes" },
					modelOverrides: { "model-1": { maxTokens: 10, customOverride: "old" } },
					models: [
						{
							id: "model-1",
							name: "Old name",
							api: "old-model-api",
							baseUrl: "https://old.example.com",
							maxTokens: 100,
							customModelField: { nested: { old: true }, keep: "yes" },
						},
					],
				},
			},
		});
		const store = new AppSettingsStore(userDataDirectory);
		const input = parseProviderInput({
			id: "custom",
			api: "custom-wire-api",
			baseUrl: "https://new.example.com",
			advanced: {
				headers: { "x-new": "2" },
				authHeader: false,
				compat: { supportsStrictMode: true },
				modelOverrides: {
					"model-1": {
						maxTokens: 20,
						customOverride: "new",
					},
				},
				customProviderField: { nested: { updated: true }, keep: "yes" },
			},
			models: [
				{
					originalId: "model-1",
					id: "model-1",
					name: "New name",
					api: null,
					baseUrl: null,
					maxTokens: null,
					contextWindow: 8192,
					reasoning: false,
					input: ["text", "image"],
					advanced: {
						thinkingLevelMap: { high: "max" },
						cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0.2 },
						compat: { supportsReasoningEffort: true },
						customModelField: { nested: { updated: true }, keep: "yes" },
					},
				},
			],
		});

		await store.saveProvider(input);
		const written = await readModels();
		const provider = (written.providers as Record<string, Record<string, unknown>>).custom;
		const model = (provider.models as Record<string, unknown>[])[0];

		expect(provider).toMatchObject({
			api: "custom-wire-api",
			baseUrl: "https://new.example.com",
			headers: { "x-new": "2" },
			authHeader: false,
			compat: { supportsStrictMode: true },
			customProviderField: { nested: { updated: true }, keep: "yes" },
		});
		expect(provider.modelOverrides).toEqual({
			"model-1": {
				maxTokens: 20,
				customOverride: "new",
			},
		});
		expect(model).toMatchObject({
			id: "model-1",
			name: "New name",
			contextWindow: 8192,
			reasoning: false,
			input: ["text", "image"],
			thinkingLevelMap: { high: "max" },
			cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0.2 },
			compat: { supportsReasoningEffort: true },
			customModelField: { nested: { updated: true }, keep: "yes" },
		});
		expect(model.api).toBeUndefined();
		expect(model.baseUrl).toBeUndefined();
		expect(model.maxTokens).toBeUndefined();
	});

	it("matches renamed models by originalId and removes omitted fields", async () => {
		await writeModels({
			providers: {
				custom: {
					models: [
						{
							id: "old-id",
							name: "Old",
							baseUrl: "https://old.example.com",
							customModelField: "kept",
						},
					],
					customProviderField: "remove-me",
				},
			},
		});
		const store = new AppSettingsStore(userDataDirectory);

		await store.saveProvider(
			parseProviderInput({
				id: "custom",
				advanced: {},
				models: [
					{
						originalId: "old-id",
						id: "new-id",
						name: "New",
						baseUrl: null,
						advanced: {
							customModelField: "kept",
						},
					},
				],
			}),
		);

		const written = await readModels();
		const provider = (written.providers as Record<string, Record<string, unknown>>).custom;
		const model = (provider.models as Record<string, unknown>[])[0];
		expect(model).toEqual({
			id: "new-id",
			name: "New",
			customModelField: "kept",
		});
		expect(provider.customProviderField).toBeUndefined();
	});

	it("rejects invalid model numbers and non-object advanced JSON", () => {
		expect(() =>
			parseProviderInput({
				id: "custom",
				models: [{ id: "model-1", contextWindow: -1 }],
			}),
		).toThrow("上下文窗口");
		expect(() =>
			parseProviderInput({
				id: "custom",
				advanced: [],
			}),
		).toThrow("Provider 高级字段");
	});

	it("rejects incomplete model cost objects before writing files", async () => {
		const store = new AppSettingsStore(userDataDirectory);
		await expect(
			store.saveProvider(
				parseProviderInput({
					id: "custom",
					models: [
						{
							id: "model-1",
							advanced: {
								cost: { input: 1 },
							},
						},
					],
				}),
			),
		).rejects.toThrow("cost");
	});
});
