declare module "highlight.js/lib/core.js" {
	import hljs from "highlight.js";
	export default hljs;
}

declare module "highlight.js/lib/languages/*.js" {
	import hljs from "highlight.js";
	const language: Parameters<typeof hljs.registerLanguage>[1];
	export default language;
}
