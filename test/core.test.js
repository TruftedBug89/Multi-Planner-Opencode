import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  formatModelRef,
  getModelBadge,
  resolveConfig,
  resolvePluginConfig,
} from "../dist/src/config.js";
import {
  globalConfigPath,
  readOpenCodeConfig,
  updatePluginOptions,
} from "../dist/src/configfile.js";
import { loadHistory, recordUsage } from "../dist/src/history.js";
import { extractJSON, parseStructured, textFromParts } from "../dist/src/json.js";
import { formatConfigShow } from "../dist/src/menu.js";
import { fanOutPlans } from "../dist/src/planner.js";
import { judgePlans } from "../dist/src/judge.js";
import { buildJudgePrompt } from "../dist/src/prompts/judge.js";
import { formatPlanTable, truncate } from "../dist/src/questions.js";

const schema = {
  parse(value) {
    if (!value || typeof value !== "object" || value.kind !== "ok") {
      throw new Error("invalid value");
    }
    return value;
  },
};

test("extractJSON handles fenced and nested JSON with braces in strings", () => {
  assert.equal(extractJSON("```json\n{\"kind\":\"ok\",\"text\":\"{nested}\"}\n```"), '{"kind":"ok","text":"{nested}"}');
  assert.equal(extractJSON('Model said: {"kind":"ok","text":"{nested}"} done'), '{"kind":"ok","text":"{nested}"}');
  assert.equal(extractJSON("no JSON here"), null);
});

test("parseStructured validates extracted JSON and reports failures", () => {
  assert.deepEqual(parseStructured('{"kind":"ok"}', schema), {
    ok: true,
    value: { kind: "ok" },
  });
  const result = parseStructured("not JSON", schema);
  assert.equal(result.ok, false);
});

test("textFromParts keeps only text parts", () => {
  assert.equal(
    textFromParts([
      { type: "text", text: "first" },
      { type: "image", data: "ignored" },
      { type: "text", text: "second" },
      null,
    ]),
    "first\nsecond",
  );
});

test("resolveConfig applies defaults and caps minPlans", () => {
  const config = resolveConfig({
    models: [
      { providerID: "local", modelID: "one" },
      { providerID: "local", modelID: "two" },
    ],
    judge: { providerID: "local", modelID: "judge" },
    minPlans: 5,
    timeout: 10000,
  });
  assert.equal(config.minPlans, 2);
  assert.equal(config.timeout, 10000);
  assert.equal(formatModelRef(config.judge), "local/judge");
  assert.equal(getModelBadge("openai/gpt-test").name, "GPT");
});

test("history records models newest first and reloads persisted entries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "multi-planner-test-"));
  recordUsage(dir, [
    { providerID: "a", modelID: "first" },
    { providerID: "b", modelID: "second" },
  ]);
  const history = loadHistory(dir);
  assert.equal(history.length, 2);
  assert.deepEqual(history.map(({ providerID, modelID }) => `${providerID}/${modelID}`), ["a/first", "b/second"]);
  const persisted = JSON.parse(await readFile(join(dir, "multi-plan-history.json"), "utf8"));
  assert.equal(persisted.entries.length, 2);
});

test("report formatting handles successful and failed planner runs", () => {
  assert.equal(truncate("  one   two  ", 20), "one two");
  const table = formatPlanTable([
    {
      model: { providerID: "a", modelID: "ok" },
      status: "fulfilled",
      plan: { confidence: 0.9, steps: [{ title: "step", description: "do" }] },
      durationMs: 1200,
    },
    {
      model: { providerID: "b", modelID: "bad" },
      status: "rejected",
      error: "failed",
      durationMs: 500,
    },
  ]);
  assert.match(table, /a\/ok \| ok \| 0\.90 \| 1 \| 1\.2s/);
  assert.match(table, /b\/bad \| failed \| — \| — \| 0\.5s/);
});

test("resolvePluginConfig prefers nested plugin options", () => {
  const selected = {
    models: [
      { providerID: "forge", modelID: "planner-one" },
      { providerID: "forge", modelID: "planner-two" },
    ],
    judge: { providerID: "forge", modelID: "judge" },
  };
  const fallback = {
    models: [
      { providerID: "other", modelID: "fallback-one" },
      { providerID: "other", modelID: "fallback-two" },
    ],
    judge: { providerID: "other", modelID: "fallback-judge" },
  };
  const config = resolvePluginConfig(
    { multiPlan: selected },
    { multiPlan: fallback },
  );
  assert.deepEqual(config?.models, selected.models);
  assert.deepEqual(config?.judge, selected.judge);
});

