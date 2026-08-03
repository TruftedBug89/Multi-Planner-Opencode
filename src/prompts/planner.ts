export const PLANNER_SYSTEM_PROMPT = `You are an expert software architect. You produce concise, concrete, actionable implementation plans.
Your output is a single JSON object. No markdown, no prose outside the JSON, no code fences.`;

export const PLANNER_JSON_SCHEMA = `{
  "model": string,               // short label of the model producing this plan
  "summary": string,             // 2-4 sentence overview of the approach
  "steps": [                     // ordered implementation steps, 3-10
    {
      "title": string,           // short imperative title
      "description": string,     // what to do, why, and how to verify
      "files": string[],         // files created/modified (optional, default [])
      "dependencies": string[]   // step titles this step depends on (optional)
    }
  ],
  "risks": string[],             // risks or uncertainties
  "questions": string[],         // clarifying questions if the task is ambiguous
  "confidence": number           // 0.0 to 1.0, how confident you are in this plan
}`;

export function buildPlannerPrompt(task: string): string {
	return `Analyze the task below and produce a detailed implementation plan.

## Task
${task}

## Rules
- Break the task into concrete, ordered steps (3-10).
- For each step list the files that will be created or modified.
- Identify dependencies between steps.
- List risks or uncertainties.
- If the task is ambiguous, list clarifying questions.
- Rate your confidence (0.0 to 1.0).

## Output format
Respond with a single JSON object exactly matching this schema:

${PLANNER_JSON_SCHEMA}`;
}
