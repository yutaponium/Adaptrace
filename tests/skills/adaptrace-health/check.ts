// Checks the result of running the adaptrace-health skill on the test
// repository (see README.md). Usage: bun check.ts <repository> [dialog]
// Exits 1 when a required check fails. "should" checks only warn.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadBundle } from "../../../src/bundle";
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
const issues = validate(bundle);
const errors = issues.filter((i) => i.severity === "error");
check("must", errors.length === 0, `validate: ${errors.length} errors`);
const deadlocks = issues.filter((i) => i.code === "dependency-deadlock");
check(
  "must",
  deadlocks.length === 0,
  `no deadlock${deadlocks.length ? ` (${deadlocks.map((i) => i.file).join(", ")})` : ""}`,
);

const docs = [...bundle.concepts.entries()].map(([path, c]) => ({
  path: path.replace(/^\//, ""),
  fm: c.frontmatter as Record<string, unknown>,
}));
const doc = (path: string) => docs.find((d) => d.path === path);
const list = (v: unknown) =>
  (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]).map(String);
const at = (d: { fm: Record<string, unknown> } | undefined) =>
  String((d?.fm.generated as { at?: unknown } | undefined)?.at);
const ADR2 = "/decisions/adr-0002-session-db.md";
const TABLE = "/tasks/session-table.md";
const API = "/tasks/session-api.md";

// The edited keys hold exactly these values: nothing else added to them.
const exactly = (v: unknown, values: string[]) =>
  JSON.stringify(list(v).sort()) === JSON.stringify([...values].sort());
const form = doc("tasks/login-form.md");
check(
  "must",
  exactly(form?.fm.depends_on, [ADR2]),
  `the login form depends on ADR-0002, not ADR-0001 (depends_on: ${list(form?.fm.depends_on).join(", ")})`,
);
const api = doc("tasks/session-api.md");
check(
  "must",
  exactly(api?.fm.depends_on, [TABLE]),
  `the session API depends on the table, not directly on ADR-0002 (depends_on: ${list(api?.fm.depends_on).join(", ")})`,
);
const ui = doc("tasks/login-ui.md");
check(
  "must",
  exactly(ui?.fm.depends_on, [API]),
  `the login screen names the session API once (depends_on: ${list(ui?.fm.depends_on).join(", ")})`,
);
const report = doc("tasks/audit-report.md");
check(
  "must",
  list(report?.fm.depends_on).includes(ADR2) &&
    list(report?.fm.depends_on).includes(TABLE),
  "the audit report keeps its direct dependency on ADR-0002",
);
const risk = doc("risks/db-load.md");
check(
  "must",
  exactly(
    ["depends_on", "derived_from", "satisfies"].flatMap((k) =>
      list(risk?.fm[k]),
    ),
    [ADR2],
  ),
  "the database load risk points at ADR-0002, and at nothing else",
);
const poc = doc("tasks/redis-poc.md");
// Stopped: deprecated, or a state that means stopped.
check(
  "must",
  poc !== undefined &&
    (poc.fm.status === "deprecated" ||
      /^(cancell?ed|abandoned|stopped|dropped|discontinued|中止)$/i.test(
        String(poc.fm.state),
      )),
  `the Redis PoC is stopped (state: ${String(poc?.fm.state)}, status: ${String(poc?.fm.status)})`,
);

// A change of dependencies alone is not a change of content.
const DATES: Record<string, string> = {
  "tasks/login-form.md": "2026-10-10",
  "tasks/session-api.md": "2026-10-23",
  "tasks/login-ui.md": "2026-10-24",
  "tasks/data-migration.md": "2026-10-25",
  "tasks/redis-poc.md": "2026-10-12",
  "risks/db-load.md": "2026-10-21",
};
const moved = Object.entries(DATES).filter(
  ([path, day]) => !at(doc(path)).startsWith(day),
);
check(
  "should",
  moved.length === 0,
  `the changed documents keep their generated.at${moved.length ? ` (${moved.map(([p]) => p).join(", ")})` : ""}`,
);

// Only the documents with an item changed, and only the keys it needs.
if (existsSync(join(repo, ".git"))) {
  let gitFailed = false;
  const git = (args: string[]) => {
    const r = Bun.spawnSync(["git", "-c", "core.quotePath=false", ...args], {
      cwd: repo,
    });
    if (r.exitCode !== 0) gitFailed = true;
    return r.stdout.toString();
  };
  const ALLOWED: Record<string, RegExp> = {
    "tasks/login-form.md": /^(depends_on|generated):|^\s*- /,
    "tasks/session-api.md": /^(depends_on|generated):|^\s*- /,
    "tasks/login-ui.md": /^(depends_on|generated):|^\s*- /,
    "tasks/data-migration.md": /^(blocks|generated):/,
    "tasks/redis-poc.md": /^(state|status|generated):/,
    "risks/db-load.md":
      /^(depends_on|derived_from|satisfies|generated):|^\s*- /,
  };
  const changed = git([
    "diff",
    "--name-only",
    "-z",
    "--diff-filter=MDRT",
    "test-base",
    "--",
    ".adaptrace",
  ])
    .split("\0")
    .filter(
      (p) =>
        p !== "" &&
        !/(^|\/)(index|log)\.md$/.test(p) &&
        !Object.keys(ALLOWED).some((a) => p === `.adaptrace/${a}`),
    );
  for (const [path, allowed] of Object.entries(ALLOWED)) {
    // The allowed keys in the frontmatter only; the body must not change.
    const keep = (text: string) => {
      const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
      const [fm, body] = m ? [m[1] ?? "", m[2] ?? ""] : ["", text];
      return [
        fm
          .split("\n")
          .filter((l) => !allowed.test(l))
          .join("\n"),
        body.trimEnd(),
      ].join("\n---\n");
    };
    const before = git(["show", `test-base:.adaptrace/${path}`]);
    const now = existsSync(join(root, path))
      ? readFileSync(join(root, path), "utf8")
      : "";
    if (keep(before) !== keep(now)) changed.push(`.adaptrace/${path}`);
  }
  const removed = git(["diff", "--numstat", "test-base", "--", ".adaptrace"])
    .split("\n")
    .filter((l) => /(^|\/)(index|log)\.md$/.test(l))
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
  // The report: the runner's turns after the user's last answer.
  const parts = readFileSync(dialogPath, "utf8").split(
    /^(?=## (?:Runner \d+$|User \d+ \(|Stopped$|Error$))/m,
  );
  const lastUser = parts.findLastIndex((p) => p.startsWith("## User"));
  const dialog = parts
    .slice(lastUser + 1)
    .filter((part) => part.startsWith("## Runner"))
    .join("\n");
  check(
    "should",
    /adr-0003|ADR-0003|コーディング規約/.test(dialog) &&
      /audit-report|監査レポート/.test(dialog),
    "the report names the items kept (ADR-0003, the audit report)",
  );
}

console.log(failed === 0 ? "\nPASS" : `\n${failed} required checks failed`);
process.exit(failed === 0 ? 0 : 1);
