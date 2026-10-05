import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { AgentCommandOption } from "@codepiddy/shared";

const execFileAsync = promisify(execFile);
// Only commands for which this desktop client has an implementation should be offered.
const DESKTOP_BUILTINS = new Set([
	"settings",
	"mcp",
	"llama",
	"model",
	"tree",
	"thinking",
	"export",
	"copy",
	"name",
	"session",
	"changelog",
	"hotkeys",
	"fork",
	"clone",
	"trust",
	"new",
	"compact",
	"resume",
	"reload",
	"quit",
]);

function toBuiltinCommands(raw: unknown): AgentCommandOption[] {
	if (!Array.isArray(raw)) return [];
	return raw.flatMap((value): AgentCommandOption[] => {
		if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
		const command = value as Record<string, unknown>;
		if (
			typeof command.name !== "string" ||
			!DESKTOP_BUILTINS.has(command.name) ||
			typeof command.description !== "string"
		)
			return [];
		return [
			{
				name: command.name,
				command: `/${command.name}`,
				description: command.description,
				...(typeof command.argumentHint === "string" ? { argumentHint: command.argumentHint } : {}),
				source: "builtin",
			},
		];
	});
}

export async function loadPiBuiltinCommands(packageDir: string, nodeExecutable: string): Promise<AgentCommandOption[]> {
	const file = path.join(packageDir, "dist", "core", "slash-commands.js");
	try {
		await access(file);
		// Pi's RPC get_commands excludes TUI built-ins in newer versions. Read the list shipped by that exact Pi version.
		const source = `import { BUILTIN_SLASH_COMMANDS } from ${JSON.stringify(pathToFileURL(file).href)}; process.stdout.write(JSON.stringify(BUILTIN_SLASH_COMMANDS));`;
		const { stdout } = await execFileAsync(nodeExecutable, ["--input-type=module", "--eval", source], {
			env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
			windowsHide: true,
			timeout: 12_000,
			maxBuffer: 128 * 1024,
		});
		const commands = toBuiltinCommands(JSON.parse(stdout) as unknown);
		if (commands.length > 0) return commands;
	} catch {
		// Keep the desktop's built-in commands available if a future Pi moves its internal module.
	}
	return toBuiltinCommands([...DESKTOP_BUILTINS].map((name) => ({ name, description: "Pi 内置命令" })));
}

export function mergePiCommands(remote: AgentCommandOption[], builtins: AgentCommandOption[]): AgentCommandOption[] {
	const remoteByName = new Map<string, AgentCommandOption>();
	for (const command of remote) {
		if (command.source !== "builtin" || DESKTOP_BUILTINS.has(command.name)) remoteByName.set(command.name, command);
	}
	const merged = new Map<string, AgentCommandOption>();
	for (const command of builtins) merged.set(command.name, remoteByName.get(command.name) ?? command);
	for (const [name, command] of remoteByName) if (!merged.has(name)) merged.set(name, command);
	return [...merged.values()];
}
