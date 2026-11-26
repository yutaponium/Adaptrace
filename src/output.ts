import type { AssessContext } from "./assess";
import type { SyncAction, SyncPlan } from "./backlog";
import type { BoardColumn } from "./board";
import type { Bundle } from "./bundle";
import type { ConflictReport, JudgedPair } from "./conflicts";
import type { CoverageReport } from "./coverage";
import type { EstimateReport, Sizes } from "./estimate";
import type { ExtractResult, WriteOutcome } from "./extract";
import type { Graph } from "./graph";
import type { HealthFinding } from "./health";
import type { Updated } from "./history";
import {
  type Affected,
  byReviewOrder,
  type ImpactReport,
  type Order,
  type StaleReport,
} from "./impact";
import { type ListReport, NUMBER } from "./list";
import { type Assessment, fence } from "./llm";
import type { MeetingResult } from "./meeting";
import type { ProgressReport, ProgressStatus } from "./progress";
import type { Issue } from "./validate";

export function formatIssues(issues: Issue[], bundle: Bundle): string {
  const lines = issues.map((i) => {
    const location = i.line === undefined ? i.file : `${i.file}:${i.line}`;
    return `${i.severity.padEnd(7)} ${location}  ${i.message}  [${i.code}]`;
  });
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.length - errors;
  const files =
    bundle.concepts.size + bundle.reserved.length + bundle.invalid.length;
  lines.push(
    `${plural(errors, "error")}, ${plural(warnings, "warning")} in ${plural(files, "file")}`,
  );
  return lines.join("\n");
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function title(bundle: Bundle, path: string): string {
  const t = bundle.concepts.get(path)?.frontmatter.title;
  return typeof t === "string" && t !== "" ? t : path;
}

export function graphToJson(bundle: Bundle, graph: Graph, references: boolean) {
  const edges = graph.edges.filter(
    (e) => references || e.kind !== "references",
  );
  return {
    nodes: [...bundle.concepts.values()].map((c) => ({
      path: c.path,
      id: c.id,
      type: c.frontmatter.type ?? null,
      title: title(bundle, c.path),
      status: c.frontmatter.status ?? "stable",
      state: c.frontmatter.state ?? null,
    })),
    edges: edges.map(({ from, to, kind }) => ({ from, to, kind })),
    backlinks: Object.fromEntries(
      [...graph.backlinks]
        .map(
          ([to, incoming]) =>
            [
              to,
              incoming
                .filter((e) => references || e.kind !== "references")
                .map(({ from, kind }) => ({ from, kind })),
            ] as const,
        )
        .filter(([, incoming]) => incoming.length > 0),
    ),
  };
}

export function graphToMermaid(
  bundle: Bundle,
  graph: Graph,
  references: boolean,
): string {
  const ids = new Map<string, string>();
  const lines = ["graph LR"];
  for (const path of bundle.concepts.keys()) {
    const id = `n${ids.size}`;
    ids.set(path, id);
    const label = title(bundle, path)
      .replace(/\s+/g, " ")
      .replace(/"/g, "#quot;");
    lines.push(`  ${id}["${label}"]`);
  }
  for (const edge of graph.edges) {
    if (edge.kind === "references" && !references) continue;
    const arrow = edge.kind === "references" ? "-.->" : "-->";
    lines.push(
      `  ${ids.get(edge.from)} ${arrow}|${edge.kind}| ${ids.get(edge.to)}`,
    );
  }
  return lines.join("\n");
}

function day(updated: Updated | null): string {
  if (updated === null) return "unknown";
  const reviewed = updated.reviewed
    ? `, reviewed ${updated.reviewed.raw} (verified.at)`
    : "";
  return `${updated.raw} (${updated.source})${reviewed}`;
}

function updatedJson(updated: Updated | null | undefined) {
  return updated
    ? {
        at: updated.raw,
        utc: updated.at.toISOString(),
        source: updated.source,
        // A later review that needed no change (verified.at), or none.
        reviewed: updated.reviewed
          ? {
              at: updated.reviewed.raw,
              utc: updated.reviewed.at.toISOString(),
            }
          : null,
      }
    : null;
}

export function formatImpact(
  report: ImpactReport,
  order: Order = "depth",
): string {
  const lines = [`${report.target} was updated ${day(report.updated)}`];
  if (report.updated === null) {
    lines.push("Its update date is unknown, so every dependent needs review.");
  }
  const review = report.affected.filter((a) => a.needsReview).length;
  if (order === "review" && report.affected.length > 0) {
    const steps = report.affected.reduce((m, a) => Math.max(m, a.step), 0);
    lines.push("", `Review order, upstream first (${plural(steps, "step")})`);
    for (const a of byReviewOrder(report.affected)) {
      lines.push(
        `  ${String(a.step).padStart(String(steps).length)}  ${a.path}  ${a.depth === 1 ? a.edge.kind : `${a.edge.kind} -> ${a.edge.to}`}  updated ${day(a.updated)}${a.needsReview ? "  needs review" : ""}`,
      );
    }
    lines.push("", `${plural(review, "document")} to review`);
    return lines.join("\n");
  }
  const direct = report.affected.filter((a) => a.depth === 1);
  const indirect = report.affected.filter((a) => a.depth > 1);
  const row = (a: Affected, via: string) =>
    `  ${a.path}  ${via}  updated ${day(a.updated)}${a.needsReview ? "  needs review" : ""}`;
  if (report.affected.length === 0) {
    lines.push("", "No documents depend on it.");
  }
  if (direct.length > 0) {
    lines.push("", `Direct (${direct.length})`);
    for (const a of direct) lines.push(row(a, a.edge.kind));
  }
  if (indirect.length > 0) {
    lines.push("", `Indirect (${indirect.length})`);
    for (const a of indirect)
      lines.push(row(a, `${a.edge.kind} -> ${a.edge.to}`));
  }
  lines.push("", `${plural(review, "document")} to review`);
  return lines.join("\n");
}

export function impactToJson(report: ImpactReport) {
  return {
    target: report.target,
    updated: updatedJson(report.updated),
    affected: report.affected.map((a) => ({
      path: a.path,
      kind: a.edge.kind,
      via: a.edge.to,
      depth: a.depth,
      step: a.step,
      updated: updatedJson(a.updated),
      needsReview: a.needsReview,
    })),
  };
}

export function formatHealth(findings: HealthFinding[]): string {
  const lines = findings.map((f) => {
    const location = f.line === undefined ? f.file : `${f.file}:${f.line}`;
    return `${location}  ${f.message}  [${f.code}]`;
  });
  lines.push(plural(findings.length, "finding"));
  return lines.join("\n");
}

export function healthToJson(findings: HealthFinding[]) {
  return findings.map((f) => ({
    code: f.code,
    file: f.file,
    ...(f.line === undefined ? {} : { line: f.line }),
    message: f.message,
    ...(f.edge === undefined ? {} : { kind: f.edge.kind, to: f.edge.to }),
    ...(f.replacedBy === undefined ? {} : { replacedBy: f.replacedBy }),
    ...(f.via === undefined
      ? {}
      : { via: f.via.map(({ from, to, kind }) => ({ from, to, kind })) }),
  }));
}

export function formatStale(report: StaleReport): string {
  const lines: string[] = [];
  for (const doc of report.stale) {
    lines.push(`${doc.path}  updated ${day(doc.updated)}`);
    for (const r of doc.reasons) {
      lines.push(
        r.kind === "expired"
          ? `  past stale_after (${r.staleAfterRaw})`
          : r.kind === "resource-changed"
            ? `  its file ${r.resource} changed (sha256 now ${r.current}, recorded ${r.recorded})`
            : r.kind === "resource-unrecorded"
              ? `  no sha256 recorded for its file ${r.resource} (now ${r.current})`
              : r.kind === "resource-missing"
                ? `  its file ${r.resource} is missing or not a readable file`
                : `  older than ${r.dependency} (${r.kinds?.join(", ")}, updated ${day(r.dependencyUpdated ?? null)})`,
      );
    }
  }
  if (report.unknown.length > 0) {
    lines.push(
      `Update date unknown, not compared with dependencies: ${report.unknown.join(", ")}`,
    );
  }
  lines.push(`${plural(report.stale.length, "stale document")}`);
  return lines.join("\n");
}

export function staleToJson(report: StaleReport) {
  return {
    stale: report.stale.map((d) => ({
      path: d.path,
      updated: updatedJson(d.updated),
      reasons: d.reasons.map((r) =>
        r.kind === "expired"
          ? { kind: r.kind, staleAfter: r.staleAfterRaw }
          : r.kind === "resource-changed" ||
              r.kind === "resource-unrecorded" ||
              r.kind === "resource-missing"
            ? {
                kind: r.kind,
                resource: r.resource,
                ...(r.recorded === undefined ? {} : { recorded: r.recorded }),
                ...(r.current === undefined ? {} : { current: r.current }),
              }
            : {
                kind: r.kind,
                dependency: r.dependency,
                via: r.kinds,
                dependencyUpdated: updatedJson(r.dependencyUpdated),
              },
      ),
    })),
    unknown: report.unknown,
  };
}

const ACTION_LABELS: Record<SyncAction["kind"], string> = {
  "export-new": "create in Backlog.md",
  export: "update Backlog.md",
  "import-new": "create in Adaptrace",
  import: "update Adaptrace",
  link: "record as in sync",
  conflict: "CONFLICT (changed on both sides)",
  missing: "MISSING in Backlog.md",
  "duplicate-link": "SKIPPED (backlog.id used twice)",
  pending: "PENDING (excluded by --direction)",
  "unmapped-state": "SKIPPED (state has no Backlog.md status)",
};

const CHANGE_KINDS: SyncAction["kind"][] = [
  "export-new",
  "export",
  "import-new",
  "import",
  "link",
];

export function formatSync(plan: SyncPlan, written: boolean): string {
  const lines: string[] = [];
  for (const a of plan.actions) {
    const label = ACTION_LABELS[a.kind].padEnd(22);
    if (a.kind === "missing") {
      lines.push(`${label} ${a.adaptrace}  (${a.id})`);
    } else if (a.kind === "unmapped-state") {
      lines.push(`${label} ${a.adaptrace}  state '${a.state}'`);
    } else if (a.kind === "duplicate-link") {
      lines.push(
        `${label} ${a.adaptrace}  (${a.id}, also ${a.others.join(", ")})`,
      );
    } else {
      const fields =
        "fields" in a && a.fields.length > 0
          ? `  [${a.fields.join(", ")}]`
          : "";
      lines.push(
        `${label} ${a.adaptrace} <-> ${a.backlogPath} (${a.id})${fields}`,
      );
    }
  }
  for (const e of plan.errors)
    lines.push(`error                  ${e.path}  ${e.message}`);
  const changes = plan.actions.filter((a) =>
    CHANGE_KINDS.includes(a.kind),
  ).length;
  const pending = plan.actions.filter((a) => a.kind === "pending").length;
  const problems = plan.actions.length - changes - pending;
  lines.push(
    `${plural(changes, "change")}, ${plural(problems, "problem")}, ${pending} pending, ${plan.inSync} in sync` +
      (changes > 0 && !written
        ? ". Run again with --write to apply"
        : written
          ? ". Written"
          : ""),
  );
  return lines.join("\n");
}

export function syncToJson(plan: SyncPlan, written: boolean) {
  return {
    written,
    inSync: plan.inSync,
    actions: plan.actions,
    errors: plan.errors,
  };
}

// Without `linkBase`, markdown shows each path as code, since a link
// relative to the bundle breaks once pasted elsewhere. With it, titles link
// to `linkBase` + path (for example a repository URL ending in .adaptrace/).
export function formatBoard(
  columns: BoardColumn[],
  markdown: boolean,
  linkBase?: string,
): string {
  const lines: string[] = [];
  for (const column of columns) {
    if (lines.length > 0) lines.push("");
    lines.push(
      markdown
        ? `## ${column.label} (${column.tasks.length})`
        : `${column.label} (${column.tasks.length})`,
    );
    if (markdown) lines.push("");
    for (const task of column.tasks) {
      if (!markdown) {
        const waiting =
          task.waitingFor.length > 0
            ? `  waiting for ${task.waitingFor.join(", ")}`
            : "";
        lines.push(`  - ${task.title}  ${task.path}${waiting}`);
        continue;
      }
      const item = docLink(task.title, task.path, linkBase);
      const waiting =
        task.waitingFor.length > 0
          ? ` — waiting for ${task.waitingFor.map(code).join(", ")}`
          : "";
      lines.push(`- ${item}${waiting}`);
    }
  }
  if (columns.length === 0) lines.push("No tasks.");
  return lines.join("\n");
}

// A document in Markdown that is pasted elsewhere: its title with the path as
// code, since a link relative to the bundle would break; or, with
// `linkBase`, a link to `linkBase` + path.
// In a table cell (`table`), a "|" in the path is escaped too: GFM splits
// cells on it even inside code.
function docLink(
  title: string,
  path: string,
  linkBase?: string,
  table = false,
): string {
  if (linkBase === undefined) {
    const shown = code(path);
    return `${escapeMarkdown(title)} (${table ? shown.replace(/\|/g, "\\|") : shown})`;
  }
  const url = `${linkBase.replace(/\/*$/, "/")}${path.split("/").map(encodeURIComponent).join("/")}`;
  return `[${escapeMarkdown(title)}](${url})`;
}

function code(text: string): string {
  return text.includes("`") ? `\`\` ${text} \`\`` : `\`${text}\``;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]<>|]/g, "\\$&");
}

