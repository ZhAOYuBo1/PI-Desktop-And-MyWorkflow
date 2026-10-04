import anthropic from "@lobehub/icons-static-svg/icons/anthropic.svg?url";
import awsColor from "@lobehub/icons-static-svg/icons/aws-color.svg?url";
import azureAiColor from "@lobehub/icons-static-svg/icons/azureai-color.svg?url";
import baseten from "@lobehub/icons-static-svg/icons/baseten.svg?url";
import cerebrasColor from "@lobehub/icons-static-svg/icons/cerebras-color.svg?url";
import cloudflareColor from "@lobehub/icons-static-svg/icons/cloudflare-color.svg?url";
import deepseekColor from "@lobehub/icons-static-svg/icons/deepseek-color.svg?url";
import fireworksColor from "@lobehub/icons-static-svg/icons/fireworks-color.svg?url";
import githubCopilot from "@lobehub/icons-static-svg/icons/githubcopilot.svg?url";
import googleColor from "@lobehub/icons-static-svg/icons/google-color.svg?url";
import groq from "@lobehub/icons-static-svg/icons/groq.svg?url";
import huggingFaceColor from "@lobehub/icons-static-svg/icons/huggingface-color.svg?url";
import kimi from "@lobehub/icons-static-svg/icons/kimi.svg?url";
import metaColor from "@lobehub/icons-static-svg/icons/meta-color.svg?url";
import minimaxColor from "@lobehub/icons-static-svg/icons/minimax-color.svg?url";
import mistralColor from "@lobehub/icons-static-svg/icons/mistral-color.svg?url";
import moonshot from "@lobehub/icons-static-svg/icons/moonshot.svg?url";
import nvidiaColor from "@lobehub/icons-static-svg/icons/nvidia-color.svg?url";
import openai from "@lobehub/icons-static-svg/icons/openai.svg?url";
import opencode from "@lobehub/icons-static-svg/icons/opencode.svg?url";
import openrouterColor from "@lobehub/icons-static-svg/icons/openrouter-color.svg?url";
import qwenColor from "@lobehub/icons-static-svg/icons/qwen-color.svg?url";
import togetherColor from "@lobehub/icons-static-svg/icons/together-color.svg?url";
import vercel from "@lobehub/icons-static-svg/icons/vercel.svg?url";
import vertexAiColor from "@lobehub/icons-static-svg/icons/vertexai-color.svg?url";
import xai from "@lobehub/icons-static-svg/icons/xai.svg?url";
import xiaomiMiMo from "@lobehub/icons-static-svg/icons/xiaomimimo.svg?url";
import zai from "@lobehub/icons-static-svg/icons/zai.svg?url";
import { Server } from "lucide-react";

const providerIconUrls: Record<string, string> = {
	"amazon-bedrock": awsColor,
	anthropic,
	"azure-openai-responses": azureAiColor,
	baseten,
	cerebras: cerebrasColor,
	"cloudflare-ai-gateway": cloudflareColor,
	"cloudflare-workers-ai": cloudflareColor,
	deepseek: deepseekColor,
	fireworks: fireworksColor,
	"github-copilot": githubCopilot,
	google: googleColor,
	"google-vertex": vertexAiColor,
	groq,
	huggingface: huggingFaceColor,
	"kimi-coding": kimi,
	meta: metaColor,
	minimax: minimaxColor,
	"minimax-cn": minimaxColor,
	mistral: mistralColor,
	moonshotai: moonshot,
	"moonshotai-cn": moonshot,
	nvidia: nvidiaColor,
	openai,
	"openai-codex": openai,
	opencode,
	"opencode-go": opencode,
	openrouter: openrouterColor,
	"qwen-token-plan": qwenColor,
	"qwen-token-plan-cn": qwenColor,
	"qwen-token-plan-individual": qwenColor,
	together: togetherColor,
	"vercel-ai-gateway": vercel,
	xai,
	xiaomi: xiaomiMiMo,
	"xiaomi-token-plan-ams": xiaomiMiMo,
	"xiaomi-token-plan-cn": xiaomiMiMo,
	"xiaomi-token-plan-sgp": xiaomiMiMo,
	zai,
	"zai-coding-cn": zai,
};

export function ProviderIcon({
	providerId,
	size = 16,
	className,
}: {
	providerId: string;
	size?: number;
	className?: string;
}) {
	const url = providerIconUrls[providerId];
	if (!url) return <Server className={className} size={size} strokeWidth={2} />;
	return (
		<img
			alt=""
			aria-hidden="true"
			className={`provider-brand-icon${className ? ` ${className}` : ""}`}
			decoding="async"
			height={size}
			src={url}
			width={size}
		/>
	);
}
