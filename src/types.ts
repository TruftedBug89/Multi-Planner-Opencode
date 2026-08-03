import { z } from "zod";

export const ModelRefSchema = z.object({
	providerID: z.string().min(1),
	modelID: z.string().min(1),
});

export type ModelRef = z.infer<typeof ModelRefSchema>;

export const MultiPlanConfigSchema = z.object({
	models: z.array(ModelRefSchema).min(2).max(5),
	judge: ModelRefSchema,
	minPlans: z.number().int().min(2).max(5).default(2),
	timeout: z.number().int().min(10000).default(120000),
});

export type MultiPlanConfig = z.infer<typeof MultiPlanConfigSchema>;

export const PlanStepSchema = z.object({
	title: z.string().min(1),
	description: z.string().min(1),
	files: z.array(z.string()).optional(),
	dependencies: z.array(z.string()).optional(),
});

export const PlanSchema = z.object({
	model: z.string().min(1),
	summary: z.string().min(1),
	steps: z.array(PlanStepSchema).min(1),
	risks: z.array(z.string()).default([]),
	questions: z.array(z.string()).default([]),
	confidence: z.number().min(0).max(1).default(0.5),
});

export type Plan = z.infer<typeof PlanSchema>;
export type PlanStep = z.infer<typeof PlanStepSchema>;

export const JudgeResultSchema = z.object({
	synthesizedPlan: z.object({
		summary: z.string().min(1),
		steps: z.array(PlanStepSchema).min(1),
		risks: z.array(z.string()).default([]),
		rationale: z.string().min(1),
	}),
	questionsForUser: z.array(z.string()).default([]),
	discardedIdeas: z
		.array(
			z.object({
				idea: z.string(),
				reason: z.string(),
			}),
		)
		.default([]),
});

export type JudgeResult = z.infer<typeof JudgeResultSchema>;

export interface PlannerResult {
	model: ModelRef;
	status: "fulfilled" | "rejected";
	plan?: Plan;
	error?: string;
	durationMs: number;
}
