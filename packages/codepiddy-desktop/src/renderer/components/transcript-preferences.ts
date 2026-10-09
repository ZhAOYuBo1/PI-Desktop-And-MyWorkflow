export type ThinkingDisplayMode = "compact" | "detailed";

export const TRANSCRIPT_THINKING_DISPLAY_STORAGE_KEY = "codepiddy.transcript.thinkingDisplayMode";
export const TRANSCRIPT_SMOOTH_STREAMING_STORAGE_KEY = "codepiddy.transcript.smoothStreaming";

export function normalizeThinkingDisplayMode(value: unknown): ThinkingDisplayMode {
	return value === "detailed" ? "detailed" : "compact";
}

export function normalizeSmoothStreaming(value: unknown): boolean {
	return value !== "false";
}

interface LocalStorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

function browserStorage(): LocalStorageLike | null {
	return (globalThis as { localStorage?: LocalStorageLike }).localStorage ?? null;
}

export function readTranscriptThinkingDisplayMode(): ThinkingDisplayMode {
	try {
		return normalizeThinkingDisplayMode(browserStorage()?.getItem(TRANSCRIPT_THINKING_DISPLAY_STORAGE_KEY) ?? null);
	} catch {
		return "compact";
	}
}

export function readTranscriptSmoothStreaming(): boolean {
	try {
		return normalizeSmoothStreaming(browserStorage()?.getItem(TRANSCRIPT_SMOOTH_STREAMING_STORAGE_KEY) ?? null);
	} catch {
		return true;
	}
}

export function writeTranscriptThinkingDisplayMode(mode: ThinkingDisplayMode): void {
	try {
		browserStorage()?.setItem(TRANSCRIPT_THINKING_DISPLAY_STORAGE_KEY, mode);
	} catch {}
}

export function writeTranscriptSmoothStreaming(enabled: boolean): void {
	try {
		browserStorage()?.setItem(TRANSCRIPT_SMOOTH_STREAMING_STORAGE_KEY, String(enabled));
	} catch {}
}
