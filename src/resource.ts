// Files that a document stands in for or was made from (ADR-022): OKF's
// `resource` and `sources[].resource`, when they name a local file. A
// spreadsheet or a project plan cannot be a dependency, so a Markdown
// document stands in for it and records the SHA-256 of the file as it was
// when the document was last reviewed: `resource_sha256`, and `sha256` in
// each sources entry. stale reports a file whose content differs from what
// was recorded. No dates and no git: the result is the same in every clone.
import { createHash } from "node:crypto";
import {
  accessSync,
  closeSync,
  constants,
  openSync,
  readSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Bundle, Concept } from "./bundle";

export interface LocalResource {
  // As written in the frontmatter.
  raw: string;
  key: "resource" | "sources";
  // For sources: the entry's position in the list.
  index?: number;
  // On disk.
  file: string;
  // The SHA-256 recorded for it, in lowercase (null when none is), and the
  // value as written (to tell a malformed one: not a string, or not 64 hex
  // digits).
  recorded: string | null;
  recordedRaw: unknown;
}

// Lowercase is written; uppercase is read too. Record the value stale shows:
// a text file is hashed with CRLF read as LF, so another tool's SHA-256
// (sha256sum, Get-FileHash) may differ for it.
export const SHA256 = /^[0-9a-f]{64}$/i;

// A local file is written as a path relative to the document, starting
// with "./" or "../", or as an absolute file:/// URI. Anything else in
// resource or sources (a URL, a resource name such as "projects/p/topics/
// orders.v1" or "/subscriptions/...", a host, a description) is not taken as
// a file: guessing from the shape of a value went wrong too often.
const RELATIVE = /^\.\.?\//;
const FILE_URL = /^file:\/\/\//i;

