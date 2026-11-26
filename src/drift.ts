// Checks on dates that validate adds to the structural ones (ADR-029):
// documents with no date, and content changed without a new date. git is
// read only here, in migrate-dates and in assess, never for the last update
// itself.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Bundle, Concept } from "./bundle";
import { DELIMITER, parseDocument } from "./frontmatter";
import { git, hasContentDate, verifiedRange } from "./history";
import { DATETIME } from "./schema";
import { type Issue, validate } from "./validate";

// Documents with no date for their content (a readable generated.at or
// timestamp). impact, stale and progress cannot compare them, or, with only
// verified, use the first review for the content. migrate-dates writes one.
export function missingDateIssues(bundle: Bundle): Issue[] {
  return (
    [...bundle.concepts.values()]
      // Not when validate already warns about generated (invalid-generated,
      // or invalid-datetime for an at it cannot read): a person fixes those.
      .filter((c) => !hasContentDate(c) && !generatedWarned(c))
      .map((c) => ({
        severity: "warning" as const,
        code: "missing-generated",
        file: c.path,
        line: 1,
        message:
          "no readable 'generated.at' with the date of the content, so it cannot be compared (for a bundle dated by git, run 'adaptrace migrate-dates' once)",
      }))
  );
}

// Whether validate warns about this document's generated already.
function generatedWarned(concept: Concept): boolean {
  const g = concept.frontmatter.generated as Record<string, unknown> | null;
  if (g === undefined) return false;
  if (g === null || typeof g !== "object" || typeof g.by !== "string") {
    return true;
  }
  // An at that the last update cannot read: the regex, then a real date.
  return (
    g.at !== undefined &&
    !(
      typeof g.at === "string" &&
      DATETIME.test(g.at) &&
      !Number.isNaN(new Date(g.at).getTime())
    )
  );
}

// What a version records: each date on its own, so moving any one forward
// counts, even below another (a generated.at newer than before but older
// than a verified.at).
function recorded(text: string): number[] {
  const parsed = parseDocument(text);
  if (!parsed.ok || parsed.frontmatter === null) return [];
  const fm = parsed.frontmatter;
  const at = (v: unknown) => {
    if (typeof v !== "string" || !DATETIME.test(v)) return Number.NaN;
    return new Date(v).getTime();
  };
  const g = fm.generated as Record<string, unknown> | null | undefined;
  const content = Math.max(
    ...[at(g?.at), at(fm.timestamp)].filter((d) => !Number.isNaN(d)),
    Number.NEGATIVE_INFINITY,
  );
  // A review older than the content is no review of it.
  const latest =
    verifiedRange({ frontmatter: fm } as Concept)?.latest.at.getTime() ??
    Number.NaN;
  const verified = latest >= content ? latest : Number.NaN;
  return [at(g?.at), at(fm.timestamp), verified];
}

// The body of a version: what follows the frontmatter. Compared as text,
// so git's diff settings (context, drivers) do not matter.
function body(text: string): string {
  const parsed = parseDocument(text);
  if (parsed.ok) return parsed.body;
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const end = lines.findIndex((l, i) => i > 0 && DELIMITER.test(l));
  return end === -1 ? text : lines.slice(end + 1).join("\n");
}

// What a change from one version to the next does: whether the body
// changed, and whether a date was recorded (one of them moved forward). A
// new by, a reformatted block or a removed entry is no record.
function classify(
  before: string,
  after: string,
): { body: boolean; record: boolean } {
  const was = recorded(before);
  const now = recorded(after);
  const record = now.some(
    (d, i) =>
      !Number.isNaN(d) &&
      (Number.isNaN(was[i] ?? Number.NaN) || d > (was[i] ?? 0)),
  );
  return { body: body(before) !== body(after), record };
}

// How far back to look for a body change after the last record.
const MAX_COMMITS = 50;

function hasRecord(concept: Concept): boolean {
  const fm = concept.frontmatter;
  return (
    fm.generated !== undefined ||
    fm.timestamp !== undefined ||
    fm.verified !== undefined
  );
}

