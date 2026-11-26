import { expect, test } from "bun:test";
import { loadBundle } from "../src/bundle";
import { coverage } from "../src/coverage";
import { buildGraph } from "../src/graph";
import { formatCoverage } from "../src/output";

const FIXTURE = "tests/fixtures/requirement-coverage";
const bundle = await loadBundle(FIXTURE);
const graph = buildGraph(bundle);
const MILESTONE = "milestones/m1-release.md";

test("each live requirement with what satisfies it", () => {
  const report = coverage(bundle, graph);
  expect(report.requirements.map((r) => [r.path, r.status])).toEqual([
    // "Done" is done in any case; v2 is not. A Decision tracks no work.
    ["requirements/req-1-login.md", "open"],
    // The deprecated task is left out.
    ["requirements/req-2-mfa.md", "open"],
    ["requirements/req-3-audit.md", "open"],
    // REQ-8 satisfies it and is uncovered itself.
    ["requirements/req-5-export.md", "open"],
    ["requirements/req-6-policy.md", "covered"],
    // The milestone that satisfies it has work left.
    ["requirements/req-7-uptime.md", "open"],
    ["requirements/req-8-sub.md", "uncovered"],
    ["requirements/req-9-retention.md", "covered"],
  ]);
  expect(report.byStatus).toEqual({ uncovered: 1, open: 5, covered: 2 });
  expect(report.scope).toBeNull();
  const satisfiers = (path: string) =>
    report.requirements
      .find((r) => r.path === path)
      ?.satisfiers.map((s) => [s.path, s.status, s.done, s.counted]);
  expect(satisfiers("requirements/req-1-login.md")).toEqual([
    ["decisions/adr-1-idp.md", null, null, true],
    ["tasks/t-a-login.md", null, true, true],
    ["tasks/t-y-login-v2.md", null, false, true],
  ]);
  expect(satisfiers("requirements/req-5-export.md")).toEqual([
    ["requirements/req-8-sub.md", "uncovered", false, true],
    ["tasks/t-z-export.md", null, true, true],
  ]);
  expect(satisfiers("requirements/req-7-uptime.md")).toEqual([
    ["milestones/m1-release.md", null, false, true],
  ]);
});

test("a milestone's scope and what counts in it", () => {
  const report = coverage(bundle, graph, { milestone: MILESTONE });
  expect(report.milestone).toEqual({
    path: MILESTONE,
    title: "Year-end release",
    state: null,
    due: "2026-12-25",
  });
  expect(report.requirements.map((r) => [r.path, r.status])).toEqual([
    // The v2 task is outside the milestone, and does not count.
    ["requirements/req-1-login.md", "covered"],
    ["requirements/req-2-mfa.md", "open"],
    // Waited for directly: the work that satisfies it joins the scope.
    ["requirements/req-3-audit.md", "open"],
    // Satisfied by the milestone itself, whose work is not done. Not REQ-5
    // (no work in the scope), nor REQ-6 (only a Decision the work depends
    // on satisfies it).
    ["requirements/req-7-uptime.md", "open"],
    // It satisfies REQ-3, which is in the scope.
    ["requirements/req-9-retention.md", "covered"],
  ]);
  expect(
    report.requirements[0]?.satisfiers.map((s) => [s.path, s.counted]),
  ).toEqual([
    ["decisions/adr-1-idp.md", true],
    ["tasks/t-a-login.md", true],
    ["tasks/t-y-login-v2.md", false],
  ]);
  // Nearest first. From Tasks: what they wait for. From a requirement: its
  // work. The Decision is in it, the requirement it depends on is not.
  expect(report.scope?.map((i) => [i.path, i.done, i.late])).toEqual([
    ["requirements/req-3-audit.md", null, false],
    ["tasks/t-a-login.md", true, false],
    ["tasks/t-b-mfa.md", false, true],
    ["tasks/t-e-review.md", false, false],
    ["requirements/req-9-retention.md", null, false],
    ["tasks/t-w-audit.md", false, false],
    ["decisions/adr-2-otp.md", null, false],
    ["tasks/t-c-sms.md", false, false],
    ["tasks/t-v-rotation.md", true, false],
  ]);
});

test("--done and --type change what counts", () => {
  const report = coverage(bundle, graph, { done: ["in_progress", "to_do"] });
  expect(report.requirements.map((r) => r.status)).toEqual([
    // "Done" is no longer a done state.
    "open",
    "covered",
    // REQ-9's "done" task is not done now.
    "open",
    "open",
    "covered",
    // The milestone's work: "Done" and "done" are not done now.
    "open",
    "uncovered",
    "open",
  ]);
  const decisions = coverage(bundle, graph, { types: ["Decision"] });
  expect(decisions.requirements.map((r) => [r.path, r.status])).toEqual([
    ["decisions/adr-1-idp.md", "uncovered"],
    ["decisions/adr-2-otp.md", "uncovered"],
  ]);
});

