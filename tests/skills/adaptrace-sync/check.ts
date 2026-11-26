// Checks the result of running the adaptrace-sync skill on the test
// repository (see README.md). Usage: bun check.ts <repository> [dialog]
// Exits 1 when a required check fails. "should" checks only warn.
// The files before the skill ran are repo/ next to this file: setup.sh
// copies it as it is (no dates to render).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { loadBacklog, normalizeId, planSync } from "../../../src/backlog";
import { loadBundle } from "../../../src/bundle";
import { parseDocument } from "../../../src/frontmatter";
import { validate } from "../../../src/validate";

const [repo, dialogPath] = process.argv.slice(2);
if (repo === undefined) {
  console.error("usage: bun check.ts <repository> [dialog]");
  process.exit(2);
}
const BASE = join(import.meta.dir, "repo");

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
const backlog = await loadBacklog(join(repo, "backlog"));
const errors = validate(bundle).filter((i) => i.severity === "error");
check("must", errors.length === 0, `validate: ${errors.length} errors`);

const fm = (path: string) =>
  (bundle.concepts.get(path)?.frontmatter ?? {}) as Record<string, unknown>;
const body = (path: string) => bundle.concepts.get(path)?.body.trim() ?? "";
const list = (v: unknown) =>
  (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]).map(String);
const linkId = (path: string) =>
  String((fm(path).backlog as { id?: unknown } | undefined)?.id ?? "");
const task = (id: string) => backlog.tasks.get(normalizeId(id));
const theirs = (id: string) =>
  (task(id)?.frontmatter ?? {}) as Record<string, unknown>;

// What sync still has to do: only the archived task, kept on purpose.
const plan = planSync(bundle, backlog, { generatedBy: "check" });
const left = plan.actions.map((a) => `${a.kind} ${a.adaptrace}`);
check(
  "must",
  left.join() === "missing tasks/legacy-import.md" && plan.errors.length === 0,
  `sync has nothing left but the archived task (${left.join(", ") || "none"})`,
);

check(
  "must",
  fm("tasks/login-mfa.md").state === "done",
  `the login task is imported as done (state: ${String(fm("tasks/login-mfa.md").state)})`,
);
check(
  "must",
  theirs("BACK-5").title === "SMSで確認コードを送信する",
  `the SMS task's new title is exported (title: ${String(theirs("BACK-5").title)})`,
);

const MANUAL = "tasks/manual.md";
check(
  "must",
  fm(MANUAL).title === "操作マニュアルを書く" &&
    fm(MANUAL).state === "in_progress" &&
    list(
      (fm(MANUAL).backlog as { fields?: { assignee?: unknown } } | undefined)
        ?.fields?.assignee,
    ).includes("@tanaka") &&
    theirs("BACK-4").status === "In Progress" &&
    theirs("BACK-4").title === "操作マニュアルを書く",
  `the manual task follows Backlog.md (In Progress, @tanaka) (title: ${String(fm(MANUAL).title)}, state: ${String(fm(MANUAL).state)}, Backlog.md status: ${String(theirs("BACK-4").status)})`,
);

const AUDIT = "tasks/audit-log.md";
check(
  "must",
  body(AUDIT).includes("ログの保存期間は1年とする。") &&
    fm(AUDIT).state === "in_progress" &&
    (task("BACK-1")?.body ?? "").includes("ログの保存期間は1年とする。") &&
    theirs("BACK-1").status === "In Progress",
  `the audit log task keeps the retention period and is in progress on both sides (state: ${String(fm(AUDIT).state)}, Backlog.md status: ${String(theirs("BACK-1").status)})`,
);

const SESSION = "tasks/session-timeout.md";
const sessionId = linkId(SESSION);
check(
  "must",
  fm(SESSION).state === "to_do" &&
    sessionId !== "" &&
    sessionId.toUpperCase() !== "BACK-2" &&
    theirs(sessionId).title === "セッションの有効期限を設定する" &&
    theirs(sessionId).status === "To Do",
  `the session timeout task is to_do and exported (state: ${String(fm(SESSION).state)}, backlog.id: ${sessionId || "none"})`,
);

const imported = [...bundle.concepts.values()].filter(
  (c) =>
    c.frontmatter.type === "Task" &&
    String((c.frontmatter.backlog as { id?: unknown } | undefined)?.id ?? "")
      .toUpperCase()
      .startsWith("BACK-6"),
);
check(
  "must",
  imported.length === 1 &&
    imported[0]?.frontmatter.title === "パスワード再設定メールの文面を直す",
  `the new Backlog.md task BACK-6 is imported once (${imported.map((c) => c.path).join(", ") || "none"})`,
);

