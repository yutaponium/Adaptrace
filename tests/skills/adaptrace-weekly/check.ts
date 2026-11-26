// Checks the result of running the adaptrace-weekly skill on the test
// repository (see README.md). Usage: bun check.ts <repository> [dialog]
// Exits 1 when a required check fails. "should" checks only warn.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadBundle } from "../../../src/bundle";
import { DEPENDENCY_KEYS } from "../../../src/schema";
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

const bundle = await loadBundle(join(repo, ".adaptrace")).catch((e) => {
  console.log(`FAIL  no bundle: ${String(e)}`);
  console.log("\n1 required checks failed");
  process.exit(1);
});
const errors = validate(bundle).filter((i) => i.severity === "error");
check("must", errors.length === 0, `validate: ${errors.length} errors`);

// Nothing changed but a Meeting draft, and lines added to index.md and
// log.md.
const GIT = ["git", "-c", "core.quotePath=false", "-c", "color.ui=never"];
if (existsSync(join(repo, ".git"))) {
  // A failed git command (no test-base, for example) fails the check
  // rather than reading as "nothing changed".
  let gitFailed = false;
  const run = (args: string[]) => {
    const r = Bun.spawnSync([...GIT, ...args], { cwd: repo });
    if (r.exitCode !== 0) gitFailed = true;
    return r.stdout.toString();
  };
  const changed = run([
    "diff",
    "--name-only",
    "--diff-filter=MDRT",
    "test-base",
    "--",
    ".adaptrace",
  ])
    .split("\n")
    .filter((p) => p !== "" && !/(^|\/)(index|log)\.md$/.test(p));
  // New files too, committed, staged or not: only under meetings/. -z
  // keeps paths with spaces unquoted.
  const committed = run([
    "diff",
    "--name-only",
    "-z",
    "--diff-filter=A",
    "test-base",
    "--",
    ".adaptrace",
  ]).split("\0");
  const uncommitted = run([
    "status",
    "--porcelain",
    "-z",
    "--untracked-files=all",
    "--",
    ".adaptrace",
  ])
    .split("\0")
    .filter((l) => /^(\?\?|A)/.test(l))
    .map((l) => l.slice(3));
  changed.push(
    ...[...committed, ...uncommitted].filter(
      (p) => p !== "" && !/^\.adaptrace\/meetings\//.test(p),
    ),
  );
  const removed = run(["diff", "--numstat", "test-base", "--", ".adaptrace"])
    .split("\n")
    .filter((l) => /(^|\/)(index|log)\.md$/.test(l))
    .some((l) => l.split("\t")[1] !== "0");
  check(
    "must",
    !gitFailed && changed.length === 0 && !removed,
    `existing documents unchanged${gitFailed ? " (git failed: no test-base?)" : ""}${changed.length ? ` (changed: ${changed.join(", ")})` : ""}${removed ? " (lines removed from index.md or log.md)" : ""}`,
  );
} else {
  console.log("      existing documents: not a git repository, not compared");
}

const meetings = [...bundle.concepts.values()].filter((c) =>
  /^meeting$/i.test(String(c.frontmatter.type ?? "")),
);
check(
  "should",
  meetings.length > 0 &&
    meetings.every((m) =>
      Object.keys(DEPENDENCY_KEYS).every((k) => m.frontmatter[k] === undefined),
    ),
  "a Meeting draft without dependency keys",
);

if (dialogPath === undefined) {
  console.log("      no dialog given: the report is not checked");
} else {
  // The runner's words only, split at the headings run.ts writes.
  const dialog = readFileSync(dialogPath, "utf8")
    .split(/^(?=## (?:Runner \d+$|User \d+ \(|Stopped$|Error$))/m)
    .filter((part) => part.startsWith("## Runner"))
    .join("\n");
  // The overdue task on a line that says it is overdue, not only as what
  // another task waits for.
  // A line, or the heading or table section above it, says overdue.
  const OVERDUE = /過ぎ|超過|遅れ|期限切れ|日前|overdue/;
  const lines = dialog.split("\n");
  const section = (n: number) => {
    for (let k = n; k >= 0; k--) {
      const l = lines[k] ?? "";
      if (/^#{1,6} |^\*\*.*\*\*\s*$/.test(l)) return l;
    }
    return "";
  };
  const saysOverdue = (n: number) =>
    OVERDUE.test(lines[n] ?? "") || OVERDUE.test(section(n));
  check(
    "must",
    lines.some((l, n) => l.includes("login-mfa") && saysOverdue(n)),
    "the report calls the overdue task overdue (login-mfa)",
  );
  for (const [name, what] of [
    ["sms-send", "the task due soon, waiting"],
    ["adr-0001", "the decision older than its requirement"],
    ["idp-lock-in", "the risk past stale_after"],
    ["cr-002", "the request still in review"],
    ["cr-003", "the request not yet decided"],
  ] as const) {
    check("must", dialog.includes(name), `the report names ${what} (${name})`);
  }
  // The finished task is not overdue: no line names it with 過ぎ or 遅れ.
  check(
    "should",
    !lines.some(
      (l, n) =>
        l.includes("e2e-email") &&
        saysOverdue(n) &&
        !/完了|終わ|done|除/.test(l),
    ),
    "the finished task is not reported as overdue",
  );
}

console.log(failed === 0 ? "\nPASS" : `\n${failed} required checks failed`);
process.exit(failed === 0 ? 0 : 1);
