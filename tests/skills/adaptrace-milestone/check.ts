// Checks the result of running the adaptrace-milestone skill on the test
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

const fm = (path: string) =>
  (bundle.concepts.get(path)?.frontmatter ?? {}) as Record<string, unknown>;
const list = (v: unknown) =>
  (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]).map(String);
const at = (path: string) =>
  String((fm(path).generated as { at?: unknown } | undefined)?.at);
const R1 = "milestones/release-1.md";
const R2 = "milestones/release-2.md";
const SMS = "/tasks/sms-send.md";

check(
  "must",
  !list(fm(R1).depends_on).includes(SMS) &&
    !list(fm("tasks/sms-send.md").blocks).includes(`/${R1}`),
  "the year-end release no longer waits for the SMS task",
);
check(
  "must",
  list(fm(R2).depends_on).includes(SMS) ||
    list(fm("tasks/sms-send.md").blocks).includes(`/${R2}`),
  "the second release waits for the SMS task",
);
check(
  "must",
  String(fm(R1).due) === "2026-12-25" && fm(R1).state === undefined,
  `the year-end release keeps its due date and is not marked done (due: ${String(fm(R1).due)}, state: ${String(fm(R1).state)})`,
);
check(
  "should",
  at(R1).startsWith("2026-11-01") && at(R2).startsWith("2026-11-01"),
  "the milestones keep their generated.at",
);

// Only the milestones' dependency keys changed; nothing else, and nothing new.
if (existsSync(join(repo, ".git"))) {
  let gitFailed = false;
  const git = (args: string[]) => {
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
  const ALLOWED: Record<string, RegExp> = {
    [R1]: /^(depends_on|blocks):|^\s*- /,
    [R2]: /^(depends_on|blocks):|^\s*- /,
    // The task may lose a blocks that pointed at the year-end release.
    "tasks/sms-send.md": /^blocks:|^\s*- /,
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
    .map((p) => p.replace(/^\.adaptrace\//, ""))
    .filter((p) => p !== "" && p !== "log.md" && !(p in ALLOWED))
    .map((p) => `.adaptrace/${p}`);
  for (const [path, allowed] of Object.entries(ALLOWED)) {
    const keep = (text: string) => {
      const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
      const [front, body] = m ? [m[1] ?? "", m[2] ?? ""] : ["", text];
      return [
        front
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
  const added = [
    ...git([
      "diff",
      "--name-only",
      "-z",
      "--diff-filter=A",
      "test-base",
      "--",
      ".adaptrace",
    ]).split("\0"),
    ...git([
      "ls-files",
      "-z",
      "--others",
      "--exclude-standard",
      "--",
      ".adaptrace",
    ]).split("\0"),
  ].filter((p) => p !== "");
  changed.push(...added.map((p) => `${p} (new)`));
  const removed = git(["diff", "--numstat", "test-base", "--", ".adaptrace"])
    .split("\n")
    .filter((l) => l.split("\t")[2] === ".adaptrace/log.md")
    .some((l) => l.split("\t")[1] !== "0");
  check(
    "must",
    !gitFailed && changed.length === 0 && !removed,
    `no other document changed${gitFailed ? " (git failed: no test-base?)" : ""}${changed.length ? ` (${changed.join(", ")})` : ""}${removed ? " (lines removed from log.md)" : ""}`,
  );
} else {
  console.log("      other documents: not a git repository, not compared");
}

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
    /req-2|REQ-2|セッションの有効期限/.test(dialog),
    "the report names the requirement with no work (REQ-2)",
  );
  check(
    "should",
    /cr-003|CR-003/.test(dialog),
    "the report names the open change request (CR-003)",
  );
  check(
    "should",
    /login-mfa|ログイン画面のMFA対応/.test(dialog),
    "the report names the work left (login-mfa)",
  );
}

console.log(failed === 0 ? "\nPASS" : `\n${failed} required checks failed`);
process.exit(failed === 0 ? 0 : 1);
