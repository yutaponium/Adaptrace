// How far the review for one change request has got (ADR-018): for each
// document the change reaches, whether it has been reviewed, can be reviewed
// now, or waits for something upstream. It reads update dates only, and
// writes nothing.
import type { Bundle } from "./bundle";
import type { Graph } from "./graph";
import { reviewedAt, type Updated } from "./history";
import { propagates, reviewSteps } from "./impact";
import { DATETIME } from "./schema";

export type ProgressStatus = "reviewed" | "to-review" | "waiting";

export interface ProgressItem {
  path: string;
  title: string;
  step: number;
  status: ProgressStatus;
  updated: Updated | null;
  // Points at the change request itself (directly or through deprecated
  // documents).
  origin: boolean;
  // For to-review: the reviewed dependencies that are newer than it, and the
  // change request when it starts the change but is older than the request.
  newer: string[];
  // For waiting: the dependencies that are not reviewed yet.
  waitingFor: string[];
}

// What the documents the change starts from must not be older than: when
// the change request was received. Its `received_at` does not move when the
// request is updated later (for example its state), so finished reviews
// stay finished.
export interface Baseline {
  at: Date;
  raw: string;
  source: "received_at" | Updated["source"];
}

// The request's received_at, or else its last update. A received_at that is
// not a datetime with a UTC offset (validate warns) is passed over. Null when
// no date is known.
export function requestBaseline(
  bundle: Bundle,
  updated: Map<string, Updated>,
  request: string,
): Baseline | null {
  const received = bundle.concepts.get(request)?.frontmatter.received_at;
  if (typeof received === "string" && DATETIME.test(received)) {
    const at = new Date(received);
    if (!Number.isNaN(at.getTime())) {
      return { at, raw: received, source: "received_at" };
    }
  }
  return updated.get(request) ?? null;
}

export interface ProgressReport {
  request: string;
  // Null when the request's date is unknown; then the starting documents
  // are not compared with it.
  baseline: Baseline | null;
  // The request has a received_at that could not be read (shown as written).
  badReceivedAt: string | null;
  items: ProgressItem[];
  // Reached but not listed, because they are deprecated.
  deprecated: string[];
  counts: Record<ProgressStatus, number>;
  done: boolean;
}

function isDeprecated(bundle: Bundle, path: string): boolean {
  return bundle.concepts.get(path)?.frontmatter.status === "deprecated";
}

