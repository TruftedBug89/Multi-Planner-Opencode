export function buildPlannerPrompt(task: string): string {
  return `You are an expert software architect. Analyze the following task and produce a detailed implementation plan.

## Task
${task}

## Instructions
- Break the task into concrete, ordered steps.
- For each step, identify which files will be created or modified.
- Identify dependencies between steps.
- List any risks or uncertainties.
- If the task is ambiguous, list clarifying questions.
- Rate your confidence in the plan (0.0 to 1.0).

Respond with a structured plan.`
}
