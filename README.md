# Multi-Planner for OpenCode

Consensus-based planning for [OpenCode](https://opencode.ai): multiple LLMs plan the same task **in parallel**, then a judge model synthesizes the best plan from their combined strengths.

## How it works

1. **Fan-out** — N models (2–5, default 3) each produce a structured plan for your task in parallel sessions.
2. **Judge** — a judge model compares all plans, merges the best ideas, resolves contradictions, lists discarded ideas, and flags clarifying questions.
3. **Result** — a compact report: per-model run table (status, confidence, steps, duration) + the synthesized plan.

One model failing never kills the run: failures are reported, and the run proceeds as long as `minPlans` succeeded. If the judge itself fails, the highest-confidence plan is returned as a fallback.

## Install

Requires OpenCode with the plugin API (v1.18+).

### From npm (once published)

```json
{
  "plugin": ["multi-planner-opencode"]
}
```

### Local / from source

```json
{
  "plugin": ["./multi-planner-opencode/src/index.ts"]
}
```

Relative paths resolve from your global config dir (`~/.config/opencode/`) or the project `opencode.json`.

## Configure

Add a `multiPlan` block to your `opencode.json` (or any config in the chain):

```json
{
  "multiPlan": {
    "models": [
      { "providerID": "anthropic", "modelID": "claude-sonnet-4-5" },
      { "providerID": "openai", "modelID": "gpt-5.2" },
      { "providerID": "google", "modelID": "gemini-3-pro" }
    ],
    "judge": { "providerID": "anthropic", "modelID": "claude-sonnet-4-5" },
    "minPlans": 2,
    "timeout": 120000
  }
}
```

| Key | Default | Notes |
|---|---|---|
| `models` | 3 defaults above | 2–5 model refs; must be configured in OpenCode (`/models`) |
| `judge` | `anthropic/claude-sonnet-4-5` | Synthesizer model |
| `minPlans` | `2` | Minimum successful plans to proceed |
| `timeout` | `120000` | Per-model timeout in ms (min 10000) |

Alternatively pass config as plugin options: `"plugin": [["multi-planner-opencode", { "multiPlan": { ... } }]]`.

> Note: models must exist in your OpenCode `/models` list. The `/multi-plan-config` menu only lists connected providers, so it always picks real models. Defaults use widely available models — override them to match your providers. If you don't have e.g. Google configured, remove it from `models`.

## Usage

Restart OpenCode. The plugin is a **tool**, not a mode. You get three entry points:

### 1. `multi-planner` mode

A primary agent mode. Switch to it (mode picker) and ask for a plan — it calls `multi-plan` for you on large/ambiguous tasks.

### 2. The `multi-plan` tool

> Use multi-plan to plan: <your task>

The tool is expensive (N model calls + 1 judge call), so use it for large or ambiguous tasks.

### 3. `/multi-plan-config` — config menu

> /multi-plan-config

Shows the current config plus a numbered menu of your **connected** models ordered by **last use** (tracked by the plugin across runs). Pick planners + judge, and the command applies the changes to your `opencode.json` automatically.

You can also call the `multi-plan-config` tool directly:
- `action="show"` — current config + model menu
- `action="set"` with `models` / `judge` / `minPlans` / `timeout` — applies and writes to `opencode.json`

Config applies immediately in the running session; restart OpenCode to make it permanent at startup.

## Example output

```
## Multi-Plan Results
**Task:** Add dark mode to the settings page

### Planner Runs
| Model | Status | Confidence | Steps | Time |
|---|---|---|---|---|
| anthropic/claude-sonnet-4-5 | ok | 0.85 | 6 | 14.2s |
| openai/gpt-5.2 | ok | 0.78 | 5 | 17.8s |
| google/gemini-3-pro | failed | — | — | 1.2s |

**Judge:** anthropic/claude-sonnet-4-5

## Synthesized Plan
**Summary:** ...

**Steps:**
1. **Add theme tokens** `src/theme.ts`
   ...
```

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run lint        # biome check
npm run build       # tsc emit
```

## How it works under the hood

- Each planner + the judge run in their own OpenCode session via `client.session.create()` / `client.session.prompt()`, so they reuse your provider auth, rate limits and retries.
- Plans are requested as strict JSON (schema embedded in the prompt) and parsed defensively (`src/json.ts` handles fenced/raw JSON, nested braces, prose wrapping) then validated with zod.
- Sessions are deleted after each call; timeouts and user aborts are respected.

See `docs/ARCHITECTURE.md` for design details.

## License

MIT
