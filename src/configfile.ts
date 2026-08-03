import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { MultiPlanConfig } from "./types.js";

const PLUGIN_NAME = "multi-planner-opencode";

export function configDir(): string {
	const xdg = process.env.XDG_CONFIG_HOME;
	const base = xdg
		? join(xdg, "opencode")
		: join(homedir(), ".config", "opencode");
	return base;
}

export function globalConfigPath(): string {
	return join(configDir(), "opencode.json");
}

export function readOpenCodeConfig(): Record<string, unknown> | null {
	const path = globalConfigPath();
	if (!existsSync(path)) return null;
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
	} catch {
		/* malformed config: report failure to caller */
	}
	return null;
}

export function writeOpenCodeConfig(
	cfg: Record<string, unknown>,
	path: string,
): void {
	const tmp = `${path}.tmp`;
	writeFileSync(tmp, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
	renameSync(tmp, path);
}

export function updatePluginOptions(
	cfg: Record<string, unknown>,
	multiPlan: MultiPlanConfig,
): { updated: boolean } {
	const plugins = cfg.plugin;
	if (!Array.isArray(plugins)) return { updated: false };
	for (const entry of plugins) {
		if (!Array.isArray(entry) || entry.length < 2) continue;
		const [name, options] = entry;
		if (typeof name !== "string" || !name.includes(PLUGIN_NAME)) continue;
		if (options && typeof options === "object" && !Array.isArray(options)) {
			(options as Record<string, unknown>).multiPlan = multiPlan;
			return { updated: true };
		}
	}
	return { updated: false };
}
