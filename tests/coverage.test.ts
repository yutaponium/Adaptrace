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
  expect(
    report.requirements.map((r) => [r.path, r.status, r.satisfiers.length]),
  ).toEqual([
    // A Decision tracks no work; "Done" is done in any case; v2 is not.
    ["requirements/req-1-login.md", "open", 3],
    // The deprecated task is left out.
    ["requirements/req-2-mfa.md", "open", 1],
    ["requirements/req-3-audit.md", "open", 1],
    // REQ-8 satisfies it and is uncovered itself.
    ["requirements/req-5-export.md", "open", 2],
    ["requirements/req-6-policy.md", "covered", 1],
    ["requirements/req-7-uptime.md", "covered", 1],
    ["requirements/req-8-sub.md", "uncovered", 0],
  ]);
  expect(report.byStatus).toEqual({ uncovered: 1, open: 4, covered: 2 });
  expect(report.scope).toBeNull();
  expect(
    report.requirements[0]?.satisfiers.map((s) => [s.path, s.done, s.inScope]),
  ).toEqual([
    ["decisions/adr-1-idp.md", null, true],
    ["tasks/t-a-login.md", true, true],
    ["tasks/t-y-login-v2.md", false, true],
  ]);
});

test("a milestone's scope: the work it waits for, and what that satisfies", () => {
  const report = coverage(bundle, graph, { milestone: MILESTONE });
  expect(report.milestone).toEqual({
    path: MILESTONE,
    title: "Year-end release",
    state: null,
    due: "2026-12-25",
  });
  expect(report.requirements.map((r) => [r.path, r.status])).toEqual([
    // Work outside the milestone (v2) does not count.
    ["requirements/req-1-login.md", "covered"],
    ["requirements/req-2-mfa.md", "open"],
    // Waited for directly: its work counts even outside the scope.
    ["requirements/req-3-audit.md", "open"],
    // Satisfied by the milestone itself. Not REQ-5 (no work in scope), nor
    // REQ-6 (only a Decision the work depends on satisfies it).
    ["requirements/req-7-uptime.md", "covered"],
  ]);
  expect(
    report.requirements[0]?.satisfiers.map((s) => [s.path, s.inScope]),
  ).toEqual([
    ["decisions/adr-1-idp.md", false],
    ["tasks/t-a-login.md", true],
    ["tasks/t-y-login-v2.md", false],
  ]);
  // Nearest first, through Tasks only: the Decision is in the scope, the
  // requirement it depends on is not.
  expect(report.scope?.map((i) => [i.path, i.done, i.late])).toEqual([
    ["requirements/req-3-audit.md", null, false],
    ["tasks/t-a-login.md", true, false],
    ["tasks/t-b-mfa.md", false, true],
    ["tasks/t-e-review.md", false, false],
    ["decisions/adr-2-otp.md", null, false],
    ["tasks/t-c-sms.md", false, false],
  ]);
});

test("a requirement the milestone waits for counts all its work", () => {
  const report = coverage(bundle, graph, { milestone: MILESTONE });
  const audit = report.requirements.find(
    (r) => r.path === "requirements/req-3-audit.md",
  );
  expect(audit?.status).toBe("open");
  expect(audit?.satisfiers.map((s) => [s.path, s.done, s.inScope])).toEqual([
    ["tasks/t-w-audit.md", false, false],
  ]);
});

test("--done and --type change what counts", () => {
  const report = coverage(bundle, graph, { done: ["in_progress", "to_do"] });
  expect(report.requirements.map((r) => r.status)).toEqual([
    // "Done" is no longer a done state.
    "open",
    "covered",
    "covered",
    "open",
    "covered",
    "covered",
    "uncovered",
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
  expect(text).toContain("Work the milestone waits for (3 not done of 4)");
  expect(text).toContain("due 2026-12-30 (after the milestone)");
  const md = formatCoverage(report, true, "https://example.com/b/");
  expect(md).toContain("| Status | Requirement | Satisfied by |");
  expect(md).toContain(
    "| open | [REQ-2 MFA](https://example.com/b/requirements/req-2-mfa.md) |",
  );
  // Escaped once: a "|" would split the cell.
  expect(md).toContain("(in\\_progress)");
  expect(md).not.toContain("\\\\");
});
