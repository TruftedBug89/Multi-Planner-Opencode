import { type Plugin, tool } from "@opencode-ai/plugin";
import {
	formatModelRef,
	resolveConfig,
	resolvePluginConfig,
} from "./config.js";
import {
	configDir,
	globalConfigPath,
	readOpenCodeConfig,
	updatePluginOptions,
	writeOpenCodeConfig,
} from "./configfile.js";
import { loadHistory, recordUsage } from "./history.js";
import { judgePlans } from "./judge.js";
import { formatConfigShow, listConnectedModels } from "./menu.js";
import { fanOutPlans } from "./planner.js";
import {
	formatBestPlanFallback,
	formatFinalPlan,
	formatPlanTable,
	formatQuestionsForUser,
	truncate,
} from "./questions.js";
import type { MultiPlanConfig, Plan, PlannerResult } from "./types.js";

export const MultiPlan: Plugin = async ({ client }, options) => {
	let config: MultiPlanConfig | null = null;
	let configError: string | null = null;
	const cfgDir = configDir();

	const currentConfig = () => {
		if (configError) throw new Error(configError);
		if (!config) {
			throw new Error(
				"Multi-Planner is not configured. Run /multi-plan-config, choose at least two connected models, and save the selection.",
			);
		}
		return config;
	};

	const recordRun = (
		results: PlannerResult[],
		judge?: MultiPlanConfig["judge"],
	) => {
		const used = results
			.filter((r) => r.status === "fulfilled")
			.map((r) => r.model);
		if (judge) used.push(judge);
		recordUsage(cfgDir, used);
	};

	return {
		config: async (cfg) => {
			try {
				config = resolvePluginConfig(options, cfg);
				configError = null;
			} catch (err) {
				config = null;
				configError = `Invalid Multi-Planner configuration: ${err instanceof Error ? err.message : String(err)}`;
			}
		},

		tool: {
			"multi-plan": tool({
				description:
					"Consensus planning: N LLMs plan the task in parallel, a judge model synthesizes the best plan. Expensive and slow — use for large or ambiguous tasks, not small ones.",
				args: {
					task: tool.schema
						.string()
						.min(1)
						.describe("The task or feature to plan for"),
				},
				async execute(args, ctx) {
					let resolved: MultiPlanConfig;
					try {
						resolved = currentConfig();
					} catch (err) {
						return `## Multi-Plan Not Configured\n\n${err instanceof Error ? err.message : String(err)}`;
					}
					const { task } = args;

					ctx.metadata({
						title: `multi-plan: ${resolved.models.length} planners on "${truncate(task, 30)}"`,
					});

					try {
						const results = await fanOutPlans(
							client,
							resolved.models,
							task,
							resolved.timeout,
							ctx.abort,
						);
						recordRun(results, resolved.judge);

						const successful = results.filter(
							(r): r is PlannerResult & { plan: Plan } =>
								r.status === "fulfilled" && !!r.plan,
						);
						const failed = results.filter((r) => r.status === "rejected");

						if (successful.length < resolved.minPlans) {
							const errors = failed
								.map((f) => `- ${formatModelRef(f.model)}: ${f.error}`)
								.join("\n");
							return [
								"## Multi-Plan Failed",
								"",
								`Only ${successful.length}/${results.length} models produced plans (minimum: ${resolved.minPlans}).`,
								"",
								"**Failures:**",
								errors,
								"",
								"**Fix:** check that the models in `multiPlan.models` are configured in OpenCode (`/models`) and override them in your config if needed.",
							].join("\n");
						}

						ctx.metadata({ title: "multi-plan: judging plans…" });

						const plans = successful.map((r) => r.plan);
						let judgeResult: Awaited<ReturnType<typeof judgePlans>>;

						try {
							judgeResult = await judgePlans(
								client,
								resolved.judge,
								plans,
								task,
								resolved.timeout,
								ctx.abort,
							);
						} catch (err) {
							const fallback = formatBestPlanFallback(plans);
							return [
								"## Multi-Plan Results",
								"",
								`**Task:** ${truncate(task, 120)}`,
								"",
								"### Planner Runs",
								formatPlanTable(results),
								"",
								`> Judge failed: ${err instanceof Error ? err.message : String(err)}`,
								"",
								fallback,
							].join("\n");
						}

						recordRun([], resolved.judge);
						const questions = formatQuestionsForUser(judgeResult);
						const finalPlan = formatFinalPlan(judgeResult);

						return [
							"## Multi-Plan Results",
							"",
							`**Task:** ${truncate(task, 120)}`,
							"",
							"### Planner Runs",
							formatPlanTable(results),
							"",
							`**Judge:** ${formatModelRef(resolved.judge)}`,
							...(questions ? [`\n${questions}`] : []),
							"",
							finalPlan,
						].join("\n");
					} catch (err) {
						const message = err instanceof Error ? err.message : String(err);
						return `## Multi-Plan Failed\n\nUnexpected error: ${message}\n\nIf this persists, check your \`multiPlan\` config in \`opencode.json\`.`;
					}
				},
			}),

			"multi-plan-config": tool({
				description:
					"Show or change multi-plan settings (planner models, judge model, minPlans, timeout). Use action=show to display the current config plus a menu of your available models ordered by last use. Use action=set with the chosen model refs to apply changes.",
				args: {
					action: tool.schema
						.enum(["show", "set"])
						.describe(
							"show = display config + model menu; set = apply changes",
						),
					models: tool.schema
						.array(
							tool.schema.object({
								providerID: tool.schema.string(),
								modelID: tool.schema.string(),
							}),
						)
						.optional()
						.describe("Planner models (2-5)"),
					judge: tool.schema
						.object({
							providerID: tool.schema.string(),
							modelID: tool.schema.string(),
						})
						.optional()
						.describe("Judge model"),
					minPlans: tool.schema
						.number()
						.int()
						.min(2)
						.max(5)
						.optional()
						.describe("Minimum successful plans to proceed"),
					timeout: tool.schema
						.number()
						.int()
						.min(10000)
						.optional()
						.describe("Per-model timeout in ms"),
				},
				async execute(args) {
					if (args.action === "show") {
						const [catalog, history] = await Promise.all([
							listConnectedModels(client),
							Promise.resolve(loadHistory(cfgDir)),
						]);
						return formatConfigShow(config, catalog, history);
					}

					if (!args.models || !args.judge) {
						return "## Multi-Plan Setup\n\nUse `/multi-plan-config` to see connected models, then provide at least two planner models and one judge model.";
					}

					const current = config;
					const next = resolveConfig({
						models: args.models,
						judge: args.judge,
						minPlans: args.minPlans ?? current?.minPlans ?? 2,
						timeout: args.timeout ?? current?.timeout ?? 120000,
					});

					const fileCfg = readOpenCodeConfig();
					if (fileCfg) {
						const { updated } = updatePluginOptions(fileCfg, next);
						if (updated) {
							writeOpenCodeConfig(fileCfg, globalConfigPath());
							config = next;
							recordUsage(cfgDir, [...next.models, next.judge]);
							return [
								"## multi-plan config updated",
								"",
								`**Planners:** ${next.models.map(formatModelRef).join(", ")}`,
								`**Judge:** ${formatModelRef(next.judge)}`,
								`**minPlans:** ${next.minPlans}`,
								`**timeout:** ${next.timeout}ms`,
								"",
								`Written to \`${globalConfigPath()}\`. Restart opencode for the change to be picked up at startup (it is already active in this session).`,
							].join("\n");
						}
					}

					return [
						"## multi-plan config not saved",
						"",
						`Could not find a \`multiPlan\` plugin entry in \`${globalConfigPath()}\`.`,
						"",
						"Add it manually:",
						"```json",
						JSON.stringify({ multiPlan: next }, null, 2),
						"```",
						"",
						`or pass it as plugin options: \`"plugin": [["multi-planner-opencode", { "multiPlan": { ... } }]]\`.`,
					].join("\n");
				},
			}),
		},
	};
};

export default MultiPlan;
