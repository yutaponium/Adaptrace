// Requirement coverage (ADR-040): for each requirement, the live documents
// that satisfy it and whether their work is done. With a milestone, only the
// requirements in its scope: what it waits for through depends_on and blocks,
// followed on through Tasks and Milestones and through the work that
// satisfies a requirement in it, and the requirements that work (and the
// milestone itself) satisfies. Only Tasks in the scope count. It is computed from the
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
  // A requirement (one of the requirement types): its own status. Others:
  // null.
  status: CoverageStatus | null;
  // A Task: whether the state is a done one. A requirement: whether it is
  // covered. A Milestone: whether every Task in its scope is done. Other
  // types track no work: null.
  done: boolean | null;
  // Whether it counts toward the status: with a milestone, a Task outside
  // its scope does not. Without a milestone: true.
  counted: boolean;
}

export interface RequirementCoverage {
  path: string;
  title: string;
  state: string | null;
  // uncovered: no live document that counts satisfies it. open: one of them
  // is not done (a Task not done, a requirement not covered, a Milestone with
  // work left). covered: the others.
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
  // With a milestone: the live documents in its scope (see scopeOf), nearest
  // first. done is set for Tasks only. Without one: null.
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

  const satisfiersOf = (path: string) =>
    [
      ...new Set(
        (graph.backlinks.get(path) ?? [])
          .filter((e) => e.kind === "satisfies" && live(e.from))
          .map((e) => e.from),
      ),
    ].sort();
  const waits = new Map<string, string[]>();
  for (const { waiter, waitee } of waitPairs(graph)) {
    const list = waits.get(waiter) ?? [];
    list.push(waitee);
    waits.set(waiter, list);
  }
  // A milestone's scope, nearest first: the live documents it waits for.
  // From a Task or a Milestone, what it waits for in turn; from a requirement,
  // the Tasks and requirements that satisfy it (the work it needs). Other
  // documents, such as a Decision the work depends on, are in the scope, but
  // the walk does not go past them.
  const scopeOf = (root: string): string[] => {
    const seen = new Set([root]);
    const order: string[] = [];
    let level = [root];
    while (level.length > 0) {
      const next: string[] = [];
      for (const path of level) {
        const t = typeOf(path);
        const onward =
          t === "Task" || t === "Milestone"
            ? [...(waits.get(path) ?? [])].sort()
            : isRequirement(path)
              ? satisfiersOf(path).filter(
                  (p) => typeOf(p) === "Task" || isRequirement(p),
                )
              : [];
        for (const p of onward) {
          if (seen.has(p) || !live(p)) continue;
          seen.add(p);
          order.push(p);
          next.push(p);
        }
      }
      level = next;
    }
    return order;
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
    scope = scopeOf(root);
  }
  const scopeSet = scope === null ? null : new Set(scope);
  // Counts toward progress: with a milestone, Tasks in its scope only.
  const counted = (path: string) =>
    scopeSet === null || typeOf(path) !== "Task" || scopeSet.has(path);

  // Requirements: all live ones, or those in the scope and those its work
  // (Tasks and Milestones, the milestone itself included) satisfies.
  let paths: string[];
  if (scope === null) {
    paths = [...bundle.concepts.keys()].filter(
      (p) => live(p) && isRequirement(p),
    );
  } else {
    const work = new Set([
      ...scope.filter((p) => {
        const t = typeOf(p);
        return t === "Task" || t === "Milestone";
      }),
      options.milestone ?? "",
    ]);
    const found = new Set(scope.filter(isRequirement));
    for (const e of graph.edges) {
      if (e.kind !== "satisfies" || !work.has(e.from)) continue;
      if (live(e.to) && isRequirement(e.to)) found.add(e.to);
    }
    paths = [...found];
  }
  paths.sort();

  // Whether a satisfier is done: a Task by its state; a requirement by being
  // covered; a Milestone by all the Tasks in its own scope being done
  // (unknown, null, when it has none); others track no work (null). A cycle
  // counts as not done.
  const statuses = new Map<string, CoverageStatus>();
  const milestones = new Map<string, boolean | null>();
  const visiting = new Set<string>();
  const satisfied = (path: string): boolean | null => {
    if (isRequirement(path)) return statusOf(path) === "covered";
    if (typeOf(path) === "Milestone") {
      const known = milestones.get(path);
      if (known !== undefined) return known;
      const tasks = scopeOf(path).filter((p) => typeOf(p) === "Task");
      const done =
        tasks.length === 0 ? null : tasks.every((p) => isDone(p) === true);
      milestones.set(path, done);
      return done;
    }
    return isDone(path);
  };
  const statusOf = (path: string): CoverageStatus => {
    const known = statuses.get(path);
    if (known !== undefined) return known;
    if (visiting.has(path)) return "open";
    visiting.add(path);
    const list = satisfiersOf(path).filter(counted);
    const status: CoverageStatus =
      list.length === 0
        ? "uncovered"
        : list.some((p) => satisfied(p) === false)
          ? "open"
          : "covered";
    visiting.delete(path);
    statuses.set(path, status);
    return status;
  };

  const requirements = paths.map((path): RequirementCoverage => {
    const satisfiers = satisfiersOf(path).map(
      (p): Satisfier => ({
        path: p,
        type: typeOf(p),
        title: titleOf(p),
        state: stateOf(p),
        status: isRequirement(p) ? statusOf(p) : null,
        done: satisfied(p),
        counted: counted(p),
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
