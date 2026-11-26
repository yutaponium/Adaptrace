import { expect, test } from "bun:test";
import { loadBundle } from "../src/bundle";
import { validate } from "../src/validate";

test("a valid bundle has no issues", async () => {
  expect(validate(await loadBundle("tests/fixtures/valid"))).toEqual([]);
});

test("reports each problem in the invalid bundle", async () => {
  const issues = validate(await loadBundle("tests/fixtures/invalid"));
  const found = issues.map(
    (i) => `${i.severity} ${i.code} ${i.file}${i.line ? `:${i.line}` : ""}`,
  );
  expect(found).toEqual([
    "error frontmatter bad-yaml.md:1",
    "warning okf-version index.md:2",
    "error log-date log.md:3",
    "error frontmatter no-frontmatter.md:1",
    "error missing-type no-type.md",
    "error index-frontmatter notes/index.md:1",
    "warning type-spelling tasks/a.md:2",
    "warning invalid-status tasks/a.md:3",
    "warning legacy-timestamp tasks/a.md:4",
    "error dependency-cycle tasks/a.md:6",
    "error dependency-target tasks/a.md:7",
    "warning broken-link tasks/a.md:10",
    "warning dependency-deadlock tasks/b.md:4",
    "error invalid-dependency tasks/b.md:5",
    "warning invalid-datetime tasks/b.md:6",
    "warning invalid-datetime tasks/c.md:3",
  ]);
});

test("edge cases: catalog links, code in log.md, empty root frontmatter, value lines", async () => {
  const issues = validate(await loadBundle("tests/fixtures/edge"));
  const found = issues.map((i) => `${i.code} ${i.file}:${i.line}`);
  expect(found).toEqual([
    "broken-link index.md:6",
    "dependency-target t/c.md:5",
    "dependency-target t/c.md:8",
    "dependency-deadlock t/e.md:7",
  ]);
});

test("a deadlock is a warning that names who waits for whom", async () => {
  const issues = validate(await loadBundle("tests/fixtures/edge"));
  const deadlock = issues.find((i) => i.code === "dependency-deadlock");
  expect(deadlock?.severity).toBe("warning");
  expect(deadlock?.message).toBe(
    "deadlock: t/f.md waits for t/e.md (blocks), t/e.md waits for t/f.md (depends_on). Remove one of these dependencies, or split a document so part of the work can start",
  );
});

test("a pure blocks cycle across documents is a deadlock, not an error", async () => {
  const { findCycles } = await import("../src/graph");
  const graph = {
    edges: [
      { from: "a.md", to: "b.md", kind: "blocks" as const },
      { from: "b.md", to: "c.md", kind: "blocks" as const },
      { from: "c.md", to: "a.md", kind: "blocks" as const },
    ],
    unresolved: [],
    backlinks: new Map(),
  };
  const cycles = findCycles(graph);
  expect(cycles).toHaveLength(1);
  expect(cycles[0]?.group).toBe("deadlock");
  expect(cycles[0]?.edges).toHaveLength(3);
});

test("cycle detection handles long chains without overflowing the stack", async () => {
  const { findCycles } = await import("../src/graph");
  const n = 20000;
  const edges = Array.from({ length: n }, (_, i) => ({
    from: `n${i}.md`,
    to: `n${(i + 1) % n}.md`,
    kind: "depends_on" as const,
  }));
  const cycles = findCycles({ edges, unresolved: [], backlinks: new Map() });
  expect(cycles).toHaveLength(1);
  expect(cycles[0]?.nodes).toHaveLength(n);
});

function edge(
  from: string,
  kind: "depends_on" | "blocks" | "supersedes",
  to: string,
) {
  return { from, to, kind };
}

async function issuesFor(edges: ReturnType<typeof edge>[]) {
  const { findCycles } = await import("../src/graph");
  return findCycles({ edges, unresolved: [], backlinks: new Map() });
}

test("a self loop inside a larger cycle does not hide the real cycle", async () => {
  const cycles = await issuesFor([
    edge("a.md", "depends_on", "b.md"),
    edge("b.md", "depends_on", "a.md"),
    edge("a.md", "blocks", "a.md"),
    edge("a.md", "supersedes", "a.md"),
    edge("a.md", "supersedes", "b.md"),
    edge("b.md", "supersedes", "a.md"),
  ]);
  const byGroup = Object.fromEntries(cycles.map((c) => [c.group, c.edges]));
  expect(byGroup.review).toHaveLength(2);
  expect(byGroup.supersedes).toHaveLength(2);
  // The deadlock group {a, b} has no blocks edge between documents, so the
  // blocks self loop is reported on its own.
  expect(byGroup.deadlock).toEqual([edge("a.md", "blocks", "a.md")]);
});

test("cycle messages name the rest of the tangle and use the right wording", async () => {
  const { validate: run } = await import("../src/validate");
  const bundle = await loadBundle("tests/fixtures/edge");
  const graph = {
    edges: [
      edge("A.md", "depends_on", "B.md"),
      edge("B.md", "depends_on", "A.md"),
      edge("B.md", "depends_on", "C.md"),
      edge("C.md", "depends_on", "B.md"),
      edge("S.md", "supersedes", "S.md"),
    ],
    unresolved: [],
    backlinks: new Map(),
  };
  const messages = run(bundle, graph)
    .filter((i) => i.code === "dependency-cycle")
    .map((i) => i.message);
  expect(messages).toEqual([
    "cycle: A.md depends_on B.md, B.md depends_on A.md. Also caught in the same tangle: C.md",
    "S.md refers to itself via supersedes. Remove the entry",
  ]);
});
