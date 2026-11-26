// A table of documents (ADR-019): a register, a log or a change log, with
// the frontmatter keys the user picks as columns. It writes nothing.
import type { Bundle } from "./bundle";
import type { Updated } from "./history";
import { DATETIME } from "./schema";

// The pseudo-column for the last update (ADR-010), not a frontmatter key.
export const UPDATED = "updated";

export const DEFAULT_COLUMNS = ["type", "state", "owner", "due", UPDATED];

export interface ListOptions {
  type?: string;
  state?: string;
  // Without it, deprecated documents are left out.
  status?: string;
  columns?: string[];
  sort?: string;
}

export interface ListRow {
  path: string;
  title: string;
  // One per column, "" when the document has no value.
  values: string[];
  // With options.sort: whether the document has a value to sort by.
  sortKeyFound?: boolean;
}

export interface ListReport {
  columns: string[];
  rows: ListRow[];
}

// A frontmatter value as text: lists joined with ", ", dates as written by
// YAML, other objects as JSON.
function show(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(show).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// "generated.by" reads generated, then its key by. Only keys the document
// has count, not inherited ones such as "constructor".
function lookup(frontmatter: Record<string, unknown>, key: string): unknown {
  if (Object.hasOwn(frontmatter, key)) return frontmatter[key];
  let value: unknown = frontmatter;
  for (const part of key.split(".")) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }
    if (!Object.hasOwn(value, part)) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function text(value: unknown): string | null {
  const s = show(value);
  return s === "" ? null : s;
}

// A value to sort by. Numbers come first, then dates and datetimes with a
// UTC offset (by the instant, whatever the offset), then other text, then empty values,
// so the order is the same whatever order the documents are read in.
type SortKey =
  | { rank: 0; n: number }
  | { rank: 1; n: number }
  | { rank: 2; s: string }
  | { rank: 3 };

export const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
// A date without a time, such as a due date. It sorts as the start of that
// day in UTC, among the datetimes.
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// The same order on every machine, whatever its locale.
function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// A real calendar day: Date.parse would turn 2026-02-30 into March 2.
function realDay(t: string): boolean {
  const [y, m, d] = t.slice(0, 10).split("-").map(Number);
  if (y === undefined || m === undefined || d === undefined) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function sortKey(value: string, at?: Date): SortKey {
  if (at !== undefined) return { rank: 1, n: at.getTime() };
  const t = value.trim();
  if (t === "") return { rank: 3 };
  if (NUMBER.test(t)) return { rank: 0, n: Number(t) };
  if ((DATETIME.test(t) || DATE.test(t)) && realDay(t)) {
    const n = Date.parse(t);
    if (!Number.isNaN(n)) return { rank: 1, n };
  }
  return { rank: 2, s: t };
}

function compare(a: SortKey, b: SortKey): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  if ("n" in a && "n" in b) return a.n - b.n;
  if ("s" in a && "s" in b) return byCodePoint(a.s, b.s);
  return 0;
}

export function list(
  bundle: Bundle,
  updated: Map<string, Updated>,
  options: ListOptions = {},
): ListReport {
  const columns = (options.columns ?? DEFAULT_COLUMNS).filter(
    // The type is the same on every row when it is filtered on.
    (c) => !(options.columns === undefined && c === "type" && options.type),
  );
  const rows: (ListRow & { key: SortKey })[] = [];
  for (const concept of bundle.concepts.values()) {
    const fm = concept.frontmatter;
    // Exact matches on the values as written, as MCP list_documents does.
    const status = fm.status ?? "stable";
    if (
      options.status === undefined
        ? status === "deprecated"
        : status !== options.status
    ) {
      continue;
    }
    if (options.type !== undefined && fm.type !== options.type) continue;
    if (options.state !== undefined && fm.state !== options.state) continue;
    const title = text(fm.title) ?? concept.path;
    const value = (key: string) =>
      key === UPDATED
        ? (updated.get(concept.path)?.raw ?? "")
        : show(lookup(fm, key));
    // The fixed columns sort as shown.
    const sortValue = (key: string) =>
      key === "path" ? concept.path : key === "title" ? title : value(key);
    const sort = options.sort;
    rows.push({
      path: concept.path,
      title,
      values: columns.map(value),
      key:
        sort === undefined
          ? { rank: 3 }
          : sortKey(
              sortValue(sort),
              sort === UPDATED ? updated.get(concept.path)?.at : undefined,
            ),
    });
  }
  rows.sort((a, b) => compare(a.key, b.key) || byCodePoint(a.path, b.path));
  return {
    columns,
    rows: rows.map(({ key, ...row }) =>
      options.sort === undefined
        ? row
        : { ...row, sortKeyFound: key.rank !== 3 },
    ),
  };
}
