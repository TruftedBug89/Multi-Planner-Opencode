import { parseStructured, textFromParts } from "./json.js";
import type { SDKClient } from "./planner.js";
import { buildJudgePrompt, JUDGE_SYSTEM_PROMPT } from "./prompts/judge.js";
import type { JudgeResult, ModelRef, Plan } from "./types.js";
import { JudgeResultSchema } from "./types.js";

export async function judgePlans(
	client: SDKClient,
	judge: ModelRef,
	plans: Plan[],
	task: string,
	timeout: number,
	signal?: AbortSignal,
): Promise<JudgeResult> {
	const session = await client.session.create({
		body: { title: "multi-plan: judge" },
	});
	if (!session.data) throw new Error("could not create judge session");
	const sessionId = session.data.id;

	let timer: ReturnType<typeof setTimeout> | undefined;

	try {
		const result = await Promise.race([
			client.session.prompt({
				path: { id: sessionId },
				body: {
					model: { providerID: judge.providerID, modelID: judge.modelID },
					system: JUDGE_SYSTEM_PROMPT,
					parts: [{ type: "text", text: buildJudgePrompt(plans, task) }],
				},
				signal,
			}),
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() =>
						reject(
							new Error(
								`Judge timed out after ${(timeout / 1000).toFixed(0)}s`,
							),
						),
					timeout,
				);
			}),
		]);

		const text = textFromParts((result.data?.parts ?? []) as unknown[]);
		const parsed = parseStructured(text, JudgeResultSchema);
		if (!parsed.ok) {
			throw new Error(`unparseable judge output: ${parsed.error}`);
		}
		return parsed.value;
	} finally {
		if (timer) clearTimeout(timer);
		void client.session.delete({ path: { id: sessionId } }).catch(() => {});
	}
}