export function progress(
  bundle: Bundle,
  graph: Graph,
  updated: Map<string, Updated>,
  request: string,
  baseline: Baseline | null = requestBaseline(bundle, updated, request),
): ProgressReport {
  const reached = new Set<string>();
  const queue = [request];
  for (let node = queue.pop(); node !== undefined; node = queue.pop()) {
    for (const edge of graph.backlinks.get(node) ?? []) {
      if (!propagates(edge) || edge.from === request) continue;
      if (reached.has(edge.from)) continue;
      reached.add(edge.from);
      queue.push(edge.from);
    }
  }
  const direct = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!propagates(edge) || !reached.has(edge.from)) continue;
    if (edge.to !== request && !reached.has(edge.to)) continue;
    const list = direct.get(edge.from) ?? [];
    if (!list.includes(edge.to) && edge.to !== edge.from) list.push(edge.to);
    direct.set(edge.from, list);
  }
  // The dependencies to compare with: deprecated ones are replaced by what
  // they depend on, and the change request is left out (but noted).
  const resolve = (path: string) => {
    const deps = new Set<string>();
    let origin = false;
    const seen = new Set<string>();
    const pending = [...(direct.get(path) ?? [])];
    for (let dep = pending.pop(); dep !== undefined; dep = pending.pop()) {
      if (seen.has(dep)) continue;
      seen.add(dep);
      if (dep === request) origin = true;
      else if (isDeprecated(bundle, dep))
        pending.push(...(direct.get(dep) ?? []));
      else if (dep !== path) deps.add(dep);
    }
    return { deps: [...deps].sort(), origin };
  };
  const listed = [...reached].filter((p) => !isDeprecated(bundle, p));
  const steps = reviewSteps(graph, [request], listed);
  const ordered = listed
    .map((path) => ({ path, step: steps.get(path) ?? 1 }))
    .sort((a, b) => a.step - b.step || a.path.localeCompare(b.path));
  const status = new Map<string, ProgressStatus>();
  const items: ProgressItem[] = [];
  // A dependency in the same step is in the same cycle (a validate error).
  // A cycle is judged as one unit: its documents are not compared with each
  // other, but each with every dependency of the cycle outside it (and with
  // the baseline if any of them starts the change), and it is reviewed only
  // as a whole. Each step is settled before the next one.
  const groups = new Map<number, string[]>();
  for (const { path, step } of ordered) {
    groups.set(step, [...(groups.get(step) ?? []), path]);
  }
  for (const [step, paths] of groups) {
    const resolved = new Map(paths.map((p) => [p, resolve(p)]));
    const peers = new Map(
      paths.map((p) => [
        p,
        (resolved.get(p)?.deps ?? []).filter((d) => steps.get(d) === step),
      ]),
    );
    // Documents linked either way by peers form one cycle.
    const unit = new Map<string, string[]>();
    for (const p of paths) {
      if (unit.has(p)) continue;
      const members = new Set([p]);
      for (const m of members) {
        for (const q of paths) {
          if (peers.get(m)?.includes(q) || peers.get(q)?.includes(m)) {
            members.add(q);
          }
        }
      }
      const list = [...members].sort();
      for (const m of list) unit.set(m, list);
    }
    const judged: ProgressItem[] = [];
    for (const path of paths) {
      const members = unit.get(path) ?? [path];
      const deps = [
        ...new Set(
          members.flatMap((m) =>
            (resolved.get(m)?.deps ?? []).filter(
              (d) => (steps.get(d) ?? 0) < step,
            ),
          ),
        ),
      ].sort();
      const startsChange = members.some((m) => resolved.get(m)?.origin);
      const own = updated.get(path) ?? null;
      const waitingFor = deps.filter((d) => status.get(d) !== "reviewed");
      const newer =
        own === null
          ? []
          : deps.filter((d) => {
              const at = updated.get(d)?.at;
              return at !== undefined && reviewedAt(own) < at;
            });
      // Linking to the request without updating the document is not a
      // review.
      if (
        startsChange &&
        own !== null &&
        baseline !== null &&
        reviewedAt(own) < baseline.at
      ) {
        newer.unshift(request);
      }
      const s: ProgressStatus =
        waitingFor.length > 0
          ? "waiting"
          : own === null || newer.length > 0
            ? "to-review"
            : "reviewed";
      const t = bundle.concepts.get(path)?.frontmatter.title;
      judged.push({
        path,
        title: typeof t === "string" && t.trim() !== "" ? t : path,
        step,
        status: s,
        updated: own,
        origin: resolved.get(path)?.origin ?? false,
        newer: s === "to-review" ? newer : [],
        waitingFor,
      });
    }
    for (const item of judged) status.set(item.path, item.status);
    // Until every document of a cycle is reviewed, the others wait for it.
    for (const item of judged) {
      if (item.status !== "reviewed") continue;
      const open = (unit.get(item.path) ?? []).filter(
        (m) => m !== item.path && status.get(m) !== "reviewed",
      );
      if (open.length === 0) continue;
      item.status = "waiting";
      item.waitingFor = open;
    }
    for (const item of judged) status.set(item.path, item.status);
    items.push(...judged);
  }
  const counts: Record<ProgressStatus, number> = {
    reviewed: 0,
    "to-review": 0,
    waiting: 0,
  };
  for (const i of items) counts[i.status]++;
  return {
    request,
    baseline,
    badReceivedAt: (() => {
      const r = bundle.concepts.get(request)?.frontmatter.received_at;
      if (r === undefined || baseline?.source === "received_at") return null;
      return r instanceof Date ? r.toISOString() : String(r);
    })(),
    items,
    deprecated: [...reached].filter((p) => isDeprecated(bundle, p)).sort(),
    counts,
    done: counts["to-review"] === 0 && counts.waiting === 0,
  };
}
