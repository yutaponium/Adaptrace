// Checks the result of running the adaptrace-risk skill on the test
// repository (see README.md). Usage: bun check.ts <repository> [dialog]
// Exits 1 when a required check fails. "should" checks only warn.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadBundle } from "../../../src/bundle";
import { buildGraph } from "../../../src/graph";
import { lastUpdated } from "../../../src/history";
import { resourceStates } from "../../../src/resource";
import { stale } from "../../../src/impact";
import { validate } from "../../../src/validate";

const [repo, dialogPath] = process.argv.slice(2);
if (repo === undefined) {
  console.error("usage: bun check.ts <repository> [dialog]");
  process.exit(2);
}

let failed = 0;
function check(level: "must" | "should", ok: boolean, what: string) {
  const mark = ok ? "ok  " : level === "must" ? "FAIL" : "warn";
  if (!ok && level === "must") failed++;
  console.log(`${mark}  ${what}`);
}

const root = join(repo, ".adaptrace");
const bundle = await loadBundle(root).catch((e) => {
  console.log(`FAIL  no bundle: ${String(e)}`);
  console.log("\n1 required checks failed");
  process.exit(1);
});
const errors = validate(bundle).filter((i) => i.severity === "error");
check("must", errors.length === 0, `validate: ${errors.length} errors`);

const fm = (path: string) =>
  (bundle.concepts.get(path)?.frontmatter ?? {}) as Record<string, unknown>;
const list = (v: unknown) =>
  (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]).map(String);
const read = (path: string) =>
  existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : "";
const gen = (path: string) => {
  const g = (fm(path).generated ?? {}) as { at?: unknown; by?: unknown };
  return { at: String(g.at), by: String(g.by) };
};
// The time a value means, or NaN.
const time = (v: unknown) =>
  new Date(v instanceof Date ? v.toISOString() : String(v)).getTime();
// In a test repository (git), now; expected/ and failing/ are rendered for
// 2026-11-26, so they are checked as on that day.
const git = existsSync(join(repo, ".git"));
const now = git ? Date.now() : Date.parse("2026-11-26T12:00:00+09:00");

// The original documents: in a test repository, the ones setup.sh rendered
// (git test-base). expected/ and failing/ are not compared with them.
const original = (path: string) => {
  if (!git) return "";
  const r = Bun.spawnSync(["git", "show", `test-base:.adaptrace/${path}`], {
    cwd: repo,
  });
  return r.exitCode === 0 ? r.stdout.toString() : "";
};
const originalGenerated = (path: string) =>
  /^generated: (.*)$/m.exec(original(path))?.[1] ?? null;

// Nothing left to review: no risk is stale.
const report = stale(
  bundle,
  buildGraph(bundle),
  lastUpdated(bundle),
  new Date(now),
  resourceStates(bundle),
);
const staleRisks = report.stale
  .map((s) => s.path)
  .filter((p) => String(fm(p).type) === "Risk");
check(
  "must",
  staleRisks.length === 0,
  `no risk is stale${staleRisks.length ? ` (${staleRisks.join(", ")})` : ""}`,
);

// Kept as it was: reviewed, not changed.
const IDP = "risks/idp-lock-in.md";
const verified = list(
  (Array.isArray(fm(IDP).verified) ? fm(IDP).verified : [fm(IDP).verified])
    .filter((v) => v !== undefined)
    .map((v) => (v as { by?: unknown }).by),
);
const idpGenerated = /^generated: (.*)$/m.exec(read(IDP))?.[1] ?? "";
check(
  "must",
  verified.length > 0 &&
    String(fm(IDP).probability) === "中" &&
    String(fm(IDP).impact) === "大" &&
    read(IDP).includes("対応方針：契約の更新の3か月前に、ほかのIdPと比べる。") &&
    (!git || idpGenerated === originalGenerated(IDP)) &&
    time(fm(IDP).stale_after) > now,
  "the IdP risk is verified, unchanged, with a later review date",
);
check(
  "should",
  verified.includes("human:hayashi"),
  `the IdP risk was verified by the user (${verified.join(", ")})`,
);

// Reassessed: more likely, with a mitigation.
const SMS = "risks/sms-cost.md";
check(
  "must",
  String(fm(SMS).probability) === "高" &&
    String(fm(SMS).impact) === "中" &&
    (!git || /^generated: (.*)$/m.exec(read(SMS))?.[1] !== originalGenerated(SMS)) &&
    time(fm(SMS).stale_after) > now,
  `the SMS cost risk is reassessed (probability: ${String(fm(SMS).probability)}, impact: ${String(fm(SMS).impact)})`,
);
check(
  "should",
  /上限/.test(read(SMS)),
  "the SMS cost risk's body names the limit",
);

