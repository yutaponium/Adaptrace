// Material for judging whether the documents that depend on a changed
// document need an update (v0.5, ADR-013): for each direct dependent, what
// changed in the target since the dependent was last committed. The judging
// itself is done by an LLM through llm.ts, or by an agent over MCP.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Bundle } from "./bundle";
import { unifiedDiff } from "./diff";
import type { EdgeKind, Graph } from "./graph";
import { git, type Updated } from "./history";
import { impact, propagates } from "./impact";

export interface Baseline {
  commit: string;
  // Author date of that commit.
  at: string;
}

export interface AssessItem {
  path: string;
  kinds: EdgeKind[];
  updated: Updated | null;
  needsReview: boolean;
  // The commit that last changed this document, where the target is taken
  // from. Null when that is unknown (no git history, or the target did not
  // exist in it).
  baseline: Baseline | null;
  // Unified diff of the target from the baseline to the working tree; ""
  // when the target has not changed since then. Null without a baseline.
  change: string | null;
  content: string;
}

export interface AssessContext {
  target: string;
  updated: Updated | null;
  content: string;
  items: AssessItem[];
}

// The target as it was in the last commit that changed `dependent`: what
// the dependent's author saw when they last wrote it. Commit dates are not
// compared with generated.at, since a document is usually written before it
// is committed.
export function textAt(
  root: string,
  target: string,
  dependent: string,
): { baseline: Baseline; text: string } | null {
  const log = git(root, [
    "log",
    "-1",
    "--format=%H%x00%aI",
    "--",
    `./${dependent}`,
  ])?.trim();
  if (!log) return null;
  const [commit, date] = log.split("\0");
  if (!commit || !date) return null;
  const text = git(root, ["show", `${commit}:./${target}`]);
  return text === null ? null : { baseline: { commit, at: date }, text };
}

function lf(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

// Direct dependents of `target` through depends_on, derived_from and
// satisfies. Only those marked needs review, unless `all` is set. Indirect
// dependents are assessed once the direct ones have been updated.
export async function assessContext(
  bundle: Bundle,
  graph: Graph,
  updated: Map<string, Updated>,
  target: string,
  options: { all?: boolean } = {},
): Promise<AssessContext> {
  const report = impact(bundle, graph, updated, target);
  const current = await readFile(join(bundle.root, target), "utf8");
  const items: AssessItem[] = [];
  for (const a of report.affected) {
    if (a.depth !== 1 || (!a.needsReview && !options.all)) continue;
    const kinds = graph.edges
      .filter((e) => e.from === a.path && e.to === target && propagates(e))
      .map((e) => e.kind);
    const before = textAt(bundle.root, target, a.path);
    items.push({
      path: a.path,
      kinds: [...new Set(kinds)],
      updated: a.updated,
      needsReview: a.needsReview,
      baseline: before?.baseline ?? null,
      // Compared without line endings: the blob in git may have LF where the
      // working tree has CRLF (core.autocrlf, eol attributes).
      change:
        before === null
          ? null
          : unifiedDiff(lf(before.text), lf(current), target),
      content: await readFile(join(bundle.root, a.path), "utf8"),
    });
  }
  return { target, updated: report.updated, content: current, items };
}