test("config discovery reads JSONC and upgrades a string plugin entry", async () => {
  const root = await mkdtemp(join(tmpdir(), "multi-planner-config-"));
  const configDir = join(root, "opencode");
  await mkdir(configDir, { recursive: true });
  await writeFile(
    join(configDir, "opencode.jsonc"),
    '{\n  // global plugin config\n  "plugin": ["multi-planner-opencode"],\n}\n',
  );
  const previous = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = root;
  try {
    assert.equal(globalConfigPath(), join(configDir, "opencode.jsonc"));
    const config = readOpenCodeConfig();
    assert.ok(config);
    const next = resolveConfig({
      models: [
        { providerID: "forge", modelID: "one" },
        { providerID: "forge", modelID: "two" },
      ],
      judge: { providerID: "forge", modelID: "judge" },
    });
    assert.deepEqual(updatePluginOptions(config, next), { updated: true });
    assert.deepEqual(config.plugin, [
      ["multi-planner-opencode", { multiPlan: next }],
    ]);
  } finally {
    if (previous === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previous;
  }
});

test("setup output shows connected model IDs before configuration", () => {
  const output = formatConfigShow(
    null,
    [
      { providerID: "forge", modelID: "one", name: "One" },
      { providerID: "forge", modelID: "two", name: "Two" },
    ],
    [],
  );
  assert.match(output, /not configured/);
  assert.match(output, /forge\/one/);
  assert.match(output, /forge\/two/);
});

test("planner and judge calls preserve exact OpenCode model references", async () => {
  const plannerModels = [
    { providerID: "forge", modelID: "vendor/model-one" },
    { providerID: "local", modelID: "coder:14b" },
  ];
  const plannerRequests = [];
  const judgeRequests = [];
  let sessionNumber = 0;
  const planResponse = JSON.stringify({
    model: "ignored",
    summary: "summary",
    steps: [{ title: "step", description: "do" }],
    risks: [],
    questions: [],
    confidence: 0.8,
  });
  const judgeResponse = JSON.stringify({
    synthesizedPlan: {
      summary: "summary",
      steps: [{ title: "step", description: "do" }],
      risks: [],
      rationale: "reason",
    },
    questionsForUser: [],
    discardedIdeas: [],
  });
  const client = {
    session: {
      create: async () => ({ data: { id: `session-${sessionNumber++}` } }),
      prompt: async (request) => {
        if (request.body.system.includes("judge")) judgeRequests.push(request);
        else plannerRequests.push(request);
        return {
          data: {
            parts: [{
              type: "text",
              text: request.body.system.includes("judge") ? judgeResponse : planResponse,
            }],
          },
        };
      },
      delete: async () => ({ data: true }),
    },
  };

  await fanOutPlans(client, plannerModels, "task", 10000);
  await judgePlans(client, plannerModels[0], [
    {
      model: "forge/vendor/model-one",
      summary: "summary",
      steps: [{ title: "step", description: "do" }],
      risks: [],
      questions: [],
      confidence: 0.8,
    },
  ], "task", 10000);

  assert.deepEqual(
    plannerRequests.map((request) => request.body.model),
    plannerModels,
  );
  assert.deepEqual(judgeRequests[0].body.model, plannerModels[0]);
});

test("plugin registers the two documented tools", async () => {
  const { MultiPlan } = await import("../dist/src/index.js");
  const hooks = await MultiPlan({ client: {} }, {});
  assert.deepEqual(Object.keys(hooks.tool).sort(), [
    "multi-plan",
    "multi-plan-config",
  ]);
});

test("judge prompt includes step files and dependencies", () => {
  const prompt = buildJudgePrompt(
    [
      {
        model: "forge/planner-one",
        summary: "summary",
        steps: [
          {
            title: "Add theme tokens",
            description: "define tokens",
            files: ["src/theme.ts"],
            dependencies: [],
          },
          {
            title: "Wire settings",
            description: "persist choice",
            files: ["src/settings.ts"],
            dependencies: ["Add theme tokens"],
          },
        ],
        risks: [],
        questions: [],
        confidence: 0.8,
      },
    ],
    "Add dark mode",
  );
  assert.match(prompt, /files: src\/theme\.ts/);
  assert.match(prompt, /\(after: Add theme tokens\)/);
});
