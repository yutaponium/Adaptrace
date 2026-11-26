// Checks the result of running the adaptrace-change-decision skill on the
// test repository (see README.md). Usage: bun check.ts <repository> [dialog]
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

const read = (path: string) =>
  existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : "";
const fm = (path: string) =>
  (bundle.concepts.get(path)?.frontmatter ?? {}) as Record<string, unknown>;
const at = (path: string) =>
  String((fm(path).generated as { at?: unknown } | undefined)?.at);

// The decided requests: the state, a 判断 section, and the reasons.
const DECIDED = [
  {
    path: "change-requests/cr-002-sms.md",
    name: "CR-002",
    state: /^(approved|accepted)$/,
    states: "approved",
    received: "メールが届かない会員がいるので",
    reason: /問い合わせ/,
    reasonName: "the inquiries",
    was: "2026-11-18T09:30:00+09:00",
  },
  {
    path: "change-requests/cr-003-push.md",
    name: "CR-003",
    state: /^(deferred|on_hold|postponed)$/,
    states: "deferred",
    received: "会員向けのスマートフォンのアプリに",
    reason: /2027年4月|2027-04|2027年の?4月/,
    reasonName: "April 2027",
    was: "2026-11-18T15:00:00+09:00",
  },
  {
    path: "change-requests/cr-004-timeout.md",
    name: "CR-004",
    state: /^declined$/,
    states: "the bundle's value for rejection (declined)",
    received: "入力に時間のかかる申し込みの画面で",
    reason: /セキュリティ/,
    reasonName: "the security standard",
    was: "2026-11-20T10:00:00+09:00",
  },
];
for (const d of DECIDED) {
  const state = String(fm(d.path).state);
  check(
    "must",
    d.state.test(state),
    `${d.name} uses ${d.states} (state: ${state})`,
  );
  const text = read(d.path);
  const section = /^## 判断\s*$([\s\S]*)/m.exec(text)?.[1] ?? "";
  check(
    "must",
    text.includes(d.received) && section.trim() !== "",
    `${d.name} keeps its body and has a 判断 section`,
  );
  check(
    "should",
    /11月26日|11-26|11\/26/.test(section) && d.reason.test(section),
    `${d.name}'s 判断 section has the date and ${d.reasonName}`,
  );
  check(
    "should",
    at(d.path) !== d.was && at(d.path) !== "undefined",
    `${d.name}'s generated.at is new (${at(d.path)})`,
  );
}

// Only the decided requests changed, and only their state, generated and
// the end of the body.
if (existsSync(join(repo, ".git"))) {
  let gitFailed = false;
  const git = (args: string[]) => {
    const r = Bun.spawnSync(["git", "-c", "core.quotePath=false", ...args], {
      cwd: repo,
    });
    if (r.exitCode !== 0) gitFailed = true;
    return r.stdout.toString();
  };
  const decided = new Set(DECIDED.map((d) => d.path));
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
        !decided.has(p.replace(/^\.adaptrace\//, "")),
    );
  for (const path of decided) {
    // The frontmatter without state and generated, and the body as received:
    // the new text may only follow it.
    const split = (text: string) => {
      const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
      const [front, body] = m ? [m[1] ?? "", m[2] ?? ""] : ["", text];
      return {
        front: front
          .split("\n")
          .filter((l) => !/^(state|generated):/.test(l))
          .join("\n"),
        body: body.trimEnd(),
      };
    };
    const before = split(git(["show", `test-base:.adaptrace/${path}`]));
    const now = split(read(path));
    if (before.front !== now.front || !now.body.startsWith(before.body)) {
      changed.push(`.adaptrace/${path}`);
    }
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
    /adaptrace-review/.test(dialog),
    "the report says CR-002 is reviewed with adaptrace-review",
  );
  check(
    "should",
    /cr-005|CR-005/.test(dialog),
    "the report names the undecided request that overlapped CR-002 (CR-005)",
  );
}

console.log(failed === 0 ? "\nPASS" : `\n${failed} required checks failed`);
process.exit(failed === 0 ? 0 : 1);
