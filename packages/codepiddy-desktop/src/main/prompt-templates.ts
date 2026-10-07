import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
	PromptTemplateInput,
	PromptTemplateLocator,
	PromptTemplateScope,
	PromptTemplateSource,
	PromptTemplateSummary,
} from "@codepiddy/shared";

const MAX_TEMPLATE_NAME = 80;
const MAX_TEMPLATE_DESCRIPTION = 500;
const MAX_ARGUMENT_HINT = 200;
const MAX_TEMPLATE_CONTENT = 200_000;

function normalizeNewlines(value: string): string {
	return value.replace(/\r\n?/g, "\n");
}

function assertTemplateName(value: string): string {
	const name = value.trim();
	if (!name) throw new Error("模板名称不能为空");
	if (name.length > MAX_TEMPLATE_NAME) throw new Error(`模板名称不能超过 ${MAX_TEMPLATE_NAME} 个字符`);
	if (name === "." || name === "..") throw new Error("模板名称无效");
	if (/[<>:"/\\|?*\u0000-\u001f]/u.test(name)) throw new Error("模板名称不能包含路径或文件名非法字符");
	if (/[. ]$/u.test(name)) throw new Error("模板名称不能以点或空格结尾");
	return name;
}

function assertText(value: string, label: string, maximum: number, allowEmpty: boolean): string {
	if (typeof value !== "string") throw new Error(`${label}必须是字符串`);
	if (value.length > maximum) throw new Error(`${label}不能超过 ${maximum} 个字符`);
	if (value.includes("\0")) throw new Error(`${label}包含非法字符`);
	if (!allowEmpty && !value.trim()) throw new Error(`${label}不能为空`);
	return value;
}

function parseQuotedValue(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return "";
	if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
		try {
			const parsed: unknown = JSON.parse(trimmed);
			return typeof parsed === "string" ? parsed : trimmed.slice(1, -1);
		} catch {
			return trimmed.slice(1, -1);
		}
	}
	if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
		return trimmed.slice(1, -1).replace(/''/gu, "'");
	}
	return trimmed;
}

function frontmatterValue(yaml: string, key: string): string {
	const lines = yaml.split("\n");
	const index = lines.findIndex((line) => new RegExp(`^${key}\\s*:`, "u").test(line));
	if (index === -1) return "";
	const raw = lines[index]?.replace(new RegExp(`^${key}\\s*:\\s*`, "u"), "") ?? "";
	const trimmed = raw.trim();
	if (trimmed === "|" || trimmed === ">") {
		const indented: string[] = [];
		for (const line of lines.slice(index + 1)) {
			if (!line.trim()) {
				indented.push("");
				continue;
			}
			if (!/^\s/u.test(line)) break;
			indented.push(line.replace(/^\s{1,2}/u, ""));
		}
		return trimmed === ">" ? indented.join(" ").trim() : indented.join("\n").trim();
	}
	return parseQuotedValue(trimmed);
}

export function parsePromptTemplate(content: string): {
	description: string;
	argumentHint: string;
	body: string;
} {
	const normalized = normalizeNewlines(content).replace(/^\uFEFF/u, "");
	if (!normalized.startsWith("---\n")) {
		return { description: "", argumentHint: "", body: normalized.trim() };
	}
	const endIndex = normalized.indexOf("\n---", 4);
	if (endIndex === -1) {
		return { description: "", argumentHint: "", body: normalized.trim() };
	}
	const yaml = normalized.slice(4, endIndex);
	const body = normalized.slice(endIndex + 4).trim();
	return {
		description: frontmatterValue(yaml, "description"),
		argumentHint: frontmatterValue(yaml, "argument-hint"),
		body,
	};
}

function fallbackDescription(body: string): string {
	const firstLine = body.split("\n").find((line) => line.trim());
	if (!firstLine) return "";
	const value = firstLine.trim();
	return value.length > 60 ? `${value.slice(0, 60)}...` : value;
}

function renderPromptTemplate(input: { description: string; argumentHint: string; content: string }): string {
	const description = input.description.trim();
	const argumentHint = input.argumentHint.trim();
	const body = normalizeNewlines(input.content).trim();
	const frontmatter: string[] = [];
	if (description) frontmatter.push(`description: ${JSON.stringify(description)}`);
	if (argumentHint) frontmatter.push(`argument-hint: ${JSON.stringify(argumentHint)}`);
	if (frontmatter.length === 0) return `${body}\n`;
	return `---\n${frontmatter.join("\n")}\n---\n\n${body}\n`;
}

async function isFile(filePath: string): Promise<boolean> {
	try {
		return (await stat(filePath)).isFile();
	} catch {
		return false;
	}
}

async function findTemplateFile(directory: string, name: string): Promise<string | null> {
	try {
		const entries = await readdir(directory, { withFileTypes: true });
		const expected = `${name}.md`.toLowerCase();
		for (const entry of entries) {
			if (entry.name.toLowerCase() !== expected) continue;
			const filePath = path.join(directory, entry.name);
			if (entry.isFile() || (entry.isSymbolicLink() && (await isFile(filePath)))) return filePath;
		}
	} catch {
		return null;
	}
	return null;
}

