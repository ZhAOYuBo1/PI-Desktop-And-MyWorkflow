import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import cacheWarmingStatusExtension from "../index.ts";

interface CacheWarmingDecisionEvent {
	type: "cache_warming_decision";
	warmCost: number;
	missCost: number;
	continuationProbability: number;
	action: "warm" | "stop";
}

describe("cache warming status extension", () => {
	const directories: string[] = [];

	afterEach(async () => {
		delete process.env.CODEPIDDY_CACHE_WARMING_STATUS_PATH;
		await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
	});

	it("writes the latest decision to the configured status file", async () => {
		const directory = await mkdtemp(path.join(tmpdir(), "codepiddy-cache-warming-status-"));
		directories.push(directory);
		const statusPath = path.join(directory, "status.json");
		process.env.CODEPIDDY_CACHE_WARMING_STATUS_PATH = statusPath;

		let handler: ((event: CacheWarmingDecisionEvent) => Promise<void> | void) | undefined;
		const pi = {
			on: (event: string, callback: (event: CacheWarmingDecisionEvent) => Promise<void> | void) => {
				if (event === "cache_warming_decision") handler = callback;
			},
		} as unknown as ExtensionAPI;
		cacheWarmingStatusExtension(pi);
		expect(handler).toBeDefined();

		await handler?.({
			type: "cache_warming_decision",
			warmCost: 0.002,
			missCost: 0.03,
			continuationProbability: 0.35,
			action: "warm",
		});
		const written = JSON.parse(await readFile(statusPath, "utf8")) as Record<string, unknown>;
		expect(written.warmCost).toBe(0.002);
		expect(written.missCost).toBe(0.03);
		expect(written.continuationProbability).toBe(0.35);
		expect(written.action).toBe("warm");
		expect(written.expectedSavings).toBeCloseTo(0.35 * 0.03 - 0.002);
		expect(typeof written.updatedAt).toBe("string");
	});
});
