import { type Bundle, withFiles } from "./bundle";
import { unifiedDiff } from "./diff";
import { type Issue, validate } from "./validate";

export interface Proposal {
  path: string;
  written: boolean;
  content: string;
  diff: string;
  // Issues on this document after the change.
  issues: Issue[];
  // Issues anywhere in the bundle that the change would add or remove.
  newIssues: Issue[];
  resolvedIssues: Issue[];
}

export interface ProposalSet {
  // Each with the new issues on its own file.
  proposals: Proposal[];
  // Across all the files together, so dependencies between new documents
  // resolve, and issues on other documents show up.
  newIssues: Issue[];
  resolvedIssues: Issue[];
}

const key = (i: Issue) => `${i.severity}|${i.code}|${i.file}|${i.message}`;

// What validate would report if the files had the given text, compared with
// now, as one change. `now` is validate(bundle), when the caller makes
// several proposals on one bundle.
export function proposeFiles(
  bundle: Bundle,
  files: { path: string; before: string; text: string }[],
  now: Issue[] = validate(bundle),
): ProposalSet {
  const after = validate(withFiles(bundle, files));
  const nowKeys = new Set(now.map(key));
  const afterKeys = new Set(after.map(key));
  const newIssues = after.filter((i) => !nowKeys.has(key(i)));
  const resolvedIssues = now.filter((i) => !afterKeys.has(key(i)));
  return {
    proposals: files.map((f) => ({
      path: f.path,
      written: false,
      content: f.text,
      diff: unifiedDiff(f.before, f.text, f.path),
      issues: after.filter((i) => i.file === f.path),
      newIssues: newIssues.filter((i) => i.file === f.path),
      resolvedIssues: resolvedIssues.filter((i) => i.file === f.path),
    })),
    newIssues,
    resolvedIssues,
  };
}

// One file. Its newIssues and resolvedIssues cover the whole bundle, so a
// change that closes a cycle or breaks another document's dependency shows
// up even when the issue is reported on another file.
export function proposal(
  bundle: Bundle,
  path: string,
  before: string,
  text: string,
  now?: Issue[],
): Proposal {
  const set = proposeFiles(bundle, [{ path, before, text }], now);
  const [p] = set.proposals;
  if (p === undefined) throw new Error("unreachable");
  return {
    ...p,
    newIssues: set.newIssues,
    resolvedIssues: set.resolvedIssues,
  };
}
