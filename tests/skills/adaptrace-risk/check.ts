// Checks the result of running the adaptrace-risk skill on the test
// repository (see README.md). Usage: bun check.ts <repository> [dialog]
// Exits 1 when a required check fails. "should" checks only warn.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadBundle } from "../../../src/bundle";
import { parseDocument } from "../../../src/frontmatter";
import { buildGraph } from "../../../src/graph";
import { lastUpdated } from "../../../src/history";
import { stale } from "../../../src/impact";
import { resourceStates } from "../../../src/resource";
import { DATETIME } from "../../../src/schema";
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
// The time a value means, or NaN.
const time = (v: unknown) =>
  new Date(v instanceof Date ? v.toISOString() : String(v)).getTime();
// In a test repository (git), now; expected/ and failing/ are rendered for
// 2026-11-26, so they are checked as on that day.
const git = existsSync(join(repo, ".git"));
// With ADAPTRACE_TEST_DAY, the day setup.sh rendered the dates for.
// Empty is unset, as in setup.sh.
const day = process.env.ADAPTRACE_TEST_DAY || undefined;
if (day !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
  console.error(`ADAPTRACE_TEST_DAY is not a day: ${day} (YYYY-MM-DD)`);
  process.exit(2);
}
const now = !git
  ? Date.parse("2026-11-26T12:00:00+09:00")
  : day
    ? Date.parse(`${day}T12:00:00+09:00`)
    : Date.now();

