import { expect, spyOn, test } from "bun:test";
import { loadBundle, withFiles } from "../src/bundle";
import { run } from "../src/cli";
import { buildGraph } from "../src/graph";
import { health } from "../src/health";

const ROOT = "tests/fixtures/health";

async function findings() {
  const bundle = await loadBundle(ROOT);
  return health(bundle, buildGraph(bundle));
}

test("a live document pointing at a deprecated one, with what replaced it", async () => {
  const found = (await findings()).filter(
    (f) => f.code === "deprecated-target",
  );
  expect(
    found.map((f) => [f.file, f.edge?.kind, f.edge?.to, f.replacedBy]),
  ).toEqual([
    // The replacement itself is not told to point at itself.
    ["decisions/new.md", "depends_on", "decisions/old.md", []],
    ["tasks/a.md", "depends_on", "decisions/old.md", ["decisions/new.md"]],
    // No replacement for a stopped task.
    ["tasks/e.md", "depends_on", "tasks/f.md", []],
    // blocks counts too.
    ["tasks/g.md", "blocks", "decisions/old.md", ["decisions/new.md"]],
    // Through a deprecated replacement to the live one, and directly.
    [
      "tasks/i.md",
      "derived_from",
      "decisions/older.md",
      ["decisions/new.md", "decisions/solo.md"],
    ],
  ]);
  expect(found[0]?.message).toContain("This document replaces it");
  // supersedes points at the deprecated document by design, and changes is
  // the request's history (cr-1); a deprecated document's own dependencies
  // are not reported.
  expect(
    found.some(
      (f) => f.edge?.kind === "supersedes" || f.edge?.kind === "changes",
    ),
  ).toBe(false);
  expect(found.some((f) => f.file === "decisions/old.md")).toBe(false);
});

test("a dependency reached anyway through the same key is redundant", async () => {
  const found = (await findings()).filter(
    (f) => f.code === "redundant-dependency",
  );
  // a -> c is also a -> b -> c. d's satisfies next to depends_on c, then
  // satisfies is another key; e's path goes through the deprecated f.
  expect(found.map((f) => [f.file, f.line, f.edge?.to])).toEqual([
    ["tasks/a.md", 7, "tasks/c.md"],
    // Listed twice, the second time as a concept ID.
    ["tasks/b.md", 7, "tasks/c.md"],
  ]);
  expect(found[1]?.via).toEqual([]);
  expect(found[0]?.via?.map((e) => [e.from, e.to])).toEqual([
    ["tasks/a.md", "tasks/b.md"],
    ["tasks/b.md", "tasks/c.md"],
  ]);
});

test("an edge into a cycle of the same key is not called redundant", async () => {
  const base = await loadBundle(ROOT);
  const doc = (deps: string[]) =>
    `---\ntype: Task\ndepends_on:\n${deps.map((d) => `  - /tasks/${d}.md\n`).join("")}---\n`;
  // x -> y and x -> z, while y and z depend on each other: each edge would
  // be redundant because of the other.
  const bundle = withFiles(base, [
    { path: "tasks/x.md", text: doc(["y", "z"]) },
    { path: "tasks/y.md", text: doc(["z"]) },
    { path: "tasks/z.md", text: doc(["y"]) },
  ]);
  const found = health(bundle, buildGraph(bundle)).filter(
    (f) => f.code === "redundant-dependency" && f.file === "tasks/x.md",
  );
  expect(found).toEqual([]);
});

test("an edge from a document in a cycle is not called redundant", async () => {
  const base = await loadBundle(ROOT);
  // p and q depend on each other and both on c: each edge to c would be
  // redundant because of the other.
  const bundle = withFiles(base, [
    {
      path: "tasks/p.md",
      text: "---\ntype: Task\ndepends_on:\n  - /tasks/q.md\n  - /tasks/c.md\n---\n",
    },
    {
      path: "tasks/q.md",
      text: "---\ntype: Task\ndepends_on:\n  - /tasks/p.md\n  - /tasks/c.md\n---\n",
    },
  ]);
  const found = health(bundle, buildGraph(bundle)).filter(
    (f) => f.code === "redundant-dependency" && /tasks\/[pq]\.md/.test(f.file),
  );
  expect(found).toEqual([]);
});

