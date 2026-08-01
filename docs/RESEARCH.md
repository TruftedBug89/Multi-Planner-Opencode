# Research: OpenCode Internals for Multi-Plan Plugin

## 1. Modes (Agents)

OpenCode uses **agents** with a `mode` property:

- `primary` — main agents the user interacts with (Build, Plan)
- `subagent` — specialized assistants invoked by primary agents or via `@` mention
- `all` — default if unspecified

**Plan agent** is a primary agent with restricted permissions:
- `edit: ask/deny`, `bash: ask/deny`
- Designed for analysis and planning without modifications

**Build agent** is the default primary agent with full tool access.

Agents are configured in `opencode.json`:
```json
{
  "agent": {
    "plan": {
      "mode": "primary",
      "model": "anthropic/claude-haiku-4-20250514",
      "permission": { "edit": "deny", "bash": "deny" }
    }
  }
}
```

Agents can also be defined as Markdown files in `~/.config/opencode/agents/`.

## 2. Plugin System

Plugins are TypeScript/JavaScript modules in:
- `.opencode/plugins/` (project-level)
- `~/.config/opencode/plugins/` (global)
- npm packages via `"plugin": [...]` in `opencode.json`

### Plugin structure:
```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async ({ project, client, $, directory, worktree }) => {
  return {
    // hooks
  }
}
```

### Context provided:
- `project` — current project info
- `client` — OpenCode SDK client (can create sessions, send prompts)
- `$` — Bun shell API
- `directory` — working directory
- `worktree` — git worktree path

### Available Hooks:
| Hook | Purpose |
|------|---------|
| `config` | Modify OpenCode configuration at load |
| `chat.message` | Intercept new user messages (sessionID, agent, model, parts) |
| `chat.params` | Modify LLM parameters (temperature, topP, maxOutputTokens) |
| `tool.execute.before` | Intercept before tool execution |
| `tool.execute.after` | Intercept after tool execution |
| `event` | Subscribe to system events |
| `tool` | Register custom tools |
| `auth` | Custom authentication |
| `provider` | Custom provider hook |
| `shell.env` | Inject environment variables |

### Events available:
- `session.created`, `session.idle`, `session.error`, `session.status`
- `permission.asked`, `permission.replied`
- `message.updated`, `message.part.updated`
- `tool.execute.before`, `tool.execute.after`
- `command.executed`
- `todo.updated`

## 3. Question/Permission System

Permissions are granular per tool type:
- `read`, `edit`, `glob`, `grep`, `bash`, `task`, `skill`, `lsp`
- **`question`** — asking the user questions during execution
- `webfetch`, `websearch`, `external_directory`

Each permission can be: `allow`, `deny`, `ask`, or pattern-matched.

Events `permission.asked` and `permission.replied` allow plugins to observe the Q&A flow.

## 4. Model Configuration

Models configured via `opencode.json`:
```json
{
  "provider": {
    "anthropic": {
      "models": {
        "claude-sonnet-4-5-20250929": {
          "options": { "thinking": { "type": "enabled", "budgetTokens": 16000 } }
        }
      }
    }
  }
}
```

Supports 75+ providers via AI SDK + Models.dev. Variants allow different configs for same model.

## 5. SDK Client (Key for Multi-Plan)

The `client` object in plugins provides full API access:

```typescript
// Create a session
const session = await client.session.create({ body: { title: "..." } })

// Send a prompt with a SPECIFIC model
const result = await client.session.prompt({
  path: { id: session.id },
  body: {
    model: { providerID: "anthropic", modelID: "claude-sonnet-4-20250514" },
    parts: [{ type: "text", text: "Generate a plan for..." }],
  },
})

// Structured output (JSON schema enforcement)
const result = await client.session.prompt({
  path: { id: sessionId },
  body: {
    parts: [{ type: "text", text: "..." }],
    format: {
      type: "json_schema",
      schema: { /* zod-like schema */ },
    },
  },
})

// Inject context without triggering AI response
await client.session.prompt({
  path: { id: session.id },
  body: { noReply: true, parts: [{ type: "text", text: "context..." }] },
})
```

**This is the key capability**: from a plugin, we can create multiple sessions, each targeting a different model, send them the same planning prompt in parallel, collect results, then feed them to a judge model.

## 6. Execution Cycle

From the source, the flow is:
```
User Input
  → Create User Message (attach file context & metadata)
  → Resolve Tool Registry
  → Insert Reminders
  → LLM Streaming (via SessionProcessor)
  → Tool Execution (permission check → plugin hooks → execute)
  → Record Response
  → if finish_reason == "tool-calls" → loop
  → Return Final Response
```

## 7. Architecture: Client-Server

- **Go-based TUI** (terminal UI)
- **Bun/JavaScript HTTP server** (business logic, AI SDK, plugin runtime)
- Multiple frontends can connect to same server
- Plugins run in-process on the server side

## Key Takeaways for Multi-Plan

1. **Plugin + SDK client** is the natural implementation path — no need to fork OpenCode.
2. **`client.session.prompt()`** with explicit `model` param allows calling different models.
3. **Parallel sessions** are supported (SDK example shows `Promise.all` over multiple sessions).
4. **Structured output** via JSON schema ensures plans come back in parseable format.
5. **`chat.message` hook** can intercept when user enters Plan mode and trigger multi-plan flow.
6. **Custom tools** can expose a `/multi-plan` command to the user.
7. **`config` hook** can register custom agents (planner models + judge).
