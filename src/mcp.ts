// MCP server over stdio (ADR-012). Every tool reads the bundle from disk on
// each call. Tools never write files: the propose_* tools return the new
// content, a diff and what validate would say, and a person or the agent's
// own editor applies them (design principle 6 in AGENTS.md).
import { readFile } from "node:fs/promises";
import { posix } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import pkg from "../package.json";
import { assessContext } from "./assess";
import { loadBacklog, loadBacklogConfig, nowIso, planSync } from "./backlog";
import { board, doneState } from "./board";
import { type Bundle, loadBundle } from "./bundle";
import {
  CONFLICTS_INSTRUCTIONS,
  changedBy,
  conflicts,
  conflictsContext,
  SETTLED_STATES,
} from "./conflicts";
import { coverage, DONE_STATES, isWorkType } from "./coverage";
import { validateAll } from "./drift";
import { estimate, estimateContext } from "./estimate";
import { extractContext } from "./extract";
import {
  addVerified,
  editFrontmatter,
  parseDocument,
  serializeDocument,
} from "./frontmatter";
import { buildGraph } from "./graph";
import { health } from "./health";
import { lastUpdated } from "./history";
import { findConcept, impact, stale } from "./impact";
import { customerView, MEETING_INSTRUCTIONS, meetingPlan } from "./meeting";
import {
  assessToJson,
  graphToJson,
  healthToJson,
  impactToJson,
  progressToJson,
  staleToJson,
  syncToJson,
} from "./output";
import { progress } from "./progress";
import { proposal } from "./propose";
import {
  fileSha256,
  localResources,
  recordResources,
  resolveLocal,
  resourceStates,
} from "./resource";
import { RESERVED_FILENAMES } from "./schema";

export interface McpOptions {
  bundle: string;
  backlog: string;
}

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function json(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

const ASSESS_INSTRUCTIONS =
  "For each item, decide whether the document needs an update because of `change`: none (still correct), minor (wording or details) or major (its substance no longer holds). A null change means the earlier version is unknown; compare with `content` of the target. For minor or major, draft the new text with propose_update. For none, propose_update with review: true adds the review to verified, leaving generated as is; for a document with generated.at (or timestamp), the documents that depend on it are then not made out of date. Show the user the proposals; do not write files without their consent.";

const EXTRACT_INSTRUCTIONS =
  "Draft only what the meeting decided, assigned, required or flagged as a risk, and nothing that already exists in `documents` (link to those instead). Draft each with propose_document: frontmatter status: draft and derived_from: /<meeting path>, plus state, owner, due, depends_on, satisfies or blocks where the notes say so. Use the language of the notes. Show the user the drafts; do not write files without their consent.";

const ESTIMATE_INSTRUCTIONS =
  "For each item, estimate how much the change affects it: size none, small (wording or a few lines), medium (a part) or large (its substance or most of its work redone), and the person-hours to update it and do the work it stands for, or unknown. Weigh finished tasks to reopen and milestones at risk. Present it as a rough estimate to support the decision, not a quote, and do not write files.";

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

// A bundle path for a new or existing concept, or an error message. Taken
// literally: unlike a link, "#", "?" and "%" are not special here.
function conceptPath(path: string): string | { error: string } {
  const normalized = posix.normalize(path.replace(/^\/+/, ""));
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    return { error: `'${path}' is outside the bundle` };
  }
  const file = normalized.endsWith(".md") ? normalized : `${normalized}.md`;
  if (
    (RESERVED_FILENAMES as readonly string[]).includes(posix.basename(file))
  ) {
    return { error: `'${file}' is a reserved OKF file, not a concept` };
  }
  return file;
}

// A proposal whose frontmatter would not read back as YAML (a rewritten
// block can meet a layout editFrontmatter does not follow, such as a list
// broken by a comment at column 0) is refused rather than returned.
function proposeIfReadable(
  bundle: Bundle,
  path: string,
  before: string,
  text: string,
) {
  const parsed = parseDocument(text);
  if (!parsed.ok || parsed.frontmatter === null) {
    return fail(
      "the proposed frontmatter would not read back as YAML; edit the document by hand",
    );
  }
  return json(proposal(bundle, path, before, text));
}

function withoutKeys(
  record: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([k]) => !keys.includes(k)),
  );
}

