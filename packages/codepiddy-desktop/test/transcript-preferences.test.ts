import { describe, expect, it } from "vitest";
import {
	normalizeSmoothStreaming,
	normalizeThinkingDisplayMode,
} from "../src/renderer/components/transcript-preferences.ts";
import { nextSmoothText } from "../src/renderer/components/transcript-smooth-text.ts";

describe("transcript preferences", () => {
	it("normalizes thinking display mode", () => {
		expect(normalizeThinkingDisplayMode("detailed")).toBe("detailed");
		expect(normalizeThinkingDisplayMode("compact")).toBe("compact");
		expect(normalizeThinkingDisplayMode("unknown")).toBe("compact");
		expect(normalizeThinkingDisplayMode(null)).toBe("compact");
	});

	it("keeps smooth streaming enabled unless explicitly disabled", () => {
		expect(normalizeSmoothStreaming("true")).toBe(true);
		expect(normalizeSmoothStreaming("false")).toBe(false);
		expect(normalizeSmoothStreaming(null)).toBe(true);
	});

	it("releases smooth text without skipping or reordering source text", () => {
		expect(nextSmoothText("abcdefghijklmnop", "")).toBe("ab");
		expect(nextSmoothText("abcdefghijklmnop", "ab")).toBe("abcd");
		expect(nextSmoothText("abcdef", "abcdef")).toBe("abcdef");
		expect(nextSmoothText("new source", "old")).toBe("new source");
	});
});
