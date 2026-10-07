import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const args = process.argv.slice(2);
console.log = (...values) => console.error(...values);
console.info = (...values) => console.error(...values);
console.debug = (...values) => console.error(...values);

function argument(name) {
	const index = args.indexOf(name);
	return index >= 0 ? args[index + 1] : undefined;
}

const packageDir = argument("--package-dir");
const agentDir = argument("--agent-dir");
const action = argument("--action");
const cwd = argument("--cwd") ?? process.cwd();
const source = argument("--source");
const scope = argument("--scope");
const enabled = argument("--enabled") === "true";
const projectTrusted = argument("--project-trusted") === "true";

if (!packageDir || !agentDir || !action || !cwd) {
	console.error("pi-package-helper requires --package-dir, --agent-dir, --action and --cwd");
	process.exit(2);
}

const require = createRequire(import.meta.url);
const { DefaultPackageManager, SettingsManager } = require(
	path.join(path.resolve(packageDir), "dist", "bundle", "index.js"),
);

function write(value) {
	process.stdout.write(`${JSON.stringify(value)}\n`);
}

function parseSourceType(value) {
	if (value.startsWith("npm:")) return "npm";
	if (
		value.startsWith("git:") ||
		value.startsWith("ssh://") ||
		value.startsWith("http://") ||
		value.startsWith("https://") ||
		value.startsWith("git@")
	) {
		return "git";
	}
	return "local";
}

