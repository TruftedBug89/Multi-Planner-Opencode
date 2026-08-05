# Multi-Plan: Architecture Proposal

## Overview

Multi-Plan is an OpenCode plugin that improves planning by running multiple LLMs in parallel on the same problem, then using a "judge" model to synthesize a superior plan.

## Flow

```
User invokes the multi-plan tool (agent calls `multi-plan` with a task)
  │
  ▼
┌─────────────────────────────────────────────────┐
│  1. FAN-OUT: Create N sessions (2-5 models)     │
│     Each receives the same planning prompt      │
│     All run in parallel via Promise.allSettled  │
│     Sessions are deleted after each call       │
└─────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────┐
│  2. COLLECT: Gather all plans                   │
│     - Successful plans collected                │
│     - Failed models reported to user            │
│     - Minimum 2 plans required to proceed       │
└─────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────┐
│  3. JUDGE: Synthesis session                    │
│     - Judge model receives all plans            │
│     - Combines best ideas                       │
│     - Resolves contradictions                   │
│     - Identifies questions for user (if any)    │
│     - Outputs structured result                 │
│     - On judge failure: best plan by confidence │
└─────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────┐
│  4. REPORT: Compact markdown                    │
│     - Per-model table (status/confidence/time)  │
│     - Clarifying questions (if any)             │
│     - Synthesized plan: steps, risks, rationale │
└─────────────────────────────────────────────────┘
```

## Project Structure

```
multi-planner-opencode/
├── package.json
├── tsconfig.json
├── LICENSE                  # MIT
├── README.md
├── docs/
│   ├── RESEARCH.md          # OpenCode internals research
│   └── ARCHITECTURE.md      # This file
├── src/
│   ├── index.ts             # Plugin entry point (exports MultiPlan plugin)
│   ├── config.ts            # Configuration schema & defaults
│   ├── planner.ts           # Fan-out logic: parallel model calls
│   ├── judge.ts             # Judge synthesis logic
│   ├── json.ts              # Defensive JSON extraction/parsing
│   ├── questions.ts         # Report formatting (table, questions, plan)
│   ├── prompts/
│   │   ├── planner.ts       # System prompt for planner models
│   │   └── judge.ts         # System prompt for judge model
│   └── types.ts             # Shared TypeScript types
└── examples/
    └── opencode.json        # Example configuration
```

## Configuration

The canonical configuration is nested in the plugin tuple options:
```jsonc
{
  "plugin": [[
    "multi-planner-opencode",
    {
      "multiPlan": {
        "models": [
          { "providerID": "your-provider", "modelID": "your-model-one" },
          { "providerID": "your-provider", "modelID": "your-model-two" }
        ],
        "judge": { "providerID": "your-provider", "modelID": "your-model-one" },
        "minPlans": 2,
        "timeout": 120000
      }
    }
  ]]
}
```

The model list contains exact OpenCode `{ providerID, modelID }` references. The plugin reads and writes this tuple option. For an easier setup, run `/multi-plan-config`; the command asks the agent to list connected models, select planners and a judge, validate the choices, and save them. Run `/multi-plan <task>` to invoke the registered `multi-plan` tool. The plugin does not create an agent or mode.

## Registration and configuration

The plugin registers two OpenCode tools: `multi-plan` for consensus planning and `multi-plan-config` for setup. It does not create an agent or mode. The model list, judge, minimum plan count, and timeout belong under the plugin tuple options at `plugin[].multiPlan`; the planner and judge SDK calls receive exact `{ providerID, modelID }` references. The `/multi-plan-config` command is a thin OpenCode command that guides the agent through the setup tool, which lists connected models and persists the selected tuple options in the global OpenCode config.

## Key Design Decisions

### 1. Plugin, not fork
Uses OpenCode's plugin system + SDK client. No modifications to OpenCode core.

### 2. Parallel sessions via SDK
Each planner model gets its own session via `client.session.create()` + `client.session.prompt()`. This leverages OpenCode's existing infrastructure (provider auth, rate limiting, retries).

### 3. Structured plans via prompt-embedded JSON

The SDK's `session.prompt` no longer supports a `format: json_schema` option. Instead, each prompt embeds a compact JSON schema and the model is told to reply with exactly one JSON object. `src/json.ts` defensively extracts the first balanced JSON object (code fences, prose, nested braces) and validates with zod. Runs that return unparseable output count as failed.

### 4. Fault tolerance
`Promise.allSettled` ensures one model failing doesn't kill the process. User is informed of failures. Minimum threshold (default: 2) of successful plans required.

### 5. Judge as synthesizer, not voter
The judge doesn't just pick the "best" plan — it actively combines strengths, resolves conflicts, and produces something better than any individual plan.

### 6. Non-invasive integration
- Triggered explicitly via the `multi-plan` tool (the agent decides when to use it)
- Report is a compact markdown summary; the agent works from it directly
- User retains full control: can refine the plan, ask follow-ups, switch to Build

### 7. Resilience
- Per-model timeouts, user-abort support, session cleanup after every call
- Judge failure degrades to the highest-confidence individual plan

## Extension Points

- **Custom judge strategies**: voting, weighted scoring, debate (future)
- **Model presets**: "fast" (cheap models), "thorough" (expensive models)
- **Plan comparison view**: show individual plans side-by-side (TUI future)
- **Other harnesses**: core logic (planner.ts, judge.ts) is harness-agnostic; only `index.ts` and `tools/` are OpenCode-specific

## Dependencies

- `@opencode-ai/plugin` — plugin types and tool helper
- `zod` — schema validation for config and structured output
- No other runtime dependencies
