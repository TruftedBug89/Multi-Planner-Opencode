import { MultiPlanConfigSchema, type MultiPlanConfig } from "./types.js"

const DEFAULT_CONFIG: MultiPlanConfig = {
  models: [
    { providerID: "anthropic", modelID: "claude-sonnet-4-20250514" },
    { providerID: "openai", modelID: "gpt-5" },
  ],
  judge: { providerID: "anthropic", modelID: "claude-sonnet-4-20250514" },
  minPlans: 2,
  timeout: 120000,
  autoTrigger: false,
}

export function resolveConfig(raw: unknown): MultiPlanConfig {
  if (!raw || typeof raw !== "object") {
    return DEFAULT_CONFIG
  }
  const merged = { ...DEFAULT_CONFIG, ...(raw as Record<string, unknown>) }
  return MultiPlanConfigSchema.parse(merged)
}
