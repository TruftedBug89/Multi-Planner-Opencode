import type { PluginInput } from "@opencode-ai/plugin";
import { formatModelRef } from "./config.js";
import { parseStructured, textFromParts } from "./json.js";
import {
	PLANNER_SYSTEM_PROMPT,
	buildPlannerPrompt,
} from "./prompts/planner.js";
import type { ModelRef, PlannerResult } from "./types.js";
import { PlanSchema } from "./types.js";

export type SDKClient = PluginInput["client"];

export class PlannerTimeoutError extends Error {
	constructor(model: ModelRef, timeout: number) {
		super(
			`Model ${formatModelRef(model)} timed out after ${(timeout / 1000).toFixed(0)}s`,
		);
		this.name = "PlannerTimeoutError";
	}
}

async function runPlanner(
	client: SDKClient,
	model: ModelRef,
	task: string,
	timeout: number,
	signal?: AbortSignal,
): Promise<PlannerResult> {
	const start = Date.now();
	const label = formatModelRef(model);

	const session = await client.session.create({
		body: { title: `multi-plan: ${label}` },
	});
	if (!session.data) throw new Error(`could not create session for ${label}`);
	const sessionId = session.data.id;

	const controller = new AbortController();
	const onExternalAbort = () => controller.abort();
	if (signal) {
		if (signal.aborted) controller.abort();
		else signal.addEventListener("abort", onExternalAbort, { once: true });
	}

	let timer: ReturnType<typeof setTimeout> | undefined;

	try {
		const result = await Promise.race([
			client.session.prompt({
				path: { id: sessionId },
				body: {
					model: { providerID: model.providerID, modelID: model.modelID },
					system: PLANNER_SYSTEM_PROMPT,
					parts: [{ type: "text", text: buildPlannerPrompt(task) }],
				},
				signal: controller.signal,
			}),
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new PlannerTimeoutError(model, timeout)),
					timeout,
				);
			}),
		]);

		const text = textFromParts((result.data?.parts ?? []) as unknown[]);
		const parsed = parseStructured(text, PlanSchema);
		if (!parsed.ok) {
			throw new Error(`unparseable plan: ${parsed.error}`);
		}

		return {
			model,
			status: "fulfilled",
			plan: { ...parsed.value, model: label },
			durationMs: Date.now() - start,
		};
	} catch (err) {
		if (signal?.aborted && !(err instanceof PlannerTimeoutError)) {
			return {
				model,
				status: "rejected",
				error: "aborted",
				durationMs: Date.now() - start,
			};
		}
		return {
			model,
			status: "rejected",
			error: err instanceof Error ? err.message : String(err),
			durationMs: Date.now() - start,
		};
	} finally {
		if (timer) clearTimeout(timer);
		signal?.removeEventListener("abort", onExternalAbort);
		controller.abort();
		void client.session.delete({ path: { id: sessionId } }).catch(() => {});
	}
}

export async function fanOutPlans(
	client: SDKClient,
	models: ModelRef[],
	task: string,
	timeout: number,
	signal?: AbortSignal,
): Promise<PlannerResult[]> {
	const results = await Promise.allSettled(
		models.map((m) => runPlanner(client, m, task, timeout, signal)),
	);

	return results.map((r, i) => {
		if (r.status === "fulfilled") return r.value;
		const model = models[i];
		if (!model) {
			return {
				model: { providerID: "unknown", modelID: "unknown" },
				status: "rejected" as const,
				error: r.reason instanceof Error ? r.reason.message : String(r.reason),
				durationMs: 0,
			};
		}
		return {
			model,
			status: "rejected" as const,
			error: r.reason instanceof Error ? r.reason.message : String(r.reason),
			durationMs: 0,
		};
	});
}
