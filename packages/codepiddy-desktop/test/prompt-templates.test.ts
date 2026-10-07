import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PromptTemplateManager, parsePromptTemplate } from "../src/main/prompt-templates.ts";

describe("prompt templates", () => {
	let agentDirectory: string;
	let projectDirectory: string;

	beforeEach(async () => {
		agentDirectory = await mkdtemp(path.join(tmpdir(), "codepiddy-prompts-agent-"));
		projectDirectory = await mkdtemp(path.join(tmpdir(), "codepiddy-prompts-project-"));
	});

	afterEach(async () => {
		await rm(agentDirectory, { recursive: true, force: true });
		await rm(projectDirectory, { recursive: true, force: true });
	});

	it("parses description, argument hint and body", () => {
		expect(
			parsePromptTemplate(
				'---\ndescription: "Review a change"\nargument-hint: "[focus]"\n---\n\nReview $ARGUMENTS\n',
			),
		).toEqual({
			description: "Review a change",
			argumentHint: "[focus]",
			body: "Review $ARGUMENTS",
		});
	});

	it("lists user and project templates", async () => {
		await mkdir(path.join(agentDirectory, "prompts"), { recursive: true });
		await writeFile(
			path.join(agentDirectory, "prompts", "review.md"),
			"---\ndescription: Review code\n---\n\nReview this change.\n",
			"utf8",
		);
		await mkdir(path.join(projectDirectory, ".pi", "prompts"), { recursive: true });
		await writeFile(path.join(projectDirectory, ".pi", "prompts", "fix.md"), "Fix the bug.\n", "utf8");

		const manager = new PromptTemplateManager(agentDirectory);
		const templates = await manager.list(projectDirectory);
		expect(templates.map((template) => `${template.scope}:${template.name}`)).toEqual(["project:fix", "user:review"]);
		expect(templates.find((template) => template.name === "review")?.description).toBe("Review code");
		expect(templates.find((template) => template.name === "fix")?.description).toBe("Fix the bug.");
	});

	it("creates, renames and deletes a template", async () => {
		const manager = new PromptTemplateManager(agentDirectory);
		await manager.save({
			scope: "user",
			name: "review",
			description: "Review code",
			argumentHint: "[focus]",
			content: "Review $ARGUMENTS",
		});
		const filePath = path.join(agentDirectory, "prompts", "review.md");
		expect(await readFile(filePath, "utf8")).toContain('description: "Review code"');

		await manager.save({
			scope: "user",
			originalName: "review",
			name: "code-review",
			description: "Review code deeply",
			argumentHint: "",
			content: "Review deeply: $ARGUMENTS",
		});
		expect((await manager.list()).map((template) => template.name)).toEqual(["code-review"]);
		expect(await readFile(path.join(agentDirectory, "prompts", "code-review.md"), "utf8")).toContain(
			"Review deeply: $ARGUMENTS",
		);

		await manager.delete({ scope: "user", name: "code-review" });
		expect(await manager.list()).toEqual([]);
	});

	it("rejects duplicate names and path traversal", async () => {
		const manager = new PromptTemplateManager(agentDirectory);
		await manager.save({
			scope: "user",
			name: "review",
			description: "",
			argumentHint: "",
			content: "Review",
		});
		await expect(
			manager.save({
				scope: "user",
				name: "review",
				description: "",
				argumentHint: "",
				content: "Duplicate",
			}),
		).rejects.toThrow("同名模板已存在");
		await expect(
			manager.save({
				scope: "user",
				name: "../escape",
				description: "",
				argumentHint: "",
				content: "Nope",
			}),
		).rejects.toThrow("非法字符");
	});
});
