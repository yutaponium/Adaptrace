// Checks the result of running the adaptrace-minutes skill on the test
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
const typed = (type: string) =>
  docs.filter((d) => String(d.fm.type ?? "").toLowerCase() === type);
const list = (v: unknown) =>
  (Array.isArray(v) ? v : v === undefined ? [] : [v]).map(String);
const ORIGINAL = new Set([
  "requirements/req-1-form.md",
  "decisions/adr-0001-mail.md",
  "tasks/form-ui.md",
  "tasks/smtp-setup.md",
]);
const added = docs.filter((d) => !ORIGINAL.has(d.path));

// The minutes, in the bundle as a Meeting.
const meetings = typed("meeting");
const meeting = meetings[0];
check(
  "must",
  meeting?.path.startsWith("meetings/") === true,
  "the minutes are a Meeting document under meetings/",
);

// No contact details in any file of the bundle, log.md and index.md too.
// NFKC turns full-width digits and hyphens into ASCII ones.
const contact =
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}\b|\+\d{1,3}[- ]\d{1,4}[- ]\d{3,4}|\(?0\d{1,4}\)?[- ]?\d{2,4}[- ]\d{3,4}|\b0\d{9,10}\b|1234-?5678/;
const contacts = [...bundle.files]
  .filter((p) =>
    contact.test(readFileSync(join(root, p), "utf8").normalize("NFKC")),
  )
  .map((path) => ({ path }));
check(
  "must",
  contacts.length === 0,
  `no e-mail address or phone number in the bundle${contacts.length ? ` (${contacts.map((d) => d.path).join(", ")})` : ""}`,
);

// The finished screen is done.
const form = docs.find((d) => d.path === "tasks/form-ui.md");
check(
  "must",
  form?.fm.state === "done",
  `the finished task is done (state: ${String(form?.fm.state)})`,
);

// The decision replaced, not rewritten.
const old = docs.find((d) => d.path === "decisions/adr-0001-mail.md");
const replacing = typed("decision").filter((d) =>
  list(d.fm.supersedes).includes("/decisions/adr-0001-mail.md"),
);
check(
  "must",
  replacing.length === 1 && old?.fm.status === "deprecated",
  "a new decision supersedes ADR-0001, and ADR-0001 is deprecated",
);
check(
  "must",
  old !== undefined && /自前で構築するSMTPサーバーから送る/.test(old.text),
  "ADR-0001's body is kept",
);

// The new task for the selection, with the owner and the day given.
const selection = typed("task").filter(
  (d) => !ORIGINAL.has(d.path) && String(d.fm.due) === "2026-12-04",
);
check(
  "must",
  selection.length === 1 && /yamada|山田/i.test(String(selection[0]?.fm.owner)),
  "a new task due 2026-12-04, owned by yamada",
);
check(
  "must",
  typed("risk").some((d) => !ORIGINAL.has(d.path)),
  "a new risk for the mail treated as spam",
);

// The customer's wish is a change request to take later, not a requirement.
const req = docs.find((d) => d.path === "requirements/req-1-form.md");
check(
  "must",
  typed("requirement").length === 1 &&
    req !== undefined &&
    !/添付/.test(req.text) &&
    req.fm.generated !== undefined &&
    String((req.fm.generated as { at?: unknown }).at).startsWith("2026-11-02"),
  "no requirement added or changed for the attachments",
);

// The stopped task no longer reads as in progress.
const smtp = docs.find((d) => d.path === "tasks/smtp-setup.md");
check(
  "should",
  smtp !== undefined &&
    (smtp.fm.state !== "in_progress" || smtp.fm.status === "deprecated"),
  `the stopped task is marked stopped (state: ${String(smtp?.fm.state)}, status: ${String(smtp?.fm.status)})`,
);
// A change of state alone is not a change of content.
check(
  "should",
  String((form?.fm.generated as { at?: unknown } | undefined)?.at).startsWith(
    "2026-11-05",
  ),
  "the finished task keeps its generated.at",
);
check(
  "should",
  meeting !== undefined &&
    Object.keys(DEPENDENCY_KEYS).every((k) => meeting.fm[k] === undefined),
  "the Meeting has no dependency keys",
);
const fromMeeting = added.filter((d) => d !== meeting);
check(
  "should",
  meeting !== undefined &&
    fromMeeting.length > 0 &&
    fromMeeting.every((d) =>
      list(d.fm.derived_from).includes(`/${meeting.path}`),
    ),
  "the new documents are derived from the Meeting",
);

// Only the documents the minutes speak of changed.
if (existsSync(join(repo, ".git"))) {
  const git = (args: string[]) => {
    const r = Bun.spawnSync(["git", "-c", "core.quotePath=false", ...args], {
      cwd: repo,
    });
    if (r.exitCode !== 0) gitFailed = true;
    return r.stdout.toString();
  };
  let gitFailed = false;
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
        !/(form-ui|smtp-setup|adr-0001-mail)\.md$/.test(p),
    );
  // The three documents the minutes speak of: only the keys they change.
  const ALLOWED: Record<string, RegExp> = {
    "tasks/form-ui.md": /^(state|generated):/,
    "tasks/smtp-setup.md": /^(state|status|generated):/,
    "decisions/adr-0001-mail.md": /^(status|generated):/,
  };
  for (const [path, allowed] of Object.entries(ALLOWED)) {
    const keep = (text: string) =>
      text
        .split("\n")
        .filter((l) => !allowed.test(l))
        .join("\n")
        .trimEnd();
    const before = git(["show", `test-base:.adaptrace/${path}`]);
    const now = existsSync(join(root, path))
      ? readFileSync(join(root, path), "utf8")
      : "";
    if (keep(before) !== keep(now)) changed.push(`.adaptrace/${path}`);
  }
  // index.md and log.md: lines added only.
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
  const dialog = readFileSync(dialogPath, "utf8")
    .split(/^(?=## (?:Runner \d+$|User \d+ \(|Stopped$|Error$))/m)
    .filter((part) => part.startsWith("## Runner"))
    .join("\n");
  // One line or paragraph names both the attachments and the way to take
  // them: a change request.
  check(
    "should",
    dialog
      .split(/\n\s*\n|\n(?=[-|*] )/)
      .some(
        (p) => /添付/.test(p) && /変更要求|adaptrace-change-request/.test(p),
      ),
    "the report points the attachments to a change request",
  );
  check(
    "should",
    typed("change request").length === 0,
    "no change request written for a wish not yet received",
  );
}

console.log(failed === 0 ? "\nPASS" : `\n${failed} required checks failed`);
process.exit(failed === 0 ? 0 : 1);
