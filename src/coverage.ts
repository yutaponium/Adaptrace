// Requirement coverage (ADR-040): for each requirement, the live documents
// that satisfy it and whether their work is done. With a milestone, only the
// requirements in its scope: what it waits for through depends_on and blocks,
// followed on through Tasks and Milestones, and the requirements those Tasks
// and Milestones (and the milestone itself) satisfy. It is computed from the
// dependencies, not kept as a separate table (docs/guide/pmbok.md), and
// writes nothing.
import { waitPairs } from "./board";
import type { Bundle } from "./bundle";
import type { Graph } from "./graph";

// state values that mean a Task is done. The list of state values is not
// settled (docs/STATUS.md), so it can be changed with --done.
export const DONE_STATES = ["done"];
export const REQUIREMENT_TYPES = ["Requirement"];

export type CoverageStatus = "uncovered" | "open" | "covered";

export interface Satisfier {
  path: string;
  type: string | null;
  title: string;
  state: string | null;
  // Tasks: whether the state is a done one. A requirement (one of the
  // requirement types): whether it is covered itself. Other types track no
  // work: null.
  done: boolean | null;
  // With a milestone: whether it is in the milestone's scope. Without: true.
  inScope: boolean;
}

export interface RequirementCoverage {
  path: string;
  title: string;
  state: string | null;
  // uncovered: no live document satisfies it. open: a Task (or a
  // requirement) that satisfies it is not done (not covered); with a
  // milestone, only those in its scope count, unless the milestone waits for
  // the requirement itself. covered: the others.
  status: CoverageStatus;
  satisfiers: Satisfier[];
}

export interface ScopeItem {
  path: string;
  type: string | null;
  title: string;
  state: string | null;
  owner: string | null;
  due: string | null;
  done: boolean | null;
  // Due after the milestone (both dates readable).
  late: boolean;
}

export interface CoverageReport {
  milestone: {
    path: string;
    title: string;
    state: string | null;
    due: string | null;
  } | null;
  types: string[];
  done: string[];
  requirements: RequirementCoverage[];
  // With a milestone: the live documents it waits for, followed on through
  // Tasks and Milestones, nearest first. done is set for Tasks only. Without
  // one: null.
  scope: ScopeItem[] | null;
  byStatus: Record<CoverageStatus, number>;
}

