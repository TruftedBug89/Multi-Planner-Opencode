# Multi-Planner for OpenCode

> [!WARNING]
> **Project Status:** ⚠️ **In Development / Not Working**  
> *This repository is currently under development and is not fully functional yet. This status must not be changed by AI unless explicitly instructed by the repository owner.*


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

The model list belongs in the plugin tuple options. Do not put it under `agent` or in a separate `.opencode/multi-plan.json` file:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [[
    "multi-planner-opencode",
    {
      "multiPlan": {
        "models": [
          { "providerID": "forge", "modelID": "gpt-5.6-luna" },
          { "providerID": "forge", "modelID": "claude-sonnet-4-6" },
          { "providerID": "forge", "modelID": "deepseek-v4-flash" }
        ],
        "judge": { "providerID": "forge", "modelID": "claude-sonnet-4-6" },
        "minPlans": 2,
        "timeout": 120000
      }
    }
  ]]
}
```

Each model must use the exact `providerID` and `modelID` shown by OpenCode. The plugin passes these IDs unchanged to OpenCode; it does not use display names or guess providers.

| Key | Notes |
|---|---|
| `models` | 2–5 exact OpenCode model references used in parallel |
| `judge` | Exact OpenCode model reference used to synthesize the plans |
| `minPlans` | Minimum successful plans; defaults to `2` |
| `timeout` | Per-model timeout in milliseconds; minimum `10000` |

### Easy in-CLI setup

After installation, restart OpenCode and run:

```text
/multi-plan-config
```

The command asks the agent to show your connected models, lets you choose planner models and a judge from numbered IDs, validates the selection, and writes it back under the plugin tuple options. It does not run shell commands or make planning model calls.

## Usage

Run consensus planning directly:

```text
/multi-plan Add dark mode to the settings page
```

This command calls the registered `multi-plan` tool. You can also ask the agent to use that tool directly for a large or ambiguous task. The plugin exposes two tools—`multi-plan` and `multi-plan-config`—and does not automatically create an agent or mode.

Configuration changes apply immediately in the current session and persist to the global OpenCode config. Restart OpenCode after setup so the saved model list is loaded at startup.

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
