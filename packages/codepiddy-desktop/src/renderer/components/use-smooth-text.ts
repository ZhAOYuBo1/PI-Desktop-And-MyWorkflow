import { useEffect, useRef, useState } from "react";
import { nextSmoothText } from "./transcript-smooth-text.ts";

/**
 * Keep provider deltas immediate in state, but release them to the view at a
 * bounded rate. This avoids one-frame jumps when a provider emits large chunks.
 */
export function useSmoothText(source: string, streaming: boolean, enabled: boolean): string {
	const [display, setDisplay] = useState(source);
	const displayRef = useRef(source);

	useEffect(() => {
		if (!enabled || !streaming) {
			displayRef.current = source;
			setDisplay(source);
			return;
		}
		if (!source.startsWith(displayRef.current)) {
			displayRef.current = source;
			setDisplay(source);
			return;
		}
		if (source.length <= displayRef.current.length) return;
		const timer = window.setInterval(() => {
			const current = displayRef.current;
			if (current.length >= source.length) {
				window.clearInterval(timer);
				return;
			}
			const next = nextSmoothText(source, current);
			displayRef.current = next;
			setDisplay(next);
		}, 24);
		return () => window.clearInterval(timer);
	}, [enabled, source, streaming]);

	return display;
}