// One issue per document whose body changed after its last record: walking
// back from the working tree through the commits that touched it, newest
// first, until a change that recorded a newer date. Empty outside git and
// before the first commit. In a shallow clone, where a commit's parent may
// be missing, one note says the check was not made.
export function driftIssues(bundle: Bundle): Issue[] {
  const issues: Issue[] = [];
  if (git(bundle.root, ["rev-parse", "--git-dir"]) === null) return issues;
  if (git(bundle.root, ["rev-parse", "--verify", "-q", "HEAD"]) === null) {
    return issues;
  }
  const shallow =
    git(bundle.root, ["rev-parse", "--is-shallow-repository"])?.trim() ===
    "true";
  if (shallow) {
    return [
      {
        severity: "warning",
        code: "stale-generated-skipped",
        file: ".",
        message:
          "a shallow clone, so bodies changed without a new generated are not checked (in CI, check out with fetch-depth: 0)",
      },
    ];
  }
  // Documents git could not read: reported, not taken as fine.
  const failed: string[] = [];
  const show = (rev: string, file: string) =>
    git(bundle.root, ["show", `${rev}:./${file}`]);
  for (const concept of bundle.concepts.values()) {
    // A document without any record is reported as missing-generated.
    if (!hasRecord(concept)) continue;
    const file = concept.path;
    let where: string | null = null;
    let settled = false;
    // The working tree against HEAD, when git says it changed (git's
    // filters, such as ident, make the raw file differ from the blob).
    const head = show("HEAD", file);
    const dirty =
      git(bundle.root, ["diff", "--quiet", "HEAD", "--", file]) === null;
    if (head !== null && dirty) {
      const now = readFileSync(join(bundle.root, file), "utf8");
      const c = classify(head, now);
      if (c.record) settled = true;
      else if (c.body) where = "uncommitted changes";
    }
    if (!settled && where === null && head !== null) {
      // Following renames: each commit names the path it had then, and the
      // path before it for a rename.
      const log = git(bundle.root, [
        "log",
        `-${MAX_COMMITS}`,
        "--follow",
        "--first-parent",
        "--name-status",
        "--format=%x00%H %P",
        "--",
        file,
      ]);
      if (log === null) {
        failed.push(file);
        continue;
      }
      for (const entry of log.split("\0").filter((e) => e.trim() !== "")) {
        const [header, ...rest] = entry.split("\n");
        const [commit, parent] = (header ?? "").trim().split(/\s+/);
        // No parent: the first commit, which added the file with its record.
        if (!commit || !parent) break;
        const status = rest.find((l) => /^[A-Z]/.test(l))?.split("\t") ?? [];
        // Paths from the repository's root: the old one for a rename.
        const newPath = status.at(-1);
        const oldPath = status[0]?.startsWith("R") ? status[1] : newPath;
        if (!newPath || !oldPath) break;
        const after = git(bundle.root, ["show", `${commit}:${newPath}`]);
        // Against the first parent. Not there: added here, with its record.
        const before = git(bundle.root, ["show", `${parent}:${oldPath}`]);
        if (before === null) break;
        if (after === null) {
          failed.push(file);
          break;
        }
        const c = classify(before, after);
        if (c.record) break;
        if (c.body) {
          where = `commit ${commit.slice(0, 7)}`;
          break;
        }
      }
    }
    if (where !== null) {
      issues.push({
        severity: "warning",
        code: "stale-generated",
        file,
        line: 1,
        message: `the body changed in ${where} without a new generated or verified: update generated if the meaning changed, or add verified if it was only wording`,
      });
    }
  }
  if (failed.length > 0) {
    issues.push({
      severity: "warning",
      code: "stale-generated-skipped",
      file: ".",
      message: `git could not read these documents' history, so they were not checked: ${failed.join(", ")}`,
    });
  }
  return issues;
}

// Both checks, for validate.
export function dateIssues(bundle: Bundle): Issue[] {
  return [...missingDateIssues(bundle), ...driftIssues(bundle)];
}

// What the CLI and MCP validate report: the structure, then the dates,
// in one order by file and line.
export function validateAll(bundle: Bundle): Issue[] {
  return [...validate(bundle), ...dateIssues(bundle)].sort(
    // By code point, not locale: the same order on every machine.
    (a, b) =>
      (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) ||
      (a.line ?? 0) - (b.line ?? 0),
  );
}