// The files before and after, under .adaptrace/ and backlog/.
function files(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    if (!existsSync(d)) return;
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p));
    }
  };
  walk(join(dir, ".adaptrace"));
  walk(join(dir, "backlog"));
  return out.sort();
}
const before = files(BASE);
const after = new Set(files(repo));
const read = (dir: string, p: string) => readFileSync(join(dir, p), "utf8");

check(
  "must",
  after.has(".adaptrace/tasks/legacy-import.md") &&
    read(repo, ".adaptrace/tasks/legacy-import.md") ===
      read(BASE, ".adaptrace/tasks/legacy-import.md"),
  "the archived task's document is kept",
);

// Changed by sync or by the decisions; the rest must stay as it was.
const CHANGED = new Set([
  ".adaptrace/tasks/login-mfa.md",
  ".adaptrace/tasks/sms-send.md",
  ".adaptrace/tasks/manual.md",
  ".adaptrace/tasks/audit-log.md",
  ".adaptrace/tasks/session-timeout.md",
  "backlog/tasks/back-1 - 監査ログを出力する.md",
  "backlog/tasks/back-5 - SMSで確認コードを送る.md",
]);
// Lines may only be added to these.
const APPEND = new Set([".adaptrace/log.md", ".adaptrace/tasks/index.md"]);
const keepsLines = (was: string, now: string) => {
  const lines = now.split("\n");
  let i = 0;
  for (const line of was.split("\n")) {
    while (i < lines.length && lines[i] !== line) i++;
    if (i === lines.length) return false;
    i++;
  }
  return true;
};
const problems: string[] = [];
for (const p of before) {
  if (!after.has(p)) problems.push(`${p} (removed)`);
  else if (CHANGED.has(p)) continue;
  else if (APPEND.has(p)) {
    if (!keepsLines(read(BASE, p), read(repo, p))) problems.push(p);
  } else if (read(BASE, p) !== read(repo, p)) problems.push(p);
}
const added = [...after].filter((p) => !before.includes(p));
const expectedNew = (p: string) =>
  imported.some((c) => `.adaptrace/${c.path}` === p) ||
  (task(sessionId) !== undefined && `backlog/${task(sessionId)?.path}` === p);
for (const p of added) if (!expectedNew(p)) problems.push(`${p} (new)`);
check(
  "must",
  problems.length === 0,
  `no other file changed${problems.length ? ` (${problems.join(", ")})` : ""}`,
);

// The tasks keep their tags and dependencies, and their bodies, except
// the manual (Backlog.md's body) and the audit log (its new line).
const keeps = (path: string, withBody: boolean) => {
  const was = parseDocument(read(BASE, `.adaptrace/${path}`));
  if (!was.ok) return false;
  const f = (was.frontmatter ?? {}) as Record<string, unknown>;
  return (
    (!withBody || was.body.trim() === body(path)) &&
    ["satisfies", "depends_on", "tags"].every(
      (k) => list(f[k]).join() === list(fm(path)[k]).join(),
    )
  );
};
const changedTasks = [
  ["tasks/login-mfa.md", true],
  ["tasks/sms-send.md", true],
  ["tasks/session-timeout.md", true],
  [MANUAL, false],
  [AUDIT, false],
] as const;
const lost = changedTasks
  .filter(([path, withBody]) => !keeps(path, withBody))
  .map(([path]) => path);
check(
  "must",
  lost.length === 0,
  `the tasks keep their bodies, tags and dependencies${lost.length ? ` (changed: ${lost.join(", ")})` : ""}`,
);

const ORIGINAL = "human:hayashi 2026-11-20T10:00:00+09:00";
const gen = (path: string) => {
  const g = (fm(path).generated ?? {}) as { at?: unknown; by?: unknown };
  return `${String(g.by)} ${String(g.at)}`;
};
check(
  "should",
  gen(AUDIT) === ORIGINAL && gen(SESSION) === ORIGINAL,
  `a state-only edit keeps generated (audit log: ${gen(AUDIT)}, session timeout: ${gen(SESSION)})`,
);
check(
  "should",
  read(repo, ".adaptrace/log.md") !== read(BASE, ".adaptrace/log.md"),
  "log.md has a new line",
);

if (dialogPath === undefined) {
  console.log("      no dialog given: the report is not checked");
} else {
  // The runner's turns: the report may come before a last word from the
  // user, such as thanks.
  const dialog = readFileSync(dialogPath, "utf8")
    .split(/^(?=## (?:Runner \d+$|User \d+ \(|Stopped$|Error$))/m)
    .filter((part) => part.startsWith("## Runner"))
    .join("\n");
  check(
    "should",
    /会員向け/.test(dialog),
    "the runner names the change lost in the manual task",
  );
  check(
    "should",
    /legacy-import|BACK-2|back-2|旧会員データ/.test(dialog),
    "the report names the archived task sync still reports",
  );
}

console.log(failed === 0 ? "\nPASS" : `\n${failed} required checks failed`);
process.exit(failed === 0 ? 0 : 1);
