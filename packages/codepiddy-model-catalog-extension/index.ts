import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type RuntimeModelType = "chat" | "classifier" | "image";

export type SpecialModelCatalogType = "chat" | "virtual" | "classifier" | "image";

export type SpecialModelCatalogSource = "configured" | "extension" | "virtual";

export interface SpecialModelCatalogEntry {
	provider: string;
	id: string;
	name: string;
	type: SpecialModelCatalogType;
	api: string;
	source: SpecialModelCatalogSource;
	available: boolean | null;
	contextWindow?: number;
	maxTokens?: number;
}

export interface SpecialModelCatalogSnapshot {
	version: 1;
	updatedAt: string;
	models: SpecialModelCatalogEntry[];
	errors: string[];
}

interface RuntimeModel {
	provider: string;
	id: string;
	name?: string;
	api?: string;
	contextWindow?: number;
	maxTokens?: number;
}

interface ModelRegistry {
	getModelsOfType(type: RuntimeModelType, provider?: string): readonly RuntimeModel[];
	getAvailableOfType(type: RuntimeModelType, provider?: string): Promise<readonly RuntimeModel[]>;
	getRegisteredProviderIds(): readonly string[];
}

interface SessionStartContext {
	modelRegistry: ModelRegistry;
}

type RegisterSessionStart = (
	event: "session_start",
	handler: (event: { type: "session_start" }, context: SessionStartContext) => Promise<void> | void,
) => void;

const MODEL_TYPES: readonly RuntimeModelType[] = ["chat", "classifier", "image"];
const SNAPSHOT_TYPE_ORDER: readonly SpecialModelCatalogType[] = ["chat", "virtual", "classifier", "image"];
const VIRTUAL_MODEL_API = "pi-virtual";

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function modelKey(type: RuntimeModelType, model: RuntimeModel): string {
	return `${type}\u0000${model.provider}\u0000${model.id}`;
}

function optionalPositive(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function snapshotType(type: RuntimeModelType, model: RuntimeModel): SpecialModelCatalogType {
	return type === "chat" && model.api === VIRTUAL_MODEL_API ? "virtual" : type;
}

function snapshotSource(
	providerIds: ReadonlySet<string>,
	type: SpecialModelCatalogType,
	provider: string,
): SpecialModelCatalogSource {
	if (type === "virtual") return "virtual";
	return providerIds.has(provider) ? "extension" : "configured";
}

export async function buildModelCatalogSnapshot(registry: ModelRegistry): Promise<SpecialModelCatalogSnapshot> {
	const errors: string[] = [];
	const registeredProviderIds = new Set(registry.getRegisteredProviderIds());
	const availability = new Map<RuntimeModelType, ReadonlySet<string> | null>();

	await Promise.all(
		MODEL_TYPES.map(async (type) => {
			try {
				const available = await registry.getAvailableOfType(type);
				availability.set(type, new Set(available.map((model) => modelKey(type, model))));
			} catch (error) {
				availability.set(type, null);
				errors.push(`${type} availability: ${errorMessage(error)}`);
			}
		}),
	);

	const entries = new Map<string, SpecialModelCatalogEntry>();
	for (const type of MODEL_TYPES) {
		let models: readonly RuntimeModel[];
		try {
			models = registry.getModelsOfType(type);
		} catch (error) {
			errors.push(`${type} catalog: ${errorMessage(error)}`);
			continue;
		}
		const available = availability.get(type) ?? null;
		for (const model of models) {
			if (!model.provider || !model.id) continue;
			const modelType = snapshotType(type, model);
			const api = typeof model.api === "string" && model.api.trim() ? model.api : "unknown";
			const entry: SpecialModelCatalogEntry = {
				provider: model.provider,
				id: model.id,
				name: typeof model.name === "string" && model.name.trim() ? model.name : model.id,
				type: modelType,
				api,
				source:
					modelType === "virtual"
						? "virtual"
						: snapshotSource(registeredProviderIds, modelType, model.provider),
				available: available ? available.has(modelKey(type, model)) : null,
			};
			const contextWindow = optionalPositive(model.contextWindow);
			if (contextWindow !== undefined) entry.contextWindow = contextWindow;
			const maxTokens = optionalPositive(model.maxTokens);
			if (maxTokens !== undefined) entry.maxTokens = maxTokens;
			entries.set(modelKey(type, model), entry);
		}
	}

	return {
		version: 1,
		updatedAt: new Date().toISOString(),
		models: [...entries.values()].sort(
			(left, right) =>
				SNAPSHOT_TYPE_ORDER.indexOf(left.type) - SNAPSHOT_TYPE_ORDER.indexOf(right.type) ||
				left.provider.localeCompare(right.provider) ||
				left.name.localeCompare(right.name) ||
				left.id.localeCompare(right.id),
		),
		errors,
	};
}

export function resolveModelCatalogPath(env: NodeJS.ProcessEnv = process.env): string | null {
	const configured = env.CODEPIDDY_MODEL_CATALOG_PATH?.trim();
	return configured ? path.resolve(configured) : null;
}

export default function modelCatalogExtension(pi: ExtensionAPI): void {
	const catalogPath = resolveModelCatalogPath();
	if (!catalogPath) return;

	const onSessionStart = pi.on as unknown as RegisterSessionStart;
	onSessionStart("session_start", async (_event, context) => {
		const snapshot = await buildModelCatalogSnapshot(context.modelRegistry);
		await mkdir(path.dirname(catalogPath), { recursive: true });
		await writeFile(catalogPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
	});
}
