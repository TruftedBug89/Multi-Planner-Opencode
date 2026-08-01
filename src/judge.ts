import type { JudgeResult, ModelRef, Plan } from "./types.js"
import { JudgeResultSchema } from "./types.js"
import { buildJudgePrompt } from "./prompts/judge.js"

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

const JUDGE_JSON_SCHEMA = {
  type: "object",
  properties: {
    synthesizedPlan: {
      type: "object",
      properties: {
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
        rationale: { type: "string" },
      },
      required: ["summary", "steps", "risks", "rationale"],
    },
    questionsForUser: { type: "array", items: { type: "string" } },
    discardedIdeas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          idea: { type: "string" },
          reason: { type: "string" },
        },
        required: ["idea", "reason"],
      },
    },
  },
  required: ["synthesizedPlan", "questionsForUser", "discardedIdeas"],
}

export async function judgePlans(
  client: SessionClient,
  judge: ModelRef,
  plans: Plan[],
  task: string,
  timeout: number,
): Promise<JudgeResult> {
  const session = await client.session.create({
    body: { title: "multi-plan: judge" },
  })

  const result = await Promise.race([
    client.session.prompt({
      path: { id: session.data.id },
      body: {
        model: { providerID: judge.providerID, modelID: judge.modelID },
        parts: [{ type: "text", text: buildJudgePrompt(plans, task) }],
        format: { type: "json_schema", schema: JUDGE_JSON_SCHEMA },
      },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Judge timeout after ${timeout}ms`)), timeout),
    ),
  ])

  const raw = result.data?.info?.structured_output
  return JudgeResultSchema.parse(raw)
}