function indent(text: string, prefix: string): string[] {
  return text
    .replace(/\n$/, "")
    .split("\n")
    .map((l) => `${prefix}${l}`);
}

export function formatAssess(
  ctx: AssessContext,
  assessments: Assessment[] | null,
): string {
  const lines = [`${ctx.target} was updated ${day(ctx.updated)}`];
  if (ctx.items.length === 0) {
    lines.push("", "No direct dependents to assess.");
    return lines.join("\n");
  }
  for (const [i, item] of ctx.items.entries()) {
    const a = assessments?.[i];
    lines.push("");
    const head = `${item.path}  ${item.kinds.join(", ")}  updated ${day(item.updated)}`;
    if (a === undefined) {
      lines.push(`${head}${item.needsReview ? "  needs review" : ""}`);
      if (item.change === null) {
        lines.push(
          `  The earlier version of ${ctx.target} is unknown (${item.path} has no commit, or ${ctx.target} was not in it).`,
        );
      } else if (item.change === "") {
        lines.push(`  ${ctx.target} has not changed since then.`);
      } else {
        lines.push(
          `  Changes since ${item.baseline?.commit.slice(0, 7)} (${item.baseline?.at}):`,
        );
        lines.push(...indent(item.change, "    "));
      }
      continue;
    }
    if (a.judgment === null) {
      lines.push(`${head}  error`, `  ${a.error}`);
      continue;
    }
    lines.push(`${head}  ${a.judgment.verdict}`);
    lines.push(...indent(a.judgment.reason, "  "));
    if (a.proposal !== null) {
      lines.push(
        a.judgment.verdict === "none"
          ? "  Proposal: record the review in verified"
          : "  Proposal:",
      );
      lines.push(...indent(a.proposal.diff, "    "));
      for (const issue of a.proposal.newIssues) {
        lines.push(`    ${issue.severity} ${issue.file}  ${issue.message}`);
      }
    } else if (a.error) {
      lines.push(`  No proposal: ${a.error}`);
    }
  }
  lines.push("");
  if (assessments === null) {
    lines.push(
      `${plural(ctx.items.length, "document")} to assess. Give --llm <command> (or set ADAPTRACE_LLM) to judge them.`,
    );
  } else {
    // A judged document whose proposal could not be made counts as an
    // error, not under its verdict, so each document is counted once.
    const failed = (a: Assessment) =>
      a.judgment === null || Boolean(a.error && a.proposal === null);
    const count = (v: string) =>
      assessments.filter((a) => !failed(a) && a.judgment?.verdict === v).length;
    const errors = assessments.filter(failed).length;
    lines.push(
      `${count("major")} major, ${count("minor")} minor, ${count("none")} none${errors > 0 ? `, ${plural(errors, "error")}` : ""}. Nothing was written.`,
    );
  }
  return lines.join("\n");
}

