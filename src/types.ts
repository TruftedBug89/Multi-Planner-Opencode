import { z } from "zod"

export const ModelRefSchema = z.object({
  providerID: z.string(),
  modelID: z.string(),
})

export type ModelRef = z.infer<typeof ModelRefSchema>

export const MultiPlanConfigSchema = z.object({
  models: z.array(ModelRefSchema).min(2).max(5),
  judge: ModelRefSchema,
  minPlans: z.number().int().min(2).max(5).default(2),
  timeout: z.number().int().min(10000).default(120000),
  autoTrigger: z.boolean().default(false),
})

export type MultiPlanConfig = z.infer<typeof MultiPlanConfigSchema>

export const PlanStepSchema = z.object({
  title: z.string(),
  description: z.string(),
  files: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
})

export const PlanSchema = z.object({
  model: z.string(),
  summary: z.string(),
  steps: z.array(PlanStepSchema),
  risks: z.array(z.string()),
  questions: z.array(z.string()),
  confidence: z.number().min(0).max(1),
})

export type Plan = z.infer<typeof PlanSchema>
export type PlanStep = z.infer<typeof PlanStepSchema>

export const JudgeResultSchema = z.object({
  synthesizedPlan: z.object({
    summary: z.string(),
    steps: z.array(PlanStepSchema),
    risks: z.array(z.string()),
    rationale: z.string(),
  }),
  questionsForUser: z.array(z.string()),
  discardedIdeas: z.array(
    z.object({
      idea: z.string(),
      reason: z.string(),
    }),
  ),
})

export type JudgeResult = z.infer<typeof JudgeResultSchema>

export interface PlannerResult {
  model: ModelRef
  status: "fulfilled" | "rejected"
  plan?: Plan
  error?: string
  durationMs: number
}
