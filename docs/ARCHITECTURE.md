# Multi-Plan: Architecture Proposal

## Overview

Multi-Plan is an OpenCode plugin that improves planning by running multiple LLMs in parallel on the same problem, then using a "judge" model to synthesize a superior plan.

## Flow

```
User triggers /multi-plan (or switches to Plan mode with multi-plan enabled)
  │
  ▼
┌─────────────────────────────────────────────────┐
│  1. FAN-OUT: Create N sessions (2-5 models)     │
│     Each receives the same planning prompt      │
│     All run in parallel via Promise.allSettled  │
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
└─────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────┐
│  4. CLARIFY (optional): Ask user questions      │
│     - Uses OpenCode's question tool/permission  │
│     - Single consolidated set of questions      │
└─────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────┐
│  5. FINAL PLAN: Judge produces definitive plan  │
│     - Incorporates user answers                 │
│     - Injected into current session as context  │
│     - User switches to Build mode to execute    │
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
│   ├── questions.ts         # User question consolidation
│   ├── prompts/
│   │   ├── planner.ts       # System prompt for planner models
│   │   └── judge.ts         # System prompt for judge model
│   └── types.ts             # Shared TypeScript types
├── tools/
│   └── multi-plan.ts        # Custom tool definition (for /multi-plan command)
└── examples/
    └── opencode.json        # Example configuration
```

## Configuration

In `opencode.json`:
```json
{
  "plugin": ["multi-planner-opencode"],
  "multiPlan": {
    "models": [
      { "providerID": "anthropic", "modelID": "claude-sonnet-4-20250514" },
      { "providerID": "openai", "modelID": "gpt-5" },
      { "providerID": "google", "modelID": "gemini-2.5-pro" }
    ],
    "judge": { "providerID": "anthropic", "modelID": "claude-sonnet-4-20250514" },
    "minPlans": 2,
    "timeout": 120000,
    "autoTrigger": false
  }
}
```

Alternatively, via plugin-local config file `.opencode/multi-plan.json`.

## Key Design Decisions

### 1. Plugin, not fork
Uses OpenCode's plugin system + SDK client. No modifications to OpenCode core.

### 2. Parallel sessions via SDK
Each planner model gets its own session via `client.session.create()` + `client.session.prompt()`. This leverages OpenCode's existing infrastructure (provider auth, rate limiting, retries).

### 3. Structured output for plans
Use `format: { type: "json_schema" }` to get plans in a consistent structure:
```typescript
interface Plan {
  model: string
  summary: string
  steps: PlanStep[]
  risks: string[]
  questions: string[]
  confidence: number
}
```

### 4. Fault tolerance
`Promise.allSettled` ensures one model failing doesn't kill the process. User is informed of failures. Minimum threshold (default: 2) of successful plans required.

### 5. Judge as synthesizer, not voter
The judge doesn't just pick the "best" plan — it actively combines strengths, resolves conflicts, and produces something better than any individual plan.

### 6. Non-invasive integration
- Triggered explicitly via custom tool (`/multi-plan`) or optionally on Plan mode entry
- Final plan is injected as context into the user's current session
- User retains full control: can edit the plan, ask follow-ups, switch to Build

## Extension Points

- **Custom judge strategies**: voting, weighted scoring, debate (future)
- **Model presets**: "fast" (cheap models), "thorough" (expensive models)
- **Plan comparison view**: show individual plans side-by-side (TUI future)
- **Other harnesses**: core logic (planner.ts, judge.ts) is harness-agnostic; only `index.ts` and `tools/` are OpenCode-specific

## Dependencies

- `@opencode-ai/plugin` — plugin types and tool helper
- `zod` — schema validation for config and structured output
- No other runtime dependencies
