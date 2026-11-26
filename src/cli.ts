#!/usr/bin/env bun
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import pkg from "../package.json";
import { assessContext } from "./assess";
import {
  applySync,
  type Direction,
  loadBacklog,
  loadBacklogConfig,
  nowIso,
  planSync,
} from "./backlog";
import { board, doneState } from "./board";
import { loadBundle } from "./bundle";
import {
  changedBy,
  conflicts,
  conflictsContext,
  type JudgedPair,
  judgePairs,
  SETTLED_STATES,
} from "./conflicts";
import { coverage, DONE_STATES } from "./coverage";
import { validateAll } from "./drift";
import { estimate, estimateContext, size } from "./estimate";
import { extract, extractContext, writeDrafts } from "./extract";
import { buildGraph } from "./graph";
import { health } from "./health";
import { lastUpdated } from "./history";
import {
  byReviewOrder,
  findConcept,
  impact,
  type Order,
  stale,
} from "./impact";
import { init } from "./init";
import { DEFAULT_COLUMNS, list, UPDATED } from "./list";
import { assess, DEFAULT_JOBS } from "./llm";
import {
  type Audience,
  buildInvitationPrompt,
  customerView,
  draftInvitation,
  meetingDraft,
  meetingPlan,
} from "./meeting";
import { migrateDates } from "./migrate";
import {
  assessToJson,
  estimateToJson,
  extractToJson,
  formatAssess,
  formatBoard,
  formatConflicts,
  formatCoverage,
  formatEstimate,
  formatExtract,
  formatHealth,
  formatImpact,
  formatIssues,
  formatList,
  formatMeeting,
  formatProgress,
  formatStale,
  formatSync,
  graphToJson,
  graphToMermaid,
  healthToJson,
  impactToJson,
  listToJson,
  progressToJson,
  staleToJson,
  syncToJson,
} from "./output";
import { progress } from "./progress";
import { proposeFiles } from "./propose";
import { resourceStates } from "./resource";
import { LIFECYCLE_STATUSES } from "./schema";

const DEFAULT_BUNDLE = ".adaptrace";
const DEFAULT_BACKLOG = "backlog";

