import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ModelRef } from "./types.js";

export interface HistoryEntry extends ModelRef {
	lastUsedAt: number;
}

export function historyPath(dir: string): string {
	return join(dir, "multi-plan-history.json");
}

export function loadHistory(dir: string): HistoryEntry[] {
	const path = historyPath(dir);
	if (!existsSync(path)) return [];
	try {
		const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (
			raw &&
			typeof raw === "object" &&
			Array.isArray((raw as { entries?: unknown }).entries)
		) {
			return (raw as { entries: HistoryEntry[] }).entries.filter(
				(e) =>
					e &&
					typeof e.providerID === "string" &&
					typeof e.modelID === "string" &&
					typeof e.lastUsedAt === "number",
			);
		}
	} catch {
		/* corrupt history: ignore */
	}
	return [];
}

export function recordUsage(dir: string, models: ModelRef[]): void {
	if (models.length === 0) return;
	const now = Date.now();
	const entries = loadHistory(dir).filter(
		(e) =>
			!models.some(
				(m) => m.providerID === e.providerID && m.modelID === e.modelID,
			),
	);
	for (const m of models) entries.push({ ...m, lastUsedAt: now });
	entries.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
	try {
		writeFileSync(
			historyPath(dir),
			`${JSON.stringify({ entries }, null, 2)}\n`,
			"utf8",
		);
	} catch {
		/* ignore write errors */
	}
}
