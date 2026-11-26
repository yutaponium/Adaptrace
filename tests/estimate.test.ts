import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { join } from "node:path";
import { loadBundle, withFiles } from "../src/bundle";
import { run } from "../src/cli";
import {
  buildSizingPrompt,
  estimate,
  estimateContext,
  size,
} from "../src/estimate";
import { buildGraph } from "../src/graph";
import { formatEstimate } from "../src/output";

const BUNDLE = "tests/fixtures/estimate";
// The running bun, so the tests do not depend on bun being on PATH.
const FAKE = `"${process.execPath}" "${join(import.meta.dir, "fake-llm.ts")}"`;

afterEach(() => {
  mock.restore();
});

async function report(targets = ["requirements/mfa.md"]) {
  const bundle = await loadBundle(BUNDLE);
  return {
    bundle,
    report: estimate(bundle, buildGraph(bundle), targets, {
      request: "change-requests/sms.md",
    }),
  };
}

test("the report lists what the change reaches, nearest first", async () => {
  const { report: r } = await report();
  expect(r.items.map((i) => [i.path, i.depth])).toEqual([
    ["requirements/mfa.md", 0],
    ["acceptance/mfa.md", 1],
    ["decisions/idp.md", 1],
    ["tasks/login.md", 1],
    ["risks/lockin.md", 2],
    ["tasks/e2e.md", 2],
    ["milestones/release.md", 3],
  ]);
  expect(r.byType).toEqual({
    Requirement: 1,
    Acceptance: 1,
    Decision: 1,
    Task: 2,
    Risk: 1,
    Milestone: 1,
  });
  expect(r.tasksByState).toEqual({ in_progress: 1, done: 1 });
  expect(r.items.find((i) => i.path === "tasks/e2e.md")?.reopens).toBe(true);
  expect(r.owners).toEqual(["sato", "tanaka", "yamada"]);
});

test("milestones at risk: blocked by an affected task or depending on one; deprecated tasks are left out", async () => {
  const { report: r } = await report();
  expect(r.milestones).toEqual([
    {
      path: "milestones/release.md",
      title: "年内リリース",
      due: "2026-12-20",
      blockedBy: ["tasks/e2e.md", "tasks/login.md"],
    },
  ]);
});

test("several starting documents keep the nearest depth", async () => {
  const { report: r } = await report([
    "requirements/mfa.md",
    "acceptance/mfa.md",
  ]);
  expect(r.items.find((i) => i.path === "acceptance/mfa.md")?.depth).toBe(0);
  expect(r.items.find((i) => i.path === "tasks/e2e.md")?.depth).toBe(1);
});

test("an LLM sizes each document and the hours add up", async () => {
  const { bundle, report: r } = await report();
  const ctx = await estimateContext(bundle, r);
  expect(ctx.request).toContain("SMS でもワンタイムコード");
  const sizes = await size(ctx, {
    command: `${FAKE} size`,
    timeoutMs: 10_000,
  });
  expect(sizes.bySize).toEqual({ small: 5, large: 1, none: 1 });
  expect(sizes.hours).toBe(5 * 1.5 + 8);
  expect(sizes.unknown).toBe(0);
  const text = formatEstimate(r, sizes, false);
  expect(text).toContain("Effort: 15.5 hours");
  expect(text).toContain("Finished tasks to reopen: tasks/e2e.md");
});

test("the sizing prompt carries the request, the starting documents and the relation", async () => {
  const { bundle, report: r } = await report();
  const ctx = await estimateContext(bundle, r);
  const e2e = r.items.find((i) => i.path === "tasks/e2e.md");
  if (e2e === undefined) throw new Error("missing");
  const prompt = buildSizingPrompt(ctx, e2e, "---\ntype: Task\n---\n");
  expect(prompt).toContain("The change request, change-requests/sms.md");
  expect(prompt).toContain("requirements/mfa.md:\n\n```");
  expect(prompt).toContain(
    "through depends_on acceptance/mfa.md (2 steps away)",
  );
  expect(prompt).toContain("so the change reopens it");
});

test("CLI: markdown without links unless --link-base; LLM errors exit 1", async () => {
  const log = spyOn(console, "log").mockImplementation(() => {});
  const saved = process.env.ADAPTRACE_LLM;
  delete process.env.ADAPTRACE_LLM;
  try {
    expect(
      await run([
        "estimate",
        "requirements/mfa",
        "--bundle",
        BUNDLE,
        "--request",
        "change-requests/sms",
        "--format",
        "markdown",
      ]),
    ).toBe(0);
    const md = String(log.mock.calls[0]?.[0]);
    expect(md).toStartWith("# Change estimate: `change-requests/sms.md`");
    expect(md).toContain(
      "| ログインに MFA を入れる (`requirements/mfa.md`) | Requirement |",
    );
    expect(md).not.toContain("](");
    await run([
      "estimate",
      "requirements/mfa",
      "--bundle",
      BUNDLE,
      "--format",
      "markdown",
      "--link-base",
      "https://e.x/b/",
    ]);
    expect(String(log.mock.calls[1]?.[0])).toContain(
      "](https://e.x/b/requirements/mfa.md)",
    );
    expect(
      await run([
        "estimate",
        "requirements/mfa",
        "acceptance/mfa",
        "--bundle",
        BUNDLE,
        "--llm",
        `${FAKE} fail`,
      ]),
    ).toBe(1);
    expect(
      await run([
        "estimate",
        "requirements/mfa",
        "--bundle",
        BUNDLE,
        "--format",
        "json",
      ]),
    ).toBe(0);
    const json = JSON.parse(String(log.mock.calls[3]?.[0]));
    expect(json.targets).toEqual(["requirements/mfa.md"]);
    expect(json.estimate).toBeUndefined();
  } finally {
    if (saved !== undefined) process.env.ADAPTRACE_LLM = saved;
  }
});

