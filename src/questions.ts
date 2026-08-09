import { formatModelRef, getModelBadge } from "./config.js";
import type {
	JudgeResult,
	MultiPlanConfig,
	Plan,
	PlannerResult,
} from "./types.js";

export function truncate(s: string, max: number): string {
	const clean = s.replace(/\s+/g, " ").trim();
	return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function formatPlanTable(results: PlannerResult[]): string {
	const rows = results.map((r) => {
		if (r.status === "rejected") {
			return `| ${formatModelRef(r.model)} | failed | — | — | ${(r.durationMs / 1000).toFixed(1)}s |`;
		}
		const plan = r.plan;
		return `| ${formatModelRef(r.model)} | ok | ${plan?.confidence.toFixed(2) ?? "—"} | ${plan?.steps.length ?? "—"} | ${(r.durationMs / 1000).toFixed(1)}s |`;
	});
	return `| Model | Status | Confidence | Steps | Time |
|---|---|---|---|---|
${rows.join("\n")}`;
}

export function formatQuestionsForUser(
	judgeResult: JudgeResult,
): string | null {
	const questions = judgeResult.questionsForUser;
	if (!questions || questions.length === 0) return null;

	const lines = questions.map((q, i) => `${i + 1}. ${q}`);
	return `## Clarifying Questions
${lines.join("\n")}

Answer these before implementing, or ask the agent to proceed with best-effort assumptions.`;
}

export function formatFinalPlan(judgeResult: JudgeResult): string {
	const plan = judgeResult.synthesizedPlan;
	const steps = plan.steps
		.map((s, i) => {
			const files = s.files?.length ? ` \`${s.files.join("`, `")}\`` : "";
			const deps = s.dependencies?.length
				? ` _(after: ${s.dependencies.join(", ")})_`
				: "";
			return `${i + 1}. **${s.title}**${deps}${files}\n   ${s.description}`;
		})
		.join("\n");

	const risks = plan.risks.length
		? `\n## Risks\n${plan.risks.map((r) => `- ${r}`).join("\n")}`
		: "";

	const discarded = judgeResult.discardedIdeas.length
		? `\n## Discarded Ideas\n${judgeResult.discardedIdeas.map((d) => `- **${truncate(d.idea, 60)}** — ${truncate(d.reason, 120)}`).join("\n")}`
		: "";

	return `## Synthesized Plan
**Summary:** ${plan.summary}

**Steps:**
${steps}${risks}

**Rationale:** ${plan.rationale}${discarded}`;
}

export function formatBestPlanFallback(plans: Plan[]): string {
	const best = plans.reduce((a, b) => (b.confidence > a.confidence ? b : a));
	return `## Synthesized Plan (judge unavailable — best plan by confidence)
**Source:** ${best.model} (confidence ${best.confidence.toFixed(2)})
**Summary:** ${best.summary}

**Steps:**
${best.steps
	.map((s, i) => {
		const files = s.files?.length ? ` \`${s.files.join("`, `")}\`` : "";
		const deps = s.dependencies?.length
			? ` _(after: ${s.dependencies.join(", ")})_`
			: "";
		return `${i + 1}. **${s.title}**${deps}${files}\n   ${s.description}`;
	})
	.join("\n")}

**Risks:**
${best.risks.length ? best.risks.map((r) => `- ${r}`).join("\n") : "- none identified"}

> The judge model failed. Re-run with a working judge model to get a synthesized plan.`;
}

export function formatPreFlightStatusCard(
	config: MultiPlanConfig,
	task: string,
): string {
	const modelList = config.models
		.map((m) => {
			const b = getModelBadge(m);
			return `│   • ${b.badge} \`${m.providerID}/${m.modelID}\`  [ ⏳ Fan-out Prompts Sent ]`;
		})
		.join("\n");

	const judgeBadge = getModelBadge(config.judge);

	return `⚡ **MULTI-PLANNER CONSENSUS PIPELINE LAUNCHED**

┌─────────────────────────────────────────────────────────────┐
│ 🤖 **Parallel Planner Council** (${config.models.length}):                            │
${modelList}
│                                                             │
│ ⚖️ **Synthesis Judge**: ${judgeBadge.badge} \`${config.judge.providerID}/${config.judge.modelID}\`  │
└─────────────────────────────────────────────────────────────┘
*Dispatching task: "${task}"...*`;
}
