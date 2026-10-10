import { describe, expect, it } from "vitest";
import { buildModelCatalogSnapshot } from "../index.ts";

interface FakeModel {
	provider: string;
	id: string;
	name?: string;
	api?: string;
	contextWindow?: number;
	maxTokens?: number;
}

function registry(models: Record<"chat" | "classifier" | "image", FakeModel[]>, available?: FakeModel[]) {
	return {
		getModelsOfType(type: "chat" | "classifier" | "image") {
			return models[type];
		},
		async getAvailableOfType() {
			return available ?? [];
		},
		getRegisteredProviderIds() {
			return ["router"];
		},
	};
}

describe("model catalog extension", () => {
	it("classifies chat, virtual, classifier and image entries", async () => {
		const snapshot = await buildModelCatalogSnapshot(
			registry(
				{
					chat: [
						{ provider: "openai", id: "gpt-5", name: "GPT-5", api: "openai-responses" },
						{ provider: "router", id: "auto", name: "Auto", api: "pi-virtual" },
					],
					classifier: [{ provider: "typesafe", id: "jev", name: "Jev", api: "typesafe" }],
					image: [{ provider: "openai", id: "gpt-image", name: "GPT Image", api: "openai-images" }],
				},
				[{ provider: "router", id: "auto", api: "pi-virtual" }],
			),
		);

		expect(snapshot.models.map((model) => model.type)).toEqual(["chat", "virtual", "classifier", "image"]);
		expect(snapshot.models.find((model) => model.id === "auto")).toMatchObject({
			source: "virtual",
			available: true,
		});
		expect(snapshot.models.find((model) => model.id === "jev")).toMatchObject({
			source: "configured",
			available: false,
		});
	});

	it("keeps availability unknown when Pi cannot check a model type", async () => {
		const failing = registry({ chat: [], classifier: [], image: [] });
		failing.getAvailableOfType = async () => {
			throw new Error("auth unavailable");
		};
		const snapshot = await buildModelCatalogSnapshot(failing);
		expect(snapshot.errors).toHaveLength(3);
	});
});