const USAGE = `Usage: adaptrace <command> [options]

Commands:
  init [bundle]       Create a bundle (index.md, log.md, a folder per type); never overwrites
  validate [bundle]   Check OKF conformance and dependencies (default bundle: ${DEFAULT_BUNDLE}),
                      and dates: documents without generated, bodies changed without a
                      new generated or verified (in git)
  migrate-dates [bundle]
                      Once, for a bundle dated by git: write each undated document's last
                      commit date into generated (shows the plan; --write applies)
  graph [bundle]      Print the dependency graph
  impact <document>   List documents to review when <document> changes
  assess <document>   Show what changed for each direct dependent of <document>;
                      with --llm, judge whether each needs an update and propose one
  extract <meeting>   Draft decisions, tasks, requirements and risks from meeting notes
                      with --llm (shows them; --write creates the new files)
  estimate [<document>...]
                      What changing the documents would reach: tasks, owners, finished
                      work to reopen, milestones at risk; with --llm, size and effort.
                      Without documents, from what --request names in changes
  stale [bundle]      List documents older than what they depend on, whose files (resource,
                      sources) changed, are missing or have no sha256 recorded, or past
                      stale_after
  health [bundle]     Suggestions to tidy the dependencies: live documents that depend on
                      deprecated ones, dependencies already reached through others, and
                      documents with no dependency to or from a live one
  progress <request>  For a change request, which documents it reaches are reviewed, can
                      be reviewed now, or wait for others upstream; exits 1 until all are
                      (0 when no document depends on it yet)
  sync [bundle]       Convert Tasks to and from Backlog.md (shows the plan; --write applies)
  board [bundle]      Show Tasks as a kanban board, grouped by state
  meeting <request>...
                      Prepare the meeting that settles change requests: participants, agenda
                      and a Meeting draft (--write creates it); with --llm, the points to
                      decide and an invitation. --audience internal (default) | customer
  conflicts [bundle]  Change requests not yet decided whose changes reach the same documents
                      (they name what they change in changes); with --llm, whether each
                      pair conflicts, duplicates, is compatible or is unclear
  coverage [bundle]   For each Requirement, the live documents that satisfy it and whether
                      the Tasks among them are done (uncovered, open, covered); with
                      --milestone, only its scope: what it waits for through depends_on and
                      blocks, followed on, and the requirements those documents satisfy
  list [bundle]       A table of documents (a register or a log): --type, --state, --status
                      filter; --columns picks the frontmatter keys; deprecated ones are
                      left out unless --status is given
  mcp [bundle]        Run an MCP server over stdio for AI agents (read and propose only)

Options:
  --format <format>   validate, impact, assess, extract, stale, health, sync, migrate-dates:
                      text | json
                      (default text)
                      graph: mermaid | json (default mermaid)
                      board, estimate, progress: text | markdown | json (default text)
                      list: text | markdown | csv | json (default text)
                      conflicts, meeting, coverage: text | markdown | json (default text)
  --backlog <dir>     sync, board, estimate, mcp: the Backlog.md directory (default ${DEFAULT_BACKLOG})
  --direction <dir>   sync: both | import | export (default both)
  --write             sync: write the changes instead of only showing them
                      extract, meeting: create the drafted files
                      migrate-dates: write generated into the documents
  --resolve <side>    sync: settle conflicts with adaptrace | backlog
  --references        graph: include body links as untyped edges
  --link-base <url>   board, estimate, progress, list, conflicts, meeting, coverage --format markdown: link titles to <url> + path
  --request <doc>     estimate: the change request, given to the LLM as the reason; without
                      documents, the change starts from what it names in changes
  --type <type>       list: only documents of this type (exact match)
                      coverage: the type of the requirements (default Requirement)
  --milestone <doc>   coverage: only the requirements and work in the milestone's scope
  --done <states>     coverage: comma-separated state values that mean a Task is done, in
                      any case (default done)
  --state <state>     list: only documents in this state
  --status <status>   list: only documents with this status (draft | stable | deprecated)
  --columns <keys>    list: comma-separated frontmatter keys ("generated.by" reads a nested
                      key; "updated" is the last update) (default type,state,owner,due,updated)
  --sort <key>        list: sort by this column (numbers as numbers, empty values last)
  --audience <who>    meeting: internal (the team, first) | customer (with the customer)
  --settled <states>  conflicts: comma-separated state values that mean a request is decided,
                      in any case (default approved,accepted,rejected,deferred,implemented,
                      closed,done)
  --order <order>     impact, estimate: depth (nearest first) | review (upstream first, so
                      each document is reviewed once, after what it depends on) (default depth)
  --title <title>     init: the title in index.md (default: the current directory's name)
  --llm <command>     assess, extract, estimate, conflicts, meeting: a command that reads a prompt on
                      stdin and prints a JSON answer (default: $ADAPTRACE_LLM). The answer
                      is not written (meeting --write writes its own draft)
  --all               assess: also dependents that are not older than <document>
  --by <actor>        assess, extract, meeting: generated.by for proposals (default adaptrace/<version>)
  --jobs <n>          assess, estimate, conflicts, meeting: LLM calls at a time (default 4; 1 runs
                      them one by one)
  --timeout <sec>     assess, extract, estimate, conflicts, meeting: time limit for each --llm call
                      (default 300)
  --bundle <dir>      The bundle directory (default ${DEFAULT_BUNDLE}). For
                      validate, graph, stale and health it can also be given as [bundle]
  -h, --help          Show this help
  -v, --version       Show the version`;

class UsageError extends Error {}

async function openBundle(dir: string | undefined) {
  const root = dir ?? DEFAULT_BUNDLE;
  const info = await stat(root).catch(() => null);
  if (!info?.isDirectory())
    throw new UsageError(`bundle directory '${root}' not found`);
  return loadBundle(root);
}

async function isDirectory(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null))?.isDirectory() ?? false;
}

function pickOption(
  name: string,
  value: string | undefined,
  allowed: string[],
): string {
  const picked = value ?? allowed[0];
  if (picked === undefined || !allowed.includes(picked)) {
    throw new UsageError(`${name} must be one of ${allowed.join(", ")}`);
  }
  return picked;
}

function pickOrder(value: string | undefined): Order {
  return pickOption("--order", value, ["depth", "review"]) as Order;
}