test("the repeated entry, not the first, is the one to remove", async () => {
  const base = await loadBundle(ROOT);
  const bundle = withFiles(base, [
    {
      path: "tasks/dup.md",
      text: "---\ntype: Task\ndepends_on:\n  - /tasks/c.md\n  - /tasks/c.md\n---\n",
    },
  ]);
  const found = health(bundle, buildGraph(bundle)).filter(
    (f) => f.file === "tasks/dup.md",
  );
  expect(found.map((f) => [f.code, f.line])).toEqual([
    ["redundant-dependency", 5],
  ]);
});

test("a replacement pointing at what it replaces hears of the other replacements", async () => {
  const base = await loadBundle(ROOT);
  const bundle = withFiles(base, [
    {
      path: "decisions/other.md",
      text: "---\ntype: Decision\nsupersedes: /decisions/old.md\n---\n",
    },
  ]);
  const found = health(bundle, buildGraph(bundle)).find(
    (f) => f.file === "decisions/new.md" && f.code === "deprecated-target",
  );
  expect(found?.replacedBy).toEqual(["decisions/other.md"]);
  expect(found?.message).toContain(
    "This document replaces it (also superseded by decisions/other.md)",
  );
});

test("a change request about a deprecated document only is not an orphan", async () => {
  const base = await loadBundle(ROOT);
  const bundle = withFiles(base, [
    {
      path: "change-requests/cr-2.md",
      text: "---\ntype: Change Request\nchanges: /decisions/old.md\n---\n",
    },
  ]);
  expect(
    health(bundle, buildGraph(bundle)).filter(
      (f) => f.file === "change-requests/cr-2.md",
    ),
  ).toEqual([]);
});

test("a live document with no dependency to or from a live one is an orphan", async () => {
  const found = (await findings()).filter((f) => f.code === "orphan");
  // lonely's body link is a reference, not a dependency. g's only
  // dependency is on a deprecated document. Deprecated ones are not listed.
  // solo only supersedes a deprecated decision, which is what it is for.
  // a-corp (a requested_by path) and sato (an owner title) are named by
  // live documents; nobody is not.
  expect(found.map((f) => f.file)).toEqual([
    "risks/lonely.md",
    "stakeholders/nobody.md",
    "tasks/g.md",
  ]);
});

test("health prints text and json, and exits 0", async () => {
  const log = spyOn(console, "log").mockImplementation(() => {});
  try {
    expect(await run(["health", ROOT])).toBe(0);
    const text = String(log.mock.calls[0]?.[0]);
    expect(text).toContain(
      "tasks/a.md:7  depends_on tasks/c.md is also reached through depends_on tasks/b.md -> tasks/c.md.",
    );
    expect(text).toContain("[orphan]");
    expect(text.split("\n").at(-1)).toBe("10 findings");
    expect(await run(["health", "--bundle", ROOT, "--format", "json"])).toBe(0);
    const json = JSON.parse(String(log.mock.calls[1]?.[0]));
    expect(json[3]).toEqual({
      code: "deprecated-target",
      file: "tasks/a.md",
      line: 5,
      message:
        "depends_on decisions/old.md, which is deprecated. Superseded by decisions/new.md: point there, remove the entry, or keep it as history",
      kind: "depends_on",
      to: "decisions/old.md",
      replacedBy: ["decisions/new.md"],
    });
    expect(await run(["health", "tests/fixtures/valid"])).toBe(0);
    expect(String(log.mock.calls[2]?.[0])).toBe("0 findings");
  } finally {
    log.mockRestore();
  }
});
