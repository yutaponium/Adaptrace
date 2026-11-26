import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBundle, withFiles } from "../src/bundle";
import { addVerified } from "../src/frontmatter";
import { buildGraph } from "../src/graph";
import { gitDates, lastUpdated } from "../src/history";
import { findConcept, impact, stale } from "../src/impact";

const ROOT = "tests/fixtures/history";

async function setup() {
  const bundle = await loadBundle(ROOT);
  // No git dates, so the results do not depend on the repository's history.
  return {
    bundle,
    graph: buildGraph(bundle),
    updated: lastUpdated(bundle),
  };
}

test("last updated comes from generated.at, then timestamp; an older verified changes nothing", async () => {
  const { updated } = await setup();
  // d.md was verified on 10-28, after its content (10-21): reviewed then.
  expect(updated.get("decisions/d.md")).toEqual({
    at: new Date("2026-10-21T01:00:00Z"),
    source: "generated.at",
    raw: "2026-10-21T10:00:00+09:00",
    reviewed: {
      at: new Date("2026-10-28T01:00:00Z"),
      raw: "2026-10-28T10:00:00+09:00",
    },
  });
  expect(updated.get("tasks/u.md")?.source).toBe("timestamp");
  expect(updated.has("tasks/n.md")).toBe(false);
});

test("a review recorded in verified clears a document, but not what depends on it", async () => {
  const base = await loadBundle(ROOT);
  // r.md changed on 10-29. d.md was reviewed on 10-31 and needed no change:
  // verified moves, generated stays at 10-21.
  const bundle = withFiles(base, [
    {
      path: "decisions/d.md",
      text: "---\ntype: Decision\ngenerated: { by: human:suzuki, at: 2026-10-21T10:00:00+09:00 }\nverified:\n  - { by: human:sato, at: 2026-10-25T10:00:00+09:00 }\n  - { by: human:sato, at: 2026-10-31T10:00:00+09:00 }\nderived_from:\n  - /requirements/r.md\n---\n",
    },
  ]);
  const graph = buildGraph(bundle);
  const updated = lastUpdated(bundle);
  // The latest entry of a list counts.
  expect(updated.get("decisions/d.md")?.reviewed?.raw).toBe(
    "2026-10-31T10:00:00+09:00",
  );
  const d = impact(bundle, graph, updated, "requirements/r.md").affected.find(
    (a) => a.path === "decisions/d.md",
  );
  expect(d?.needsReview).toBe(false);
  expect(stale(bundle, graph, updated).stale.map((s) => s.path)).not.toContain(
    "decisions/d.md",
  );
  // t.md (10-30) depends on d.md and is older than d.md's review (10-31),
  // but d.md's content did not change, so t.md is not out of date.
  expect(stale(bundle, graph, updated).stale.map((s) => s.path)).not.toContain(
    "tasks/t.md",
  );
  // With only a review and no other date, the first review stands in for
  // the content date.
  const only = withFiles(base, [
    {
      path: "tasks/n.md",
      text: "---\ntype: Task\nverified: { by: human:sato, at: 2026-10-31T10:00:00+09:00 }\n---\n",
    },
  ]);
  expect(lastUpdated(only).get("tasks/n.md")?.source).toBe("verified.at");
});

test("the git date is never the last update (ADR-029)", async () => {
  const { bundle } = await setup();
  const updated = lastUpdated(bundle);
  // tasks/n.md has no generated: unknown, though git may have a date.
  expect(updated.has("tasks/n.md")).toBe(false);
  expect(updated.get("requirements/r.md")?.source).toBe("generated.at");
});

