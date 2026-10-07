import { readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentRole, AgentSkillSource, AgentSkillSummary, RoleSkillAssignments } from "@codepiddy/shared";

export const BUILTIN_GRILL_WITH_DOCS_ID = "builtin:grill-with-docs";
export const BUILTIN_OPEN_CODE_REVIEW_ID = "builtin:open-code-review";
export const BUILTIN_OPENSPEC_APPLY_ID = "builtin:openspec-apply-change";
export const BUILTIN_OPENSPEC_ARCHIVE_ID = "builtin:openspec-archive-change";
export const BUILTIN_OPENSPEC_EXPLORE_ID = "builtin:openspec-explore";
export const BUILTIN_OPENSPEC_PROPOSE_ID = "builtin:openspec-propose";
export const BUILTIN_OPENSPEC_SYNC_ID = "builtin:openspec-sync-specs";
export const BUILTIN_OPENSPEC_UPDATE_ID = "builtin:openspec-update-change";

export const DEFAULT_ROLE_SKILL_ASSIGNMENTS: RoleSkillAssignments = {
	"requirement-analysis": [
		BUILTIN_GRILL_WITH_DOCS_ID,
		BUILTIN_OPENSPEC_EXPLORE_ID,
		BUILTIN_OPENSPEC_PROPOSE_ID,
		BUILTIN_OPENSPEC_UPDATE_ID,
	],
	coding: [BUILTIN_OPENSPEC_APPLY_ID, BUILTIN_OPENSPEC_SYNC_ID],
	"bug-fix": [
		BUILTIN_OPENSPEC_EXPLORE_ID,
		BUILTIN_OPENSPEC_PROPOSE_ID,
		BUILTIN_OPENSPEC_APPLY_ID,
		BUILTIN_OPENSPEC_SYNC_ID,
	],
	review: [BUILTIN_OPEN_CODE_REVIEW_ID],
};

function frontmatterValue(content: string, key: string): string | null {
	const match = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(content);
	return match?.[1]?.trim().replace(/^['"]|['"]$/g, "") ?? null;
}

async function readSkill(filePath: string, source: AgentSkillSource, id?: string): Promise<AgentSkillSummary | null> {
	try {
		const content = await readFile(filePath, "utf8");
		const name = frontmatterValue(content, "name");
		if (!name) return null;
		return {
			id: id ?? `path:${path.resolve(filePath)}`,
			name,
			description: frontmatterValue(content, "description") ?? "",
			filePath: path.resolve(filePath),
			source,
		};
	} catch {
		return null;
	}
}

async function discoverSkillDirectory(
	directory: string,
	source: AgentSkillSource,
	idPrefix?: string,
): Promise<AgentSkillSummary[]> {
	const direct = await readSkill(path.join(directory, "SKILL.md"), source);
	const result = direct ? [direct] : [];
	try {
		const entries = await readdir(directory, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const skill = await readSkill(
				path.join(directory, entry.name, "SKILL.md"),
				source,
				idPrefix ? `${idPrefix}:${entry.name}` : undefined,
			);
			if (skill) result.push(skill);
		}
	} catch {}
	return result;
}

/** 开发态在 packages/codepiddy-agent-skills，打包后由 build-codepiddy-runtime.mjs 复制成 skills/。 */
const BUILTIN_SKILL_DIRECTORIES = ["packages/codepiddy-agent-skills", "skills"] as const;

export async function resolveBuiltinSkillsDirectory(repositoryRoot: string): Promise<string | null> {
	for (const relative of BUILTIN_SKILL_DIRECTORIES) {
		const directory = path.join(repositoryRoot, relative);
		try {
			if ((await stat(directory)).isDirectory()) return directory;
		} catch {}
	}
	return null;
}

export async function discoverAgentSkills(
	repositoryRoot: string,
	projectRoot?: string,
	packageSkillPaths: string[] = [],
): Promise<AgentSkillSummary[]> {
	const home = os.homedir();
	const groups: Array<Promise<AgentSkillSummary[]>> = [
		...BUILTIN_SKILL_DIRECTORIES.map((relative) =>
			discoverSkillDirectory(path.join(repositoryRoot, relative), "builtin", "builtin"),
		),
		discoverSkillDirectory(path.join(home, ".codex", "skills"), "codex"),
		discoverSkillDirectory(path.join(home, ".agents", "skills"), "agents"),
		discoverSkillDirectory(path.join(home, ".pi", "agent", "skills"), "pi"),
	];
	if (projectRoot) {
		groups.push(
			discoverSkillDirectory(path.join(projectRoot, ".codepiddy", ".pi", "skills"), "project"),
			discoverSkillDirectory(path.join(projectRoot, ".pi", "skills"), "project"),
			discoverSkillDirectory(path.join(projectRoot, ".agents", "skills"), "project"),
		);
	}
	groups.push(
		...packageSkillPaths.map((filePath) =>
			readSkill(filePath, "package", `package:${path.resolve(filePath)}`).then((skill) => (skill ? [skill] : [])),
		),
	);
	const discovered = (await Promise.all(groups)).flat();
	const byName = new Map<string, AgentSkillSummary>();
	for (const skill of discovered) {
		if (!byName.has(skill.name)) byName.set(skill.name, skill);
	}
	return [...byName.values()].sort((left, right) => {
		if (left.source === "builtin" && right.source !== "builtin") return -1;
		if (right.source === "builtin" && left.source !== "builtin") return 1;
		return left.name.localeCompare(right.name);
	});
}

export async function resolveRoleSkillPaths(
	repositoryRoot: string,
	projectRoot: string,
	role: AgentRole,
	assignments: RoleSkillAssignments,
	packageSkillPaths: string[] = [],
): Promise<string[]> {
	const catalog = await discoverAgentSkills(repositoryRoot, projectRoot, packageSkillPaths);
	const byId = new Map(catalog.map((skill) => [skill.id, skill.filePath]));
	return assignments[role].flatMap((id) => {
		const filePath = byId.get(id);
		return filePath ? [filePath] : [];
	});
}
