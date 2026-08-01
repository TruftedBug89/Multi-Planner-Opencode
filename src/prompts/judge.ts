import type { Plan } from "../types.js"

export function buildJudgePrompt(plans: Plan[], task: string): string {
  const planSections = plans
    .map(
      (p, i) => `### Plan ${i + 1} (from ${p.model}, confidence: ${p.confidence})
**Summary:** ${p.summary}
**Steps:**
${p.steps.map((s, j) => `  ${j + 1}. ${s.title}: ${s.description}`).join("\n")}
**Risks:** ${p.risks.join(", ") || "none identified"}
**Questions:** ${p.questions.join(", ") || "none"}
`,
    )
    .join("\n---\n")

  return `You are a senior technical judge. Multiple AI models have independently produced implementation plans for the same task. Your job is to synthesize the BEST possible plan by combining their strengths.

## Original Task
${task}

## Submitted Plans
${planSections}

## Your Instructions
1. Compare all plans. Identify unique strengths and weaknesses of each.
2. Combine the best ideas into a single, superior plan.
3. Resolve any contradictions between plans (explain your reasoning).
4. Remove redundant or inferior steps.
5. If the plans collectively reveal ambiguities, formulate a consolidated set of clarifying questions for the user (deduplicate across plans).
6. List ideas you discarded and why.

Produce your synthesized result.`
}