function pickFormat(value: string | undefined, allowed: string[]): string {
  const format = value ?? allowed[0];
  if (format === undefined || !allowed.includes(format)) {
    throw new UsageError(`--format must be one of ${allowed.join(", ")}`);
  }
  return format;
}

// --timeout in milliseconds. setTimeout takes at most 2^31 - 1 ms.
function parseTimeout(value: string | undefined): number {
  const seconds = Number(value ?? "300");
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 2_147_483) {
    throw new UsageError(
      "--timeout must be a number of seconds between 0 and 2147483",
    );
  }
  return seconds * 1000;
}

// YYYY-MM-DD in the local time zone, for the log.md heading.
function localDate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function parseJobs(value: string | undefined): number {
  const jobs = Number(value ?? DEFAULT_JOBS);
  if (!Number.isInteger(jobs) || jobs < 1 || jobs > 64) {
    throw new UsageError("--jobs must be a whole number from 1 to 64");
  }
  return jobs;
}

function llmCommand(value: string | undefined): string | undefined {
  const command = value ?? process.env.ADAPTRACE_LLM;
  return command === undefined || command.trim() === "" ? undefined : command;
}

export async function run(args: string[]): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      options: {
        format: { type: "string" },
        references: { type: "boolean" },
        bundle: { type: "string" },
        backlog: { type: "string" },
        direction: { type: "string" },
        write: { type: "boolean" },
        resolve: { type: "string" },
        "link-base": { type: "string" },
        llm: { type: "string" },
        all: { type: "boolean" },
        by: { type: "string" },
        timeout: { type: "string" },
        title: { type: "string" },
        request: { type: "string" },
        order: { type: "string" },
        type: { type: "string" },
        state: { type: "string" },
        status: { type: "string" },
        columns: { type: "string" },
        sort: { type: "string" },
        settled: { type: "string" },
        milestone: { type: "string" },
        done: { type: "string" },
        audience: { type: "string" },
        jobs: { type: "string" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    });
    const [command, dir, ...rest] = positionals;
    if (values.version) {
      console.log(pkg.version);
      return 0;
    }
    if (values.help || command === undefined) {
      console.log(USAGE);
      return 0;
    }
    if (rest.length > 0 && command !== "estimate" && command !== "meeting")
      throw new UsageError(`unexpected argument '${rest[0]}'`);
    // These take a document (or documents) as their positional; the others
    // take the bundle.
    const takesDocument =
      command === "impact" ||
      command === "assess" ||
      command === "extract" ||
      command === "estimate" ||
      command === "progress" ||
      command === "meeting";
    if (!takesDocument && dir !== undefined && values.bundle !== undefined) {
      throw new UsageError(
        "give the bundle either as [bundle] or --bundle, not both",
      );
    }
    const bundleDir = takesDocument ? values.bundle : (values.bundle ?? dir);
    if (command !== "meeting" && values.audience !== undefined) {
      throw new UsageError("--audience is only for meeting");
    }
    if (command !== "conflicts" && values.settled !== undefined) {
      throw new UsageError("--settled is only for conflicts");
    }
    if (command !== "coverage") {
      for (const name of ["milestone", "done"] as const) {
        if (values[name] !== undefined) {
          throw new UsageError(`--${name} is only for coverage`);
        }
      }
    }
    if (
      command !== "list" &&
      command !== "coverage" &&
      values.type !== undefined
    ) {
      throw new UsageError("--type is only for list and coverage");
    }
    if (command !== "list") {
      for (const name of ["state", "status", "columns", "sort"] as const) {
        if (values[name] !== undefined) {
          throw new UsageError(`--${name} is only for list`);
        }
      }
    }

    if (command === "validate") {
      const format = pickFormat(values.format, ["text", "json"]);
      const bundle = await openBundle(bundleDir);
      // The structure, then the dates (missing, or not updated with the
      // content), which need git (ADR-029).
      const issues = validateAll(bundle);
      console.log(
        format === "json"
          ? JSON.stringify(issues, null, 2)
          : formatIssues(issues, bundle),
      );
      return issues.some((i) => i.severity === "error") ? 1 : 0;
    }
    if (command === "graph") {
      const format = pickFormat(values.format, ["mermaid", "json"]);
      const bundle = await openBundle(bundleDir);
      const graph = buildGraph(bundle);
      const references = values.references ?? false;
      console.log(
        format === "json"
          ? JSON.stringify(graphToJson(bundle, graph, references), null, 2)
          : graphToMermaid(bundle, graph, references),
      );
      return 0;
    }
    if (command === "impact") {
      const format = pickFormat(values.format, ["text", "json"]);
      const order = pickOrder(values.order);
      if (dir === undefined) throw new UsageError("impact needs a document");
      const bundle = await openBundle(bundleDir);
      const target = findConcept(bundle, dir);
      if (target === null) {
        throw new UsageError(`'${dir}' is not a document in ${bundle.root}`);
      }
      const report = impact(
        bundle,
        buildGraph(bundle),
        lastUpdated(bundle),
        target,
      );
      if (order === "review") report.affected = byReviewOrder(report.affected);
      console.log(
        format === "json"
          ? JSON.stringify(impactToJson(report), null, 2)
          : formatImpact(report, order),
      );
      return 0;
    }
    if (command === "assess") {
      const format = pickFormat(values.format, ["text", "json"]);
      if (dir === undefined) throw new UsageError("assess needs a document");
      const timeout = parseTimeout(values.timeout);
      const jobs = parseJobs(values.jobs);
      const bundle = await openBundle(bundleDir);
      const target = findConcept(bundle, dir);
      if (target === null) {
        throw new UsageError(`'${dir}' is not a document in ${bundle.root}`);
      }
      const ctx = await assessContext(
        bundle,
        buildGraph(bundle),
        lastUpdated(bundle),
        target,
        { all: values.all ?? false },
      );
      const command = llmCommand(values.llm);
      const assessments =
        command === undefined
          ? null
          : await assess(bundle, ctx, {
              command,
              by: values.by ?? `adaptrace/${pkg.version}`,
              now: nowIso(new Date()),
              timeoutMs: timeout,
              jobs,
            });
      console.log(
        format === "json"
          ? JSON.stringify(assessToJson(ctx, assessments), null, 2)
          : formatAssess(ctx, assessments),
      );
      return assessments?.some(
        (a) => a.judgment === null || (a.error && a.proposal === null),
      )
        ? 1
        : 0;
    }
    if (command === "extract") {
      const format = pickFormat(values.format, ["text", "json"]);
      if (dir === undefined) throw new UsageError("extract needs a meeting");
      const timeout = parseTimeout(values.timeout);
      const llm = llmCommand(values.llm);
      if (llm === undefined) {
        throw new UsageError(
          "extract needs --llm <command> (or ADAPTRACE_LLM); agents can use the MCP tool extract_context",
        );
      }
      const bundle = await openBundle(bundleDir);
      const meeting = findConcept(bundle, dir);
      if (meeting === null) {
        throw new UsageError(`'${dir}' is not a document in ${bundle.root}`);
      }
      const outcome = await extract(
        bundle,
        await extractContext(bundle, meeting),
        {
          command: llm,
          by: values.by ?? `adaptrace/${pkg.version}`,
          now: nowIso(new Date()),
          timeoutMs: timeout,
        },
      );
      if (!outcome.ok) {
        console.error(`adaptrace: ${outcome.error}`);
        return 1;
      }
      const write = values.write
        ? await writeDrafts(bundle.root, outcome.result)
        : null;
      console.log(
        format === "json"
          ? JSON.stringify(
              extractToJson(meeting, outcome.result, write),
              null,
              2,
            )
          : formatExtract(meeting, outcome.result, write),
      );
      // Like validate: errors the drafts would bring, links that had to be
      // removed, or files not written.
      const errors = outcome.result.newIssues.some(
        (i) => i.severity === "error",
      );
      const dropped = outcome.result.dropped.length > 0;
      return errors || dropped || (write?.failed.length ?? 0) > 0 ? 1 : 0;
    }
    if (command === "estimate") {
      const format = pickFormat(values.format, ["text", "markdown", "json"]);
      const order = pickOrder(values.order);
      if (dir === undefined && values.request === undefined) {
        throw new UsageError(
          "estimate needs the documents the change starts from, or --request with a change request that names them in changes",
        );
      }
      const timeout = parseTimeout(values.timeout);
      const jobs = parseJobs(values.jobs);
      const bundle = await openBundle(bundleDir);
      const find = (arg: string) => {
        const found = findConcept(bundle, arg);
        if (found === null) {
          throw new UsageError(`'${arg}' is not a document in ${bundle.root}`);
        }
        return found;
      };
      const request =
        values.request === undefined ? null : find(values.request);
      // Without starting documents, the request's changes (ADR-023).
      const targets =
        dir === undefined && request !== null
          ? changedBy(buildGraph(bundle), request)
          : [...new Set([dir ?? "", ...rest].map(find))];
      if (targets.length === 0) {
        throw new UsageError(
          `${request} names no documents in changes; give the documents the change starts from`,
        );
      }
      const backlogDir = values.backlog ?? DEFAULT_BACKLOG;
      const config = (await isDirectory(backlogDir))
        ? await loadBacklogConfig(backlogDir)
        : undefined;
      const report = estimate(bundle, buildGraph(bundle), targets, {
        request,
        done: doneState(config),
      });
      if (order === "review") report.items = byReviewOrder(report.items);
      const llm = llmCommand(values.llm);
      const sizes =
        llm === undefined
          ? null
          : await size(await estimateContext(bundle, report), {
              command: llm,
              timeoutMs: timeout,
              jobs,
            });
      console.log(
        format === "json"
          ? JSON.stringify(estimateToJson(report, sizes), null, 2)
          : formatEstimate(
              report,
              sizes,
              format === "markdown",
              values["link-base"],
              order,
            ),
      );
      return sizes?.items.some((i) => i.sizing === null) ? 1 : 0;
    }
    if (command === "progress") {
      const format = pickFormat(values.format, ["text", "markdown", "json"]);
      if (dir === undefined) {
        throw new UsageError("progress needs the change request");
      }
      const bundle = await openBundle(bundleDir);
      const request = findConcept(bundle, dir);
      if (request === null) {
        throw new UsageError(`'${dir}' is not a document in ${bundle.root}`);
      }
      const report = progress(
        bundle,
        buildGraph(bundle),
        lastUpdated(bundle),
        request,
      );
      console.log(
        format === "json"
          ? JSON.stringify(progressToJson(report), null, 2)
          : formatProgress(report, format === "markdown", values["link-base"]),
      );
      return report.done ? 0 : 1;
    }
    if (command === "init") {
      const root = bundleDir ?? DEFAULT_BUNDLE;
      const info = await stat(root).catch(() => null);
      if (info !== null && !info.isDirectory()) {
        throw new UsageError(`'${root}' is not a directory`);
      }
      const result = await init(root, {
        title: values.title ?? basename(resolve(".")),
        today: localDate(new Date()),
      });
      for (const p of result.created) console.log(`created ${join(root, p)}`);
      for (const p of result.skipped) console.log(`exists  ${join(root, p)}`);
      return 0;
    }
    if (command === "migrate-dates") {
      const format = pickFormat(values.format, ["text", "json"]);
      const bundle = await openBundle(bundleDir);
      const plan = migrateDates(bundle);
      const set = proposeFiles(bundle, plan.changes);
      const failed: string[] = [];
      if (values.write) {
        for (const p of set.proposals) {
          try {
            await writeFile(join(bundle.root, p.path), p.content);
            p.written = true;
          } catch (e) {
            failed.push(`${p.path}: ${(e as Error).message}`);
          }
        }
      }
      if (format === "json") {
        console.log(
          JSON.stringify(
            {
              documents: plan.changes.map((c, n) => ({
                path: c.path,
                at: c.at,
                written: set.proposals[n]?.written ?? false,
              })),
              uncommitted: plan.uncommitted,
              unreadable: plan.unreadable,
              refused: plan.refused,
              failed,
            },
            null,
            2,
          ),
        );
      } else {
        const lines: string[] = [];
        if (plan.nothingMissing) {
          lines.push("Every document already has generated or timestamp.");
        } else if (plan.refused !== null) {
          lines.push(`Nothing written: ${plan.refused}.`);
        } else if (plan.changes.length === 0) {
          lines.push("No document gets a date written.");
        } else {
          lines.push(
            `${plan.changes.length} ${plan.changes.length === 1 ? "document gets" : "documents get"} the date its last update was taken from until now${values.write ? "" : " (not written; --write writes them)"}:`,
            "",
          );
          for (const p of set.proposals) {
            lines.push(`${p.path}${p.written ? " (written)" : ""}`);
            if (!values.write)
              lines.push(...p.diff.split("\n").map((l) => `  ${l}`));
          }
        }
        if (plan.uncommitted.length > 0) {
          lines.push(
            "",
            `Not committed, or changed since the last commit, so no date to take (commit them and run again, or write generated by hand): ${plan.uncommitted.join(", ")}`,
          );
        }
        if (plan.unreadable.length > 0) {
          lines.push(
            "",
            `generated is not a mapping with by and a readable at (fix it by hand): ${plan.unreadable.join(", ")}`,
          );
        }
        for (const f of failed) lines.push(`error: ${f}`);
        console.log(lines.join("\n"));
      }
      return failed.length > 0 || plan.refused !== null ? 1 : 0;
    }
    if (command === "stale") {
      const format = pickFormat(values.format, ["text", "json"]);
      const bundle = await openBundle(bundleDir);
      const report = stale(
        bundle,
        buildGraph(bundle),
        lastUpdated(bundle),
        new Date(),
        resourceStates(bundle),
      );
      console.log(
        format === "json"
          ? JSON.stringify(staleToJson(report), null, 2)
          : formatStale(report),
      );
      return 0;
    }
    if (command === "health") {
      const format = pickFormat(values.format, ["text", "json"]);
      const bundle = await openBundle(bundleDir);
      const findings = health(bundle, buildGraph(bundle));
      console.log(
        format === "json"
          ? JSON.stringify(healthToJson(findings), null, 2)
          : formatHealth(findings),
      );
      return 0;
    }
    if (command === "sync") {
      const format = pickFormat(values.format, ["text", "json"]);
      const direction = pickOption("--direction", values.direction, [
        "both",
        "import",
        "export",
      ]);
      const resolve =
        values.resolve === undefined
          ? undefined
          : (pickOption("--resolve", values.resolve, [
              "adaptrace",
              "backlog",
            ]) as "adaptrace" | "backlog");
      const bundle = await openBundle(bundleDir);
      const backlogDir = values.backlog ?? DEFAULT_BACKLOG;
      if (!(await isDirectory(backlogDir))) {
        throw new UsageError(`Backlog.md directory '${backlogDir}' not found`);
      }
      const backlog = await loadBacklog(backlogDir);
      const plan = planSync(bundle, backlog, {
        direction: direction as Direction,
        resolve,
        generatedBy: `adaptrace/${pkg.version}`,
      });
      const write = values.write ?? false;
      if (write) await applySync(plan, bundle.root, backlogDir);
      console.log(
        format === "json"
          ? JSON.stringify(syncToJson(plan, write), null, 2)
          : formatSync(plan, write),
      );
      const problems = plan.actions.some((a) =>
        ["conflict", "missing", "unmapped-state", "duplicate-link"].includes(
          a.kind,
        ),
      );
      return problems || plan.errors.length > 0 ? 1 : 0;
    }
    if (command === "board") {
      const format = pickFormat(values.format, ["text", "markdown", "json"]);
      const bundle = await openBundle(bundleDir);
      const backlogDir = values.backlog ?? DEFAULT_BACKLOG;
      const config = (await isDirectory(backlogDir))
        ? await loadBacklogConfig(backlogDir)
        : undefined;
      const columns = board(bundle, buildGraph(bundle), config);
      console.log(
        format === "json"
          ? JSON.stringify({ columns }, null, 2)
          : formatBoard(columns, format === "markdown", values["link-base"]),
      );
      return 0;
    }
    if (command === "coverage") {
      const format = pickFormat(values.format, ["text", "markdown", "json"]);
      const done =
        values.done === undefined
          ? DONE_STATES
          : values.done
              .split(",")
              .map((v) => v.trim())
              .filter((v) => v !== "");
      if (done.length === 0) {
        throw new UsageError("--done needs at least one state value");
      }
      const bundle = await openBundle(bundleDir);
      let milestone: string | undefined;
      if (values.milestone !== undefined) {
        const found = findConcept(bundle, values.milestone);
        if (found === null) {
          throw new UsageError(
            `'${values.milestone}' is not a document in ${bundle.root}`,
          );
        }
        milestone = found;
      }
      const report = coverage(bundle, buildGraph(bundle), {
        milestone,
        types: values.type === undefined ? undefined : [values.type],
        done,
      });
      console.log(
        format === "json"
          ? JSON.stringify(report, null, 2)
          : formatCoverage(report, format === "markdown", values["link-base"]),
      );
      return 0;
    }
    if (command === "conflicts") {
      const format = pickFormat(values.format, ["text", "markdown", "json"]);
      const settled =
        values.settled === undefined
          ? SETTLED_STATES
          : values.settled
              .split(",")
              .map((v) => v.trim())
              .filter((v) => v !== "");
      if (settled.length === 0) {
        throw new UsageError("--settled needs at least one state value");
      }
      const timeout = parseTimeout(values.timeout);
      const jobs = parseJobs(values.jobs);
      const bundle = await openBundle(bundleDir);
      const report = conflicts(bundle, buildGraph(bundle), settled);
      const llm = llmCommand(values.llm);
      const judged =
        llm === undefined || report.pairs.length === 0
          ? llm === undefined
            ? null
            : []
          : await judgePairs(await conflictsContext(bundle, report), {
              command: llm,
              timeoutMs: timeout,
              jobs,
            });
      console.log(
        format === "json"
          ? JSON.stringify(
              {
                ...report,
                pairs: report.pairs.map((p) => {
                  const j = judged?.find((x) => x.a === p.a && x.b === p.b);
                  return j === undefined
                    ? p
                    : {
                        ...p,
                        judgment: j.judgment,
                        ...(j.error ? { error: j.error } : {}),
                      };
                }),
              },
              null,
              2,
            )
          : formatConflicts(
              bundle,
              report,
              format === "markdown",
              values["link-base"],
              judged,
            ),
      );
      return judged?.some((j) => j.judgment === null) ? 1 : 0;
    }
    if (command === "meeting") {
      const format = pickFormat(values.format, ["text", "markdown", "json"]);
      const audience = pickOption("--audience", values.audience, [
        "internal",
        "customer",
      ]) as Audience;
      if (dir === undefined) {
        throw new UsageError("meeting needs the change requests to settle");
      }
      const timeout = parseTimeout(values.timeout);
      const jobs = parseJobs(values.jobs);
      const bundle = await openBundle(bundleDir);
      const requests = [...new Set([dir, ...rest])].map((arg) => {
        const found = findConcept(bundle, arg);
        if (found === null) {
          throw new UsageError(`'${arg}' is not a document in ${bundle.root}`);
        }
        return found;
      });
      const graph = buildGraph(bundle);
      // The full plan is for judging; what is shown, written or given to
      // the LLM for the invitation is the view (ADR-025).
      const plan = meetingPlan(bundle, graph, [...new Set(requests)], audience);
      const view = customerView(plan);
      const llm = llmCommand(values.llm);
      let judged: JudgedPair[] | null = null;
      let invitation: Awaited<ReturnType<typeof draftInvitation>> | null = null;
      // For the customer, no pair judging: its points come from texts that
      // carry internal analysis. The invitation lists points from the
      // requests alone.
      if (llm !== undefined && audience === "internal") {
        const report = {
          requests: plan.requests.filter((r) => r.targets.length > 0),
          pairs: plan.pairs,
          unlinked: [],
        };
        judged = await judgePairs(await conflictsContext(bundle, report), {
          command: llm,
          timeoutMs: timeout,
          jobs,
        });
      }
      const decide = [
        ...new Set((judged ?? []).flatMap((j) => j.judgment?.decide ?? [])),
      ];
      if (llm !== undefined) {
        // For the customer, no request texts: a body may name internal
        // documents in more ways than can be removed. Titles only.
        const texts: Record<string, string> = {};
        if (audience === "internal") {
          for (const r of view.requests) {
            texts[r.path] = await readFile(join(bundle.root, r.path), "utf8");
          }
        }
        invitation = await draftInvitation(
          buildInvitationPrompt(view, texts, decide),
          { command: llm, timeoutMs: timeout },
        );
      }
      const now = new Date();
      let draft = meetingDraft(view, {
        today: localDate(now),
        by: values.by ?? `adaptrace/${pkg.version}`,
        now: nowIso(now),
        decide,
      });
      // Never over an existing file, in any case: -2, -3, ...
      const taken = new Set([...bundle.files].map((f) => f.toLowerCase()));
      for (let n = 2; taken.has(draft.path.toLowerCase()); n++) {
        draft = {
          ...draft,
          path: draft.path.replace(/(-\d+)?\.md$/, `-${n}.md`),
        };
      }
      const proposal = proposeFiles(bundle, [
        { path: draft.path, before: "", text: draft.text },
      ]).proposals[0];
      let writeError: string | null = null;
      if (values.write && proposal) {
        const full = join(bundle.root, draft.path);
        try {
          await mkdir(dirname(full), { recursive: true });
          await writeFile(full, draft.text, { flag: "wx" });
          proposal.written = true;
        } catch (e) {
          writeError = (e as Error).message;
        }
      }
      const result = {
        plan: view,
        // Reasons are internal analysis: for the customer, only failures.
        judged: audience === "customer" ? null : judged,
        decide,
        invitation,
        draft: proposal ?? null,
        writeError,
      };
      console.log(
        format === "json"
          ? JSON.stringify(result, null, 2)
          : formatMeeting(
              bundle,
              result,
              format === "markdown",
              values["link-base"],
            ),
      );
      const failed =
        judged?.some((j) => j.judgment === null) ||
        (invitation !== null && invitation.invitation === null) ||
        writeError !== null;
      return failed ? 1 : 0;
    }
    if (command === "list") {
      const format = pickFormat(values.format, [
        "text",
        "markdown",
        "csv",
        "json",
      ]);
      const columns =
        values.columns === undefined
          ? undefined
          : values.columns.split(",").map((c) => c.trim());
      if (columns?.some((c) => c === "")) {
        throw new UsageError("--columns needs comma-separated keys");
      }
      const fixed = columns?.find((c) => c === "path" || c === "title");
      if (fixed !== undefined) {
        throw new UsageError(`--columns: '${fixed}' is always shown`);
      }
      const twice = columns?.find((c, i) => columns.indexOf(c) !== i);
      if (twice !== undefined) {
        throw new UsageError(`--columns: '${twice}' is given twice`);
      }
      const sort = values.sort?.trim();
      if (sort === "") throw new UsageError("--sort needs a key");
      if (values.status !== undefined) {
        pickOption("--status", values.status, [...LIFECYCLE_STATUSES]);
      }
      const bundle = await openBundle(bundleDir);
      // Git is read only when the last update is shown or sorted on.
      const needsUpdated =
        sort === UPDATED || (columns ?? DEFAULT_COLUMNS).includes(UPDATED);
      const report = list(
        bundle,
        needsUpdated ? lastUpdated(bundle) : new Map(),
        {
          type: values.type,
          state: values.state,
          status: values.status,
          columns,
          sort,
        },
      );
      if (
        sort !== undefined &&
        !["path", "title", UPDATED].includes(sort) &&
        report.rows.length > 0 &&
        !report.rows.some((r) => r.sortKeyFound)
      ) {
        console.error(
          `adaptrace: warning: no document has a value for --sort ${sort}`,
        );
      }
      if (format === "csv") {
        // Every line ends with CRLF, the last one too (RFC 4180): console.log
        // adds the LF. Not process.stdout.write, which a pipe may not take
        // in full before the process exits. The BOM lets spreadsheets (Excel
        // in Japanese in particular) read UTF-8.
        console.log(`\uFEFF${formatList(report, "csv")}\r`);
        return 0;
      }
      console.log(
        format === "json"
          ? JSON.stringify(listToJson(report), null, 2)
          : formatList(
              report,
              format as "text" | "markdown",
              values["link-base"],
            ),
      );
      return 0;
    }
    if (command === "mcp") {
      const bundle = (await openBundle(bundleDir)).root;
      const { serve } = await import("./mcp");
      await serve({ bundle, backlog: values.backlog ?? DEFAULT_BACKLOG });
      return 0;
    }
    throw new UsageError(`unknown command '${command}'`);
  } catch (e) {
    if (
      e instanceof UsageError ||
      (e as { code?: string }).code?.startsWith("ERR_PARSE_ARGS")
    ) {
      console.error(`adaptrace: ${(e as Error).message}\n\n${USAGE}`);
      return 2;
    }
    throw e;
  }
}

if (import.meta.main) {
  process.exit(await run(process.argv.slice(2)));
}
