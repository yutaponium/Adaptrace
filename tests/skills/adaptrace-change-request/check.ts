// Checks the result of running the adaptrace-change-request skill on the
// test repository (see README.md). Usage: bun check.ts <repository> [dialog]
// The dialog is the conversation run.ts records; the report is checked in it.
// Exits 1 when a required check fails. "should" checks only warn.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type Concept, loadBundle } from "../../../src/bundle";
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

const OLD = "change-requests/cr-001-app-only.md";
const requests = [...bundle.concepts.values()].filter(
  (c) =>
    /^change request$/i.test(String(c.frontmatter.type ?? "")) &&
    c.path !== OLD,
);
const cr: Concept | undefined = requests[0];
check(
  "must",
  requests.length === 1,
  `one new change request (${requests.length})`,
);
check(
  "must",
  list(cr?.frontmatter.changes).includes("/requirements/req-1-mfa.md"),
  "its changes names /requirements/req-1-mfa.md",
);
check(
  "must",
  String(cr?.frontmatter.received_at ?? "") === "2026-11-20T10:15:00+09:00",
  "received_at is the e-mail's Date (2026-11-20T10:15:00+09:00)",
);
check("must", cr?.frontmatter.state === "submitted", "state is submitted");

const requester = list(cr?.frontmatter.requested_by)[0] ?? "";
const stakeholder = bundle.concepts.get(requester.replace(/^\//, ""));
// A Stakeholder, or any document with side, as meeting reads it.
check(
  "must",
  requester.startsWith("/") &&
    stakeholder !== undefined &&
    (/^stakeholder$/i.test(String(stakeholder.frontmatter.type ?? "")) ||
      stakeholder.frontmatter.side !== undefined),
  "requested_by is the path of a Stakeholder document",
);
check(
  "must",
  String(stakeholder?.frontmatter.side ?? "").toLowerCase() === "customer",
  "the requester's side is customer",
);
check(
  "should",
  typeof stakeholder?.frontmatter.role === "string",
  "the requester has a role",
);

// No contact details in any file of the bundle, log.md and index.md too:
// a pattern, and the e-mail's own address and number.
const contact =
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}\b|\+\d{1,3}[- ]\d{1,4}[- ]\d{3,4}|\(?0\d{1,4}\)?[- ]?\d{2,4}[- ]\d{3,4}|\b0\d{9,10}\b|yamada@|1234-?5678/;
// NFKC turns full-width digits and hyphens into ASCII ones.
const leaks = [...bundle.files].filter((p) =>
  contact.test(
    readFileSync(join(repo, ".adaptrace", p), "utf8").normalize("NFKC"),
  ),
);
check(
  "must",
  leaks.length === 0,
  `no e-mail addresses or phone numbers${leaks.length ? ` (in ${leaks.join(", ")})` : ""}`,
);

// git with settings that do not depend on the maintainer's config: no
// colors or other prefixes, and paths not quoted.
const GIT = [
  "git",
  "-c",
  "core.quotePath=false",
  "-c",
  "color.ui=never",
  "-c",
  "diff.noprefix=false",
  "-c",
  "diff.mnemonicPrefix=false",
  "-c",
  "diff.external=",
];

// Existing documents are not changed, except index.md and log.md: compared
// with the commit setup.sh made, so a commit by the runner is seen too.
if (existsSync(join(repo, ".git"))) {
  const git = (args: string[]) =>
    Bun.spawnSync([...GIT, ...args], { cwd: repo });
  const first = git(["rev-parse", "--verify", "-q", "test-base^{commit}"])
    .stdout.toString()
    .trim();
  if (first === "") {
    console.log("      existing documents: no test-base tag, not compared");
  } else {
    // Modified, deleted or renamed only: new files may be staged or committed.
    const diff = git([
      "diff",
      "--name-only",
      "--diff-filter=MDRT",
      first,
      "--",
      ".adaptrace",
    ]);
    // index.md and log.md may only gain lines: the count of removed lines,
    // not the diff text, which depends on settings.
    const removesLines = (p: string) => {
      const [, removed] = git(["diff", "--numstat", first, "--", p])
        .stdout.toString()
        .split("\t");
      return removed !== undefined && removed !== "0";
    };
    const changed = diff.stdout
      .toString()
      .split("\n")
      .filter(
        (p) =>
          p !== "" && (!/(^|\/)(index|log)\.md$/.test(p) || removesLines(p)),
      );
    check(
      "must",
      diff.exitCode === 0 && changed.length === 0,
      `existing documents unchanged${diff.exitCode !== 0 ? ` (git failed: ${diff.stderr})` : changed.length ? ` (changed: ${changed.join(", ")})` : ""}`,
    );
  }
} else {
  console.log("      existing documents: not a git repository, not compared");
}

// Every new document is linked from its directory's index.md, and every
// directory index from the root: the request, the Stakeholder, and a
// Meeting draft when meeting --write made one. Without git, the documents
// not in repo/ are the new ones.
// The documents setup.sh committed, so new files the runner staged or
// committed still count as new.
const gitRun = (args: string[]) =>
  Bun.spawnSync([...GIT, ...args], { cwd: repo })
    .stdout.toString()
    .trim();
const first = existsSync(join(repo, ".git"))
  ? gitRun(["rev-parse", "--verify", "-q", "test-base^{commit}"])
  : "";
// Without git, or when git gives nothing, the documents in repo/ are old.
const base = first
  ? gitRun(["ls-tree", "-r", "--name-only", first, "--", ".adaptrace"]).split(
      "\n",
    )
  : [];
const old = new Set(
  base.filter((p) => p !== "").map((p) => p.replace(/^\.adaptrace\//, "")),
);
const fresh = [...bundle.concepts.values()].filter(
  (c) =>
    !old.has(c.path) &&
    (old.size > 0 ||
      !existsSync(join(import.meta.dir, "repo/.adaptrace", c.path))),
);
// A link target as a bundle path: relative to its index, or "/" first,
// without a #fragment.
const linkedFrom = (index: string, target: string) => {
  const dir = index.includes("/") ? index.slice(0, index.lastIndexOf("/")) : "";
  const want = dir ? `${dir}/${target}` : target;
  return (
    bundle.reserved
      .find((r) => r.path === index)
      ?.links.some((l) => {
        const t = l.target.replace(/#.*$/, "");
        const path = t.startsWith("/")
          ? t.slice(1)
          : join(dir, t).replace(/^\.\//, "");
        return path === want;
      }) ?? false
  );
};
const unlinked = fresh.filter((c) => {
  const slash = c.path.lastIndexOf("/");
  if (slash === -1) return !linkedFrom("index.md", c.path);
  const dir = c.path.slice(0, slash);
  // Linked from its directory's index.md, and that index from its parent's
  // (the root for a top-level directory).
  const parentSlash = dir.lastIndexOf("/");
  const parentIndex =
    parentSlash === -1 ? "index.md" : `${dir.slice(0, parentSlash)}/index.md`;
  const fromParent =
    parentSlash === -1
      ? `${dir}/index.md`
      : `${dir.slice(parentSlash + 1)}/index.md`;
  return (
    !linkedFrom(`${dir}/index.md`, c.path.slice(slash + 1)) ||
    !linkedFrom(parentIndex, fromParent)
  );
});
check(
  "should",
  fresh.length > 0 && unlinked.length === 0,
  `index.md links every new document${unlinked.length ? ` (missing: ${unlinked.map((c) => c.path).join(", ")})` : ""}`,
);

// The report: the pair with cr-001 judged a conflict, an estimate in 人時,
// the estimate's assumptions and the milestone at risk.
if (dialogPath === undefined) {
  console.log("      no dialog given: the report is not checked");
} else {
  // The runner's words only: not the user's answers.
  const dialog = readFileSync(dialogPath, "utf8")
    // Split at the headings run.ts writes, not the runner's own.
    .split(/^(?=## (?:Runner \d+$|User \d+ \(|Stopped$|Error$))/m)
    .filter((part) => part.startsWith("## Runner"))
    .join("\n");
  // The skill reports the pairs as a table, one pair a row, with only the
  // verdict in the 判定 column: find each table's 判定 column by its header,
  // and read the verdict there, not in the reason. The cell starts with one
  // of the four values (a mark, bold, code or a gloss may surround it).
  const cells = (row: string) =>
    row
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.replace(/[`*]/g, "").trim());
  const lines = dialog.split("\n");
  const verdicts: { row: string; verdict: string }[] = [];
  for (let n = 0; n < lines.length; n++) {
    const header = lines[n] ?? "";
    const separator = lines[n + 1] ?? "";
    if (!header.includes("|") || !/^\s*\|?\s*:?-+:?\s*(\||$)/.test(separator))
      continue;
    const column = cells(header).findIndex((c) => /判定|verdict/i.test(c));
    if (column === -1) continue;
    for (let m = n + 2; m < lines.length && lines[m]?.includes("|"); m++) {
      const row = lines[m] ?? "";
      const value = (cells(row)[column] ?? "")
        .replace(/^[^\p{L}\p{N}]+/u, "")
        .match(/^(conflict|duplicate|compatible|unclear)\b/i)?.[1];
      if (value) verdicts.push({ row, verdict: value.toLowerCase() });
    }
  }
  check(
    "must",
    verdicts.some((v) => /cr-001/i.test(v.row) && v.verdict === "conflict"),
    "the report's table judges the pair with cr-001 a conflict",
  );
  check("should", /人時/.test(dialog), "the report gives an estimate in 人時");
  // The estimate's assumptions are put to the user, not taken as facts.
  check(
    "should",
    dialog
      .split("\n")
      .some(
        (l) =>
          /前提/.test(l) &&
          /[?？]|ですか|ますか|よいか|でしょうか|確認させて|確認して(ください|もよい)/.test(
            l,
          ),
      ),
    "the runner asks about the estimate's assumptions",
  );
  check(
    "should",
    dialog
      .split("\n")
      .some(
        (l) =>
          /年内リリース|release/.test(l) && /響く|遅れ|間に合|at risk/.test(l),
      ),
    "the report names the milestone at risk",
  );
}

console.log(failed === 0 ? "\nPASS" : `\n${failed} required checks failed`);
process.exit(failed === 0 ? 0 : 1);
