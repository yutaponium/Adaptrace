// Adaptrace's vocabulary on top of OKF v0.2. See docs/spec/schema.md.

export const OKF_VERSION = "0.2";

// ISO 8601 datetime with an explicit UTC offset (OKF §5).
export const DATETIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

export const RESERVED_FILENAMES = ["index.md", "log.md"] as const;

export const KNOWN_TYPES = [
  "Requirement",
  "Acceptance",
  "Decision",
  "Task",
  "Risk",
  "Milestone",
  "Change Request",
  "Meeting",
] as const;

export const LIFECYCLE_STATUSES = ["draft", "stable", "deprecated"] as const;

// Typed dependency keys. Every key points from the concept that holds it to
// the target. `propagates` says whether a change to the target should mark
// the holder for review (used by impact analysis from v0.2 on).
export const DEPENDENCY_KEYS = {
  depends_on: { label: "depends on", propagates: true },
  derived_from: { label: "derived from", propagates: true },
  satisfies: { label: "satisfies", propagates: true },
  blocks: { label: "blocks", propagates: false },
  supersedes: { label: "supersedes", propagates: false },
  // A change request names the documents it would change (ADR-023). Not a
  // review chain: a request not yet decided makes nothing out of date.
  changes: { label: "changes", propagates: false },
} as const;

export type DependencyKey = keyof typeof DEPENDENCY_KEYS;

// Frontmatter keys other than the dependency keys that OKF or Adaptrace
// reads: the frontmatter table in docs/spec/schema.md, and the keys that
// commands read (owner, due, backlog). A key close to one of these is
// likely a misspelling (ADR-047).
export const KNOWN_KEYS = [
  "type",
  "title",
  "description",
  "tags",
  "status",
  "generated",
  "verified",
  "stale_after",
  "resource",
  "resource_sha256",
  "sources",
  "state",
  "received_at",
  "requested_by",
  "side",
  "role",
  "okf_version",
  "timestamp",
  "owner",
  "due",
  "backlog",
] as const;

export const DEPENDENCY_KEY_NAMES = Object.keys(
  DEPENDENCY_KEYS,
) as DependencyKey[];