// The original documents: in a test repository, the ones setup.sh rendered
// (git test-base). expected/ and failing/ are not compared with them.
const original = (path: string) => {
  if (!git) return "";
  const r = Bun.spawnSync(["git", "show", `test-base:.adaptrace/${path}`], {
    cwd: repo,
  });
  if (r.exitCode !== 0) {
    console.log("FAIL  git failed: no test-base?");
    process.exit(1);
  }
  return r.stdout.toString();
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
// Closed risks are not reviewed (SKILL.md), even when they are stale.
const staleRisks = report.stale
  .map((s) => s.path)
  .filter((p) => String(fm(p).type) === "Risk" && fm(p).state !== "closed");
check(
  "must",
  staleRisks.length === 0,
  `no open risk is stale${staleRisks.length ? ` (${staleRisks.join(", ")})` : ""}`,
);

// Kept as it was: reviewed, not changed.
const IDP = "risks/idp-lock-in.md";
const rawVerified: unknown = fm(IDP).verified;
// Each record with a by and an at that is a date and time with an offset.
// The original generated.at: a review record must be later.
const generatedBefore = git
  ? time(
      (
        parseDocument(original(IDP)) as {
          frontmatter?: { generated?: { at?: unknown } };
        }
      ).frontmatter?.generated?.at ?? "",
    )
  : Number.NEGATIVE_INFINITY;
const records = (Array.isArray(rawVerified) ? rawVerified : [rawVerified])
  .filter(
    (v: unknown): v is { by: string; at: unknown } =>
      typeof v === "object" &&
      v !== null &&
      typeof (v as { by?: unknown }).by === "string",
  )
  .filter((v) => {
    const at = v.at instanceof Date ? v.at.toISOString() : String(v.at);
    // Adaptrace's own rule for a date and time (validate, verifiedRange).
    return DATETIME.test(at) && time(at) > generatedBefore;
  });
const verified = records.map((v) => v.by);
// generated as parsed YAML: the style does not matter.
const parsedGenerated = (text: string) => {
  const doc = parseDocument(text);
  return doc.ok ? JSON.stringify(doc.frontmatter?.generated ?? null) : "";
};
check(
  "must",
  verified.length > 0 &&
    String(fm(IDP).probability) === "中" &&
    String(fm(IDP).impact) === "大" &&
    read(IDP).includes(
      "対応方針：契約の更新の3か月前に、ほかのIdPと比べる。",
    ) &&
    (!git || parsedGenerated(read(IDP)) === parsedGenerated(original(IDP))) &&
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
    (!git ||
      time((fm(SMS).generated as { at?: unknown } | undefined)?.at) >
        time(/at: ([^ }]+)/.exec(originalGenerated(SMS) ?? "")?.[1])) &&
    time(fm(SMS).stale_after) > now &&
    (!git ||
      time(fm(SMS).stale_after) >
        time(/^stale_after: (.*)$/m.exec(original(SMS))?.[1])),
  `the SMS cost risk is reassessed (probability: ${String(fm(SMS).probability)}, impact: ${String(fm(SMS).impact)})`,
);
check(
  "should",
  /上限/.test(read(SMS)) && /送信件数を毎月確認/.test(read(SMS)),
  "the SMS cost risk's body names the limit and keeps the monthly check",
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
  // The keys each reviewed risk may change, compared as parsed YAML, so the
  // style (flow or block) does not matter.
  const ALLOWED: Record<string, string[]> = {
    [IDP]: ["verified", "stale_after"],
    [SMS]: ["probability", "stale_after", "generated"],
    [OLD]: ["state", "stale_after", "generated"],
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
      (p) =>
        p !== "" && p !== "log.md" && p !== "tasks/index.md" && !(p in ALLOWED),
    )
    .map((p) => `.adaptrace/${p}`);
  for (const [path, keys] of Object.entries(ALLOWED)) {
    const before = parseDocument(original(path));
    const after = parseDocument(read(path));
    if (!before.ok || !after.ok) {
      changed.push(`.adaptrace/${path} (unreadable)`);
      continue;
    }
    const rest = (fm: Record<string, unknown> | null) =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(fm ?? {})
            .filter(([k]) => !keys.includes(k))
            .sort(([a], [b]) => a.localeCompare(b)),
        ),
      );
    // The IdP risk's body stays. The others keep the lines of their body as
    // whole lines, in order, but the response (対応方針), which may be
    // rewritten, and may add lines.
    const lines = (body: string) =>
      body
        .trimEnd()
        .split("\n")
        .filter((l) => l.trim() !== "");
    const kept = lines(before.body).filter((l) => !l.startsWith("対応方針"));
    const now = lines(after.body);
    let at = 0;
    for (const l of now) if (at < kept.length && l === kept[at]) at++;
    const bodyOk =
      path === IDP
        ? after.body.trimEnd() === before.body.trimEnd()
        : at === kept.length;
    if (rest(before.frontmatter) !== rest(after.frontmatter) || !bodyOk) {
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
    ...run([
      "ls-files",
      "-z",
      "--others",
      "--exclude-standard",
      "--",
      ".adaptrace",
    ]).split("\0"),
  ]
    .filter((p) => p !== "")
    .filter((p) => !(task !== undefined && p === `.adaptrace/${task}`));
  changed.push(...added.map((p) => `${p} (new)`));
  const removed = run(["diff", "--numstat", "test-base", "--", ".adaptrace"])
    .split("\n")
    .filter((l) =>
      [".adaptrace/log.md", ".adaptrace/tasks/index.md"].includes(
        l.split("\t")[2] ?? "",
      ),
    )
    .some((l) => l.split("\t")[1] !== "0");
  // tasks/index.md gains one line at most: the new task.
  const indexAdded = Number(
    run([
      "diff",
      "--numstat",
      "test-base",
      "--",
      ".adaptrace/tasks/index.md",
    ]).split("\t")[0] || 0,
  );
  if (indexAdded > 1)
    changed.push(".adaptrace/tasks/index.md (more than one line)");
  check(
    "must",
    !gitFailed && changed.length === 0 && !removed,
    `no other document changed${gitFailed ? " (git failed: no test-base?)" : ""}${changed.length ? ` (${changed.join(", ")})` : ""}${removed ? " (lines removed from tasks/index.md or log.md)" : ""}`,
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
