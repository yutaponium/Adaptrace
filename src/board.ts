import { type BacklogConfig, slug } from "./backlog";
import type { Bundle } from "./bundle";
import type { Graph } from "./graph";

export interface BoardTask {
  path: string;
  title: string;
  // Unfinished tasks this one waits for (depends_on, or blocks pointing at it).
  // A stopped task (status: deprecated) is not waited for.
  waitingFor: string[];
}

export interface BoardColumn {
  state: string | null;
  label: string;
  tasks: BoardTask[];
}

// The state that means finished: the last Backlog.md status, or "done".
export function doneState(config?: BacklogConfig): string {
  return config ? slug(config.statuses.at(-1) ?? "done") : "done";
}

// Who waits for whom: `A depends_on B` means A waits for B, and `A blocks B`
// means B waits for A.
export function waitPairs(graph: Graph): { waiter: string; waitee: string }[] {
  const pairs: { waiter: string; waitee: string }[] = [];
  for (const e of graph.edges) {
    if (e.kind === "depends_on") pairs.push({ waiter: e.from, waitee: e.to });
    else if (e.kind === "blocks") pairs.push({ waiter: e.to, waitee: e.from });
  }
  return pairs;
}

const DEFAULT_ORDER = ["to_do", "todo", "in_progress", "done"];

// Tasks grouped by state. Column order follows the Backlog.md statuses when a
// config is given, otherwise to_do / in_progress / done, then other states
// alphabetically, then tasks without a state.
export function board(
  bundle: Bundle,
  graph: Graph,
  config?: BacklogConfig,
): BoardColumn[] {
  const order = config ? config.statuses.map(slug) : DEFAULT_ORDER;
  const labels = new Map(config?.statuses.map((s) => [slug(s), s]) ?? []);
  const done = doneState(config);
  const tasks = [...bundle.concepts.values()].filter(
    (c) =>
      c.frontmatter.type === "Task" && c.frontmatter.status !== "deprecated",
  );
  const stateOf = (path: string): string | null => {
    const state = bundle.concepts.get(path)?.frontmatter.state;
    return typeof state === "string" ? state : null;
  };
  // A live Task: a deprecated one is stopped, and nothing waits for it.
  const isLiveTask = (path: string) => {
    const fm = bundle.concepts.get(path)?.frontmatter;
    return fm?.type === "Task" && fm.status !== "deprecated";
  };
  // What each task waits for: its depends_on targets and its blockers.
  const waits = new Map<string, string[]>();
  for (const { waiter, waitee } of waitPairs(graph)) {
    waits.set(waiter, [...(waits.get(waiter) ?? []), waitee]);
  }
  const columns = new Map<string | null, BoardTask[]>();
  for (const concept of tasks) {
    const waitingFor = (waits.get(concept.path) ?? []).filter(
      (p) => isLiveTask(p) && stateOf(p) !== done,
    );
    const state = stateOf(concept.path);
    const list = columns.get(state) ?? [];
    const title = concept.frontmatter.title;
    list.push({
      path: concept.path,
      title: typeof title === "string" && title !== "" ? title : concept.path,
      waitingFor: [...new Set(waitingFor)].sort(),
    });
    columns.set(state, list);
  }
  const states = [...columns.keys()];
  const known = order.filter((s) => columns.has(s));
  const others = states
    .filter((s): s is string => s !== null && !order.includes(s))
    .sort();
  const ordered: (string | null)[] = [...known, ...others];
  if (columns.has(null)) ordered.push(null);
  return ordered.map((state) => ({
    state,
    label: state === null ? "(no state)" : (labels.get(state) ?? state),
    tasks: columns.get(state) ?? [],
  }));
}