export function assessToJson(
  ctx: AssessContext,
  assessments: Assessment[] | null,
) {
  return {
    target: ctx.target,
    updated: updatedJson(ctx.updated),
    items: ctx.items.map((item, i) => ({
      path: item.path,
      kinds: item.kinds,
      updated: updatedJson(item.updated),
      needsReview: item.needsReview,
      baseline: item.baseline,
      change: item.change,
      ...(assessments === null
        ? {}
        : {
            judgment: assessments[i]?.judgment ?? null,
            // True when the target had not changed, so no LLM was asked.
            unchanged: assessments[i]?.unchanged ?? false,
            ...(assessments[i]?.error ? { error: assessments[i]?.error } : {}),
            proposal: assessments[i]?.proposal ?? null,
          }),
    })),
  };
}

export function formatExtract(
  meeting: string,
  result: ExtractResult,
  write: WriteOutcome | null,
): string {
  const lines = [`Drafts from ${meeting}`];
  if (result.proposals.length === 0) lines.push("", "Nothing to draft.");
  for (const p of result.proposals) {
    lines.push("", `${p.path}${p.written ? "  written" : ""}`);
    lines.push(...indent(p.diff, "  "));
    for (const issue of p.newIssues) {
      lines.push(`  ${issue.severity} ${issue.message}  [${issue.code}]`);
    }
  }
  const drafts = new Set(result.proposals.map((p) => p.path));
  const elsewhere = result.newIssues.filter((i) => !drafts.has(i.file));
  if (elsewhere.length > 0) {
    lines.push("", "New issues in existing documents");
    for (const i of elsewhere) {
      lines.push(`  ${i.severity} ${i.file}  ${i.message}  [${i.code}]`);
    }
  }
  if (result.dropped.length > 0) {
    lines.push("", "Links removed from drafts");
    for (const d of result.dropped) {
      lines.push(`  ${d.path}: ${d.reference} (${d.reason})`);
    }
  }
  if (result.skipped.length > 0) {
    lines.push("", "Skipped");
    for (const s of result.skipped) lines.push(`  ${s.title}: ${s.reason}`);
  }
  if (write !== null && write.failed.length > 0) {
    lines.push("", "Not written");
    for (const f of write.failed) lines.push(`  ${f.path}: ${f.error}`);
  }
  lines.push(
    "",
    write === null
      ? `${plural(result.proposals.length, "draft")}. Nothing was written; run with --write to create them.`
      : `${plural(result.proposals.filter((p) => p.written).length, "file")} written.`,
  );
  return lines.join("\n");
}

