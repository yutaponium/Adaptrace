// Checks the result of running the adaptrace-review skill on the test
// repository (see README.md). Usage: bun check.ts <repository> [dialog]
// Exits 1 when a required check fails. "should" checks only warn.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadBundle } from "../../../src/bundle";
import { buildGraph } from "../../../src/graph";
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

function list(value: unknown): string[] {
  const all = Array.isArray(value) ? value : [value];
  return all.filter((v): v is string => typeof v === "string");
}

const bundle = await loadBundle(join(repo, ".adaptrace")).catch((e) => {
  console.log(`FAIL  no bundle: ${String(e)}`);
  console.log("\n1 required checks failed");
  process.exit(1);
});
const graph = buildGraph(bundle);
const errors = validate(bundle, graph).filter((i) => i.severity === "error");
check("must", errors.length === 0, `validate: ${errors.length} errors`);

const CR = "change-requests/cr-002-sms.md";
const APPROVED = Date.parse("2026-11-24T16:00:00+09:00");
const ORIGINAL = "2026-11-01T10:00:00+09:00";
const doc = (path: string) => bundle.concepts.get(path);
const generated = (path: string) =>
  (doc(path)?.frontmatter.generated as { at?: unknown; by?: unknown }) ?? {};
const atOf = (path: string) => String(generated(path).at ?? "");
const verifiedList = (path: string) => {
  const v = doc(path)?.frontmatter.verified;
  return (Array.isArray(v) ? v : v ? [v] : []) as {
    at?: unknown;
    by?: unknown;
  }[];
};

// Every document reviewed: progress exits 0.
const cli = join(import.meta.dir, "../../../src/cli.ts");
const progress = Bun.spawnSync([process.execPath, cli, "progress", CR], {
  cwd: repo,
});
// Exit 0 also when nothing points at the request: require the documents.
check(
  "must",
  progress.exitCode === 0 &&
    !/No documents depend on it/.test(progress.stdout.toString()),
  `progress ${CR} exits 0${
    progress.exitCode === 0
      ? ""
      : `: ${progress.stdout
          .toString()
          .split("\n")
          .filter((l) => /to review|waiting|No documents/.test(l))
          .join(" / ")}`
  }`,
);

const REQ = "requirements/req-1-mfa.md";
check(
  "must",
  list(doc(REQ)?.frontmatter.derived_from).includes(`/${CR}`),
  "the origin requirement is derived_from the change request",
);
check("must", /SMS/.test(doc(REQ)?.body ?? ""), "the requirement now says SMS");
check(
  "must",
  Date.parse(atOf(REQ)) > APPROVED,
  "the requirement's generated.at is after the approval",
);

const TASK = "tasks/login-mfa.md";
check("must", /SMS/.test(doc(TASK)?.body ?? ""), "the login task now says SMS");
check(
  "must",
  Date.parse(atOf(TASK)) > APPROVED,
  "the task's generated.at is after the approval",
);

// Reviewed without a change: generated kept, verified added.
for (const path of ["decisions/adr-0001-idp.md", "milestones/release.md"]) {
  check(
    "must",
    Date.parse(atOf(path)) === Date.parse(ORIGINAL) &&
      verifiedList(path).length > 0,
    `${path}: generated kept, verified added`,
  );
}
// The risk depends only on the decision, whose content did not change: it
// needs no review (ADR-020), so it may be left as it was.
check(
  "must",
  Date.parse(atOf("risks/idp-lock-in.md")) === Date.parse(ORIGINAL),
  "risks/idp-lock-in.md: generated kept",
);

check(
  "must",
  doc(CR)?.frontmatter.state === "implemented",
  "the change request is implemented",
);
// Nothing left stale: updating the request's generated last would make
// the origin, which is derived_from it, older than the request.
const stale = Bun.spawnSync(
  [process.execPath, cli, "stale", "--format", "json"],
  { cwd: repo },
);
let staleDocs: { path: string }[] | undefined;
try {
  staleDocs = (
    JSON.parse(stale.stdout.toString()) as { stale?: { path: string }[] }
  ).stale;
} catch {
  console.log(`      stale --format json: ${stale.stderr.toString().trim()}`);
}
check(
  "must",
  staleDocs !== undefined && staleDocs.length === 0,
  `stale: no documents${staleDocs?.length ? ` (${staleDocs.map((d) => d.path).join(", ")})` : ""}`,
);

// Documents outside the reach are not changed.
const GIT = ["git", "-c", "core.quotePath=false", "-c", "color.ui=never"];
if (existsSync(join(repo, ".git"))) {
  const diff = Bun.spawnSync(
    [...GIT, "diff", "--name-only", "test-base", "--", ".adaptrace"],
    { cwd: repo },
  );
  // Changed, and new files not yet tracked.
  const untracked = Bun.spawnSync(
    [...GIT, "ls-files", "--others", "--exclude-standard", "--", ".adaptrace"],
    { cwd: repo },
  );
  const outside = `${diff.stdout.toString()}\n${untracked.stdout.toString()}`
    .split("\n")
    .map((p) => p.replace(/^\.adaptrace\//, ""))
    .filter(
      (p) =>
        p !== "" &&
        ![
          REQ,
          TASK,
          CR,
          "decisions/adr-0001-idp.md",
          "risks/idp-lock-in.md",
          "milestones/release.md",
          "log.md",
        ].includes(p),
    );
  check(
    "must",
    diff.exitCode === 0 && outside.length === 0,
    `documents outside the reach unchanged${outside.length ? ` (changed: ${outside.join(", ")})` : ""}`,
  );
} else {
  console.log(
    "      documents outside the reach: not a git repository, not compared",
  );
}

// Who reviewed: the PM, not the agent.
const bys = [
  generated(REQ).by,
  generated(TASK).by,
  ...["decisions/adr-0001-idp.md", "milestones/release.md"].map(
    (p) => verifiedList(p).at(-1)?.by,
  ),
  // The risk's verified, when it has one.
  ...verifiedList("risks/idp-lock-in.md").map((v) => v.by),
];
check(
  "should",
  bys.every((b) => b === "human:sato"),
  `the reviews are by human:sato (${bys.map(String).join(", ")})`,
);
const log = bundle.reserved.find((r) => r.path === "log.md")?.body ?? "";
// A date heading after the setup's last entry (2026-11-24).
check(
  "should",
  [...log.matchAll(/^## (\d{4}-\d{2}-\d{2})$/gm)].some(
    (m) => (m[1] ?? "") > "2026-11-24",
  ),
  "log.md has a new entry",
);

if (dialogPath === undefined) {
  console.log("      no dialog given: the report is not checked");
} else {
  const dialog = readFileSync(dialogPath, "utf8")
    .split(/^(?=## (?:Runner \d+$|User \d+ \(|Stopped$|Error$))/m)
    .filter((part) => part.startsWith("## Runner"))
    .join("\n");
  // At least two steps named, and more than one approval asked.
  const steps = new Set(
    [...dialog.matchAll(/ステップ\s*(\d)/g)].map((m) => m[1]),
  );
  check(
    "should",
    steps.size >= 2 && (dialog.match(/^## Runner \d+$/gm)?.length ?? 0) >= 3,
    "the runner goes step by step",
  );
}

console.log(failed === 0 ? "\nPASS" : `\n${failed} required checks failed`);
process.exit(failed === 0 ? 0 : 1);
