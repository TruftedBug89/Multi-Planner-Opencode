import type { Plugin } from "@opencode-ai/plugin"
import { resolveConfig } from "./config.js"
import { fanOutPlans } from "./planner.js"
import { judgePlans } from "./judge.js"
import { formatFinalPlan, formatQuestionsForUser } from "./questions.js"
import type { MultiPlanConfig } from "./types.js"

export const MultiPlan: Plugin = async ({ client, directory }) => {
  let config: MultiPlanConfig | null = null

  return {
    config: async (cfg) => {
      const raw = (cfg as Record<string, unknown>).multiPlan
      config = resolveConfig(raw)
    },

    tool: {
      "multi-plan": {
        description:
          "Run consensus-based planning: multiple LLMs plan in parallel, a judge synthesizes the best plan.",
        args: {
          task: {
            type: "string" as const,
            description: "The task or feature to plan for",
          },
        },
        async execute(args: { task: string }) {
          const resolved = config ?? resolveConfig(null)
          const task = args.task

          const results = await fanOutPlans(
            client as any,
            resolved.models,
            task,
            resolved.timeout,
          )

          const successful = results.filter((r) => r.status === "fulfilled" && r.plan)
          const failed = results.filter((r) => r.status === "rejected")

          if (successful.length < resolved.minPlans) {
            const errors = failed
              .map((f) => `  - ${f.model.providerID}/${f.model.modelID}: ${f.error}`)
              .join("\n")
            return `Multi-plan failed: only ${successful.length}/${results.length} models produced plans (minimum: ${resolved.minPlans}).\n\nErrors:\n${errors}`
          }

          const plans = successful.map((r) => r.plan!)

          const judgeResult = await judgePlans(
            client as any,
            resolved.judge,
            plans,
            task,
            resolved.timeout,
          )

          const questions = formatQuestionsForUser(judgeResult)
          const finalPlan = formatFinalPlan(judgeResult)

          const report = [
            `## Multi-Plan Results`,
            ``,
            `**Models queried:** ${results.length}`,
            `**Successful:** ${successful.length}`,
            failed.length > 0 ? `**Failed:** ${failed.length} (${failed.map((f) => `${f.model.providerID}/${f.model.modelID}`).join(", ")})` : null,
            `**Durations:** ${successful.map((s) => `${s.model.providerID}/${s.model.modelID}: ${(s.durationMs / 1000).toFixed(1)}s`).join(", ")}`,
            ``,
            questions ? `${questions}\n` : null,
            finalPlan,
          ]
            .filter(Boolean)
            .join("\n")

          return report
        },
      },
    },
  }
}

export default MultiPlan
