import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { loadBundle, withFiles } from "../src/bundle";
import { run } from "../src/cli";
import { estimate } from "../src/estimate";
import { buildGraph } from "../src/graph";
import { byReviewOrder, impact, reviewSteps } from "../src/impact";
import { formatEstimate, formatImpact } from "../src/output";

const BUNDLE = "tests/fixtures/order";

afterEach(() => {
  mock.restore();
});

async function setup() {
  const bundle = await loadBundle(BUNDLE);
  return { bundle, graph: buildGraph(bundle) };
}

const order = (items: { path: string; step: number }[]) =>
  byReviewOrder(items).map((i) => [i.step, i.path]);

test("impact puts a document after everything it depends on, not by depth", async () => {
  const { bundle, graph } = await setup();
  const report = impact(bundle, graph, new Map(), "requirements/r.md");
  // pmp.md depends on r.md directly (depth 1) but also on a.md and c.md.
  expect(report.affected.find((a) => a.path === "plans/pmp.md")?.depth).toBe(1);
  expect(order(report.affected)).toEqual([
    [1, "requirements/a.md"],
    [2, "plans/c.md"],
    // Through the deprecated x.md, which is walked but not listed.
    [2, "plans/y.md"],
    [3, "plans/pmp.md"],
  ]);
});

test("steps are renumbered so none is empty when deprecated ones are left out", async () => {
  const { bundle, graph } = await setup();
  const report = impact(bundle, graph, new Map(), "requirements/q.md");
  expect(order(report.affected)).toEqual([[1, "plans/v.md"]]);
});

test("estimate orders the starting documents too", async () => {
  const { bundle, graph } = await setup();
  const report = estimate(bundle, graph, [
    "requirements/a.md",
    "requirements/r.md",
  ]);
  // a.md is a starting document, but r.md reaches it, so it comes after.
  expect(order(report.items)).toEqual([
    [1, "requirements/r.md"],
    [2, "requirements/a.md"],
    [3, "plans/c.md"],
    [3, "plans/y.md"],
    [4, "plans/pmp.md"],
  ]);
});

test("a cycle shares one step, and what depends on it comes after", async () => {
  const base = await loadBundle(BUNDLE);
  // b <-> c is a cycle; z depends on r; b depends on z; a depends on c.
  const doc = (deps: string[]) =>
    `---\ntype: Plan\ndepends_on:\n${deps.map((d) => `  - ${d}\n`).join("")}---\n`;
  const bundle = withFiles(base, [
    { path: "cyc/z.md", text: doc(["/requirements/r.md"]) },
    { path: "cyc/b.md", text: doc(["/cyc/z.md", "/cyc/c.md"]) },
    { path: "cyc/c.md", text: doc(["/cyc/b.md"]) },
    { path: "cyc/a.md", text: doc(["/cyc/c.md"]) },
  ]);
  const steps = reviewSteps(
    buildGraph(bundle),
    ["requirements/r.md"],
    ["cyc/z.md", "cyc/a.md", "cyc/b.md", "cyc/c.md"],
  );
  expect(Object.fromEntries(steps)).toEqual({
    "cyc/z.md": 1,
    "cyc/b.md": 2,
    "cyc/c.md": 2,
    "cyc/a.md": 3,
  });
});

test("the text and markdown output show the steps in review order", async () => {
  const { bundle, graph } = await setup();
  const text = formatImpact(
    impact(bundle, graph, new Map(), "requirements/r.md"),
    "review",
  );
  expect(text).toContain("Review order, upstream first (3 steps)");
  expect(text.indexOf("1  requirements/a.md")).toBeLessThan(
    text.indexOf("3  plans/pmp.md"),
  );
  const md = formatEstimate(
    estimate(bundle, graph, ["requirements/r.md"]),
    null,
    true,
    undefined,
    "review",
  );
  expect(md).toContain("| Step | Document |");
  expect(md.indexOf("| 1 | Requirement R")).toBeLessThan(
    md.indexOf("| 4 | Project plan"),
  );
});

test("--order review sorts the json; the default and bad values", async () => {
  const log = spyOn(console, "log").mockImplementation(() => {});
  const args = ["impact", "requirements/r.md", "--bundle", BUNDLE];
  expect(await run([...args, "--order", "review", "--format", "json"])).toBe(0);
  const json = JSON.parse(log.mock.calls[0]?.[0]);
  expect(json.affected.map((a: { path: string }) => a.path)).toEqual([
    "requirements/a.md",
    "plans/c.md",
    "plans/y.md",
    "plans/pmp.md",
  ]);
  expect(json.affected[3].step).toBe(3);
  expect(await run([...args])).toBe(0);
  expect(log.mock.calls[1]?.[0]).toContain("Direct (2)");
  const error = spyOn(console, "error").mockImplementation(() => {});
  expect(await run([...args, "--order", "random"])).toBe(2);
  expect(error.mock.calls[0]?.[0]).toContain("--order must be one of");
});

test("steps are right-aligned, so the paths and LLM lines line up past step 9", async () => {
  // A chain of 11 documents below requirements/r.md: 11 steps.
  const base = await loadBundle(BUNDLE);
  const bundle = withFiles(
    base,
    Array.from({ length: 11 }, (_, n) => ({
      path: `chain/c${String(n + 1).padStart(2, "0")}.md`,
      text: `---\ntype: Plan\ndepends_on: ${n === 0 ? "/requirements/q.md" : `/chain/c${String(n).padStart(2, "0")}.md`}\n---\n`,
    })),
  );
  const graph = buildGraph(bundle);
  const lines = formatImpact(
    impact(bundle, graph, new Map(), "requirements/q.md"),
    "review",
  )
    .split("\n")
    .filter((l) => /^ +\d+ {2}/.test(l));
  expect(lines[0]).toStartWith("   1  chain/c01.md");
  expect(lines.at(-1)).toStartWith("  11  chain/c11.md");
  const report = estimate(bundle, graph, ["requirements/q.md"]);
  const sizes = {
    items: report.items.map((i) => ({
      path: i.path,
      sizing: { size: "small" as const, hours: 1, work: "w" },
    })),
    bySize: { small: report.items.length },
    hours: report.items.length,
    unknown: 0,
  };
  const rows = formatEstimate(report, sizes, false, undefined, "review").split(
    "\n",
  );
  const last = rows.findIndex((l) => l.startsWith("  12  chain/c11.md"));
  expect(rows.find((l) => /^ +1 {2}/.test(l))).toStartWith(
    "   1  requirements/q.md",
  );
  // The LLM line sits two spaces in from the path.
  expect(rows[last + 1]).toBe("        small, 1h: w");
});
