import { afterAll, beforeAll, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/mcp";

// A copy outside this repository: validate reads git for the dates
// (ADR-029), and this repository's checkout must not change the result.
const BUNDLE = await mkdtemp(join(tmpdir(), "adaptrace-mcp-"));
await cp("tests/fixtures/valid", BUNDLE, { recursive: true });
afterAll(() => rm(BUNDLE, { recursive: true, force: true }));
const client = new Client({ name: "test", version: "0" });

beforeAll(async () => {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer({ bundle: BUNDLE, backlog: "no/such/backlog" }).connect(a);
  await client.connect(b);
});

afterAll(async () => {
  await client.close();
});

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const [first] = result.content as { type: string; text: string }[];
  const text = first?.text ?? "";
  return {
    isError: result.isError === true,
    text,
    value: result.isError ? null : JSON.parse(text),
  };
}

test("lists the read and propose tools, all marked read-only", async () => {
  const { tools } = await client.listTools();
  expect(tools.map((t) => t.name).sort()).toEqual([
    "assess_context",
    "board",
    "conflicts",
    "conflicts_context",
    "estimate_context",
    "extract_context",
    "graph",
    "health",
    "impact",
    "list_documents",
    "meeting_context",
    "progress",
    "propose_document",
    "propose_update",
    "read_document",
    "stale",
    "sync_plan",
    "validate",
  ]);
  expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
});

test("read tools return the same data as the CLI", async () => {
  expect((await call("validate")).value).toEqual([]);
  const docs = (await call("list_documents", { type: "Task" })).value;
  expect(docs.map((d: { path: string }) => d.path)).toEqual([
    "tasks/task-042-mfa-login.md",
  ]);
  const doc = (
    await call("read_document", { path: "requirements/security-mfa" })
  ).value;
  expect(doc.incoming).toContainEqual({
    from: "tasks/task-042-mfa-login.md",
    kind: "satisfies",
  });
  const impact = (
    await call("impact", { document: "requirements/security-mfa.md" })
  ).value;
  expect(impact.affected.map((a: { path: string }) => a.path)).toContain(
    "tasks/task-042-mfa-login.md",
  );
  expect((await call("graph")).value.edges.length).toBeGreaterThan(0);
  expect((await call("stale")).value).toHaveProperty("stale");
  expect((await call("health")).value).toEqual([]);
  expect((await call("board")).value.columns[0].state).toBe("in_progress");
  expect((await call("read_document", { path: "nope.md" })).isError).toBe(true);
});

test("propose_document drafts a file, reports its issues and writes nothing", async () => {
  const result = (
    await call("propose_document", {
      path: "tasks/new-task",
      type: "Task",
      title: "New task",
      frontmatter: { state: "to_do", depends_on: ["/tasks/missing.md"] },
      by: "claude-code/test",
    })
  ).value;
  expect(result.path).toBe("tasks/new-task.md");
  expect(result.written).toBe(false);
  expect(result.content).toContain("by: claude-code/test");
  expect(result.diff).toStartWith("--- /dev/null\n+++ b/tasks/new-task.md");
  expect(result.issues.map((i: { code: string }) => i.code)).toEqual([
    "dependency-target",
  ]);
  expect(result.newIssues).toEqual(result.issues);
  expect(await Bun.file(`${BUNDLE}/tasks/new-task.md`).exists()).toBe(false);

  expect(
    (
      await call("propose_document", {
        path: "tasks/task-042-mfa-login.md",
        type: "Task",
        title: "x",
      })
    ).isError,
  ).toBe(true);
  expect(
    (
      await call("propose_document", {
        path: "../outside.md",
        type: "Task",
        title: "x",
      })
    ).isError,
  ).toBe(true);
  expect(
    (
      await call("propose_document", {
        path: "index.md",
        type: "Task",
        title: "x",
      })
    ).isError,
  ).toBe(true);
});

test("propose_update changes only the given keys and shows new cycles", async () => {
  const path = `${BUNDLE}/requirements/security-mfa.md`;
  const before = await readFile(path, "utf8");
  const result = (
    await call("propose_update", {
      path: "requirements/security-mfa.md",
      set: { depends_on: ["/tasks/task-042-mfa-login.md"] },
    })
  ).value;
  // The task satisfies this requirement, so this would close a review cycle.
  expect(result.newIssues.map((i: { code: string }) => i.code)).toEqual([
    "dependency-cycle",
  ]);
  expect(result.diff).toContain("+depends_on:");
  expect(result.diff).toContain("+  - /tasks/task-042-mfa-login.md");
  expect(result.diff).not.toContain("-title:");
  expect(await readFile(path, "utf8")).toBe(before);

  const body = (
    await call("propose_update", {
      path: "requirements/security-mfa.md",
      body: "New body.",
    })
  ).value;
  expect(body.content).toEndWith("---\n\nNew body.\n");
  expect(
    (
      await call("propose_update", {
        path: "requirements/security-mfa.md",
        unset: ["type"],
      })
    ).isError,
  ).toBe(true);
});

