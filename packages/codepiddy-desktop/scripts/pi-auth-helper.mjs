import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { createInterface } from "node:readline";

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
const providerId = argument("--provider");
const authType = argument("--auth-type");

if (!packageDir || !agentDir || !action) {
	console.error("pi-auth-helper requires --package-dir, --agent-dir and --action");
	process.exit(2);
}

const require = createRequire(import.meta.url);
const { ModelRuntime } = require(path.join(packageDir, "dist", "bundle", "index.js"));
await mkdir(agentDir, { recursive: true });
const runtime = await ModelRuntime.create({
	authPath: path.join(agentDir, "auth.json"),
	modelsPath: path.join(agentDir, "models.json"),
	allowModelNetwork: true,
	refreshOnCreate: false,
});

function write(value) {
	process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function loadDeviceId() {
	const file = path.join(agentDir, "device-id");
	try {
		const value = (await readFile(file, "utf8")).trim();
		if (value) return value;
	} catch {
		// Create the stable installation id below.
	}
	const value = randomUUID();
	await writeFile(file, `${value}\n`, { encoding: "utf8", flag: "wx" }).catch(async (error) => {
		if (error?.code !== "EEXIST") throw error;
	});
	return (await readFile(file, "utf8")).trim() || value;
}

function providerSummary(provider) {
	const methods = [];
	if (provider.auth.apiKey) {
		methods.push({ type: "api_key", name: provider.auth.apiKey.name });
	}
	if (provider.auth.oauth) {
		methods.push({
			type: "oauth",
			name: provider.auth.oauth.name,
			...(provider.auth.oauth.isSubscription ? { isSubscription: true } : {}),
		});
	}
	const status = runtime.getProviderAuthStatus(provider.id);
	return {
		id: provider.id,
		name: provider.name,
		configured: status.configured,
		authType: status.configured ? (runtime.isUsingOAuth(provider.id) ? "oauth" : "api_key") : null,
		source: status.source ?? null,
		sourceLabel: status.label ?? null,
		methods,
	};
}

if (action === "list") {
	write({
		type: "providers",
		providers: runtime
			.getProviders()
			.map(providerSummary)
			.sort((left, right) => left.name.localeCompare(right.name)),
	});
	process.exit(0);
}

if (action === "logout") {
	if (!providerId) {
		write({ type: "error", error: "Missing --provider" });
		process.exit(2);
	}
	try {
		await runtime.logout(providerId);
		write({ type: "complete" });
		process.exit(0);
	} catch (error) {
		write({ type: "error", error: error instanceof Error ? error.message : String(error) });
		process.exit(1);
	}
}

if (action !== "login" || !providerId || !authType) {
	write({ type: "error", error: "Invalid auth helper arguments" });
	process.exit(2);
}

const abortController = new AbortController();
const pendingPrompts = new Map();
const input = createInterface({ input: process.stdin, terminal: false });

input.on("line", (line) => {
	let message;
	try {
		message = JSON.parse(line);
	} catch {
		return;
	}
	if (message.type === "cancel") {
		abortController.abort();
		for (const pending of pendingPrompts.values()) pending.reject(new Error("登录已取消"));
		pendingPrompts.clear();
		return;
	}
	if (message.type !== "prompt_response" || typeof message.promptId !== "string") return;
	const pending = pendingPrompts.get(message.promptId);
	if (!pending) return;
	pendingPrompts.delete(message.promptId);
	if (message.cancelled) pending.reject(new Error("登录已取消"));
	else pending.resolve(typeof message.value === "string" ? message.value : "");
});

function prompt(value) {
	const promptId = randomUUID();
	write({ type: "prompt", promptId, prompt: value });
	return new Promise((resolve, reject) => {
		const onAbort = () => {
			pendingPrompts.delete(promptId);
			reject(new Error("登录已取消"));
		};
		pendingPrompts.set(promptId, {
			resolve: (result) => {
				value.signal?.removeEventListener("abort", onAbort);
				resolve(result);
			},
			reject: (error) => {
				value.signal?.removeEventListener("abort", onAbort);
				reject(error);
			},
		});
		value.signal?.addEventListener("abort", onAbort, { once: true });
	});
}

try {
	const deviceId = await loadDeviceId();
	await runtime.login(providerId, authType, {
		signal: abortController.signal,
		prompt,
		notify: (event) => write({ type: "event", event }),
	}, { getDeviceId: () => deviceId });
	write({ type: "complete" });
	process.exit(0);
} catch (error) {
	write({ type: "error", error: error instanceof Error ? error.message : String(error) });
	process.exit(1);
}
