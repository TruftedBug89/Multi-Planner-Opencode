import type { JudgeResult } from "./types.js"

export function formatQuestionsForUser(judgeResult: JudgeResult): string | null {
  const questions = judgeResult.questionsForUser
  if (!questions || questions.length === 0) return null

  const lines = questions.map((q, i) => `${i + 1}. ${q}`)
  return `The planning judge has identified the following clarifying questions:\n\n${lines.join("\n")}\n\nPlease answer these before proceeding with implementation.`
}

export function formatFinalPlan(judgeResult: JudgeResult): string {
  const plan = judgeResult.synthesizedPlan
  const steps = plan.steps
    .map((s, i) => {
      const files = s.files?.length ? ` [files: ${s.files.join(", ")}]` : ""
      const deps = s.dependencies?.length ? ` [after: ${s.dependencies.join(", ")}]` : ""
      return `${i + 1}. **${s.title}**${files}${deps}\n   ${s.description}`
    })
    .join("\n")

  const risks = plan.risks.length
    ? `\n## Risks\n${plan.risks.map((r) => `- ${r}`).join("\n")}`
    : ""

  const discarded = judgeResult.discardedIdeas.length
    ? `\n## Discarded Ideas\n${judgeResult.discardedIdeas.map((d) => `- ${d.idea} — ${d.reason}`).join("\n")}`
    : ""

  return `# Synthesized Plan

## Summary
${plan.summary}

## Steps
${steps}
${risks}

## Rationale
${plan.rationale}
${discarded}`
}
