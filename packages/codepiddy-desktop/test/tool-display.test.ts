import { describe, expect, it } from "vitest";
import { parseToolArgs, toolDetailRows, toolSummary } from "../src/renderer/components/tool-display.ts";

describe("tool display (Pi core native tools only)", () => {
	it("parses JSON args and returns null on malformed input", () => {
		expect(parseToolArgs('{"path":"src/a.ts"}')).toEqual({ path: "src/a.ts" });
		expect(parseToolArgs("not json")).toBeNull();
		expect(parseToolArgs("")).toBeNull();
	});

	it("summarizes read / bash / edit / ls with native argument schemas", () => {
		expect(toolSummary("read", parseToolArgs('{"path":"src/a.ts"}'))).toBe("src/a.ts");
		expect(toolSummary("read", { path: "src/a.ts", offset: 10, limit: 20 })).toBe("src/a.ts :10+20");
		expect(toolSummary("bash", { command: "npm test" })).toBe("npm test");
		expect(toolSummary("powershell", { command: "Get-ChildItem" })).toBe("Get-ChildItem");
		expect(toolSummary("edit", { path: "src/a.ts", edits: [{}, {}, {}] })).toBe("src/a.ts · 3 处替换");
		expect(toolSummary("ls", null)).toBe("当前目录");
	});

	it("keeps extension and MCP tools on the generic fallback", () => {
		expect(toolSummary("mcp__web_search__web_search", { query: "x" })).toBe("");
		expect(toolSummary("codemode", { code: "1" })).toBe("");
		expect(toolSummary("subagent", { prompt: "x" })).toBe("");
	});

	it("builds structured detail rows for native tools", () => {
		const rows = toolDetailRows("read", { path: "src/a.ts", offset: 10 });
		expect(rows).toEqual([
			{ label: "路径", value: "src/a.ts", mono: false },
			{ label: "起始行", value: "10", mono: false },
		]);
		const runRows = toolDetailRows("bash", { command: "npm test", timeout: 30 });
		expect(runRows).toEqual([
			{ label: "命令", value: "npm test", mono: true },
			{ label: "超时", value: "30", mono: false },
		]);
	});
});