test("CLI: unknown documents and a missing argument are usage errors", async () => {
  spyOn(console, "error").mockImplementation(() => {});
  expect(await run(["estimate", "--bundle", BUNDLE])).toBe(2);
  expect(await run(["estimate", "nope", "--bundle", BUNDLE])).toBe(2);
  expect(
    await run([
      "estimate",
      "requirements/mfa",
      "--request",
      "nope",
      "--bundle",
      BUNDLE,
    ]),
  ).toBe(2);
  expect(await run(["validate", BUNDLE, "extra"])).toBe(2);
});

test("deprecated starting documents and finished milestones are left out", async () => {
  const { report: r } = await report(["tasks/old.md"]);
  expect(r.items).toEqual([]);
  expect(r.targets).toEqual([]);
  expect(r.ignored).toEqual(["tasks/old.md"]);
  expect(r.milestones).toEqual([]);
  const text = formatEstimate(r, null, false);
  expect(text).toContain("reaches 0 more documents");
  expect(text).toContain("Left out as deprecated: tasks/old.md.");
  const { report: mixed } = await report(["tasks/old.md", "acceptance/mfa.md"]);
  expect(formatEstimate(mixed, null, false)).toContain(
    "Starts from acceptance/mfa.md and reaches 2 more documents.",
  );
  const base = await loadBundle(BUNDLE);
  const bundle = withFiles(base, [
    {
      path: "milestones/release.md",
      text: "---\ntype: Milestone\ntitle: R\nstate: done\ndepends_on: /tasks/e2e.md\n---\n",
    },
  ]);
  const done = estimate(bundle, buildGraph(bundle), ["requirements/mfa.md"]);
  expect(done.milestones).toEqual([]);
});

test("owner lists count every person", async () => {
  const base = await loadBundle(BUNDLE);
  const bundle = withFiles(base, [
    {
      path: "tasks/login.md",
      text: "---\ntype: Task\ntitle: L\nowner: [tanaka, suzuki]\nsatisfies: /requirements/mfa.md\n---\n",
    },
  ]);
  const r = estimate(bundle, buildGraph(bundle), ["requirements/mfa.md"]);
  expect(r.owners).toEqual(["sato", "suzuki", "tanaka", "yamada"]);
  expect(r.items.find((i) => i.path === "tasks/login.md")?.owners).toEqual([
    "tanaka",
    "suzuki",
  ]);
  expect(formatEstimate(r, null, false)).toContain(
    "(Task, owner tanaka, suzuki)",
  );
});

test("a pipe in a title is escaped once; hours are rounded", async () => {
  const base = await loadBundle(BUNDLE);
  const bundle = withFiles(base, [
    {
      path: "requirements/mfa.md",
      text: "---\ntype: Requirement\ntitle: A | B\n---\n",
    },
  ]);
  const r = estimate(bundle, buildGraph(bundle), ["requirements/mfa.md"]);
  const md = formatEstimate(r, null, true);
  expect(md).toContain("| A \\| B (`requirements/mfa.md`) |");
  expect(md).not.toContain("\\\\|");
  // Seven items at 1.1 hours each: 7.699999999999999 without rounding.
  const sizes = await size(await estimateContext(bundle, r), {
    command: `${FAKE} size-inexact`,
    timeoutMs: 10_000,
  });
  const text = formatEstimate(r, sizes, false);
  expect(sizes.items.every((i) => i.sizing?.hours === 1.1)).toBe(true);
  expect(sizes.items).toHaveLength(7);
  expect(text).toContain("Effort: 7.7 hours");
});

test("pipes in a path are escaped in the table; milestone titles are escaped", async () => {
  const base = await loadBundle(BUNDLE);
  const bundle = withFiles(base, [
    {
      path: "tasks/a|b.md",
      text: "---\ntype: Task\ntitle: T\nsatisfies: /requirements/mfa.md\nblocks: /milestones/release.md\n---\n",
    },
    {
      path: "milestones/release.md",
      text: "---\ntype: Milestone\ntitle: v1 <beta> *final*\n---\n",
    },
  ]);
  const r = estimate(bundle, buildGraph(bundle), ["requirements/mfa.md"]);
  const md = formatEstimate(r, null, true);
  expect(md).toContain("| T (`tasks/a\\|b.md`) | Task |");
  expect(md).toContain("- v1 \\<beta\\> \\*final\\* (`milestones/release.md`)");
});

test("mapLimited keeps the order and runs at most `limit` at a time", async () => {
  const { mapLimited } = await import("../src/llm");
  let active = 0;
  let peak = 0;
  const out = await mapLimited([5, 1, 4, 2, 3], 2, async (n) => {
    active++;
    peak = Math.max(peak, active);
    await Bun.sleep(n * 5);
    active--;
    return n * 10;
  });
  expect(out).toEqual([50, 10, 40, 20, 30]);
  expect(peak).toBe(2);
});

test("--jobs must be a whole number from 1 to 64", async () => {
  spyOn(console, "error").mockImplementation(() => {});
  spyOn(console, "log").mockImplementation(() => {});
  expect(
    await run([
      "estimate",
      "requirements/mfa",
      "--bundle",
      BUNDLE,
      "--jobs",
      "0",
    ]),
  ).toBe(2);
  expect(
    await run([
      "estimate",
      "requirements/mfa",
      "--bundle",
      BUNDLE,
      "--jobs",
      "1.5",
    ]),
  ).toBe(2);
  expect(
    await run([
      "estimate",
      "requirements/mfa",
      "--bundle",
      BUNDLE,
      "--jobs",
      "1",
      "--llm",
      `${FAKE} size`,
    ]),
  ).toBe(0);
});