function text(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return String(value);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

// A date's day, for comparing due dates: "2026-12-15" or an ISO 8601 date
// and time (its own date, not converted to UTC). null when not readable.
function day(value: string | null): string | null {
  const m = value === null ? null : /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return m?.[1] ?? null;
}

export function coverage(
  bundle: Bundle,
  graph: Graph,
  options: { milestone?: string; types?: string[]; done?: string[] } = {},
): CoverageReport {
  const types = options.types ?? REQUIREMENT_TYPES;
  const doneStates = options.done ?? DONE_STATES;
  const doneSet = new Set(doneStates.map((s) => s.trim().toLowerCase()));
  const fm = (path: string) => bundle.concepts.get(path)?.frontmatter;
  const live = (path: string) => {
    const f = fm(path);
    return f !== undefined && f.status !== "deprecated";
  };
  const typeOf = (path: string) => text(fm(path)?.type);
  const titleOf = (path: string) => text(fm(path)?.title) ?? path;
  const stateOf = (path: string) => text(fm(path)?.state);
  const isDone = (path: string): boolean | null => {
    if (typeOf(path) !== "Task") return null;
    const state = stateOf(path);
    return state !== null && doneSet.has(state.toLowerCase());
  };
  const isRequirement = (path: string) => {
    const t = typeOf(path);
    return t !== null && types.includes(t);
  };

  // The milestone's scope: what it waits for, followed on through live
  // documents, nearest first.
  // Only work goes further: a Requirement or a Decision the work depends on
  // is in the scope, but what it depends on or satisfies is not.
  const work = (path: string) => {
    const t = typeOf(path);
    return t === "Task" || t === "Milestone";
  };
  let milestone: CoverageReport["milestone"] = null;
  let scope: string[] | null = null;
  if (options.milestone !== undefined) {
    const root = options.milestone;
    milestone = {
      path: root,
      title: titleOf(root),
      state: stateOf(root),
      due: text(fm(root)?.due),
    };
    const waits = new Map<string, string[]>();
    for (const { waiter, waitee } of waitPairs(graph)) {
      const list = waits.get(waiter) ?? [];
      list.push(waitee);
      waits.set(waiter, list);
    }
    const seen = new Set([root]);
    const order: string[] = [];
    let level = [root];
    while (level.length > 0) {
      const next: string[] = [];
      for (const path of level) {
        for (const waitee of [...(waits.get(path) ?? [])].sort()) {
          if (seen.has(waitee) || !live(waitee)) continue;
          seen.add(waitee);
          order.push(waitee);
          if (work(waitee)) next.push(waitee);
        }
      }
      level = next;
    }
    scope = order;
  }

  // Requirements: all live ones, or those in the scope and those its
  // documents satisfy.
  let paths: string[];
  if (scope === null) {
    paths = [...bundle.concepts.keys()].filter(
      (p) => live(p) && isRequirement(p),
    );
  } else {
    // What the work satisfies, the milestone's own satisfies included.
    const inScope = new Set([...scope.filter(work), options.milestone ?? ""]);
    const found = new Set(scope.filter(isRequirement));
    for (const e of graph.edges) {
      if (e.kind !== "satisfies" || !inScope.has(e.from)) continue;
      if (live(e.to) && isRequirement(e.to)) found.add(e.to);
    }
    paths = [...found];
  }
  paths.sort();

  const scopeSet =
    scope === null ? null : new Set([...scope, options.milestone ?? ""]);
  const satisfiersOf = (path: string) =>
    [
      ...new Set(
        (graph.backlinks.get(path) ?? [])
          .filter((e) => e.kind === "satisfies" && live(e.from))
          .map((e) => e.from),
      ),
    ].sort();
  // A requirement's status; a requirement that satisfies another counts by
  // its own status. A cycle of satisfies counts as not done.
  const statuses = new Map<string, CoverageStatus>();
  const visiting = new Set<string>();
  const statusOf = (path: string): CoverageStatus => {
    const known = statuses.get(path);
    if (known !== undefined) return known;
    if (visiting.has(path)) return "open";
    visiting.add(path);
    // With a milestone, work outside its scope does not count, unless the
    // milestone waits for the requirement itself.
    const all = scopeSet === null || scopeSet.has(path);
    const list = satisfiersOf(path);
    const status: CoverageStatus =
      list.length === 0
        ? "uncovered"
        : list.some(
              (p) =>
                (all || scopeSet?.has(p) === true || !isTask(p)) &&
                satisfied(p) === false,
            )
          ? "open"
          : "covered";
    visiting.delete(path);
    statuses.set(path, status);
    return status;
  };
  const isTask = (path: string) => typeOf(path) === "Task";
  const satisfied = (path: string): boolean | null =>
    isRequirement(path) ? statusOf(path) === "covered" : isDone(path);

  const requirements = paths.map((path): RequirementCoverage => {
    const satisfiers = satisfiersOf(path).map(
      (p): Satisfier => ({
        path: p,
        type: typeOf(p),
        title: titleOf(p),
        state: stateOf(p),
        done: satisfied(p),
        inScope: scopeSet === null || scopeSet.has(p),
      }),
    );
    return {
      path,
      title: titleOf(path),
      state: stateOf(path),
      status: statusOf(path),
      satisfiers,
    };
  });

  const milestoneDay = day(milestone?.due ?? null);
  const scopeItems =
    scope === null
      ? null
      : scope.map((path): ScopeItem => {
          const due = text(fm(path)?.due);
          const dueDay = day(due);
          return {
            path,
            type: typeOf(path),
            title: titleOf(path),
            state: stateOf(path),
            owner: text(fm(path)?.owner),
            due,
            done: isDone(path),
            late:
              milestoneDay !== null && dueDay !== null && dueDay > milestoneDay,
          };
        });

  const byStatus: Record<CoverageStatus, number> = {
    uncovered: 0,
    open: 0,
    covered: 0,
  };
  for (const r of requirements) byStatus[r.status]++;
  return {
    milestone,
    types,
    done: doneStates,
    requirements,
    scope: scopeItems,
    byStatus,
  };
}