function displayName(value) {
	if (value.startsWith("npm:")) {
		const spec = value.slice(4);
		const separator = spec.lastIndexOf("@");
		return separator > 0 ? spec.slice(0, separator) : spec;
	}
	if (parseSourceType(value) === "git") {
		return value
			.replace(/^git:/u, "")
			.replace(/^https?:\/\//u, "")
			.replace(/^ssh:\/\//u, "")
			.replace(/\.git$/u, "");
	}
	return path.basename(path.resolve(cwd, value)) || value;
}

function installedVersion(installedPath) {
	if (!installedPath) return null;
	try {
		const manifest = JSON.parse(readFileSync(path.join(installedPath, "package.json"), "utf8"));
		return typeof manifest.version === "string" && manifest.version.trim() ? manifest.version.trim() : null;
	} catch {
		return null;
	}
}

function emptyResourceSummary() {
	return {
		extensions: { total: 0, enabled: 0 },
		skills: { total: 0, enabled: 0 },
		prompts: { total: 0, enabled: 0 },
		themes: { total: 0, enabled: 0 },
	};
}

function resourceSummary(resolved, sourceValue, scopeValue) {
	const summary = emptyResourceSummary();
	for (const type of ["extensions", "skills", "prompts", "themes"]) {
		for (const resource of resolved[type] ?? []) {
			if (resource.metadata?.origin !== "package") continue;
			if (resource.metadata.source !== sourceValue || resource.metadata.scope !== scopeValue) continue;
			summary[type].total += 1;
			if (resource.enabled) summary[type].enabled += 1;
		}
	}
	return summary;
}

function normalizeScope(value) {
	return value === "project" ? "project" : "user";
}

function normalizeUpdateType(value) {
	return value === "git" ? "git" : "npm";
}

async function createManager() {
	const settingsManager = SettingsManager.create(cwd, agentDir, { projectTrusted });
	const manager = new DefaultPackageManager({ cwd, agentDir, settingsManager });
	manager.setProgressCallback((event) => {
		write({ type: "progress", event });
	});
	return { manager, settingsManager };
}

function packageSource(pkg) {
	return typeof pkg === "string" ? pkg : pkg.source;
}

function packageEntry(settingsManager, scopeValue, sourceValue) {
	const settings = scopeValue === "project" ? settingsManager.getProjectSettings() : settingsManager.getGlobalSettings();
	return (settings.packages ?? []).find((pkg) => packageSource(pkg) === sourceValue);
}

function extensionEnabled(pkg) {
	return typeof pkg !== "string" && Array.isArray(pkg.extensions) && pkg.extensions.length > 0;
}

async function listPackages(manager, settingsManager) {
	const configured = manager.listConfiguredPackages();
	const resolved = await manager.resolve(async () => "skip");
	const packages = configured
		.map((entry) => {
			const sourceType = parseSourceType(entry.source);
			const resources = resourceSummary(resolved, entry.source, entry.scope);
			const extensionEnabledValue = extensionEnabled(packageEntry(settingsManager, entry.scope, entry.source));
			if (!extensionEnabledValue) resources.extensions.enabled = 0;
			return {
				source: entry.source,
				scope: entry.scope,
				sourceType,
				displayName: displayName(entry.source),
				version: installedVersion(entry.installedPath),
				installedPath: entry.installedPath ?? null,
				installed: Boolean(entry.installedPath),
				filtered: entry.filtered,
				resources,
				extensionEnabled: extensionEnabledValue,
			};
		})
		.sort((left, right) => {
			if (left.scope !== right.scope) return left.scope === "project" ? -1 : 1;
			return left.displayName.localeCompare(right.displayName);
		});
	return {
		type: "packages",
		packages,
		updates: [],
		projectTrusted,
	};
}

async function enabledExtensions(manager, settingsManager) {
	const resolved = await manager.resolve(async () => "skip");
	return {
		type: "extensions",
		extensions: resolved.extensions
			.filter(
				(resource) =>
					resource.enabled &&
					resource.metadata?.origin === "package" &&
					extensionEnabled(packageEntry(settingsManager, resource.metadata.scope, resource.metadata.source)),
			)
			.map((resource) => resource.path),
		projectTrusted,
	};
}

async function packageSkillPaths(manager) {
	const resolved = await manager.resolve(async () => "skip");
	return {
		type: "skills",
		skills: resolved.skills
			.filter((resource) => resource.enabled && resource.metadata?.origin === "package")
			.map((resource) => resource.path),
		projectTrusted,
	};
}

async function packagePromptFiles(manager) {
	const resolved = await manager.resolve(async () => "skip");
	return {
		type: "prompts",
		prompts: resolved.prompts
			.filter((resource) => resource.enabled && resource.metadata?.origin === "package")
			.map((resource) => ({ path: resource.path, source: resource.metadata.source })),
		projectTrusted,
	};
}

async function setExtensionEnabled(settingsManager, scopeValue, sourceValue, nextEnabled) {
	const settings = scopeValue === "project" ? settingsManager.getProjectSettings() : settingsManager.getGlobalSettings();
	const packages = [...(settings.packages ?? [])];
	const index = packages.findIndex((pkg) => packageSource(pkg) === sourceValue);
	if (index < 0) throw new Error(`No matching package found for ${sourceValue}`);
	const existing = packages[index];
	packages[index] =
		typeof existing === "string"
			? { source: existing, extensions: nextEnabled ? ["*"] : [] }
			: { ...existing, extensions: nextEnabled ? ["*"] : [] };
	if (scopeValue === "project") settingsManager.setProjectPackages(packages);
	else settingsManager.setPackages(packages);
	await settingsManager.flush();
}

async function checkForUpdates(manager) {
	const updates = await manager.checkForAvailableUpdates();
	return {
		type: "updates",
		updates: updates.map((update) => ({
			source: update.source,
			displayName: update.displayName,
			sourceType: normalizeUpdateType(update.type),
			scope: update.scope,
		})),
		projectTrusted,
	};
}

async function main() {
	const { manager, settingsManager } = await createManager();
	if (action === "list") {
		write(await listPackages(manager, settingsManager));
		return;
	}
	if (action === "enabled-extensions") {
		write(await enabledExtensions(manager, settingsManager));
		return;
	}
	if (action === "package-skills") {
		write(await packageSkillPaths(manager));
		return;
	}
	if (action === "package-prompts") {
		write(await packagePromptFiles(manager));
		return;
	}
	if (action === "check-updates") {
		write(await checkForUpdates(manager));
		return;
	}

	if (!source || !scope) {
		throw new Error("Package action requires --source and --scope");
	}
	const normalizedScope = normalizeScope(scope);
	const local = normalizedScope === "project";

	if (action === "install") {
		await manager.installAndPersist(source, { local });
		write({ type: "complete", message: `Installed ${source}` });
		return;
	}
	if (action === "remove") {
		const removed = await manager.removeAndPersist(source, { local });
		if (!removed) throw new Error(`No matching package found for ${source}`);
		write({ type: "complete", message: `Removed ${source}` });
		return;
	}
	if (action === "update") {
		await manager.update(source);
		write({ type: "complete", message: `Updated ${source}` });
		return;
	}
	if (action === "set-extension") {
		await setExtensionEnabled(settingsManager, normalizedScope, source, enabled);
		write({ type: "complete", message: enabled ? `Enabled extension ${source}` : `Disabled extension ${source}` });
		return;
	}
	throw new Error(`Unknown package action: ${action}`);
}

try {
	await main();
	process.exit(0);
} catch (error) {
	write({ type: "error", error: error instanceof Error ? error.message : String(error) });
	process.exit(1);
}