export function extractToJson(
  meeting: string,
  result: ExtractResult,
  write: WriteOutcome | null,
) {
  return {
    meeting,
    written: result.proposals.filter((p) => p.written).map((p) => p.path),
    failed: write?.failed ?? [],
    proposals: result.proposals,
    newIssues: result.newIssues,
    skipped: result.skipped,
    dropped: result.dropped,
  };
}

function counts(record: Record<string, number>): string {
  const entries = Object.entries(record);
  return entries.length === 0
    ? "none"
    : entries.map(([k, n]) => `${k} ${n}`).join(", ");
}

export function formatEstimate(
  report: EstimateReport,
  sizes: Sizes | null,
  markdown: boolean,
  linkBase?: string,
  order: Order = "depth",
): string {
  const stepped = order === "review";
  // Steps right-aligned, so the paths line up past step 9.
  const stepWidth = String(
    report.items.reduce((m, i) => Math.max(m, i.step), 0),
  ).length;
  const sized = new Map(sizes?.items.map((i) => [i.path, i]) ?? []);
  const c = (t: string) => (markdown ? code(t) : t);
  const lines: string[] = [];
  const heading = (t: string) => {
    if (lines.length > 0) lines.push("");
    lines.push(markdown ? `## ${t}` : t);
    if (markdown) lines.push("");
  };
  lines.push(
    markdown
      ? `# Change estimate${report.request ? `: ${c(report.request)}` : ""}`
      : `Change estimate${report.request ? ` for ${report.request}` : ""}`,
    "",
    `Starts from ${report.targets.map(c).join(", ") || "no live document"} and reaches ${plural(report.items.filter((i) => i.depth > 0).length, "more document")}. ${plural(report.items.length, "document")} in all: ${counts(report.byType)}.`,
  );
  if (report.ignored.length > 0) {
    lines.push(`Left out as deprecated: ${report.ignored.map(c).join(", ")}.`);
  }
  heading(stepped ? "Documents, in review order" : "Documents");
  if (markdown) {
    lines.push(
      `|${stepped ? " Step |" : ""} Document | Type | State | Owner | Due | Via |${sizes ? " Size | Hours | Work |" : ""}`,
      `|${stepped ? " --- |" : ""} --- | --- | --- | --- | --- | --- |${sizes ? " --- | --- | --- |" : ""}`,
    );
  }
  const cell = (t: string | null | undefined) =>
    (t ?? "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
  for (const i of stepped ? byReviewOrder(report.items) : report.items) {
    const via = i.via === null ? "(changed)" : `${i.via.kind} -> ${i.via.to}`;
    const s = sized.get(i.path);
    const sizeText = s?.sizing
      ? s.sizing.size
      : s?.error
        ? `error: ${s.error}`
        : "";
    const hours =
      typeof s?.sizing?.hours === "number" ? String(s.sizing.hours) : "";
    const state = `${i.state ?? ""}${i.reopens ? " (reopens)" : ""}`;
    if (markdown) {
      lines.push(
        // docLink already escapes the title for Markdown.
        `|${stepped ? ` ${i.step} |` : ""} ${docLink(i.title, i.path, linkBase, true).replace(/\s*\n\s*/g, " ")} | ${cell(i.type)} | ${cell(state)} | ${cell(i.owners.join(", "))} | ${cell(i.due)} | ${cell(via)} |${sizes ? ` ${cell(sizeText)} | ${hours} | ${cell(s?.sizing?.work)} |` : ""}`,
      );
    } else {
      const facts = [
        i.type,
        state,
        i.owners.length > 0 && `owner ${i.owners.join(", ")}`,
        i.due && `due ${i.due}`,
      ]
        .filter((f) => f)
        .join(", ");
      lines.push(
        `  ${stepped ? `${String(i.step).padStart(stepWidth)}  ` : ""}${i.path}  ${via}${facts ? `  (${facts})` : ""}`,
      );
      // Under the path: two spaces further in than it.
      const under = " ".repeat(stepped ? stepWidth + 6 : 4);
      if (s?.sizing) {
        lines.push(
          `${under}${s.sizing.size}${hours ? `, ${hours}h` : ""}: ${s.sizing.work}`,
        );
      } else if (s?.error) lines.push(`${under}error: ${s.error}`);
    }
  }
  heading("Tasks");
  const tasks = report.items.filter((i) => i.type === "Task");
  lines.push(
    `${markdown ? "- " : "  "}By state: ${counts(report.tasksByState)}`,
  );
  const reopen = tasks.filter((t) => t.reopens);
  if (reopen.length > 0) {
    lines.push(
      `${markdown ? "- " : "  "}Finished tasks to reopen: ${reopen.map((t) => c(t.path)).join(", ")}`,
    );
  }
  lines.push(
    `${markdown ? "- " : "  "}Owners: ${report.owners.length > 0 ? report.owners.join(", ") : "none recorded"}`,
  );
  heading("Milestones at risk");
  if (report.milestones.length === 0) {
    lines.push(
      `${markdown ? "" : "  "}No milestone waits for the affected tasks.`,
    );
  }
  for (const m of report.milestones) {
    lines.push(
      `${markdown ? `- ${docLink(m.title, m.path, linkBase)}` : `  ${m.title} (${m.path})`}${m.due ? `, due ${m.due}` : ""}: blocked by ${m.blockedBy.map(c).join(", ")}`,
    );
  }
  if (sizes !== null) {
    heading("Estimate (LLM)");
    lines.push(
      `${markdown ? "- " : "  "}Sizes: ${counts(sizes.bySize)}`,
      `${markdown ? "- " : "  "}Effort: ${sizes.hours} hours${sizes.unknown > 0 ? ` plus ${plural(sizes.unknown, "document")} without an estimate` : ""}`,
    );
    lines.push(
      "",
      "An LLM's rough guess to support the decision, not a quote. Nothing was written.",
    );
  } else {
    lines.push(
      "",
      "Give --llm <command> (or set ADAPTRACE_LLM) for a size and effort per document.",
    );
  }
  return lines.join("\n");
}

export function estimateToJson(report: EstimateReport, sizes: Sizes | null) {
  return { ...report, ...(sizes === null ? {} : { estimate: sizes }) };
}

const STATUS_LABEL: Record<ProgressStatus, string> = {
  reviewed: "reviewed",
  "to-review": "to review",
  waiting: "waiting",
};

export function formatProgress(
  report: ProgressReport,
  markdown: boolean,
  linkBase?: string,
): string {
  const c = (t: string) => (markdown ? code(t) : t);
  const { counts, items } = report;
  const lines = [
    markdown
      ? `# Review progress: ${c(report.request)}`
      : `Review progress for ${report.request}`,
    "",
  ];
  if (report.badReceivedAt !== null) {
    lines.push(
      `Warning: received_at ${c(report.badReceivedAt)} is not a datetime with a UTC offset, so it is not used.`,
    );
  }
  lines.push(
    report.baseline === null
      ? "The request's date is unknown, so the documents it starts from are not compared with it."
      : `The documents it starts from count as updated when they are not older than ${report.baseline.raw} (${report.baseline.source}).`,
    "",
  );
  if (items.length === 0) {
    lines.push(
      report.deprecated.length > 0
        ? `Every document it reaches is deprecated: ${report.deprecated.map(c).join(", ")}.`
        : "No documents depend on it yet. Link the documents the change starts from to it (for example with derived_from).",
    );
    return lines.join("\n");
  }
  const detail = (i: ProgressReport["items"][number]) => {
    if (i.status === "waiting") {
      return `after ${i.waitingFor.map(c).join(", ")}`;
    }
    if (i.status === "to-review") {
      return i.updated === null
        ? "update date unknown"
        : `older than ${i.newer.map(c).join(", ")}`;
    }
    return i.origin ? "starts the change" : "";
  };
  if (markdown) {
    lines.push(
      "| Step | Status | Document | Detail |",
      "| --- | --- | --- | --- |",
    );
    for (const i of items) {
      lines.push(
        `| ${i.step} | ${STATUS_LABEL[i.status]} | ${docLink(i.title, i.path, linkBase, true).replace(/\s*\n\s*/g, " ")} | ${detail(i).replace(/\|/g, "\\|")} |`,
      );
    }
  } else {
    const width = Math.max(...Object.values(STATUS_LABEL).map((l) => l.length));
    const stepWidth = String(
      items.reduce((m, i) => Math.max(m, i.step), 0),
    ).length;
    for (const i of items) {
      const d = detail(i);
      lines.push(
        `  ${String(i.step).padStart(stepWidth)}  ${STATUS_LABEL[i.status].padEnd(width)}  ${i.path}${d ? `  ${d}` : ""}`,
      );
    }
  }
  lines.push(
    "",
    `${counts.reviewed} of ${plural(items.length, "document")} reviewed: ${counts["to-review"]} to review now, ${counts.waiting} waiting for documents upstream.`,
  );
  return lines.join("\n");
}

export function progressToJson(report: ProgressReport) {
  const { baseline } = report;
  return {
    ...report,
    baseline: baseline
      ? {
          at: baseline.raw,
          utc: baseline.at.toISOString(),
          source: baseline.source,
        }
      : null,
    items: report.items.map((i) => ({ ...i, updated: updatedJson(i.updated) })),
  };
}

// Columns as wide as a terminal shows them: East Asian wide and fullwidth
// characters take two cells.
function cells(text: string): number {
  let n = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    // Combining marks and zero-width characters take no cell.
    if (/\p{M}/u.test(ch) || c === 0x200b || c === 0x200d || c === 0xfe0f) {
      continue;
    }
    n +=
      (c >= 0x1100 && c <= 0x115f) ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe4f) ||
      (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) ||
      (c >= 0x20000 && c <= 0x3fffd) ||
      // Emoji shown as emoji (✅, ⚡); text symbols such as ✓ stay narrow.
      /\p{Emoji_Presentation}/u.test(ch)
        ? 2
        : 1;
  }
  return n;
}