export function createServer(options: McpOptions): McpServer {
  const server = new McpServer({ name: "adaptrace", version: pkg.version });
  const open = () => loadBundle(options.bundle);

  server.registerTool(
    "validate",
    {
      title: "Validate the bundle",
      description:
        "Check OKF conformance and dependencies (missing targets, cycles, deadlocks) of the whole bundle, and the dates: documents without generated, and bodies changed without a new generated or verified.",
      annotations: READ_ONLY,
    },
    async () => json(validateAll(await open())),
  );

  server.registerTool(
    "list_documents",
    {
      title: "List documents",
      description:
        "List concept documents with their type, title, status, state and last update. Filters are exact matches.",
      inputSchema: {
        type: z.string().optional().describe("e.g. Requirement, Task"),
        state: z.string().optional(),
        status: z.string().optional().describe("draft, stable or deprecated"),
      },
      annotations: READ_ONLY,
    },
    async ({ type, state, status }) => {
      const bundle = await open();
      const updated = lastUpdated(bundle);
      const docs = [...bundle.concepts.values()]
        .map((c) => ({
          path: c.path,
          type: c.frontmatter.type ?? null,
          title: c.frontmatter.title ?? null,
          status: c.frontmatter.status ?? "stable",
          state: c.frontmatter.state ?? null,
          updated: updated.get(c.path)?.raw ?? null,
          // A later review that needed no change (verified.at), or null.
          reviewed: updated.get(c.path)?.reviewed?.raw ?? null,
        }))
        .filter(
          (d) =>
            (type === undefined || d.type === type) &&
            (state === undefined || d.state === state) &&
            (status === undefined || d.status === status),
        );
      return json(docs);
    },
  );

  server.registerTool(
    "read_document",
    {
      title: "Read a document",
      description:
        "Read one document: its text, frontmatter, the dependencies it declares and the documents that point at it.",
      inputSchema: {
        path: z
          .string()
          .describe("Bundle path or concept ID, e.g. tasks/mfa.md"),
      },
      annotations: READ_ONLY,
    },
    async ({ path }) => {
      const bundle = await open();
      const found = findConcept(bundle, path);
      if (found === null) return fail(`'${path}' is not a document`);
      const concept = bundle.concepts.get(found);
      const graph = buildGraph(bundle);
      const text = await readFile(posix.join(bundle.root, found), "utf8");
      return json({
        path: found,
        frontmatter: concept?.frontmatter,
        content: text,
        outgoing: graph.edges
          .filter((e) => e.from === found)
          .map(({ to, kind }) => ({ to, kind })),
        incoming: (graph.backlinks.get(found) ?? []).map(({ from, kind }) => ({
          from,
          kind,
        })),
      });
    },
  );

  server.registerTool(
    "graph",
    {
      title: "Dependency graph",
      description: "The dependency graph as nodes, edges and backlinks.",
      inputSchema: {
        references: z
          .boolean()
          .optional()
          .describe("Include body links as untyped edges"),
      },
      annotations: READ_ONLY,
    },
    async ({ references }) => {
      const bundle = await open();
      return json(graphToJson(bundle, buildGraph(bundle), references ?? false));
    },
  );

  server.registerTool(
    "impact",
    {
      title: "Impact of a change",
      description:
        "Documents to review when the given document changes, direct and indirect, with 'needsReview' for those older than it. Review them by ascending 'step' (upstream first), so each is reviewed once, after what it depends on.",
      inputSchema: { document: z.string() },
      annotations: READ_ONLY,
    },
    async ({ document }) => {
      const bundle = await open();
      const target = findConcept(bundle, document);
      if (target === null) return fail(`'${document}' is not a document`);
      return json(
        impactToJson(
          impact(bundle, buildGraph(bundle), lastUpdated(bundle), target),
        ),
      );
    },
  );

  server.registerTool(
    "progress",
    {
      title: "Review progress of a change request",
      description:
        "For each document a change request reaches, upstream first by 'step': 'reviewed', 'to-review' (its upstream is reviewed, but it is older than 'newer' or has no date: review it now) or 'waiting' (for the documents in 'waitingFor'). 'done' is true when all are reviewed. To record a review that needed no change, call propose_update with review: true (it adds to verified).",
      inputSchema: { request: z.string() },
      annotations: READ_ONLY,
    },
    async ({ request }) => {
      const bundle = await open();
      const found = findConcept(bundle, request);
      if (found === null) return fail(`'${request}' is not a document`);
      return json(
        progressToJson(
          progress(bundle, buildGraph(bundle), lastUpdated(bundle), found),
        ),
      );
    },
  );

  server.registerTool(
    "assess_context",
    {
      title: "Material to judge an impact",
      description:
        "For each direct dependent of a changed document: what changed in it since the dependent was last updated (a diff from git) and the dependent's text. Judge each, then draft changes with propose_update.",
      inputSchema: {
        document: z.string(),
        all: z
          .boolean()
          .optional()
          .describe("Also dependents that are not older than the document"),
      },
      annotations: READ_ONLY,
    },
    async ({ document, all }) => {
      const bundle = await open();
      const target = findConcept(bundle, document);
      if (target === null) return fail(`'${document}' is not a document`);
      const ctx = await assessContext(
        bundle,
        buildGraph(bundle),
        lastUpdated(bundle),
        target,
        { all },
      );
      const out = assessToJson(ctx, null);
      return json({
        ...out,
        content: ctx.content,
        items: out.items.map((item, i) => ({
          ...item,
          content: ctx.items[i]?.content,
        })),
        instructions: ASSESS_INSTRUCTIONS,
      });
    },
  );

  server.registerTool(
    "extract_context",
    {
      title: "Material to draft documents from a meeting",
      description:
        "The meeting notes and the documents that already exist, with instructions to draft the decisions, tasks, requirements and risks it produced. Draft each with propose_document.",
      inputSchema: { meeting: z.string() },
      annotations: READ_ONLY,
    },
    async ({ meeting }) => {
      const bundle = await open();
      const found = findConcept(bundle, meeting);
      if (found === null) return fail(`'${meeting}' is not a document`);
      return json({
        ...(await extractContext(bundle, found)),
        instructions: EXTRACT_INSTRUCTIONS,
      });
    },
  );

  server.registerTool(
    "estimate_context",
    {
      title: "Material to estimate a change",
      description:
        "What changing the given documents would reach (documents, tasks by state, owners, finished tasks to reopen, milestones at risk), with the change request and the documents' text, and instructions to size each document. Each item's 'step' is the order to update and review it, upstream first. Nothing is written.",
      inputSchema: {
        documents: z
          .array(z.string())
          .optional()
          .describe(
            "The documents the change starts from; without them, the request's changes",
          ),
        request: z.string().optional().describe("The change request document"),
      },
      annotations: READ_ONLY,
    },
    async ({ documents, request }) => {
      const bundle = await open();
      const targets: string[] = [];
      for (const d of documents ?? []) {
        const found = findConcept(bundle, d);
        if (found === null) return fail(`'${d}' is not a document`);
        if (!targets.includes(found)) targets.push(found);
      }
      const req = request === undefined ? null : findConcept(bundle, request);
      if (request !== undefined && req === null) {
        return fail(`'${request}' is not a document`);
      }
      if (targets.length === 0 && req !== null) {
        targets.push(...changedBy(buildGraph(bundle), req));
      }
      if (targets.length === 0) {
        return fail(
          "give documents, or a request that names what it changes in changes",
        );
      }
      const config = await loadBacklogConfig(options.backlog);
      const report = estimate(bundle, buildGraph(bundle), targets, {
        request: req,
        done: doneState(config),
      });
      const ctx = await estimateContext(bundle, report);
      return json({
        ...report,
        requestContent: ctx.request,
        contents: ctx.contents,
        instructions: ESTIMATE_INSTRUCTIONS,
      });
    },
  );

  server.registerTool(
    "conflicts",
    {
      title: "Change requests that overlap",
      description:
        "Change requests not yet decided (state not in settled) whose changes reach the same documents, through the dependencies: pairs with the documents both would change (sharedTargets) and both reach (overlap). Such requests may contradict each other: read them (read_document) and judge whether they can both be done; to prepare a meeting, the owners of the overlapping documents and each request's requested_by are the people involved. Nothing is written.",
      inputSchema: {
        settled: z
          .array(z.string())
          .min(1)
          .optional()
          .describe(
            `state values that mean decided, in any case (default ${SETTLED_STATES.join(", ")})`,
          ),
      },
      annotations: READ_ONLY,
    },
    async ({ settled }) => {
      const bundle = await open();
      return json(conflicts(bundle, buildGraph(bundle), settled));
    },
  );

  server.registerTool(
    "conflicts_context",
    {
      title: "Material to judge overlapping change requests",
      description:
        "The conflicts result with, for each pair (materials), the documents to read in full, and their text once each by path (texts), and instructions to judge whether both can be done. Nothing is written.",
      inputSchema: {
        settled: z
          .array(z.string())
          .min(1)
          .optional()
          .describe(
            `state values that mean decided, in any case (default ${SETTLED_STATES.join(", ")})`,
          ),
      },
      annotations: READ_ONLY,
    },
    async ({ settled }) => {
      const bundle = await open();
      const report = conflicts(bundle, buildGraph(bundle), settled);
      const contexts = await conflictsContext(bundle, report);
      // Each text once, by path; each pair names the paths to read.
      const texts: Record<string, string> = {};
      for (const c of contexts) {
        texts[c.pair.a] = c.a;
        texts[c.pair.b] = c.b;
        Object.assign(texts, c.targets);
      }
      return json({
        ...report,
        materials: contexts.map((c) => ({
          a: c.pair.a,
          b: c.pair.b,
          targets: Object.keys(c.targets),
          others: c.others,
        })),
        texts,
        instructions: CONFLICTS_INSTRUCTIONS,
      });
    },
  );

  server.registerTool(
    "meeting_context",
    {
      title: "Material to prepare a meeting on change requests",
      description:
        "For the change requests to settle together: the people to invite (names, sides from Stakeholder documents, roles), what the requests change and reach, where they overlap, the baselines they reach, and instructions to draft the agenda, the invitation and a Meeting document. audience internal is the team's meeting first; customer leaves internal analysis out. No contact details are kept in the bundle, nothing is sent and nothing is written.",
      inputSchema: {
        requests: z.array(z.string()).min(1).describe("The change requests"),
        audience: z
          .enum(["internal", "customer"])
          .optional()
          .describe("internal (default) or customer"),
      },
      annotations: READ_ONLY,
    },
    async ({ requests, audience }) => {
      const bundle = await open();
      const found: string[] = [];
      for (const r of requests) {
        const path = findConcept(bundle, r);
        if (path === null) return fail(`'${r}' is not a document`);
        if (!found.includes(path)) found.push(path);
      }
      const plan = meetingPlan(
        bundle,
        buildGraph(bundle),
        found,
        audience ?? "internal",
      );
      // For the customer, the same view as the CLI (ADR-025).
      const view = customerView(plan);
      return json({ ...view, instructions: MEETING_INSTRUCTIONS });
    },
  );

  server.registerTool(
    "stale",
    {
      title: "Stale documents",
      description:
        "Documents older than a direct dependency, whose local files named in resource or sources[].resource changed since their SHA-256 was recorded or have none recorded (kind resource-changed / resource-unrecorded: review the document against the file, then propose_update with review: true, which records the SHA-256 and verified), or past their stale_after.",
      annotations: READ_ONLY,
    },
    async () => {
      const bundle = await open();
      return json(
        staleToJson(
          stale(
            bundle,
            buildGraph(bundle),
            lastUpdated(bundle),
            new Date(),
            resourceStates(bundle),
          ),
        ),
      );
    },
  );

  server.registerTool(
    "health",
    {
      title: "Health of the dependencies",
      description:
        "Suggestions to tidy the dependencies, none of them errors: live documents that still point at a deprecated one, supersedes and changes left out (deprecated-target, with replacedBy: the live documents that supersede it), propagating dependencies already reached through a longer path of the same key over live documents, or listed twice (redundant-dependency, with via), and live documents with no dependency to or from another live one, except replacements of deprecated ones and Stakeholders named in owner or requested_by (orphan). Show each to a person; change nothing without their approval.",
      annotations: READ_ONLY,
    },
    async () => {
      const bundle = await open();
      return json(healthToJson(health(bundle, buildGraph(bundle))));
    },
  );

  server.registerTool(
    "coverage",
    {
      title: "Requirement coverage",
      description:
        "For each requirement (type Requirement unless types is given), the live documents that satisfy it, and its status: uncovered (nothing that counts satisfies it), open (one of them is not done: a Task or a Milestone whose state is not a done one, or a requirement not covered (status)) or covered. With milestone, only the milestone's scope: what it waits for through depends_on and blocks, followed on through Tasks and Milestones and through the Tasks (not those another Milestone waits for) and requirements that satisfy a requirement in it, and the requirements that work (and the milestone) satisfies. A requirement in the scope counts everything that satisfies it; another shown one counts only Tasks and Milestones in the scope (counted false for the others: another release). scope lists the documents in it, nearest first, with owner, due, late (a Task or a Milestone not done, due after the milestone) and, for Tasks and Milestones, done. Nothing is written.",
      inputSchema: {
        milestone: z.string().optional(),
        types: z
          .array(
            z
              .string()
              .trim()
              .min(1)
              .refine((t) => !isWorkType(t), {
                message: "Tasks and Milestones are work, not requirements",
              }),
          )
          .min(1)
          .optional(),
        done: z
          .array(z.string().trim().min(1))
          .min(1)
          .optional()
          .describe(
            `state values that mean a Task or a Milestone is done, in any case (default ${DONE_STATES.join(", ")})`,
          ),
      },
      annotations: READ_ONLY,
    },
    async ({ milestone, types, done }) => {
      const bundle = await open();
      let found: string | undefined;
      if (milestone !== undefined) {
        const path = findConcept(bundle, milestone);
        if (path === null) return fail(`'${milestone}' is not a document`);
        const fm = bundle.concepts.get(path)?.frontmatter;
        if (fm?.type !== "Milestone" || fm.status === "deprecated") {
          return fail(`'${milestone}' is not a live Milestone`);
        }
        found = path;
      }
      return json(
        coverage(bundle, buildGraph(bundle), { milestone: found, types, done }),
      );
    },
  );

  server.registerTool(
    "board",
    {
      title: "Task board",
      description:
        "Tasks grouped by state, with the unfinished tasks each one waits for.",
      annotations: READ_ONLY,
    },
    async () => {
      const bundle = await open();
      const config = await loadBacklogConfig(options.backlog);
      return json({ columns: board(bundle, buildGraph(bundle), config) });
    },
  );

  server.registerTool(
    "sync_plan",
    {
      title: "Backlog.md sync plan",
      description:
        "What `adaptrace sync` would change between Tasks and Backlog.md, including conflicts. Never writes; run `adaptrace sync --write` to apply.",
      inputSchema: {
        direction: z.enum(["both", "import", "export"]).optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ direction }) => {
      const bundle = await open();
      const backlog = await loadBacklog(options.backlog);
      const plan = planSync(bundle, backlog, {
        direction,
        generatedBy: `adaptrace/${pkg.version}`,
      });
      return json(syncToJson(plan, false));
    },
  );

  server.registerTool(
    "propose_document",
    {
      title: "Propose a new document",
      description:
        "Draft a new concept document. Returns its content, a diff and the validate issues it would have. Nothing is written: apply the content yourself after review.",
      inputSchema: {
        path: z
          .string()
          .describe("Bundle path for the new file, e.g. tasks/mfa.md"),
        type: z.string().describe("e.g. Requirement, Decision, Task"),
        title: z.string(),
        frontmatter: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("More keys, e.g. state, depends_on, satisfies"),
        body: z.string().optional(),
        by: z
          .string()
          .optional()
          .describe(
            "Actor for generated.by, e.g. claude-code/1.0 or human:tanaka",
          ),
      },
      annotations: READ_ONLY,
    },
    async ({ path, type, title, frontmatter, body, by }) => {
      const bundle = await open();
      const file = conceptPath(path);
      if (typeof file !== "string") return fail(file.error);
      if (bundle.files.has(file)) {
        return fail(`'${file}' already exists; use propose_update`);
      }
      const text = serializeDocument(
        {
          // type and title are required arguments; frontmatter cannot
          // override them, and generated replaces any legacy timestamp.
          ...withoutKeys(frontmatter ?? {}, [
            "type",
            "title",
            "generated",
            "timestamp",
          ]),
          type,
          title,
          generated: {
            by: by ?? `adaptrace/${pkg.version}`,
            at: nowIso(new Date()),
          },
        },
        body ?? `\n# ${title}\n`,
      );
      return json(proposal(bundle, file, "", text));
    },
  );

  server.registerTool(
    "propose_update",
    {
      title: "Propose a change to a document",
      description:
        "Draft a change to an existing document: set or remove frontmatter keys and/or replace the body; generated is set to now. With review: true and nothing else, record a review that needed no change instead: an entry for now is added to verified and generated stays. Either way, the SHA-256 of the local files named in resource and sources (resource_sha256, sources[].sha256) is set to what they are now with review: true, or with resources: true for an edit. Returns the new content, a diff and the validate issues. Nothing is written.",
      inputSchema: {
        path: z.string(),
        set: z.record(z.string(), z.unknown()).optional(),
        unset: z.array(z.string()).optional(),
        body: z.string().optional().describe("New body, replacing the old one"),
        by: z
          .string()
          .optional()
          .describe(
            "Actor for generated.by (or verified.by with review); its at is set to now",
          ),
        resources: z
          .boolean()
          .optional()
          .describe(
            "With an edit: also record the SHA-256 the files named in resource and sources have now (review: true always does)",
          ),
        review: z
          .boolean()
          .optional()
          .describe(
            "Record a review that needed no change in verified; not with set, unset or body",
          ),
      },
      annotations: READ_ONLY,
    },
    async ({ path, set, unset, body, by, review, resources }) => {
      const bundle = await open();
      const found = findConcept(bundle, path);
      if (found === null) return fail(`'${path}' is not a document`);
      if (unset?.includes("type")) {
        return fail("'type' is required by OKF and cannot be removed");
      }
      if (
        set &&
        "type" in set &&
        (typeof set.type !== "string" || set.type.trim() === "")
      ) {
        return fail("'type' must be a non-empty string");
      }
      const concept = bundle.concepts.get(found);
      const before = await readFile(posix.join(bundle.root, found), "utf8");
      const stamp = {
        by: by ?? `adaptrace/${pkg.version}`,
        at: nowIso(new Date()),
      };
      if (review) {
        // Empty values change nothing; agents often send them.
        if (
          Object.keys(set ?? {}).length > 0 ||
          (unset?.length ?? 0) > 0 ||
          body !== undefined
        ) {
          return fail(
            "review records a review without changes: leave out set, unset and body",
          );
        }
        const reviewed = addVerified(before, stamp);
        if (reviewed === null) {
          return fail(
            "could not add to verified without losing an earlier entry; edit it by hand",
          );
        }
        // Reviewed against the files it names as they are now (ADR-022).
        const record = concept ? recordResources(bundle, concept) : {};
        const text =
          Object.keys(record).length > 0
            ? editFrontmatter(reviewed, record)
            : reviewed;
        return proposeIfReadable(bundle, found, before, text);
      }
      // resources alone would set generated to now with no edit: a review
      // records the files' SHA-256 without that.
      if (
        resources &&
        Object.keys(set ?? {}).length === 0 &&
        (unset?.length ?? 0) === 0 &&
        body === undefined
      ) {
        return fail(
          "resources records the files' sha256 along with an edit; to record them without one, use review: true",
        );
      }
      // With resources: hash the files as the edit leaves the frontmatter,
      // so the caller's own resource and sources are what get hashed, and
      // drop a resource_sha256 left without a local resource.
      const edited = concept && {
        ...concept,
        frontmatter: {
          ...withoutKeys(concept.frontmatter, unset ?? []),
          ...(set ?? {}),
        },
      };
      const record = resources && edited ? recordResources(bundle, edited) : {};
      // A record describes only the file it was computed from: drop it when
      // no local resource is left, or when resource now names a file that
      // cannot be hashed yet.
      const top =
        edited === undefined
          ? undefined
          : localResources(bundle, edited).find((r) => r.key === "resource");
      // The old record goes when resource is removed or moved, unless the
      // new file is hashed (resources) and matches it.
      // Moved means it names another file now (not just written another
      // way), or it is gone.
      const moved =
        concept !== undefined &&
        (unset?.includes("resource") ||
          (set?.resource !== undefined &&
            resolveLocal(bundle, concept, set.resource) !==
              resolveLocal(bundle, concept, concept.frontmatter.resource)));
      const leftover =
        moved &&
        edited !== undefined &&
        edited.frontmatter.resource_sha256 !== undefined &&
        !(set && "resource_sha256" in set) &&
        (top === undefined || !resources || fileSha256(top.file) === null)
          ? ["resource_sha256"]
          : [];
      const text = editFrontmatter(
        before,
        {
          ...withoutKeys(set ?? {}, ["generated", ...leftover]),
          ...record,
          generated: stamp,
        },
        [...(unset ?? []), ...leftover, "timestamp"],
        body,
      );
      return proposeIfReadable(bundle, found, before, text);
    },
  );

  return server;
}

// Serves until the client closes stdin.
export async function serve(options: McpOptions): Promise<void> {
  const server = createServer(options);
  const closed = new Promise<void>((resolve) => {
    process.stdin.once("end", resolve);
    process.stdin.once("close", resolve);
  });
  await server.connect(new StdioServerTransport());
  await closed;
  await server.close();
}
