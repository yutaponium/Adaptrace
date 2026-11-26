import type { Bundle, Concept } from "./bundle";
import { DATETIME } from "./schema";

// Runs git in `root` with paths printed as is and pathspecs taken literally
// (so "[", "*" and "?" in file names are not globs), and no signature
// lines in log output. Null when git fails or
// is not installed.
export function git(root: string, args: string[]): string | null {
  try {
    const result = Bun.spawnSync(
      [
        "git",
        "-c",
        "core.quotePath=false",
        // Signature lines would mix into log output (log.showSignature).
        "-c",
        "log.showSignature=false",
        "--literal-pathspecs",
        "-C",
        root,
        ...args,
      ],
      { stdout: "pipe", stderr: "ignore" },
    );
    return result.exitCode === 0 ? result.stdout.toString() : null;
  } catch {
    return null;
  }
}

export type UpdateSource = "generated.at" | "timestamp" | "verified.at";

export interface Updated {
  at: Date;
  source: UpdateSource;
  // The value as written in the frontmatter, with its offset.
  raw: string;
  // The latest verified.at, when it is later than the content's date: the
  // document was reviewed and needed no change (ADR-020).
  reviewed?: { at: Date; raw: string };
}

// When the document was last looked at: the later of its content's last
// change and its latest verified.at. A document is up to date when this is
// not older than the content of what it depends on, so a review that changed
// nothing does not make what depends on it out of date in turn.
export function reviewedAt(updated: Updated): Date {
  return updated.reviewed?.at ?? updated.at;
}

// The earliest and the latest verified.at, from one entry or a list.
export function verifiedRange(concept: Pick<Concept, "frontmatter">): {
  earliest: { at: Date; raw: string };
  latest: { at: Date; raw: string };
} | null {
  const v = concept.frontmatter.verified;
  let range: {
    earliest: { at: Date; raw: string };
    latest: { at: Date; raw: string };
  } | null = null;
  for (const entry of Array.isArray(v) ? v : [v]) {
    if (entry === null || typeof entry !== "object") continue;
    const raw = (entry as Record<string, unknown>).at;
    const at = parseDate(raw);
    if (!at) continue;
    const date = { at, raw: String(raw) };
    if (range === null) range = { earliest: date, latest: date };
    else if (at < range.earliest.at) range.earliest = date;
    else if (at > range.latest.at) range.latest = date;
  }
  return range;
}

export type GitDates = Map<string, { at: Date; raw: string }>;

// Only full datetimes with a UTC offset, so the result does not depend on the
// machine's time zone. Anything else counts as no date.
function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !DATETIME.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Whether the content itself has a readable date (not only verified).
export function hasContentDate(concept: Concept): boolean {
  return contentDate(concept) !== null;
}

export function contentDate(
  concept: Pick<Concept, "frontmatter">,
): Updated | null {
  const generated = concept.frontmatter.generated as
    | Record<string, unknown>
    | undefined;
  const at = parseDate(generated?.at);
  if (at) return { at, source: "generated.at", raw: String(generated?.at) };
  const timestamp = parseDate(concept.frontmatter.timestamp);
  if (timestamp) {
    return {
      at: timestamp,
      source: "timestamp",
      raw: String(concept.frontmatter.timestamp),
    };
  }
  return null;
}

// Last commit date per file under the bundle root, in one git call. Uses the
// author date, which rebase and cherry-pick keep, rather than the committer
// date. Returns an empty map when the bundle is not in a git repository.
export function gitDates(root: string): GitDates {
  const dates: GitDates = new Map();
  const output = git(root, [
    "log",
    "--name-only",
    "--format=%x00%aI",
    "--relative",
    "--",
    ".",
  ]);
  if (output === null) return dates;
  for (const entry of output.split("\0")) {
    const [header, ...files] = entry.split("\n");
    const raw = header?.trim() ?? "";
    const at = parseDate(raw);
    if (!at) continue;
    for (const file of files) {
      const path = file.trim();
      if (path !== "" && !dates.has(path)) dates.set(path, { at, raw });
    }
  }
  return dates;
}

// When each concept was last updated: generated.at, then the legacy
// timestamp (ADR-029: never the git date, which depends on the clone and on
// when the change is committed). Concepts with neither are left out, unless
// they have verified.
export function lastUpdated(bundle: Bundle): Map<string, Updated> {
  const updated = new Map<string, Updated>();
  for (const concept of bundle.concepts.values()) {
    const content = contentDate(concept);
    const verified = verifiedRange(concept);
    if (content) {
      updated.set(
        concept.path,
        verified && verified.latest.at > content.at
          ? { ...content, reviewed: verified.latest }
          : content,
      );
    } else if (verified) {
      // No date for the content at all: the first review stands in for it,
      // so later reviews do not move it.
      updated.set(concept.path, {
        ...verified.earliest,
        source: "verified.at",
        ...(verified.latest.at > verified.earliest.at
          ? { reviewed: verified.latest }
          : {}),
      });
    }
  }
  return updated;
}