test("gitDates reads the author date per file, including non-ASCII names", async () => {
  const dir = await mkdtemp(join(tmpdir(), "adaptrace-git-"));
  try {
    const git = (args: string[], authored: string, committed: string) =>
      Bun.spawnSync(["git", "-C", dir, ...args], {
        env: {
          ...process.env,
          GIT_AUTHOR_DATE: authored,
          GIT_COMMITTER_DATE: committed,
          GIT_AUTHOR_NAME: "t",
          GIT_AUTHOR_EMAIL: "t@example.com",
          GIT_COMMITTER_NAME: "t",
          GIT_COMMITTER_EMAIL: "t@example.com",
        },
      });
    const jan = "2026-01-01T00:00:00Z";
    git(["init", "-q"], jan, jan);
    await writeFile(join(dir, "a.md"), "1");
    await writeFile(join(dir, "要件.md"), "1");
    git(["add", "."], jan, jan);
    git(["commit", "-q", "-m", "one"], jan, jan);
    await writeFile(join(dir, "a.md"), "2");
    // Authored in February, committed (as by a rebase) in March.
    git(
      ["commit", "-q", "-am", "two"],
      "2026-02-01T00:00:00Z",
      "2026-03-01T00:00:00Z",
    );
    const dates = gitDates(dir);
    expect(dates.get("a.md")?.at).toEqual(new Date("2026-02-01T00:00:00Z"));
    expect(dates.get("要件.md")?.at).toEqual(new Date(jan));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  expect(gitDates(tmpdir()).size).toBe(0);
});

test("impact lists direct and indirect dependents and marks older ones", async () => {
  const { bundle, graph, updated } = await setup();
  const report = impact(bundle, graph, updated, "requirements/r.md");
  expect(
    report.affected.map((a) => [a.path, a.edge.kind, a.depth, a.needsReview]),
  ).toEqual([
    ["decisions/d.md", "derived_from", 1, true],
    ["tasks/u.md", "satisfies", 1, false],
    ["tasks/w.md", "depends_on", 1, true],
    ["tasks/t.md", "depends_on", 2, false],
    // Reached through the deprecated tasks/old.md, which is not listed.
    ["tasks/after-old.md", "depends_on", 2, true],
  ]);
});

test("impact marks every dependent when the changed document has no date", async () => {
  const { bundle, graph } = await setup();
  const report = impact(bundle, graph, new Map(), "requirements/r.md");
  expect(report.updated).toBeNull();
  expect(report.affected.every((a) => a.needsReview)).toBe(true);
});

test("dates without a UTC offset are not used", async () => {
  const { updated } = await setup();
  expect(updated.has("tasks/bad-date.md")).toBe(false);
});

test("findConcept accepts paths, concept IDs and paths with the bundle root", async () => {
  const { bundle } = await setup();
  for (const arg of [
    "requirements/r.md",
    "/requirements/r.md",
    "requirements/r",
    `${ROOT}/requirements/r.md`,
    `./${ROOT}/requirements/r.md`,
    join(process.cwd(), ROOT, "requirements/r.md"),
  ]) {
    expect(findConcept(bundle, arg)).toBe("requirements/r.md");
  }
  expect(findConcept(bundle, "nope.md")).toBeNull();
});

test("stale finds documents older than a direct dependency or past stale_after", async () => {
  const { bundle, graph, updated } = await setup();
  const report = stale(
    bundle,
    graph,
    updated,
    new Date("2026-11-01T00:00:00Z"),
  );
  expect(
    report.stale.map((d) => [d.path, d.reasons.map((r) => r.kind)]),
  ).toEqual([
    ["decisions/d.md", ["older-than-dependency"]],
    ["risks/e.md", ["expired"]],
    // after-old.md is older than tasks/old.md, but old.md is deprecated.
    ["tasks/w.md", ["older-than-dependency"]],
  ]);
  // One reason for both keys that point at the same dependency.
  expect(report.stale.at(-1)?.reasons[0]?.kinds).toEqual([
    "depends_on",
    "satisfies",
  ]);
  expect(report.unknown).toEqual(["tasks/bad-date.md", "tasks/n.md"]);
});

test("addVerified keeps earlier entries and the lines around them", () => {
  const stamp = { by: "human:sato", at: "2026-11-20T10:00:00+09:00" };
  const doc = (fm: string) => `---\ntype: Task\n${fm}---\n\n# T\n`;
  // None yet: one mapping.
  expect(addVerified(doc(""), stamp)).toBe(
    doc("verified: { by: human:sato, at: 2026-11-20T10:00:00+09:00 }\n"),
  );
  // One mapping with a comment: a list, the comment kept.
  expect(
    addVerified(
      doc(
        "verified: { by: human:a, at: 2026-10-01T00:00:00Z }   # 見直した日時\n",
      ),
      stamp,
    ),
  ).toBe(
    doc(
      "verified:\n  - { by: human:a, at: 2026-10-01T00:00:00Z }   # 見直した日時\n  - { by: human:sato, at: 2026-11-20T10:00:00+09:00 }\n",
    ),
  );
  // A block list, with a key after it and CRLF line ends: one more line.
  const crlf = doc(
    "verified:\n  - by: human:a\n    at: 2026-10-01T00:00:00Z\nstate: done\n",
  ).replace(/\n/g, "\r\n");
  expect(addVerified(crlf, stamp)).toBe(
    doc(
      "verified:\n  - by: human:a\n    at: 2026-10-01T00:00:00Z\n  - { by: human:sato, at: 2026-11-20T10:00:00+09:00 }\nstate: done\n",
    ).replace(/\n/g, "\r\n"),
  );
});

test("a document with only verified dates its content by the first review", async () => {
  const base = await loadBundle(ROOT);
  const bundle = withFiles(base, [
    {
      path: "tasks/n.md",
      text: "---\ntype: Task\nverified:\n  - { by: human:a, at: 2026-10-31T10:00:00+09:00 }\n  - { by: human:b, at: 2026-11-20T10:00:00+09:00 }\n---\n",
    },
  ]);
  const n = lastUpdated(bundle).get("tasks/n.md");
  expect(n?.raw).toBe("2026-10-31T10:00:00+09:00");
  expect(n?.source).toBe("verified.at");
  expect(n?.reviewed?.raw).toBe("2026-11-20T10:00:00+09:00");
});

test("addVerified refuses what it cannot do without losing or doubling a key", () => {
  const stamp = { by: "human:me", at: "2026-11-20T00:00:00Z" };
  expect(
    addVerified(
      "---\ntype: Task\n'verified': { by: human:a, at: 2026-01-01T00:00:00Z }\n---\n",
      stamp,
    ),
  ).toBeNull();
  // A comment at column 0 stays with the key it labels.
  expect(
    addVerified(
      "---\ntype: Task\nverified:\n  - { by: human:a, at: 2026-01-01T00:00:00Z }\n# deps\ndepends_on:\n  - /x.md\n---\n",
      stamp,
    ),
  ).toBe(
    "---\ntype: Task\nverified:\n  - { by: human:a, at: 2026-01-01T00:00:00Z }\n  - { by: human:me, at: 2026-11-20T00:00:00Z }\n# deps\ndepends_on:\n  - /x.md\n---\n",
  );
});

test("addVerified: a verified example in the body, other indents, unreadable YAML", () => {
  const stamp = { by: "human:me", at: "2026-11-20T00:00:00Z" };
  // The body's example is not a second key.
  expect(
    addVerified(
      "---\ntype: Task\n---\n\n```yaml\nverified: { by: x, at: y }\n```\n",
      stamp,
    ),
  ).toBe(
    "---\ntype: Task\nverified: { by: human:me, at: 2026-11-20T00:00:00Z }\n---\n\n```yaml\nverified: { by: x, at: y }\n```\n",
  );
  // Indented by four, with a comment: the same indent, the comment kept.
  expect(
    addVerified(
      "---\ntype: Task\nverified:\n    - { by: a, at: 2026-01-01T00:00:00Z }  # keep\n---\n",
      stamp,
    ),
  ).toBe(
    "---\ntype: Task\nverified:\n    - { by: a, at: 2026-01-01T00:00:00Z }  # keep\n    - { by: human:me, at: 2026-11-20T00:00:00Z }\n---\n",
  );
  // A list at column 0.
  expect(
    addVerified(
      "---\ntype: Task\nverified:\n- { by: a, at: 2026-01-01T00:00:00Z }\n---\n",
      stamp,
    ),
  ).toBe(
    "---\ntype: Task\nverified:\n- { by: a, at: 2026-01-01T00:00:00Z }\n- { by: human:me, at: 2026-11-20T00:00:00Z }\n---\n",
  );
  // Frontmatter that YAML cannot read: nothing is risked.
  expect(
    addVerified(
      "---\ntype: Task\nverified:\n  - { by: a, at: 2026-01-01T00:00:00Z\n---\n",
      stamp,
    ),
  ).toBeNull();
});