test("text and markdown output", () => {
  const report = coverage(bundle, graph, { milestone: MILESTONE });
  const text = formatCoverage(report, false);
  expect(text).toContain(
    "open       REQ-3 Audit log  requirements/req-3-audit.md",
  );
  expect(text).toContain("to_do  (outside the milestone)");
  expect(text).toContain("Milestone  (no state)");
  expect(text).toContain("Work the milestone waits for (4 not done of 6)");
  expect(text).toContain("due 2026-12-30 (after the milestone)");
  const all = formatCoverage(coverage(bundle, graph), false);
  expect(all).toContain("Requirement  uncovered");
  const md = formatCoverage(report, true, "https://example.com/b/");
  expect(md).toContain("| Status | Requirement | Satisfied by |");
  expect(md).toContain(
    "| open | [REQ-2 MFA](https://example.com/b/requirements/req-2-mfa.md) |",
  );
  // Escaped once: a "|" would split the cell.
  expect(md).toContain("(in\\_progress)");
  expect(md).not.toContain("\\\\");
});

// A small bundle written for one test, removed once it is read.
async function bundleOf(files: Record<string, string>) {
  const { mkdtemp, mkdir, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { dirname, join } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "adaptrace-coverage-"));
  await writeFile(join(root, "index.md"), "# B\n");
  for (const [path, keys] of Object.entries(files)) {
    await mkdir(join(root, dirname(path)), { recursive: true });
    await writeFile(join(root, path), `---\n${keys}\n---\n\n# ${path}\n`);
  }
  try {
    const b = await loadBundle(root);
    return { bundle: b, graph: buildGraph(b) };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("only a milestone that delivers a waited requirement counts", async () => {
  const b = await bundleOf({
    "m1.md": "type: Milestone\ndepends_on: [/rx.md, /t1.md]",
    "m2.md": "type: Milestone\nsatisfies: [/rx.md, /x.md]\ndepends_on: /t3.md",
    "rx.md": "type: Requirement",
    "x.md": "type: Requirement",
    "r1.md": "type: Requirement",
    "rs.md": "type: Requirement\nsatisfies: /r1.md",
    "t1.md": "type: Task\nstate: done\nsatisfies: /r1.md",
    "t2.md": "type: Task\nstate: done\nsatisfies: /rs.md",
    "t3.md": "type: Task\nstate: to_do",
    "t4.md": "type: Task\nstate: done\nsatisfies: /rx.md",
  });
  const report = coverage(b.bundle, b.graph, { milestone: "m1.md" });
  // m1 waits for rx, part of which m2 delivers: m2 counts, and its work is
  // left. Its own work is not walked into, and what else it satisfies (x)
  // is not shown. rs (not shown) counts all its work.
  expect(report.requirements.map((r) => [r.path, r.status])).toEqual([
    ["r1.md", "covered"],
    ["rx.md", "open"],
  ]);
  const rx = report.requirements.find((r) => r.path === "rx.md");
  expect(rx?.satisfiers.map((s) => [s.path, s.done, s.counted])).toEqual([
    ["m2.md", false, true],
    ["t4.md", true, true],
  ]);
  expect(report.scope?.map((i) => i.path)).toEqual(["rx.md", "t1.md", "t4.md"]);
  // Without the milestone, m2's work is left.
  const all = coverage(b.bundle, b.graph);
  expect(all.requirements.find((r) => r.path === "rx.md")?.status).toBe("open");
});

test("a shown requirement has one status, and owners may be a list", async () => {
  const b = await bundleOf({
    "m1.md": "type: Milestone\ndue: 2026-12-25\ndepends_on: /t.md",
    "r1.md": "type: Requirement",
    "r2.md": "type: Requirement\nsatisfies: /r1.md",
    "t.md":
      "type: Task\nstate: done\nowner: [sato, kato]\nsatisfies: [/r1.md, /r2.md]",
    "t2.md": "type: Task\nstate: to_do\nsatisfies: /r2.md",
  });
  const report = coverage(b.bundle, b.graph, { milestone: "m1.md" });
  expect(report.requirements.map((r) => [r.path, r.status])).toEqual([
    ["r1.md", "covered"],
    ["r2.md", "covered"],
  ]);
  const r1 = report.requirements.find((r) => r.path === "r1.md");
  expect(r1?.satisfiers.find((s) => s.path === "r2.md")?.status).toBe(
    "covered",
  );
  expect(report.scope?.[0]?.owner).toBe("sato, kato");
});

test("a milestone that satisfies a requirement is done by its state", async () => {
  const b = await bundleOf({
    "m0.md": "type: Milestone\nstate: done\nsatisfies: /r0.md",
    "m1.md": "type: Milestone\nsatisfies: /r1.md\ndepends_on: [/r0.md, /t.md]",
    "r0.md": "type: Requirement",
    "r1.md": "type: Requirement",
    "t.md": "type: Task\nstate: done",
  });
  // m0 is a release marker that shipped; m1 is not marked done yet.
  for (const report of [
    coverage(b.bundle, b.graph),
    coverage(b.bundle, b.graph, { milestone: "m1.md" }),
  ]) {
    expect(report.requirements.map((r) => [r.path, r.status])).toEqual([
      ["r0.md", "covered"],
      ["r1.md", "open"],
    ]);
  }
  const report = coverage(b.bundle, b.graph, { milestone: "m1.md" });
  // m0 delivers r0, which m1 waits for: it counts.
  expect(
    report.requirements[0]?.satisfiers.map((s) => [s.path, s.counted]),
  ).toEqual([["m0.md", true]]);
});

test("done work is not late", async () => {
  const b = await bundleOf({
    "m.md": "type: Milestone\ndue: 2026-12-25\ndepends_on: [/a.md, /b.md]",
    "a.md": "type: Task\nstate: done\ndue: 2026-12-30",
    "b.md": "type: Task\nstate: to_do\ndue: 2026-12-30",
  });
  const report = coverage(b.bundle, b.graph, { milestone: "m.md" });
  expect(report.scope?.map((i) => [i.path, i.late])).toEqual([
    ["a.md", false],
    ["b.md", true],
  ]);
});

test("another release's work counts only for a requirement the milestone waits for", async () => {
  const b = await bundleOf({
    "m1.md":
      "type: Milestone\ndue: 2026-12-25\ndepends_on: [/r1.md, /t1.md, /m0.md]",
    "m0.md": "type: Milestone\nstate: in_progress",
    "m2.md": "type: Milestone\nsatisfies: /r2.md\ndepends_on: /t5.md",
    "r1.md": "type: Requirement",
    "r2.md": "type: Requirement",
    "t1.md": "type: Task\nstate: done\nsatisfies: [/r1.md, /r2.md]",
    "t5.md":
      "type: Task\nstate: to_do\ndue: 2027-03-01\nsatisfies: /r1.md\ndepends_on: /t6.md",
    "t6.md": "type: Task\nstate: to_do",
  });
  const report = coverage(b.bundle, b.graph, { milestone: "m1.md" });
  // m1 waits for r1: t5 (m2's work) counts, though it is not in m1's scope.
  // r2 is shown because t1 satisfies it: m2 does not count there.
  expect(report.requirements.map((r) => [r.path, r.status])).toEqual([
    ["r1.md", "open"],
    ["r2.md", "covered"],
  ]);
  expect(
    report.requirements[0]?.satisfiers.map((s) => [s.path, s.counted]),
  ).toEqual([
    ["t1.md", true],
    ["t5.md", true],
  ]);
  expect(
    report.requirements[1]?.satisfiers.map((s) => [s.path, s.counted]),
  ).toEqual([
    ["m2.md", false],
    ["t1.md", true],
  ]);
  // The earlier release it waits for is work, with its state.
  expect(report.scope?.map((i) => [i.path, i.done])).toEqual([
    ["m0.md", false],
    ["r1.md", null],
    ["t1.md", true],
  ]);
  expect(formatCoverage(report, false)).toContain(
    "Work the milestone waits for (1 not done of 2)",
  );
});

test("a shown requirement has one status, however it is reached", async () => {
  const b = await bundleOf({
    "m.md": "type: Milestone\ndepends_on: /t1.md",
    "r1.md": "type: Requirement",
    "r2.md": "type: Requirement\nsatisfies: /r1.md",
    "r3.md": "type: Requirement\nsatisfies: /r2.md",
    "t1.md": "type: Task\nstate: done\nsatisfies: [/r1.md, /r3.md]",
    "t9.md": "type: Task\nstate: to_do\nsatisfies: /r3.md",
  });
  const report = coverage(b.bundle, b.graph, { milestone: "m.md" });
  expect(report.requirements.map((r) => [r.path, r.status])).toEqual([
    ["r1.md", "covered"],
    ["r3.md", "covered"],
  ]);
});
