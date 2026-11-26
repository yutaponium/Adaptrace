// Checks the result of running the adaptrace-supersede skill on the test
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
const errors = validate(bundle).filter((i) => i.severity === "error");
check("must", errors.length === 0, `validate: ${errors.length} errors`);

const docs = [...bundle.concepts.entries()].map(([path, c]) => ({
  path: path.replace(/^\//, ""),
  fm: c.frontmatter as Record<string, unknown>,
  text: readFileSync(join(root, path), "utf8"),
}));
const doc = (path: string) => docs.find((d) => d.path === path);
const list = (v: unknown) =>
  (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]).map(String);
const at = (d: { fm: Record<string, unknown> } | undefined) =>
  String((d?.fm.generated as { at?: unknown } | undefined)?.at);
const OLD = "/decisions/adr-0003-batch.md";
const REVIEW_KEYS = ["depends_on", "derived_from", "satisfies"];

// The new decision.
const replacing = docs.filter((d) => list(d.fm.supersedes).includes(OLD));
const next = replacing[0];
check(
  "must",
  replacing.length === 1 &&
    String(next?.fm.type).toLowerCase() === "decision" &&
    next?.path.startsWith("decisions/") === true,
  "one new decision supersedes ADR-0003",
);
const NEW = next === undefined ? "(none)" : `/${next.path}`;
check(
  "must",
  next !== undefined && /API/.test(next.text),
  "the new decision says it calls the API",
);
check(
  "should",
  list(next?.fm.satisfies).includes("/requirements/req-1-payroll.md"),
  "the new decision keeps satisfies REQ-1",
);

// The old decision: deprecated, body and date kept.
const old = doc("decisions/adr-0003-batch.md");
check(
  "must",
  old?.fm.status === "deprecated",
  `ADR-0003 is deprecated (status: ${String(old?.fm.status)})`,
);
check(
  "must",
  old !== undefined &&
    /毎晩2時に/.test(old.text) &&
    /CSVの取り込みの機能しかない/.test(old.text),
  "ADR-0003's body is kept",
);
check(
  "should",
  at(old).startsWith("2026-10-22"),
  "ADR-0003 keeps its generated.at",
);

// The monitoring goes on under the new decision.
const monitor = doc("tasks/sync-monitor.md");
check(
  "must",
  monitor !== undefined &&
    list(monitor.fm.depends_on).includes(NEW) &&
    !list(monitor.fm.depends_on).includes(OLD),
  "the monitoring task now depends on the new decision",
);
check(
  "should",
  at(monitor).startsWith("2026-10-25"),
  "the monitoring task keeps its generated.at",
);

// The batch is stopped, and the format risk no longer reads as live.
const batch = doc("tasks/csv-batch.md");
// Stopped: deprecated, or a state that is neither work nor finished.
const stopped =
  batch !== undefined &&
  (batch.fm.status === "deprecated" ||
    /^(cancell?ed|abandoned|stopped|dropped|discontinued|中止)$/i.test(
      String(batch.fm.state),
    ));
check(
  "must",
  stopped,
  `the CSV batch task is stopped (state: ${String(batch?.fm.state)}, status: ${String(batch?.fm.status)})`,
);
const risk = doc("risks/csv-format.md");
check(
  "should",
  risk !== undefined &&
    (risk.fm.status === "deprecated" ||
      !list(risk.fm.derived_from).includes(OLD)),
  "the CSV format risk is closed or no longer derived from ADR-0003",
);

// Nothing live is left on the old decision but the change request.
// The stopped task and the risk are judged by their own checks above.
const left = docs.filter(
  (d) =>
    d.fm.status !== "deprecated" &&
    !(stopped && d.path === "tasks/csv-batch.md") &&
    d.path !== "risks/csv-format.md" &&
    !/change request/i.test(String(d.fm.type)) &&
    REVIEW_KEYS.some((k) => list(d.fm[k]).includes(OLD)),
);
check(
  "must",
  left.length === 0,
  `no live document depends on ADR-0003${left.length ? ` (${left.map((d) => d.path).join(", ")})` : ""}`,
);

// Only the documents the replacement speaks of changed.
if (existsSync(join(repo, ".git"))) {
  let gitFailed = false;
  const git = (args: string[]) => {
    const r = Bun.spawnSync(["git", "-c", "core.quotePath=false", ...args], {
      cwd: repo,
    });
    if (r.exitCode !== 0) gitFailed = true;
    return r.stdout.toString();
  };
  // The documents the replacement speaks of: only the keys it changes.
  const ALLOWED: Record<string, RegExp> = {
    "decisions/adr-0003-batch.md": /^status:/,
    "tasks/csv-batch.md": /^(state|status|depends_on|generated):|^\s*- /,
    "tasks/sync-monitor.md": /^(depends_on|generated):|^\s*- /,
    "risks/csv-format.md": /^(state|status|derived_from|generated):|^\s*- /,
    // Waits on the stopped task: the user may drop that dependency.
    "tasks/payroll-test.md": /^depends_on:|^\s*- /,
  };
  const TOUCHED =
    /(adr-0003-batch|csv-batch|sync-monitor|csv-format|payroll-test)\.md$/;
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
      (p) => p !== "" && !/(^|\/)(index|log)\.md$/.test(p) && !TOUCHED.test(p),
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
    /cr-004|CR-004/.test(dialog),
    "the report names the change request on ADR-0003 (CR-004)",
  );
  check(
    "should",
    /payroll-test|結合テスト/.test(dialog),
    "the report names the indirectly reached test task",
  );
}

console.log(failed === 0 ? "\nPASS" : `\n${failed} required checks failed`);
process.exit(failed === 0 ? 0 : 1);
