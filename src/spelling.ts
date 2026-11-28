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
export const canonical = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");

// Other words for a dependency key that are not within editing distance.
// Maps, not object literals: a key such as "constructor" must not find an
// inherited property.
const SYNONYMS = new Map<string, DependencyKey>([
  ["dependencies", "depends_on"],
  ["dependency", "depends_on"],
  ["depends", "depends_on"],
  ["depend", "depends_on"],
  ["derived", "derived_from"],
  ["derives", "derived_from"],
  ["satisfy", "satisfies"],
  ["blocking", "blocks"],
]);

// Keys that state the relation from the other side. Adaptrace records each
// relation on one document only. "blocked" is one letter from "blocks", but
// renaming it would turn the relation around.
const REVERSE = new Map<string, DependencyKey>([
  ["blockedby", "blocks"],
  ["blocked", "blocks"],
  ["blockedon", "blocks"],
  ["blocker", "blocks"],
  ["blockers", "blocks"],
  ["blockson", "blocks"],
  ["supersededby", "supersedes"],
  ["superseded", "supersedes"],
  ["satisfied", "satisfies"],
  ["satisfiedby", "satisfies"],
  ["satisfiers", "satisfies"],
  ["blocksby", "blocks"],
  ["dependsonby", "depends_on"],
  ["dependedon", "depends_on"],
  ["dependedonby", "depends_on"],
  ["dependents", "depends_on"],
  ["derivedby", "derived_from"],
  ["changedby", "changes"],
]);

// Words one letter from a dependency key that usually mean something else:
// "changed" is most often a date.
const NOT_KEYS = new Set(["changed"]);

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

// The words of a key: depends_on, dependsOn and depends-on are all
// ["depends", "on"].
const words = (s: string) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter((w) => w !== "");

// A whole word replaced by another (requested_at for requested_by) names a
// different thing, not a misspelling.
function replacesWord(written: string, known: string): boolean {
  const a = words(written);
  const b = words(known);
  if (a.length !== b.length || a.length < 2) return false;
  return a.some((w, i) => {
    const v = b[i] as string;
    return w !== v && editDistance(w, v) >= Math.max(w.length, v.length);
  });
}

// A known key with words added (description_en, verified_by) names another
// thing, not a misspelling.
function addsWords(written: string, known: string): boolean {
  const a = words(written);
  const b = words(known);
  return a.length > b.length && b.every((w, i) => a[i] === w);
}

// Two words of the same length that differ in one letter are often both
// real words ("charges" and "changes", "statue" and "status").
function swapOnly(a: string, b: string): boolean {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

// How far a key is from a known key, or null when not close. A plural "s"
// comes before one letter of difference: "states" is "state", not "status".
// - One letter: an extra or missing letter, or two adjacent letters swapped.
//   A replaced letter counts only from eight letters on.
// - Two letters: only from nine letters on, with the first three the same.
// Short words are too close to each other ("size" is one letter from
// "side"), so a short known key matches only a longer key ("stated").
function near(written: string, known: string): number | null {
  const a = canonical(written);
  const b = canonical(known);
  if (a === b) return 0;
  if (a === `${b}s` || b === `${a}s`) return 0.5;
  if (a.length < 6) return null;
  if (addsWords(written, known)) return null;
  // Only for keys that are not dependencies: a dependency key with a word
  // replaced (depends_to) is still most likely meant as the dependency.
  if (!DEPENDENCY_SET.has(known) && replacesWord(written, known)) return null;
  const d = editDistance(a, b);
  if (d === 1) {
    if (a.length === b.length && a.length < 8 && !swapOnly(a, b)) return null;
    return 1;
  }
  if (
    d === 2 &&
    a.length >= 9 &&
    b.length >= 9 &&
    a.slice(0, 3) === b.slice(0, 3)
  ) {
    return 2;
  }
  return null;
}

// The key a frontmatter key was probably meant to be, or null when the key
// is known or not close to one.
export function suggestKey(key: string): KeySuggestion | null {
  if (ALL_SET.has(key)) return null;
  const c = canonical(key);
  if (NOT_KEYS.has(c)) return null;
  const reverse = REVERSE.get(c);
  if (reverse !== undefined) {
    return { key: reverse, dependency: true, reverse: true };
  }
  const synonym = SYNONYMS.get(c);
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
// catches names one or two letters from a listed type. A listed type of five
// letters or fewer matches only one letter more or two letters swapped
// ("Taask", "Tsak" or "Tasks" for "Task", but not "Ask" or "Disk").
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
      // Two letters apart, an unrelated word is too often as close
      // ("Revision" for "Decision"): the start must agree.
      d =
        b.length >= 6 &&
        (e === 1 || (e === 2 && a.slice(0, 2) === b.slice(0, 2)))
          ? e
          : null;
      // Short: one letter more, or two adjacent letters swapped. One letter
      // replaced makes another word too often ("Disk" for "Risk").
      if (b.length < 6 && e === 1 && (a.length > b.length || swapOnly(a, b))) {
        d = 1;
      }
    }
    if (d !== null && (best === null || d < best.d)) best = { type: known, d };
  }
  return best?.type ?? null;
}
