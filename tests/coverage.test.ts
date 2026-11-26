import { expect, test } from "bun:test";
import { loadBundle } from "../src/bundle";
import { coverage } from "../src/coverage";
import { buildGraph } from "../src/graph";
import { formatCoverage } from "../src/output";

const bundle = await loadBundle("tests/fixtures/coverage");
const graph = buildGraph(bundle);

test("each live requirement with what satisfies it", () => {
  const report = coverage(bundle, graph);
  expect(
    report.requirements.map((r) => [r.path, r.status, r.satisfiers.length]),
  ).toEqual([
    // A Decision tracks no work; the Task's "Done" is done in any case.
    ["requirements/req-1-login.md", "covered", 2],
    // The deprecated task is left out.
    ["requirements/req-2-mfa.md", "open", 1],
    ["requirements/req-3-audit.md", "uncovered", 0],
    ["requirements/req-5-export.md", "covered", 1],
  ]);
  expect(report.byStatus).toEqual({ uncovered: 1, open: 1, covered: 2 });
  expect(report.scope).toBeNull();
  const login = report.requirements[0];
  expect(login?.satisfiers.map((s) => [s.path, s.done])).toEqual([
    ["decisions/adr-1-idp.md", null],
    ["tasks/t-a-login.md", true],
  ]);
});

test("a milestone's scope: what it waits for, and what that satisfies", () => {
  const report = coverage(bundle, graph, {
    milestone: "milestones/m1-release.md",
  });
  expect(report.milestone).toEqual({
    path: "milestones/m1-release.md",
    title: "Year-end release",
    state: null,
    due: "2026-12-25",
  });
  // REQ-3 directly, REQ-1 and REQ-2 through the tasks; not REQ-5.
  expect(report.requirements.map((r) => r.path)).toEqual([
    "requirements/req-1-login.md",
    "requirements/req-2-mfa.md",
    "requirements/req-3-audit.md",
  ]);
  // Nearest first: depends_on and blocks, then what those wait for.
  expect(report.scope?.map((i) => [i.path, i.done, i.late])).toEqual([
    ["requirements/req-3-audit.md", null, false],
    ["tasks/t-a-login.md", true, false],
    ["tasks/t-b-mfa.md", false, true],
    ["tasks/t-e-review.md", false, false],
    ["tasks/t-c-sms.md", false, false],
  ]);
});

test("--done and --type change what counts", () => {
  const report = coverage(bundle, graph, { done: ["in_progress"] });
  // "Done" is no longer a done state, "in_progress" is.
  expect(report.requirements.map((r) => r.status)).toEqual([
    "open",
    "covered",
    "uncovered",
    "open",
  ]);
  // Another type as the requirements: nothing satisfies the decision.
  const decisions = coverage(bundle, graph, { types: ["Decision"] });
  expect(decisions.requirements.map((r) => [r.path, r.status])).toEqual([
    ["decisions/adr-1-idp.md", "uncovered"],
  ]);
});

test("text and markdown output", () => {
  const report = coverage(bundle, graph, {
    milestone: "milestones/m1-release.md",
  });
  const text = formatCoverage(report, false);
  expect(text).toContain(
    "uncovered  REQ-3 Audit log  requirements/req-3-audit.md",
  );
  expect(text).toContain("Work the milestone waits for (3 not done of 4)");
  expect(text).toContain("due 2026-12-30 (after the milestone)");
  const md = formatCoverage(report, true, "https://example.com/b/");
  expect(md).toContain("| Status | Requirement | Satisfied by |");
  expect(md).toContain(
    "| open | [REQ-2 MFA](https://example.com/b/requirements/req-2-mfa.md) |",
  );
  expect(md).toContain("in\\_progress");
});