test("sync_plan reports a missing Backlog.md directory as a plan with no tasks", async () => {
  const plan = (await call("sync_plan")).value;
  expect(plan.written).toBe(false);
});

test("propose_document keeps type and title from the arguments and paths literal", async () => {
  const result = (
    await call("propose_document", {
      path: "notes/q#1",
      type: "Task",
      title: "Q",
      frontmatter: { type: null, title: "other", timestamp: "2020-01-01" },
    })
  ).value;
  expect(result.path).toBe("notes/q#1.md");
  expect(result.content).toContain("type: Task");
  expect(result.content).toContain("title: Q");
  expect(result.content).not.toContain("timestamp");
});

test("propose_update rejects a type that is not a non-empty string", async () => {
  for (const type of [["Task"], 1, ""]) {
    expect(
      (
        await call("propose_update", {
          path: "requirements/security-mfa.md",
          set: { type },
        })
      ).isError,
    ).toBe(true);
  }
});

test("assess_context returns the dependents with their text and instructions", async () => {
  const { value } = await call("assess_context", {
    document: "requirements/security-mfa",
    all: true,
  });
  expect(value.target).toBe("requirements/security-mfa.md");
  expect(value.items.map((i: { path: string }) => i.path)).toContain(
    "tasks/task-042-mfa-login.md",
  );
  expect(value.items[0].content).toContain("type: ");
  expect(value.instructions).toContain("propose_update");
  expect((await call("assess_context", { document: "nope" })).isError).toBe(
    true,
  );
});

test("extract_context returns the notes, the documents and instructions", async () => {
  const { value } = await call("extract_context", {
    meeting: "requirements/security-mfa",
  });
  expect(value.meeting).toBe("requirements/security-mfa.md");
  expect(value.documents.map((d: { path: string }) => d.path)).toContain(
    "/tasks/task-042-mfa-login.md",
  );
  expect(value.instructions).toContain("propose_document");
  expect((await call("extract_context", { meeting: "nope" })).isError).toBe(
    true,
  );
});

test("estimate_context returns the report, the texts and instructions", async () => {
  const { value } = await call("estimate_context", {
    documents: ["requirements/security-mfa"],
  });
  expect(value.targets).toEqual(["requirements/security-mfa.md"]);
  expect(Object.keys(value.contents)).toContain("tasks/task-042-mfa-login.md");
  expect(value.requestContent).toBeNull();
  expect(value.instructions).toContain("not a quote");
  expect(
    (await call("estimate_context", { documents: ["nope"] })).isError,
  ).toBe(true);
});

test("progress returns the review status of each reached document", async () => {
  const { value } = await call("progress", {
    request: "requirements/security-mfa.md",
  });
  expect(value.request).toBe("requirements/security-mfa.md");
  expect(typeof value.done).toBe("boolean");
  for (const i of value.items) {
    expect(["reviewed", "to-review", "waiting"]).toContain(i.status);
  }
  expect((await call("progress", { request: "no/such.md" })).isError).toBe(
    true,
  );
});

test("propose_update with review records verified and keeps generated", async () => {
  const { value } = await call("propose_update", {
    path: "tasks/task-042-mfa-login.md",
    review: true,
    by: "human:sato",
  });
  expect(value.diff).toMatch(/\n\+verified: \{ by: human:sato, at: [^}]+\}\n/);
  expect(value.diff).not.toContain("-generated");
  expect(value.written).toBe(false);
  const both = await call("propose_update", {
    path: "tasks/task-042-mfa-login.md",
    review: true,
    set: { state: "done" },
  });
  expect(both.isError).toBe(true);
  expect(both.text).toContain("leave out set, unset and body");
});

test("propose_update with review accepts empty set and unset", async () => {
  const { isError, value } = await call("propose_update", {
    path: "tasks/task-042-mfa-login.md",
    review: true,
    set: {},
    unset: [],
  });
  expect(isError).toBe(false);
  expect(value.diff).toContain("+verified:");
});
