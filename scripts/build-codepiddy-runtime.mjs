import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const outputRoot = path.join(repositoryRoot, ".artifacts", "codepiddy-runtime");
const runtimeRoot = path.join(repositoryRoot, "packages", "coding-agent-runtime");
if (!existsSync(path.join(runtimeRoot, "node_modules"))) {
	throw new Error(
		"coding-agent-runtime is not hydrated. Run: npm install --prefix packages/coding-agent-runtime --ignore-scripts --omit=dev",
	);
}

await rm(outputRoot, { force: true, recursive: true });
await mkdir(path.join(outputRoot, "extensions"), { recursive: true });
await mkdir(path.join(outputRoot, "mcp"), { recursive: true });
await mkdir(path.join(outputRoot, "skills"), { recursive: true });
await mkdir(path.join(outputRoot, "dependencies"), { recursive: true });

const common = {
	absWorkingDir: repositoryRoot,
	bundle: true,
	format: "esm",
	legalComments: "none",
	ignoreAnnotations: true,
	minify: true,
	platform: "node",
	target: "node22.19",
};

await Promise.all([
	build({
		...common,
		alias: {
			"jsonc-parser": path.join(repositoryRoot, "node_modules", "jsonc-parser", "lib", "esm", "main.js"),
		},
		entryPoints: [path.join(repositoryRoot, "packages", "codepiddy-permission-extension", "index.ts")],
		outfile: path.join(outputRoot, "extensions", "permission.js"),
	}),
	build({
		...common,
		entryPoints: [path.join(repositoryRoot, "packages", "codepiddy-review-extension", "index.ts")],
		outfile: path.join(outputRoot, "extensions", "review.js"),
	}),
	build({
		...common,
		entryPoints: [path.join(repositoryRoot, "packages", "codepiddy-retry-extension", "index.ts")],
		outfile: path.join(outputRoot, "extensions", "retry.js"),
	}),
	build({
		...common,
		entryPoints: [path.join(repositoryRoot, "packages", "codepiddy-cache-warming-extension", "index.ts")],
		outfile: path.join(outputRoot, "extensions", "cache-warming.js"),
	}),
	build({
		...common,
		entryPoints: [path.join(repositoryRoot, "packages", "codepiddy-tavily-search-mcp", "src", "index.ts")],
		outfile: path.join(outputRoot, "mcp", "tavily-search.js"),
	}),
]);

await Promise.all([
	cp(
		path.join(repositoryRoot, "packages", "codepiddy-agent-skills"),
		path.join(outputRoot, "skills"),
		{ recursive: true },
	),
	cp(
		path.join(repositoryRoot, "packages", "codepiddy-desktop", "scripts", "pi-auth-helper.mjs"),
		path.join(outputRoot, "extensions", "pi-auth-helper.mjs"),
	),
	cp(
		path.join(repositoryRoot, "packages", "codepiddy-desktop", "scripts", "pi-trust-helper.mjs"),
		path.join(outputRoot, "extensions", "pi-trust-helper.mjs"),
	),
	cp(
		path.join(repositoryRoot, "packages", "codepiddy-desktop", "scripts", "pi-share-helper.mjs"),
		path.join(outputRoot, "extensions", "pi-share-helper.mjs"),
	),
	cp(
		path.join(repositoryRoot, "packages", "codepiddy-desktop", "scripts", "pi-package-helper.mjs"),
		path.join(outputRoot, "extensions", "pi-package-helper.mjs"),
	),
	cp(
		path.join(runtimeRoot, "dist"),
		path.join(outputRoot, "coding-agent-package", "dist"),
		{ recursive: true },
	),
	cp(
		path.join(runtimeRoot, "package.json"),
		path.join(outputRoot, "coding-agent-package", "package.json"),
	),
	cp(
		path.join(runtimeRoot, "package-lock.json"),
		path.join(outputRoot, "coding-agent-package", "package-lock.json"),
	),
	cp(path.join(runtimeRoot, "node_modules"), path.join(outputRoot, "coding-agent-package", "node_modules"), {
		recursive: true,
	}),
	cp(path.join(repositoryRoot, "node_modules", "npm"), path.join(outputRoot, "npm"), { recursive: true }),
]);

console.log(`Prepared packaged runtime at ${outputRoot}`);
