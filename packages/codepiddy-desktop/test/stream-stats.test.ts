import { describe, expect, it } from "vitest";
import { extractUsageSummary } from "../src/renderer/components/stream-stats.ts";

describe("extractUsageSummary (Pi core native usage)", () => {
	it("reads the full native usage shape including cost", () => {
		const summary = extractUsageSummary({
			usage: {
				input: 218,
				output: 87,
				cacheRead: 4224,
				cacheWrite: 0,
				reasoning: 23,
				totalTokens: 4529,
				cost: { input: 0.0001, output: 0.0002, cacheRead: 0, cacheWrite: 0, total: 0.0003 },
			},
		});
		expect(summary).toEqual({
			input: 218,
			output: 87,
			cacheRead: 4224,
			cacheWrite: 0,
			reasoning: 23,
			total: 4529,
			cost: 0.0003,
		});
	});

	it("derives total when totalTokens is absent", () => {
		const summary = extractUsageSummary({ usage: { input: 10, output: 5, cacheRead: 2, cacheWrite: 1 } });
		expect(summary?.total).toBe(18);
		expect(summary?.cost).toBe(0);
	});

	it("returns null when there is no usable usage", () => {
		expect(extractUsageSummary(null)).toBeNull();
		expect(extractUsageSummary({})).toBeNull();
		expect(extractUsageSummary({ usage: {} })).toBeNull();
	});
});