// The mitigation task.
const tasks = [...bundle.concepts.keys()].filter(
  (p) =>
    String(fm(p).type) === "Task" &&
    list(fm(p).derived_from).includes(`/${SMS}`),
);
const task = tasks[0];
check(
  "must",
  tasks.length === 1 &&
    task !== undefined &&
    String(fm(task).owner) === "suzuki" &&
    fm(task).due !== undefined,
  `one mitigation task, derived from the SMS cost risk, owned by suzuki, with a due date${task ? ` (${task})` : ""}`,
);
check(
  "should",
  task !== undefined &&
    read("tasks/index.md").includes(`(${task.replace(/^tasks\//, "")})`),
  "the task is listed in tasks/index.md",
);

// Closed: no review date left.
const OLD = "risks/legacy-browser.md";
check(
  "must",
  fm(OLD).state === "closed" && fm(OLD).stale_after === undefined,
  `the legacy browser risk is closed with no review date (state: ${String(fm(OLD).state)}, stale_after: ${String(fm(OLD).stale_after)})`,
);

// Nothing else changed.
if (git) {
  let gitFailed = false;
  const run = (args: string[]) => {
    const r = Bun.spawnSync(
      [
        "git",
        "-c",
        "core.quotePath=false",
        "-c",
        "core.excludesFile=/dev/null",
        ...args,
      ],
      { cwd: repo },
    );
    if (r.exitCode !== 0) gitFailed = true;
    return r.stdout.toString();
  };
  // The keys each reviewed risk may change; its body may grow at the end.
  const ALLOWED: Record<string, RegExp> = {
    [IDP]: /^(verified|stale_after):|^\s*- |^\s+(by|at):/,
    [SMS]: /^(probability|stale_after|generated):|^\s+(by|at):/,
    [OLD]: /^(state|stale_after|generated):|^\s+(by|at):/,
  };
  const changed = run([
    "diff",
    "--name-only",
    "-z",
    "--diff-filter=MDRT",
    "test-base",
    "--",
    ".adaptrace",
  ])
    .split("\0")
    .map((p) => p.replace(/^\.adaptrace\//, ""))
    .filter(
      (p) => p !== "" && !/(^|\/)(index|log)\.md$/.test(p) && !(p in ALLOWED),
    )
    .map((p) => `.adaptrace/${p}`);
  for (const [path, allowed] of Object.entries(ALLOWED)) {
    const split = (text: string) => {
      const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
      return { front: m?.[1] ?? "", body: (m?.[2] ?? text).trimEnd() };
    };
    const before = split(original(path));
    const now = split(read(path));
    const keep = (front: string) =>
      front
        .split("\n")
        .filter((l) => !allowed.test(l))
        .join("\n");
    // The IdP risk's body stays; the others may add to theirs.
    const bodyOk =
      path === IDP
        ? now.body === before.body
        : now.body.startsWith(before.body.split("\n")[0] ?? "");
    if (keep(before.front) !== keep(now.front) || !bodyOk) {
      changed.push(`.adaptrace/${path}`);
    }
  }
  const added = [
    ...run([
      "diff",
      "--name-only",
      "-z",
      "--diff-filter=A",
      "test-base",
      "--",
      ".adaptrace",
    ]).split("\0"),
    ...run(["ls-files", "-z", "--others", "--exclude-standard", "--", ".adaptrace"]).split(
      "\0",
    ),
  ]
    .filter((p) => p !== "")
    .filter((p) => !(task !== undefined && p === `.adaptrace/${task}`));
  changed.push(...added.map((p) => `${p} (new)`));
  const removed = run(["diff", "--numstat", "test-base", "--", ".adaptrace"])
    .split("\n")
    .filter((l) => /(^|\/)(index|log)\.md$/.test(l.split("\t")[2] ?? ""))
    .some((l) => l.split("\t")[1] !== "0");
  check(
    "must",
    !gitFailed && changed.length === 0 && !removed,
    `no other document changed${gitFailed ? " (git failed: no test-base?)" : ""}${changed.length ? ` (${changed.join(", ")})` : ""}${removed ? " (lines removed from index.md or log.md)" : ""}`,
  );
} else {
  console.log("      other documents: not a git repository, not compared");
}

if (dialogPath === undefined) {
  console.log("      no dialog given: the report is not checked");
} else {
  const dialog = readFileSync(dialogPath, "utf8")
    .split(/^(?=## (?:Runner \d+$|User \d+ \(|Stopped$|Error$))/m)
    .filter((part) => part.startsWith("## Runner"))
    .join("\n");
  check(
    "should",
    /上限/.test(dialog) && /suzuki/.test(dialog),
    "the report names the mitigation task and its owner",
  );
}

console.log(failed === 0 ? "\nPASS" : `\n${failed} required checks failed`);
process.exit(failed === 0 ? 0 : 1);