// One line, without control characters (a value could move the cursor or
// change the terminal's title).
const oneLine = (t: string) =>
  t
    .replace(/\s*[\r\n]+\s*/g, " ")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: removing them
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ");

// Words from documents or an LLM, on one line and without control
// characters; in Markdown, escaped, with URLs as code so they are not live
// links (an LLM may have been steered by a document's text).
export function safeWords(t: string, markdown: boolean): string {
  return markdown
    ? oneLine(t)
        .split(/(\b[a-z][a-z0-9+.-]*:\/\/\S+)/i)
        .map((part, i) => (i % 2 === 1 ? code(part) : escapeMarkdown(part)))
        .join("")
    : oneLine(t);
}

export function formatList(
  report: ListReport,
  format: "text" | "markdown" | "csv",
  linkBase?: string,
): string {
  const { columns, rows } = report;
  if (format === "csv") {
    // RFC 4180: quote a field with a comma, quote or line break. A field
    // that a spreadsheet would run as a formula gets a leading "'".
    const field = (raw: string) => {
      const formula = /^[=+\-@\t\r]/.test(raw) && !NUMBER.test(raw.trim());
      const t = formula ? `'${raw}` : raw;
      return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    return [
      ["path", "title", ...columns],
      ...rows.map((r) => [r.path, r.title, ...r.values]),
    ]
      .map((line) => line.map(field).join(","))
      .join("\r\n");
  }
  if (format === "markdown") {
    if (rows.length === 0) return "No documents.";
    const cell = (t: string) => escapeMarkdown(oneLine(t));
    return [
      `| Document | ${columns.map(cell).join(" | ")} |`,
      `| --- | ${columns.map(() => "---").join(" | ")} |`,
      ...rows.map(
        (r) =>
          `| ${oneLine(docLink(r.title, r.path, linkBase, true))} | ${r.values.map(cell).join(" | ")} |`,
      ),
    ].join("\n");
  }
  if (rows.length === 0) return "No documents.";
  const table = [
    ["path", "title", ...columns],
    ...rows.map((r) => [r.path, r.title, ...r.values].map(oneLine)),
  ];
  const widths = table[0]?.map((_, i) =>
    Math.max(...table.map((line) => cells(line[i] ?? ""))),
  );
  const lines = table.map((line) =>
    line
      .map((t, i) =>
        i === line.length - 1
          ? t
          : t + " ".repeat((widths?.[i] ?? 0) - cells(t)),
      )
      .join("  ")
      .trimEnd(),
  );
  return [...lines, "", plural(rows.length, "document")].join("\n");
}

export function listToJson(report: ListReport) {
  return {
    columns: report.columns,
    documents: report.rows.map((r) => ({
      path: r.path,
      title: r.title,
      values: Object.fromEntries(
        report.columns.map((c, i) => [c, r.values[i] ?? ""]),
      ),
    })),
  };
}

export function formatConflicts(
  bundle: Bundle,
  report: ConflictReport,
  markdown: boolean,
  linkBase?: string,
  judged: JudgedPair[] | null = null,
): string {
  const c = (t: string) => (markdown ? code(t) : t);
  const name = (p: string) =>
    markdown
      ? docLink(title(bundle, p), p, linkBase).replace(/\s*\n\s*/g, " ")
      : p;
  const judgmentOf = (a: string, b: string) =>
    judged?.find((j) => j.a === a && j.b === b);
  const lines: string[] = [
    markdown ? "# Overlapping change requests" : "Overlapping change requests",
    "",
    `${plural(report.requests.length, "change request")} not yet decided name what they change.`,
  ];
  if (report.unlinked.length > 0) {
    lines.push(
      `Not compared, no live documents in changes: ${report.unlinked.map(c).join(", ")}.`,
    );
  }
  if (report.pairs.length === 0) {
    lines.push("", "No two of them reach the same documents.");
    return lines.join("\n");
  }
  for (const pair of report.pairs) {
    const types = Object.entries(pair.byType)
      .map(([t, n]) => `${t} ${n}`)
      .join(", ");
    lines.push(
      "",
      markdown
        ? `## ${name(pair.a)} and ${name(pair.b)}`
        : `${pair.a}  and  ${pair.b}`,
    );
    if (markdown) lines.push("");
    const bullet = markdown ? "- " : "  ";
    if (pair.sharedTargets.length > 0) {
      lines.push(
        `${bullet}Both change: ${pair.sharedTargets.map(c).join(", ")}`,
      );
    }
    lines.push(
      `${bullet}Both reach ${plural(pair.overlap.length, "document")} (${types}): ${pair.overlap.map(c).join(", ")}`,
    );
    const j = judgmentOf(pair.a, pair.b);
    // The LLM's words, on one line, and escaped in Markdown: they may have
    // been steered by a request's text.
    // URLs as code, so they are not live links.
    const llmText = (t: string) => safeWords(t, markdown);
    if (j?.judgment) {
      lines.push(
        `${bullet}LLM: ${j.judgment.verdict}: ${llmText(j.judgment.reason)}`,
      );
      for (const d of j.judgment.decide ?? []) {
        lines.push(`${markdown ? "  - " : "    "}To decide: ${llmText(d)}`);
      }
    } else if (j) {
      lines.push(`${bullet}LLM: error: ${llmText(j.error ?? "")}`);
    }
  }
  lines.push(
    "",
    "Overlapping requests may contradict each other. Settle them together before deciding either.",
  );
  if (judged === null) {
    lines.push(
      "Give --llm <command> (or set ADAPTRACE_LLM) to judge whether each pair can both be done.",
    );
  } else {
    const count = (v: string) =>
      judged.filter((j) => j.judgment?.verdict === v).length;
    const errors = judged.filter((j) => j.judgment === null).length;
    lines.push(
      `LLM: conflict: ${count("conflict")}, duplicate: ${count("duplicate")}, compatible: ${count("compatible")}, unclear: ${count("unclear")}${errors > 0 ? `, error: ${errors}` : ""}.`,
      "An LLM's judgment to prepare the meeting that settles them, not a decision. Nothing was written.",
    );
  }
  return lines.join("\n");
}

export function formatMeeting(
  bundle: Bundle,
  result: MeetingResult,
  markdown: boolean,
  linkBase?: string,
): string {
  const { plan } = result;
  const c = (t: string) => (markdown ? code(t) : t);
  const words = (t: string) => safeWords(t, markdown);
  // For the customer, no links: they would point into the repository.
  const name = (p: string) =>
    plan.audience === "customer"
      ? words(title(bundle, p))
      : markdown
        ? oneLine(docLink(title(bundle, p), p, linkBase))
        : p;
  const bullet = markdown ? "- " : "  ";
  const lines: string[] = [];
  const heading = (t: string) => {
    if (lines.length > 0) lines.push("");
    lines.push(markdown ? `## ${t}` : t);
    if (markdown) lines.push("");
  };
  lines.push(
    markdown
      ? `# Meeting to settle change requests (${plan.audience})`
      : `Meeting to settle change requests (${plan.audience})`,
  );
  heading("Change requests");
  for (const r of plan.requests) {
    // A request that is decided or deprecated is said so: settling it
    // again may not be what is meant.
    const status = [
      r.deprecated ? "deprecated" : null,
      r.state ? `state ${r.state}` : null,
    ]
      .filter((x) => x !== null)
      .join(", ");
    const by =
      r.requestedBy.length > 0
        ? `, requested by ${r.requestedBy.map((p) => `${words(p.name)} (${p.side})`).join(", ")}`
        : "";
    // The documents it changes are internal: not in the customer's view.
    const changes =
      plan.audience === "customer"
        ? ""
        : r.targets.length > 0
          ? `; changes ${r.targets.map(c).join(", ")}`
          : r.named
            ? "; changes only deprecated or missing documents"
            : "; names nothing it changes (changes)";
    lines.push(
      `${bullet}${name(r.path)}${status ? ` (${words(status)})` : ""}${by}${changes}`,
    );
  }
  heading("Participants");
  if (plan.participants.length === 0) {
    lines.push(
      plan.unconfirmed.length > 0 || plan.unresolved.length > 0
        ? `${bullet}None known to be internal: see below.`
        : `${bullet}None found: no owner or requested_by.`,
    );
  }
  for (const p of plan.participants) {
    lines.push(
      `${bullet}${words(p.name)} (${p.side})${p.roles.length > 0 ? `: ${p.roles.map(words).join("; ")}` : ""}`,
    );
  }
  if (plan.unconfirmed.length > 0) {
    lines.push(
      `${bullet}Check before inviting (side unknown: a name only, or no Stakeholder document with side): ${plan.unconfirmed.map((p) => words(p.name)).join(", ")}`,
    );
  }
  if (plan.unresolved.length > 0) {
    lines.push(
      `${bullet}Not found, or not a Stakeholder document: ${plan.unresolved.map(c).join(", ")}`,
    );
  }
  heading("Agenda");
  if (plan.audience === "internal") {
    if (plan.pairs.length === 0) {
      lines.push(`${bullet}The requests do not reach the same documents.`);
    }
    for (const pair of plan.pairs) {
      const shared =
        pair.sharedTargets.length > 0
          ? `both change ${pair.sharedTargets.map(c).join(", ")}; `
          : "";
      lines.push(
        `${bullet}${c(pair.a)} and ${c(pair.b)}: ${shared}both reach ${plural(pair.overlap.length, "document")}`,
      );
      const j = result.judged?.find((x) => x.a === pair.a && x.b === pair.b);
      if (j?.judgment) {
        lines.push(
          `${markdown ? "  - " : "    "}LLM: ${j.judgment.verdict}: ${words(j.judgment.reason)}`,
        );
      } else if (j) {
        lines.push(
          `${markdown ? "  - " : "    "}LLM: error: ${words(j.error ?? "")}`,
        );
      }
    }
    if (plan.baselines.length > 0) {
      lines.push(
        `${bullet}Baselines reached (the change control board approves changes to them): ${plan.baselines.map(c).join(", ")}`,
      );
    }
  } else {
    lines.push(
      `${bullet}Internal analysis is left out: share only the requests and what the customer is asked to decide.`,
    );
  }
  for (const d of result.decide) lines.push(`${bullet}To decide: ${words(d)}`);
  if (result.invitation !== null) {
    heading("Invitation (LLM draft)");
    const inv = result.invitation.invitation;
    if (inv === null) {
      lines.push(`${bullet}error: ${words(result.invitation.error ?? "")}`);
    } else {
      // Each line without control characters (an LLM wrote it).
      const body = inv.body
        .split(/\r?\n/)
        .map((l) => oneLine(l))
        .join("\n");
      if (markdown) {
        // As text to copy, not as Markdown to render.
        lines.push(`Subject: ${words(inv.subject)}`, "", fence(body));
      } else {
        lines.push(
          `  Subject: ${oneLine(inv.subject)}`,
          "",
          ...indent(body, "  "),
        );
      }
    }
  }
  heading("Meeting draft");
  const d = result.draft;
  if (d !== null) {
    lines.push(
      `${bullet}${c(d.path)}${d.written ? " (written)" : result.writeError ? ` (not written: ${words(result.writeError)})` : " (not written; --write creates it)"}`,
    );
    if (!markdown) lines.push(...indent(d.diff, "    "));
    for (const i of d.newIssues) {
      lines.push(`${bullet}${i.severity} ${i.file}  ${words(i.message)}`);
    }
  }
  lines.push(
    "",
    "Material for the meeting, not a decision. Scheduling and sending invitations are left to people.",
  );
  return lines.join("\n");
}

const COVERAGE_LABEL = {
  uncovered: "uncovered",
  open: "open",
  covered: "covered",
} as const;

// Requirement coverage: each requirement with the documents that satisfy it,
// then, with a milestone, the work it waits for.
export function formatCoverage(
  report: CoverageReport,
  markdown: boolean,
  linkBase?: string,
): string {
  const lines: string[] = [];
  // In Markdown, a "|" left in a code span (a URL) would split a table cell.
  const w = (t: string) =>
    markdown
      ? safeWords(t, true).replace(/(?<!\\)\|/g, "\\|")
      : safeWords(t, false);
  const doc = (title: string, path: string, table = false) =>
    markdown
      ? oneLine(docLink(title, path, linkBase, table))
      : `${oneLine(title)}  ${oneLine(path)}`;
  const state = (s: { state: string | null }) =>
    s.state === null ? "(no state)" : w(s.state);
  // A satisfier's progress: a requirement's status, a Task's or a
  // Milestone's state; nothing for the others.
  const progress = (
    s: CoverageReport["requirements"][number]["satisfiers"][number],
  ) => (s.status !== null ? s.status : s.done === null ? "" : state(s));
  const m = report.milestone;
  const heading = m
    ? `Requirement coverage for ${markdown ? doc(m.title, m.path) : `${oneLine(m.title)} (${oneLine(m.path)})`}${m.due ? `, due ${w(m.due)}` : ""}`
    : "Requirement coverage";
  lines.push(markdown ? `## ${heading}` : heading, "");
  if (report.requirements.length === 0) {
    lines.push(
      `${markdown ? "" : "  "}No ${report.types.map(w).join(" or ")} documents${m ? " in its scope" : ""}.`,
    );
  } else if (markdown) {
    lines.push("| Status | Requirement | Satisfied by |", "|---|---|---|");
    for (const r of report.requirements) {
      const by =
        r.satisfiers.length === 0
          ? "-"
          : r.satisfiers
              .map(
                (s) =>
                  `${doc(s.title, s.path, true)}${s.type ? ` ${w(s.type)}` : ""}${progress(s) === "" ? "" : ` (${progress(s).replace(/^\((.*)\)$/, "$1")})`}${s.counted ? "" : " (outside the milestone)"}`,
              )
              .join("<br>");
      lines.push(
        `| ${COVERAGE_LABEL[r.status]} | ${doc(r.title, r.path, true)} | ${by} |`,
      );
    }
  } else {
    for (const r of report.requirements) {
      lines.push(
        `  ${COVERAGE_LABEL[r.status].padEnd(9)}  ${doc(r.title, r.path)}`,
      );
      for (const s of r.satisfiers) {
        lines.push(
          `               ${doc(s.title, s.path)}  ${s.type ? w(s.type) : "(no type)"}${progress(s) === "" ? "" : `  ${progress(s)}`}${s.counted ? "" : "  (outside the milestone)"}`,
        );
      }
    }
  }
  const b = report.byStatus;
  lines.push(
    "",
    `${plural(report.requirements.length, "requirement")}: ${b.uncovered} uncovered, ${b.open} open, ${b.covered} covered`,
  );
  if (report.scope !== null) {
    const work = report.scope.filter((i) => i.done !== null);
    const notDone = work.filter((i) => i.done === false);
    lines.push(
      "",
      markdown
        ? `## Work the milestone waits for (${notDone.length} not done of ${work.length})`
        : `Work the milestone waits for (${notDone.length} not done of ${work.length})`,
      "",
    );
    if (work.length === 0) {
      lines.push(`${markdown ? "" : "  "}No tasks or milestones.`);
    } else if (markdown) {
      lines.push("| Work | State | Owner | Due |", "|---|---|---|---|");
      for (const i of work) {
        lines.push(
          `| ${doc(i.title, i.path, true)} | ${state(i)} | ${w(i.owner ?? "")} | ${w(i.due ?? "")}${i.late ? " (after the milestone)" : ""} |`,
        );
      }
    } else {
      for (const i of work) {
        lines.push(
          `  ${i.done ? "done    " : "not done"}  ${doc(i.title, i.path)}${i.done ? "" : `  ${state(i)}`}${i.owner ? `  ${w(i.owner)}` : ""}${i.due ? `  due ${w(i.due)}` : ""}${i.late ? " (after the milestone)" : ""}`,
        );
      }
    }
  }
  return lines.join("\n");
}
