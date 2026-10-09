import { describe, expect, it } from "vitest";
import { looksLikeFilePath } from "../src/renderer/components/file-path.ts";

describe("looksLikeFilePath", () => {
	it("accepts relative workspace paths with a known extension", () => {
		expect(looksLikeFilePath("WorkPanel.tsx")).toBe(true);
		expect(looksLikeFilePath("src/renderer/App.tsx")).toBe(true);
		expect(looksLikeFilePath("packages\\desktop\\src\\main\\index.ts")).toBe(true);
		expect(looksLikeFilePath("./docs/design/plan.md")).toBe(true);
		expect(looksLikeFilePath("小明.txt")).toBe(true);
		expect(looksLikeFilePath("文档/需求.md")).toBe(true);
	});

	it("rejects commands, versions, urls, and extensionless names", () => {
		expect(looksLikeFilePath("npm run check")).toBe(false);
		expect(looksLikeFilePath("0.16.47")).toBe(false);
		expect(looksLikeFilePath("https://example.com/a.ts")).toBe(false);
		expect(looksLikeFilePath("Dockerfile")).toBe(false);
		expect(looksLikeFilePath("")).toBe(false);
	});

	it("rejects absolute paths and unknown extensions", () => {
		expect(looksLikeFilePath("C:\\Users\\demo\\a.ts")).toBe(false);
		expect(looksLikeFilePath("/home/demo/a.ts")).toBe(false);
		expect(looksLikeFilePath("archive.unknownext")).toBe(false);
	});
});