// Relative to the document (OKF §6.2); the file may be outside the bundle
// (../../pm/schedule.mpp).
function onDisk(bundle: Bundle, concept: Concept, raw: string): string {
  return resolve(dirname(join(bundle.root, concept.path)), raw);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

// The file a value names, or null when it does not name a local file (or
// names the document itself).
export function resolveLocal(
  bundle: Bundle,
  concept: Concept,
  value: unknown,
): string | null {
  const raw = text(value);
  if (raw === null) return null;
  if (FILE_URL.test(raw)) {
    try {
      const file = fileURLToPath(raw);
      return file === join(resolve(bundle.root), concept.path) ? null : file;
    } catch {
      return null;
    }
  }
  // Windows separators read the same everywhere.
  const path = raw.replace(/\\/g, "/");
  const file = RELATIVE.test(path) ? onDisk(bundle, concept, path) : null;
  // The document itself would change with every record: not a file to
  // track.
  return file === join(resolve(bundle.root), concept.path) ? null : file;
}

export function localResources(
  bundle: Bundle,
  concept: Concept,
): LocalResource[] {
  const out: LocalResource[] = [];
  const add = (
    value: unknown,
    recorded: unknown,
    key: LocalResource["key"],
    index?: number,
  ) => {
    const raw = text(value);
    if (raw === null) return;
    const file = resolveLocal(bundle, concept, raw);
    if (file === null) return;
    // The same file named twice counts once, with whichever SHA-256 is
    // recorded.
    const same = out.find((r) => r.file === file);
    if (same !== undefined) {
      if (same.recorded === null && text(recorded) !== null) {
        same.recorded = text(recorded)?.toLowerCase() ?? null;
        same.recordedRaw = recorded;
      }
      return;
    }
    out.push({
      raw,
      key,
      ...(index === undefined ? {} : { index }),
      file,
      recorded: text(recorded)?.toLowerCase() ?? null,
      recordedRaw: recorded,
    });
  };
  const fm = concept.frontmatter;
  add(fm.resource, fm.resource_sha256, "resource");
  if (Array.isArray(fm.sources)) {
    fm.sources.forEach((s, i) => {
      if (s !== null && typeof s === "object") {
        const entry = s as Record<string, unknown>;
        add(entry.resource, entry.sha256, "sources", i);
      }
    });
  }
  return out;
}

// Whether `file` is a regular file (not a directory, a device or a pipe)
// that can be read.
export function isReadableFile(file: string): boolean {
  try {
    if (!statSync(file).isFile()) return false;
    accessSync(file, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

// The SHA-256 of a file's content, or null when it is not a regular file or
// cannot be read. A text file is hashed with CRLF read as LF, so a checkout
// with core.autocrlf gives the same value. Text means no NUL byte in the
// first 8000 bytes, which covers what git takes as text in the usual cases.
export function fileSha256(file: string): string | null {
  if (!isReadableFile(file)) return null;
  // In chunks, so a large file does not have to fit in memory.
  let fd: number | null = null;
  try {
    fd = openSync(file, "r");
    const hash = createHash("sha256");
    const chunk = Buffer.alloc(1 << 20);
    let text: boolean | null = null;
    // A CR at the end of a chunk, held until we know what follows it.
    let held = false;
    for (;;) {
      const n = readSync(fd, chunk, 0, chunk.length, null);
      if (n === 0) break;
      let part = chunk.subarray(0, n);
      text ??= !part.subarray(0, 8000).includes(0);
      if (!text) {
        hash.update(part);
        continue;
      }
      if (held) {
        // CR LF across chunks: the CR goes.
        if (part[0] !== 0x0a) hash.update(Buffer.from([0x0d]));
        held = false;
      }
      if (part[part.length - 1] === 0x0d) {
        held = true;
        part = part.subarray(0, part.length - 1);
      }
      let start = 0;
      for (
        let k = part.indexOf(0x0d);
        k !== -1;
        k = part.indexOf(0x0d, k + 1)
      ) {
        if (part[k + 1] === 0x0a) {
          hash.update(part.subarray(start, k));
          start = k + 1;
        }
      }
      hash.update(part.subarray(start));
    }
    if (held) hash.update(Buffer.from([0x0d]));
    return hash.digest("hex");
  } catch {
    return null;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

export interface ResourceState extends LocalResource {
  // The file's SHA-256 now, or null when it is missing or cannot be read.
  current: string | null;
}

// The local files of every live document, with their SHA-256 now.
export function resourceStates(bundle: Bundle): Map<string, ResourceState[]> {
  const out = new Map<string, ResourceState[]>();
  // A file named by several documents is hashed once.
  const hashed = new Map<string, string | null>();
  const hash = (file: string) => {
    if (!hashed.has(file)) hashed.set(file, fileSha256(file));
    return hashed.get(file) ?? null;
  };
  for (const concept of bundle.concepts.values()) {
    if (concept.frontmatter.status === "deprecated") continue;
    const states: ResourceState[] = [];
    for (const r of localResources(bundle, concept)) {
      states.push({ ...r, current: hash(r.file) });
    }
    if (states.length > 0) out.set(concept.path, states);
  }
  return out;
}

// The frontmatter keys to set so that the recorded SHA-256 of every local
// file is the one it has now: resource_sha256, and the sources list with
// each entry's sha256. Empty when nothing would change.
export function recordResources(
  bundle: Bundle,
  concept: Concept,
): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  const fm = concept.frontmatter;
  const hashed = new Map<string, string | null>();
  const hash = (file: string) => {
    if (!hashed.has(file)) hashed.set(file, fileSha256(file));
    return hashed.get(file) ?? null;
  };
  const recorded = (v: unknown) => text(v)?.toLowerCase() ?? null;
  // Every entry is updated, including one naming the same file again.
  const top = resolveLocal(bundle, concept, fm.resource);
  const topHash = top === null ? null : hash(top);
  if (topHash !== null && topHash !== recorded(fm.resource_sha256)) {
    set.resource_sha256 = topHash;
  }
  if (Array.isArray(fm.sources)) {
    let changed = false;
    const sources = fm.sources.map((s) => {
      if (s === null || typeof s !== "object") return s;
      const entry = { ...(s as Record<string, unknown>) };
      const file = resolveLocal(bundle, concept, entry.resource);
      const current = file === null ? null : hash(file);
      if (current !== null && current !== recorded(entry.sha256)) {
        entry.sha256 = current;
        changed = true;
      }
      return entry;
    });
    if (changed) set.sources = sources;
  }
  return set;
}
