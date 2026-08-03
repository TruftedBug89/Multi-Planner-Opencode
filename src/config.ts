import { type MultiPlanConfig, MultiPlanConfigSchema } from "./types.js";

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
	return MultiPlanConfigSchema.parse(merged);
}

export function formatModelRef(m: {
	providerID: string;
	modelID: string;
}): string {
	return `${m.providerID}/${m.modelID}`;
}
