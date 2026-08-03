function extractBalanced(text: string, start: number): string | null {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < text.length; i++) {
		const c = text[i];
		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (c === "\\") {
				escaped = true;
			} else if (c === '"') {
				inString = false;
			}
			continue;
		}
		if (c === '"') {
			inString = true;
		} else if (c === "{") {
			depth++;
		} else if (c === "}") {
			depth--;
			if (depth === 0) return text.slice(start, i + 1);
		}
	}
	return null;
}

export function extractJSON(text: string): string | null {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fenced?.[1]) return fenced[1].trim();

	const start = text.indexOf("{");
	if (start === -1) return null;
	return extractBalanced(text, start);
}

export function parseStructured<T>(
	text: string,
	schema: { parse(input: unknown): T },
): { ok: true; value: T } | { ok: false; error: string } {
	const candidates: string[] = [];
	const primary = extractJSON(text);
	if (primary) candidates.push(primary);

	const start = text.indexOf("{");
	if (start !== -1) {
		const balanced = extractBalanced(text, start);
		if (balanced && balanced !== primary) candidates.push(balanced);
	}

	if (candidates.length === 0)
		return { ok: false, error: "no JSON object found in model output" };

	let lastError = "";
	for (const candidate of candidates) {
		try {
			return { ok: true, value: schema.parse(JSON.parse(candidate)) };
		} catch (err) {
			lastError = err instanceof Error ? err.message : String(err);
		}
	}
	return { ok: false, error: lastError };
}

export function textFromParts(parts: unknown[]): string {
	return parts
		.filter(
			(p): p is { type: "text"; text: string } =>
				typeof p === "object" &&
				p !== null &&
				"type" in p &&
				(p as { type?: unknown }).type === "text" &&
				"text" in p &&
				typeof (p as { text?: unknown }).text === "string",
		)
		.map((p) => p.text)
		.join("\n");
}
