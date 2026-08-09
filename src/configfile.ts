import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
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
	const jsonc = join(configDir(), "opencode.jsonc");
	if (existsSync(jsonc)) return jsonc;
	return join(configDir(), "opencode.json");
}

function stripJsonComments(source: string): string {
	let output = "";
	let inString = false;
	let escaped = false;
	let inLineComment = false;
	let inBlockComment = false;

	for (let i = 0; i < source.length; i += 1) {
		const char = source[i];
		const next = source[i + 1];

		if (inLineComment) {
			if (char === "\n") {
				inLineComment = false;
				output += char;
			} else {
				output += " ";
			}
			continue;
		}
		if (inBlockComment) {
			if (char === "*" && next === "/") {
				inBlockComment = false;
				output += "  ";
				i += 1;
			} else {
				output += char === "\n" ? "\n" : " ";
			}
			continue;
		}
		if (inString) {
			output += char;
			if (escaped) escaped = false;
			else if (char === "\\") escaped = true;
			else if (char === '"') inString = false;
			continue;
		}
		if (char === '"') {
			inString = true;
			output += char;
		} else if (char === "/" && next === "/") {
			inLineComment = true;
			output += "  ";
			i += 1;
		} else if (char === "/" && next === "*") {
			inBlockComment = true;
			output += "  ";
			i += 1;
		} else if (char === ",") {
			// JSONC permits trailing commas; JSON.parse does not.
			let j = i + 1;
			while (j < source.length && /\s/.test(source[j] ?? "")) j += 1;
			const after = source[j];
			if (after === "}" || after === "]") output += " ";
			else output += char;
		} else {
			output += char;
		}
	}
	return output;
}

export function readOpenCodeConfig(): Record<string, unknown> | null {
	const path = globalConfigPath();
	if (!existsSync(path)) return null;
	try {
		const parsed: unknown = JSON.parse(
			stripJsonComments(readFileSync(path, "utf8")),
		);
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
	mkdirSync(dirname(path), { recursive: true });
	const tmp = `${path}.tmp`;
	writeFileSync(tmp, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
	renameSync(tmp, path);
}

function isMultiPlanPlugin(name: string): boolean {
	const normalized = name.toLowerCase().replaceAll("\\", "/");
	return (
		normalized === PLUGIN_NAME ||
		normalized.endsWith(`/${PLUGIN_NAME}`) ||
		normalized.includes(`/${PLUGIN_NAME}/`) ||
		normalized.endsWith("/multi-planner-opencode/src/index.ts")
	);
}

export function updatePluginOptions(
	cfg: Record<string, unknown>,
	multiPlan: MultiPlanConfig,
): { updated: boolean } {
	const plugins = cfg.plugin;
	if (!Array.isArray(plugins)) return { updated: false };
	for (let i = 0; i < plugins.length; i += 1) {
		const entry = plugins[i];
		if (typeof entry === "string") {
			if (!isMultiPlanPlugin(entry)) continue;
			plugins[i] = [entry, { multiPlan }];
			return { updated: true };
		}
		if (!Array.isArray(entry) || entry.length === 0) continue;
		const name = entry[0];
		if (typeof name !== "string" || !isMultiPlanPlugin(name)) continue;
		const options =
			entry[1] && typeof entry[1] === "object" && !Array.isArray(entry[1])
				? (entry[1] as Record<string, unknown>)
				: {};
		options.multiPlan = multiPlan;
		entry[1] = options;
		return { updated: true };
	}
	return { updated: false };
}
