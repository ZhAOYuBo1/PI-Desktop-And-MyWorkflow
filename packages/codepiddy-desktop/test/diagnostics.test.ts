import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AgentInstanceLocator, PiRuntimeStatus } from "@codepiddy/shared";
import { strFromU8, unzipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { DiagnosticsManager, redactDiagnosticValue, redactSessionJsonl } from "../src/main/diagnostics.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

const piRuntime: PiRuntimeStatus = {
	bundledVersion: "1.0.1",
	currentVersion: "1.0.1",
	rollbackVersion: null,
	runningVersion: "1.0.1",
	latestVersion: null,
	updateAvailable: false,
	restartRequired: false,
	npmAvailable: true,
	warning: null,
};

describe("diagnostics", () => {
	it("redacts secret fields and common token formats", () => {
		expect(
			redactDiagnosticValue({
				apiKey: "sk-1234567890",
				nested: { authorization: "Bearer abcdefghijklmnop" },
				message: "Bearer abcdefghijklmnop",
			}),
		).toEqual({
			apiKey: "[REDACTED]",
			nested: { authorization: "[REDACTED]" },
			message: "Bearer [REDACTED]",
		});
	});

	it("redacts session JSONL without losing its structure", () => {
		const redacted = redactSessionJsonl(
			`${JSON.stringify({ type: "session", id: "s1" })}\n${JSON.stringify({
				type: "message",
				message: { content: "token=sk-1234567890" },
			})}\n`,
		);
		expect(redacted).toContain('"type":"session"');
		expect(redacted).toContain("[REDACTED]");
		expect(redacted).not.toContain("sk-1234567890");
	});

	it("exports a zip with diagnostics, logs and an optional redacted session", async () => {
		const root = await mkdtemp(path.join(tmpdir(), "codepiddy-diagnostics-"));
		temporaryDirectories.push(root);
		const sessionFile = path.join(root, "session.jsonl");
		const debugLogPath = path.join(root, "pi-debug.log");
		await writeFile(
			sessionFile,
			`${JSON.stringify({ type: "session", id: "s1" })}\n${JSON.stringify({
				type: "message",
				message: { content: "token=sk-1234567890" },
			})}\n`,
			"utf8",
		);
		await writeFile(debugLogPath, "Authorization: Bearer abcdefghijklmnop\n", "utf8");
		const locator: AgentInstanceLocator = {
			agentInstanceId: "agent-1",
			projectId: "project-1",
			workItemId: "FEAT-001",
			role: "coding",
		};
		const manager = new DiagnosticsManager({
			userDataPath: root,
			agentDir: root,
			appVersion: "0.1.0",
			getPiRuntimeStatus: () => piRuntime,
			listAuthProviders: async () => [],
			listConfiguredProviders: async () => [],
			getMcpSnapshot: async () => ({ servers: [], errors: [] }),
			getAgentSnapshot: async () => ({
				locator,
				status: "idle",
				sessionDirectory: root,
				sessionFile,
				sessionSummary: null,
				state: { sessionFile, apiKey: "sk-1234567890" },
				stats: null,
			}),
			getTrustStatus: async () => null,
			getRecentErrors: () => [
				{ timestamp: new Date().toISOString(), source: "test", message: "Bearer abcdefghijklmnop" },
			],
		});
		const destination = path.join(root, "diagnostics.zip");
		const result = await manager.export({ includeSession: true, agent: locator }, destination);
		const archive = unzipSync(new Uint8Array(await readFile(destination)));
		const diagnostics = strFromU8(archive["diagnostics.json"]);
		const session = strFromU8(archive["session.jsonl"]);
		const debugLog = strFromU8(archive["logs/pi-debug.log"]);

		expect(result.includedSession).toBe(true);
		expect(result.sizeBytes).toBeGreaterThan(0);
		expect(diagnostics).toContain('"sessionIncluded": true');
		expect(diagnostics).not.toContain("sk-1234567890");
		expect(session).toContain("[REDACTED]");
		expect(session).not.toContain("sk-1234567890");
		expect(debugLog).toContain("Bearer [REDACTED]");
	});
});
