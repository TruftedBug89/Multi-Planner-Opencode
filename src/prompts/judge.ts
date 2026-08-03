import type { Plan } from "../types.js";

export const JUDGE_SYSTEM_PROMPT = `You are a senior technical judge. Multiple AI models have independently produced implementation plans for the same task. You synthesize the BEST possible plan by combining their strengths.
Your output is a single JSON object. No markdown, no prose outside the JSON, no code fences.`;

export const JUDGE_JSON_SCHEMA = `{
  "synthesizedPlan": {
    "summary": string,       // 2-4 sentence overview of the final approach
    "steps": [               // ordered final steps, 3-10
      {
        "title": string,
        "description": string,
        "files": string[],
        "dependencies": string[]
      }
    ],
    "risks": string[],
    "rationale": string      // why this combination is superior
  },
  "questionsForUser": string[],   // consolidated clarifying questions (deduplicated)
  "discardedIdeas": [             // ideas from individual plans you rejected
    { "idea": string, "reason": string }
  ]
}`;

export function buildJudgePrompt(plans: Plan[], task: string): string {
	const planSections = plans
		.map(
			(
				p,
				i,
			) => `### Plan ${i + 1} (from ${p.model}, confidence: ${p.confidence.toFixed(2)})
**Summary:** ${p.summary}
**Steps:**
${p.steps.map((s, j) => `  ${j + 1}. ${s.title}: ${s.description}`).join("\n")}
**Risks:** ${p.risks.join(", ") || "none identified"}
**Questions:** ${p.questions.join(", ") || "none"}
`,
		)
		.join("\n---\n");

	return `## Original Task
${task}

## Submitted Plans
${planSections}

## Your Instructions
1. Compare all plans. Identify unique strengths and weaknesses of each.
2. Combine the best ideas into a single, superior plan.
3. Resolve any contradictions between plans (explain your reasoning in "rationale").
4. Remove redundant or inferior steps.
5. If the plans collectively reveal ambiguities, formulate a consolidated, deduplicated set of clarifying questions for the user.
6. List ideas you discarded and why.

## Output format
Respond with a single JSON object exactly matching this schema:

${JUDGE_JSON_SCHEMA}`;
}
