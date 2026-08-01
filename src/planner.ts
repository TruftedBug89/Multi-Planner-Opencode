import type { ModelRef, Plan, PlannerResult } from "./types.js"
import { PlanSchema } from "./types.js"
import { buildPlannerPrompt } from "./prompts/planner.js"

interface SessionClient {
  session: {
    create(opts?: { body?: { title?: string } }): Promise<{ data: { id: string } }>
    prompt(opts: {
      path: { id: string }
      body: {
        model?: { providerID: string; modelID: string }
        parts: Array<{ type: string; text: string }>
        format?: { type: string; schema: Record<string, unknown> }
      }
    }): Promise<{ data: { info?: { structured_output?: unknown } } }>
  }
}

const PLAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    model: { type: "string" },
    summary: { type: "string" },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          files: { type: "array", items: { type: "string" } },
          dependencies: { type: "array", items: { type: "string" } },
        },
        required: ["title", "description"],
      },
    },
    risks: { type: "array", items: { type: "string" } },
    questions: { type: "array", items: { type: "string" } },
    confidence: { type: "number" },
  },
  required: ["model", "summary", "steps", "risks", "questions", "confidence"],
}

async function runPlanner(
  client: SessionClient,
  model: ModelRef,
  task: string,
  timeout: number,
): Promise<PlannerResult> {
  const start = Date.now()
  const label = `${model.providerID}/${model.modelID}`

  try {
    const session = await client.session.create({
      body: { title: `multi-plan: ${label}` },
    })

    const result = await Promise.race([
      client.session.prompt({
        path: { id: session.data.id },
        body: {
          model: { providerID: model.providerID, modelID: model.modelID },
          parts: [{ type: "text", text: buildPlannerPrompt(task) }],
          format: { type: "json_schema", schema: PLAN_JSON_SCHEMA },
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout),
      ),
    ])

    const raw = result.data?.info?.structured_output
    const plan = PlanSchema.parse({ ...raw, model: label })

    return {
      model,
      status: "fulfilled",
      plan,
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return {
      model,
      status: "rejected",
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    }
  }
}

export async function fanOutPlans(
  client: SessionClient,
  models: ModelRef[],
  task: string,
  timeout: number,
): Promise<PlannerResult[]> {
  const results = await Promise.allSettled(
    models.map((m) => runPlanner(client, m, task, timeout)),
  )

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value
    return {
      model: models[i],
      status: "rejected" as const,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      durationMs: 0,
    }
  })
}