async function readTemplateFile(
	filePath: string,
	scope: PromptTemplateScope,
	source: PromptTemplateSource,
	sourceLabel: string | null,
	readOnly: boolean,
): Promise<PromptTemplateSummary | null> {
	try {
		const parsed = parsePromptTemplate(await readFile(filePath, "utf8"));
		const name = path.basename(filePath).replace(/\.md$/iu, "");
		return {
			name,
			description: parsed.description || fallbackDescription(parsed.body),
			argumentHint: parsed.argumentHint || null,
			content: parsed.body,
			scope,
			source,
			sourceLabel,
			readOnly,
			filePath,
		};
	} catch {
		return null;
	}
}

async function listTemplatesFromDirectory(
	directory: string,
	scope: PromptTemplateScope,
): Promise<PromptTemplateSummary[]> {
	try {
		const entries = await readdir(directory, { withFileTypes: true });
		const templates = await Promise.all(
			entries.flatMap((entry) => {
				if (!entry.name.toLowerCase().endsWith(".md")) return [];
				const filePath = path.join(directory, entry.name);
				if (!entry.isFile() && !entry.isSymbolicLink()) return [];
				return [readTemplateFile(filePath, scope, scope, null, false)];
			}),
		);
		return templates.filter((template): template is PromptTemplateSummary => template !== null);
	} catch {
		return [];
	}
}

export interface PackagePromptFile {
	path: string;
	source: string;
}

export class PromptTemplateManager {
	private readonly agentDir: string;

	constructor(agentDir: string) {
		this.agentDir = path.resolve(agentDir);
	}

	resolveDirectory(scope: PromptTemplateScope, projectRoot?: string): string {
		if (scope === "user") return path.join(this.agentDir, "prompts");
		if (!projectRoot) throw new Error("项目模板需要项目路径");
		return path.join(path.resolve(projectRoot), ".pi", "prompts");
	}

	async list(projectRoot?: string, packagePrompts: PackagePromptFile[] = []): Promise<PromptTemplateSummary[]> {
		const groups = await Promise.all([
			listTemplatesFromDirectory(this.resolveDirectory("user"), "user"),
			projectRoot
				? listTemplatesFromDirectory(this.resolveDirectory("project", projectRoot), "project")
				: Promise.resolve([]),
			Promise.all(
				packagePrompts.map((prompt) => readTemplateFile(prompt.path, "user", "package", prompt.source, true)),
			).then((templates) => templates.filter((template): template is PromptTemplateSummary => template !== null)),
		]);
		return groups.flat().sort((left, right) => {
			const order: Record<PromptTemplateSource, number> = { project: 0, user: 1, package: 2 };
			return order[left.source] === order[right.source]
				? left.name.localeCompare(right.name)
				: order[left.source] - order[right.source];
		});
	}

	async save(input: PromptTemplateInput, packagePrompts: PackagePromptFile[] = []): Promise<PromptTemplateSummary[]> {
		const scope = input.scope;
		const name = assertTemplateName(input.name);
		const description = assertText(input.description, "模板说明", MAX_TEMPLATE_DESCRIPTION, true).trim();
		const argumentHint = assertText(input.argumentHint, "参数提示", MAX_ARGUMENT_HINT, true).trim();
		const content = assertText(input.content, "模板内容", MAX_TEMPLATE_CONTENT, false);
		const directory = this.resolveDirectory(scope, input.projectRoot);
		await mkdir(directory, { recursive: true });

		const targetPath = path.join(directory, `${name}.md`);
		const originalName = input.originalName?.trim();
		const existingTarget = await findTemplateFile(directory, name);
		if (originalName) {
			const originalPath = await findTemplateFile(directory, assertTemplateName(originalName));
			if (!originalPath) throw new Error("原模板不存在或已被删除");
			if (existingTarget && existingTarget.toLowerCase() !== originalPath.toLowerCase()) {
				throw new Error("同名模板已存在");
			}
			if (originalPath.toLowerCase() !== targetPath.toLowerCase()) await rename(originalPath, targetPath);
		} else if (existingTarget) {
			throw new Error("同名模板已存在");
		}

		await writeFile(targetPath, renderPromptTemplate({ description, argumentHint, content }), "utf8");
		return this.list(input.projectRoot, packagePrompts);
	}

	async delete(
		input: PromptTemplateLocator,
		packagePrompts: PackagePromptFile[] = [],
	): Promise<PromptTemplateSummary[]> {
		const directory = this.resolveDirectory(input.scope, input.projectRoot);
		const filePath = await findTemplateFile(directory, assertTemplateName(input.name));
		if (!filePath) throw new Error("模板不存在或已被删除");
		await unlink(filePath);
		return this.list(input.projectRoot, packagePrompts);
	}
}
