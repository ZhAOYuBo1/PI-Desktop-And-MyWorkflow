import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2]?.trim();
if (!version || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(version)) {
	throw new Error("Usage: npm run update:pi-runtime -- <version>");
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const runtimeRoot = path.join(repositoryRoot, "packages", "coding-agent-runtime");
const artifactsRoot = path.join(repositoryRoot, ".artifacts");
const stagingRoot = path.join(artifactsRoot, `pi-runtime-update-${version}-${Date.now()}`);
const officialPackage = "@earendil-works/pi-coding-agent";

function assertInside(parent, candidate) {
	const relative = path.relative(path.resolve(parent), path.resolve(candidate));
	if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Unsafe path: ${candidate}`);
}

function run(command, args, cwd) {
	const npmCli = process.env.npm_execpath;
	const executable = npmCli ? process.execPath : command;
	const executableArgs = npmCli ? [npmCli, ...args] : args;
	const result = spawnSync(executable, executableArgs, {
		cwd,
		env: process.env,
		shell: !npmCli && process.platform === "win32",
		stdio: "inherit",
		windowsHide: true,
	});
	if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
}

async function validateRuntime(packageRoot) {
	const required = [
		"package.json",
		"dist/index.js",
		"dist/core/slash-commands.js",
		"dist/bundle/cli.js",
	];
	for (const relative of required) {
		if (!existsSync(path.join(packageRoot, relative))) throw new Error(`Missing runtime file: ${relative}`);
	}
	const manifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
	if (manifest.name !== officialPackage || manifest.version !== version) {
		throw new Error(`Runtime manifest mismatch: ${manifest.name}@${manifest.version}`);
	}
}

assertInside(artifactsRoot, stagingRoot);
await rm(stagingRoot, { recursive: true, force: true });
await mkdir(stagingRoot, { recursive: true });

try {
	run(
		"npm",
		[
			"install",
			"--prefix",
			stagingRoot,
			"--ignore-scripts",
			"--omit=dev",
			"--no-audit",
			"--no-fund",
			"--no-package-lock",
			`${officialPackage}@${version}`,
		],
		repositoryRoot,
	);

	const sourcePackageRoot = path.join(stagingRoot, "node_modules", ...officialPackage.split("/"));
	await validateRuntime(sourcePackageRoot);

	await rm(path.join(runtimeRoot, "dist", "bundle"), { recursive: true, force: true });
	await cp(path.join(sourcePackageRoot, "dist", "bundle"), path.join(runtimeRoot, "dist", "bundle"), {
		recursive: true,
	});

	const officialManifest = JSON.parse(await readFile(path.join(sourcePackageRoot, "package.json"), "utf8"));
	const runtimeManifest = JSON.parse(await readFile(path.join(runtimeRoot, "package.json"), "utf8"));
	const dependencies = Object.fromEntries(
		Object.entries(officialManifest.dependencies ?? {}).map(([name, range]) => [
			name,
			name.startsWith("@earendil-works/") ? version : range,
		]),
	);
	dependencies["@codepiddy/pi-runtime-sdk"] = `npm:${officialPackage}@${version}`;
	runtimeManifest.version = version;
	runtimeManifest.dependencies = dependencies;
	if (officialManifest.overrides) runtimeManifest.overrides = officialManifest.overrides;
	await writeFile(
		path.join(runtimeRoot, "package.json"),
		`${JSON.stringify(runtimeManifest, null, "\t")}\n`,
		"utf8",
	);

	run(
		"npm",
		[
			"install",
			"--prefix",
			runtimeRoot,
			"--ignore-scripts",
			"--omit=dev",
			"--no-audit",
			"--no-fund",
		],
		repositoryRoot,
	);
	await validateRuntime(runtimeRoot);

	console.log(`Updated bundled Pi runtime to ${version}.`);
	console.log("Run npm run build:codepiddy-runtime to prepare the packaged runtime.");
} finally {
	assertInside(artifactsRoot, stagingRoot);
	await rm(stagingRoot, { recursive: true, force: true });
}
