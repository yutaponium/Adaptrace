// Near-miss detection for frontmatter keys and types (ADR-047). A misspelled
// dependency key is not an error in OKF (unknown keys are allowed), so the
// dependency silently disappears from impact analysis. These checks name the
// key that was probably meant.
import {
  DEPENDENCY_KEY_NAMES,
  type DependencyKey,
  KNOWN_KEYS,
  KNOWN_TYPES,
} from "./schema";

export interface KeySuggestion {
  // The key that was probably meant.
  key: string;
  dependency: boolean;
  // The written key points the other way: the dependency belongs on the
  // other document (e.g. blocked_by).
  reverse: boolean;
}

// Lower case, without separators: dependsOn, depends-on and Depends_On are
// all "dependson".
const canonical = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");

// Other words for a dependency key that are not within editing distance.
const SYNONYMS: Record<string, DependencyKey> = {
  dependencies: "depends_on",
  dependency: "depends_on",
  depends: "depends_on",
  satisfy: "satisfies",
  satisfied: "satisfies",
};

// Keys that state the relation from the other side. Adaptrace records each
// relation on one document only.
const REVERSE: Record<string, DependencyKey> = {
  blockedby: "blocks",
  supersededby: "supersedes",
  satisfiedby: "satisfies",
  derivedby: "derived_from",
  changedby: "changes",
};

const DEPENDENCY_SET = new Set<string>(DEPENDENCY_KEY_NAMES);
const ALL_KEYS: string[] = [...DEPENDENCY_KEY_NAMES, ...KNOWN_KEYS];
const ALL_SET = new Set(ALL_KEYS);

// Optimal string alignment distance: insertions, deletions, substitutions
// and swaps of two adjacent characters.
export function editDistance(a: string, b: string): number {
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    const row: number[] = [];
    for (let j = 0; j <= b.length; j++) {
      if (i === 0 || j === 0) {
        row.push(i + j);
        continue;
      }
      const prev = rows[i - 1] as number[];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(
        (prev[j] as number) + 1,
        (row[j - 1] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, ((rows[i - 2] as number[])[j - 2] as number) + 1);
      }
      row.push(d);
    }
    rows.push(row);
  }
  return (rows[a.length] as number[])[b.length] as number;
}

// Short words are too close to each other: "size" is one letter from
// "side". They match only by case, separators or a plural "s".
function near(written: string, known: string): number | null {
  const a = canonical(written);
  const b = canonical(known);
  if (a === b) return 0;
  if (a === `${b}s` || b === `${a}s`) return 1;
  if (a.length < 6 || b.length < 6) return null;
  const d = editDistance(a, b);
  return d <= 2 ? d : null;
}

// The key a frontmatter key was probably meant to be, or null when the key
// is known or not close to one.
export function suggestKey(key: string): KeySuggestion | null {
  if (ALL_SET.has(key)) return null;
  const c = canonical(key);
  const reverse = REVERSE[c];
  if (reverse !== undefined) {
    return { key: reverse, dependency: true, reverse: true };
  }
  const synonym = SYNONYMS[c];
  if (synonym !== undefined) {
    return { key: synonym, dependency: true, reverse: false };
  }
  let best: { key: string; d: number } | null = null;
  for (const known of ALL_KEYS) {
    const d = near(key, known);
    if (d !== null && (best === null || d < best.d)) best = { key: known, d };
  }
  if (best === null) return null;
  return {
    key: best.key,
    dependency: DEPENDENCY_SET.has(best.key),
    reverse: false,
  };
}

// The listed type a type was probably meant to be, or null when it is listed
// or not close to one. Projects may add their own types, so this only
// catches names one or two letters from a listed type.
export function suggestType(type: string): string | null {
  if ((KNOWN_TYPES as readonly string[]).includes(type)) return null;
  let best: { type: string; d: number } | null = null;
  for (const known of KNOWN_TYPES) {
    const a = canonical(type);
    const b = canonical(known);
    let d: number | null;
    if (a === b) d = 0;
    else if (a === `${b}s`) d = 1;
    else {
      const e = editDistance(a, b);
      d = e <= (b.length < 6 ? 1 : 2) ? e : null;
    }
    if (d !== null && (best === null || d < best.d)) best = { type: known, d };
  }
  return best?.type ?? null;
}
