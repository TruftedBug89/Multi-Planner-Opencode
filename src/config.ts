import {
	type ModelRef,
	type MultiPlanConfig,
	MultiPlanConfigSchema,
} from "./types.js";

export const DEFAULT_CONFIG: MultiPlanConfig = {
	models: [
		{ providerID: "anthropic", modelID: "claude-sonnet-4-5" },
		{ providerID: "openai", modelID: "gpt-5.2" },
		{ providerID: "google", modelID: "gemini-3-pro" },
	],
	judge: { providerID: "anthropic", modelID: "claude-sonnet-4-5" },
	minPlans: 2,
	timeout: 120000,
};

export function resolveConfig(raw: unknown): MultiPlanConfig {
	if (!raw || typeof raw !== "object") {
		return DEFAULT_CONFIG;
	}
	const merged = { ...DEFAULT_CONFIG, ...(raw as Record<string, unknown>) };
	const parsed = MultiPlanConfigSchema.parse(merged);
	if (parsed.minPlans > parsed.models.length) {
		parsed.minPlans = parsed.models.length;
	}
	return parsed;
}

export const PRESETS: Record<string, MultiPlanConfig> = {
	balanced: {
		models: [
			{ providerID: "anthropic", modelID: "claude-sonnet-4-5" },
			{ providerID: "openai", modelID: "gpt-5.2" },
		],
		judge: { providerID: "anthropic", modelID: "claude-sonnet-4-5" },
		minPlans: 2,
		timeout: 120000,
	},
	fast: {
		models: [
			{ providerID: "anthropic", modelID: "claude-sonnet-4-5" },
			{ providerID: "openai", modelID: "gpt-5.2" },
		],
		judge: { providerID: "anthropic", modelID: "claude-sonnet-4-5" },
		minPlans: 2,
		timeout: 60000,
	},
	thorough: {
		models: [
			{ providerID: "anthropic", modelID: "claude-sonnet-4-5" },
			{ providerID: "openai", modelID: "gpt-5.2" },
			{ providerID: "google", modelID: "gemini-3-pro" },
		],
		judge: { providerID: "anthropic", modelID: "claude-sonnet-4-5" },
		minPlans: 2,
		timeout: 180000,
	},
};

export function getModelBadge(model: ModelRef | string): {
	name: string;
	badge: string;
	emoji: string;
} {
	const modelStr =
		typeof model === "string" ? model : `${model.providerID}/${model.modelID}`;
	const lower = modelStr.toLowerCase();

	if (lower.includes("anthropic") || lower.includes("claude")) {
		return { name: "Claude", badge: "🧠 Claude", emoji: "🧠" };
	}
	if (lower.includes("openai") || lower.includes("gpt")) {
		return { name: "GPT", badge: "⚡ GPT", emoji: "⚡" };
	}
	if (lower.includes("google") || lower.includes("gemini")) {
		return { name: "Gemini", badge: "💎 Gemini", emoji: "💎" };
	}
	if (lower.includes("deepseek")) {
		return { name: "DeepSeek", badge: "🐋 DeepSeek", emoji: "🐋" };
	}
	if (lower.includes("mistral")) {
		return { name: "Mistral", badge: "🌪️ Mistral", emoji: "🌪️" };
	}
	return { name: "AI", badge: "🤖 AI", emoji: "🤖" };
}

export function formatConfigMatrix(config: MultiPlanConfig): string {
	const modelList = config.models
		.map((m) => {
			const b = getModelBadge(m);
			return `│   • ${b.badge} \`${m.providerID}/${m.modelID}\``;
		})
		.join("\n");

	const judgeBadge = getModelBadge(config.judge);

	return `⚙️ **MULTI-PLANNER CONFIGURATION MATRIX**

┌─────────────────────────────────────────────────────────────┐
│ 🤖 **Parallel Planner Council** (${config.models.length}):
${modelList}
│
│ ⚖️ **Synthesis Judge**: ${judgeBadge.badge} \`${config.judge.providerID}/${config.judge.modelID}\`
└─────────────────────────────────────────────────────────────┘`;
}

export function formatModelRef(m: {
	providerID: string;
	modelID: string;
}): string {
	return `${m.providerID}/${m.modelID}`;
}
