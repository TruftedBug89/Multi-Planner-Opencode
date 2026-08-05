import { DEFAULT_CONFIG, formatModelRef } from "./config.js";
import type { HistoryEntry } from "./history.js";
import type { SDKClient } from "./planner.js";
import type { MultiPlanConfig } from "./types.js";

export interface CatalogModel {
	providerID: string;
	modelID: string;
	name: string;
}

export async function listConnectedModels(
	client: SDKClient,
): Promise<CatalogModel[]> {
	const res = await client.provider.list();
	const data = res.data;
	if (!data) return [];
	const connected = new Set(data.connected ?? []);
	const out: CatalogModel[] = [];
	for (const provider of data.all ?? []) {
		if (!connected.has(provider.id)) continue;
		for (const [modelID, info] of Object.entries(provider.models ?? {})) {
			out.push({
				providerID: provider.id,
				modelID,
				name: typeof info?.name === "string" ? info.name : modelID,
			});
		}
	}
	out.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
	return out;
}

function refKey(m: { providerID: string; modelID: string }): string {
	return `${m.providerID}/${m.modelID}`;
}

interface Candidate {
	providerID: string;
	modelID: string;
	name: string;
	lastUsedAt?: number;
}

export function buildCandidates(
	catalog: CatalogModel[],
	history: HistoryEntry[],
): Candidate[] {
	const byKey = new Map<string, Candidate>();
	for (const h of history) {
		const cat = catalog.find((c) => refKey(c) === refKey(h));
		byKey.set(refKey(h), {
			providerID: h.providerID,
			modelID: h.modelID,
			name: cat?.name ?? `${h.providerID}/${h.modelID}`,
			lastUsedAt: h.lastUsedAt,
		});
	}
	for (const c of catalog) {
		if (!byKey.has(refKey(c))) byKey.set(refKey(c), { ...c });
	}
	return [...byKey.values()].sort(
		(a, b) =>
			(b.lastUsedAt ?? -1) - (a.lastUsedAt ?? -1) ||
			a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
	);
}

export function formatConfigShow(
	current: MultiPlanConfig | null,
	catalog: CatalogModel[],
	history: HistoryEntry[],
): string {
	const candidates = buildCandidates(catalog, history);
	const configured = new Set(current?.models.map(refKey) ?? []);
	const configuredJudge = current ? refKey(current.judge) : undefined;

	const lines: string[] = [];
	lines.push("## multi-plan setup");
	lines.push("");
	lines.push(
		current
			? `**Planners:** ${current.models.map(formatModelRef).join(", ")}`
			: "**Planners:** _not configured_",
	);
	lines.push(
		current
			? `**Judge:** ${formatModelRef(current.judge)}`
			: "**Judge:** _not configured_",
	);
	lines.push(`**minPlans:** ${current?.minPlans ?? 2}`);
	lines.push(`**timeout:** ${current?.timeout ?? 120000}ms`);
	lines.push("");
	lines.push(
		"Models below are from your connected providers, most recently used first.",
	);
	lines.push("");
	lines.push("### Model menu");
	lines.push("");
	if (candidates.length === 0) {
		lines.push("_No connected providers found. Check `/models`._");
	} else {
		candidates.forEach((c, i) => {
			const tags: string[] = [];
			if (configured.has(refKey(c))) tags.push("configured");
			if (configuredJudge === refKey(c)) tags.push("judge");
			if (DEFAULT_CONFIG.models.some((d) => refKey(d) === refKey(c))) {
				tags.push("recommended");
			}
			const tag = tags.length ? ` — _(${tags.join(", ")})_` : "";
			lines.push(`${i + 1}. \`${refKey(c)}\` ${tag}`);
		});
	}
	lines.push("");
	lines.push("**Next step:** choose model numbers and run:");
	lines.push("");
	lines.push(
		"`multi-plan-config set` with `models` (2-5), `judge`, `minPlans`, and `timeout`.",
	);
	return lines.join("\n");
}
