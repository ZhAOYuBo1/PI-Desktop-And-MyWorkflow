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
const cwd = argument("--cwd");
const decisionValue = argument("--decision");

if (!packageDir || !agentDir || !action || !cwd) {
	console.error("pi-trust-helper requires --package-dir, --agent-dir, --action and --cwd");
	process.exit(2);
}

const require = createRequire(import.meta.url);
const { ProjectTrustStore, hasTrustRequiringProjectResources } = require(
	path.join(packageDir, "dist", "bundle", "index.js"),
);
const store = new ProjectTrustStore(agentDir);

function status() {
	const entry = store.getEntry(cwd);
	return {
		projectRoot: cwd,
		decision: entry?.decision ?? null,
		inheritedFrom: entry?.path ?? null,
		requiresTrust: hasTrustRequiringProjectResources(cwd),
	};
}

if (action === "status") {
	process.stdout.write(`${JSON.stringify(status())}\n`);
	process.exit(0);
}

if (action === "set") {
	if (decisionValue !== "true" && decisionValue !== "false") {
		console.error("pi-trust-helper --decision must be true or false");
		process.exit(2);
	}
	const decision = decisionValue === "true";
	const includeParent = argument("--include-parent") === "true";
	if (includeParent) {
		const parent = path.dirname(path.resolve(cwd));
		store.setMany([
			{ path: parent, decision: true },
			{ path: cwd, decision: null },
		]);
	} else {
		store.set(cwd, decision);
	}
	process.stdout.write(`${JSON.stringify(status())}\n`);
	process.exit(0);
}

console.error(`Unknown pi-trust-helper action: ${action}`);
process.exit(2);
