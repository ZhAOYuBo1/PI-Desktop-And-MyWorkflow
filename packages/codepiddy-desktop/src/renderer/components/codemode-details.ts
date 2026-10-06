export interface CodemodeCall {
	id: string;
	name: string;
	args: string;
	status: string;
	durationMs: number | null;
	error: string | null;
	cost: number | null;
}

export interface CodemodeDetails {
	calls: CodemodeCall[];
	fullOutputPath: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberOrNull(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrEmpty(value: unknown): string {
	return typeof value === "string" ? value : "";
}

export function parseCodemodeDetails(value: unknown): CodemodeDetails {
	if (!isRecord(value)) return { calls: [], fullOutputPath: null };
	const calls = Array.isArray(value.calls)
		? value.calls.flatMap((raw) => {
				if (!isRecord(raw)) return [];
				const name = stringOrEmpty(raw.name);
				if (!name) return [];
				return [
					{
						id: stringOrEmpty(raw.id),
						name,
						args: stringOrEmpty(raw.args),
						status: stringOrEmpty(raw.status) || "unknown",
						durationMs: numberOrNull(raw.durationMs),
						error: typeof raw.error === "string" && raw.error ? raw.error : null,
						cost: numberOrNull(raw.cost),
					},
				];
			})
		: [];
	return {
		calls,
		fullOutputPath: typeof value.fullOutputPath === "string" && value.fullOutputPath ? value.fullOutputPath : null,
	};
}

export function codemodeSourceFromArgs(args: string): string | null {
	try {
		const parsed: unknown = JSON.parse(args);
		return isRecord(parsed) && typeof parsed.code === "string" ? parsed.code : null;
	} catch {
		return null;
	}
}
