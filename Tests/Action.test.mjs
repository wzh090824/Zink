import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const workflow = await readFile(
  new URL("../.github/workflows/Create-Short-Link.yml", import.meta.url),
  "utf8",
);
const lines = workflow.split(/\r?\n/);
const scriptStart = lines.findIndex((line) => line.trim() === "script: |");
assert.notEqual(scriptStart, -1, "workflow must include a github-script block");
const scriptLines = [];
for (const line of lines.slice(scriptStart + 1)) {
  if (line.trim() && !line.startsWith("            ")) break;
  scriptLines.push(line.startsWith("            ") ? line.slice(12) : "");
}
const actionScript = scriptLines.join("\n");
new vm.Script(`(async () => {\n${actionScript}\n})`);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

test("GitHub Action writes metadata and refuses filename collisions", async () => {
  assert.match(
    workflow,
    /run-name: Short link \$\{\{ github\.event\.client_payload\.requestId \}\}/,
  );

  const code = "NUL";
  const calls = [];
  const github = {
    rest: {
      repos: {
        getContent: async () => {
          const error = new Error("Not found");
          error.status = 404;
          throw error;
        },
      },
      git: {
        createBlob: async ({ content }) => {
          calls.push({ type: "blob", content });
          return { data: { sha: `blob-${calls.length}` } };
        },
        getRef: async () => ({ data: { object: { sha: "head" } } }),
        getCommit: async () => ({ data: { tree: { sha: "base-tree" } } }),
        createTree: async ({ tree }) => {
          calls.push({ type: "tree", tree });
          return { data: { sha: "new-tree" } };
        },
        createCommit: async () => ({ data: { sha: "new-commit" } }),
        updateRef: async (input) => calls.push({ type: "update", input }),
      },
    },
  };
  const failures = [];
  const notices = [];
  const context = {
    repo: { owner: "owner", repo: "links" },
    payload: {
      client_payload: {
        requestId: "12345678-1234-4234-8234-123456789abc",
        code,
        url: "https://example.com/",
        ip: "203.0.113.12",
        expiresAt: null,
        branch: "main",
      },
      repository: { default_branch: "main" },
    },
  };
  const core = {
    notice: (message) => notices.push(message),
    setFailed: (message) => failures.push(message),
  };

  await new AsyncFunction(
    "github",
    "context",
    "core",
    "Buffer",
    "URL",
    actionScript,
  )(github, context, core, Buffer, URL);

  assert.deepEqual(failures, []);
  const blob = calls.find((call) => call.type === "blob");
  const record = JSON.parse(blob.content);
  assert.equal(record.code, code);
  assert.equal(record.url, "https://example.com/");
  assert.equal(record.ip, "203.0.113.12");
  assert.ok(Number.isFinite(Date.parse(record.uploadedAt)));
  const tree = calls.find((call) => call.type === "tree");
  assert.equal(
    tree.tree[0].path,
    `List/~${Buffer.from(code).toString("base64url")}`,
  );
  assert.equal(calls.filter((call) => call.type === "update").length, 1);
  assert.equal(notices.length, 1);

  const collisionCalls = [];
  const collisionGithub = {
    rest: {
      repos: {
        getContent: async () => ({ data: { type: "file" } }),
      },
      git: {
        createBlob: async () => collisionCalls.push("blob"),
      },
    },
  };
  const collisionFailures = [];
  await new AsyncFunction(
    "github",
    "context",
    "core",
    "Buffer",
    "URL",
    actionScript,
  )(
    collisionGithub,
    context,
    {
      notice: () => {},
      setFailed: (message) => collisionFailures.push(message),
    },
    Buffer,
    URL,
  );
  assert.equal(collisionFailures.length, 1);
  assert.deepEqual(collisionCalls, []);
});
