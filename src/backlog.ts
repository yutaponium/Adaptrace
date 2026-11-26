// Two-way conversion between Adaptrace Task concepts and Backlog.md tasks
// (ADR-011). Backlog.md is read and written as files only (ADR-002).
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { posix } from "node:path";
import type { Bundle, Concept } from "./bundle";
import {
  type Frontmatter,
  parseDocument,
  serializeDocument,
} from "./frontmatter";
import { resolvePath } from "./links";

// Backlog.md keys that map onto Adaptrace keys. Every other Backlog.md key is
// carried in the Adaptrace frontmatter under backlog.fields.
const MAPPED_KEYS = new Set([
  "id",
  "title",
  "status",
  "labels",
  "dependencies",
  "updated_date",
]);

const TASK_DIRS = ["tasks", "completed"];
// Not synced, but their IDs are taken.
const RESERVED_DIRS = ["drafts", "archive/tasks", "archive/drafts"];
// A Backlog.md id becomes part of a file name, so it must be a plain name.
const SAFE_ID = /^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u;

export interface BacklogConfig {
  statuses: string[];
  defaultStatus: string;
  prefix: string;
}

export interface BacklogTask {
  // Path relative to the Backlog.md directory, e.g. "tasks/back-1 - X.md".
  path: string;
  id: string;
  frontmatter: Frontmatter;
  body: string;
}

export interface Backlog {
  root: string;
  config: BacklogConfig;
  tasks: Map<string, BacklogTask>; // by normalized id
  // Normalized ids in drafts and archives, which new ids must not reuse.
  reservedIds: Set<string>;
  // Archived tasks (archive/tasks, archive/drafts): normalized id -> path.
  archived: Map<string, string>;
  errors: { path: string; message: string }[];
}

// The fields both sides share, in one comparable shape. A task is in sync
// when both sides produce the same view.
export interface TaskView {
  title: string;
  state: string | null;
  tags: string[];
  dependencies: string[]; // Backlog.md IDs, normalized
  body: string;
  fields: Record<string, unknown>;
}

export function normalizeId(id: string): string {
  return id.trim().toUpperCase();
}

// "In Progress" -> "in_progress". Used to map Backlog.md statuses to state.
export function slug(status: string): string {
  return status
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return value === "" ? [] : [value];
  return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
}

function normalizeBody(body: string): string {
  return body.replace(/^\n+/, "").replace(/\s+$/, "");
}

export async function loadBacklogConfig(root: string): Promise<BacklogConfig> {
  const config: BacklogConfig = {
    statuses: ["To Do", "In Progress", "Done"],
    defaultStatus: "To Do",
    prefix: "task",
  };
  const text = await readFile(posix.join(root, "config.yml"), "utf8").catch(
    () => null,
  );
  if (text !== null) {
    const raw = (Bun.YAML.parse(text) ?? {}) as Record<string, unknown>;
    const statuses = strings(raw.statuses);
    if (statuses.length > 0) config.statuses = statuses;
    if (typeof raw.default_status === "string") {
      config.defaultStatus = raw.default_status;
    }
    if (typeof raw.task_prefix === "string") config.prefix = raw.task_prefix;
  }
  return config;
}

export async function loadBacklog(root: string): Promise<Backlog> {
  const config = await loadBacklogConfig(root);
  const backlog: Backlog = {
    root,
    config,
    tasks: new Map(),
    reservedIds: new Set(),
    archived: new Map(),
    errors: [],
  };
  // A task in drafts/ is not archived, even if an archived copy is left.
  const drafts = new Set<string>();
  for (const dir of RESERVED_DIRS) {
    const names = await readdir(posix.join(root, dir)).catch(() => []);
    for (const name of names.sort()) {
      if (!name.endsWith(".md")) continue;
      const parsed = parseDocument(
        await readFile(posix.join(root, dir, name), "utf8"),
      );
      const id = parsed.ok ? parsed.frontmatter?.id : undefined;
      if (typeof id !== "string") continue;
      backlog.reservedIds.add(normalizeId(id));
      const key = normalizeId(id);
      if (dir === "drafts") drafts.add(key);
      else if (!backlog.archived.has(key)) {
        backlog.archived.set(key, `${dir}/${name}`);
      }
    }
  }
  for (const key of drafts) backlog.archived.delete(key);
  for (const dir of TASK_DIRS) {
    const names = await readdir(posix.join(root, dir)).catch(() => []);
    for (const name of names.sort()) {
      if (!name.endsWith(".md") || name.toLowerCase() === "readme.md") continue;
      const path = `${dir}/${name}`;
      const parsed = parseDocument(
        await readFile(posix.join(root, path), "utf8"),
      );
      if (!parsed.ok || parsed.frontmatter === null) {
        backlog.errors.push({
          path,
          message: parsed.ok ? "missing frontmatter" : parsed.error,
        });
        continue;
      }
      const id = parsed.frontmatter.id;
      if (typeof id !== "string" || id.trim() === "") {
        backlog.errors.push({ path, message: "missing 'id'" });
        continue;
      }
      if (!SAFE_ID.test(id.trim())) {
        backlog.errors.push({
          path,
          message: `id '${id}' must be letters, digits, '.', '_' or '-'`,
        });
        continue;
      }
      const key = normalizeId(id);
      if (backlog.tasks.has(key)) {
        backlog.errors.push({ path, message: `duplicate id '${id}'` });
        continue;
      }
      backlog.tasks.set(key, {
        path,
        id,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
      });
    }
  }
  return backlog;
}

interface LinkInfo {
  id: string;
  sync: string | null;
  fields: Record<string, unknown>;
  unmappedDependencies: string[];
}

function linkInfo(concept: Concept): LinkInfo | null {
  const raw = concept.frontmatter.backlog;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const b = raw as Record<string, unknown>;
  if (typeof b.id !== "string" || b.id.trim() === "") return null;
  return {
    id: b.id,
    sync: typeof b.sync === "string" ? b.sync : null,
    fields:
      b.fields !== null && typeof b.fields === "object"
        ? { ...(b.fields as Record<string, unknown>) }
        : {},
    unmappedDependencies: strings(b.unmapped_dependencies).map(normalizeId),
  };
}

function isTask(concept: Concept): boolean {
  return concept.frontmatter.type === "Task";
}

// Adaptrace task path -> Backlog.md id, for the tasks that are linked, and
// the paths of tasks that share a backlog.id with another task.
function linkedIds(bundle: Bundle): {
  ids: Map<string, string>;
  duplicates: Map<string, string[]>;
} {
  const ids = new Map<string, string>();
  const byId = new Map<string, string[]>();
  for (const concept of bundle.concepts.values()) {
    const link = isTask(concept) ? linkInfo(concept) : null;
    if (!link) continue;
    const id = normalizeId(link.id);
    ids.set(concept.path, id);
    byId.set(id, [...(byId.get(id) ?? []), concept.path]);
  }
  const duplicates = new Map<string, string[]>();
  for (const [id, paths] of byId) {
    if (paths.length > 1) {
      duplicates.set(id, paths);
      for (const path of paths) ids.delete(path);
    }
  }
  return { ids, duplicates };
}

// Per-task sides for --resolve: each key (a bundle path or a Backlog.md id)
// must name a task linked on both sides, and a task may get one side only.
// Returns the sides by bundle path, or an error message.
export function resolveTaskSides(
  bundle: Bundle,
  backlog: Backlog,
  entries: [string, "adaptrace" | "backlog"][],
): Map<string, "adaptrace" | "backlog"> | { error: string } {
  const { ids, duplicates } = linkedIds(bundle);
  const pathById = new Map([...ids].map(([path, id]) => [id, path]));
  const sides = new Map<string, "adaptrace" | "backlog">();
  for (const [key, side] of entries) {
    const duplicated = [...duplicates].find(
      ([id, paths]) => id === normalizeId(key) || paths.includes(key),
    );
    if (duplicated) {
      return {
        error: `--resolve ${key}=${side}: backlog.id ${duplicated[0]} is shared by ${duplicated[1].join(", ")}; give each Task its own`,
      };
    }
    const path = ids.has(key) ? key : pathById.get(normalizeId(key));
    if (path === undefined) {
      return {
        error: `--resolve ${key}=${side}: not a Task linked to a Backlog.md task (by its path or backlog.id)`,
      };
    }
    if (backlog.archived.has(ids.get(path) ?? "")) {
      return {
        error: `--resolve ${key}=${side}: ${path} links to ${ids.get(path)}, which is archived in Backlog.md; there is nothing to resolve`,
      };
    }
    if (!backlog.tasks.has(ids.get(path) ?? "")) {
      return {
        error: `--resolve ${key}=${side}: ${path} links to ${ids.get(path)}, which is not in Backlog.md`,
      };
    }
    const before = sides.get(path);
    if (before !== undefined && before !== side) {
      return {
        error: `--resolve ${key}=${side}: ${path} is already given ${before}`,
      };
    }
    sides.set(path, side);
  }
  return sides;
}

function adaptraceView(
  concept: Concept,
  link: LinkInfo | null,
  ids: Map<string, string>,
): TaskView {
  const fm = concept.frontmatter;
  const dependencies = new Set(link?.unmappedDependencies ?? []);
  for (const target of strings(fm.depends_on)) {
    const path = resolvePath(target, concept.path);
    const id =
      path === null ? undefined : (ids.get(path) ?? ids.get(`${path}.md`));
    if (id) dependencies.add(id);
  }
  return {
    title: typeof fm.title === "string" ? fm.title : "",
    state: typeof fm.state === "string" ? fm.state : null,
    tags: strings(fm.tags).sort(),
    dependencies: [...dependencies].sort(),
    body: normalizeBody(concept.body),
    fields: link?.fields ?? {},
  };
}

function backlogView(task: BacklogTask): TaskView {
  const fm = task.frontmatter;
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fm)) {
    if (!MAPPED_KEYS.has(key)) fields[key] = value;
  }
  return {
    title: typeof fm.title === "string" ? fm.title : "",
    state: typeof fm.status === "string" ? slug(fm.status) : null,
    tags: strings(fm.labels).sort(),
    dependencies: strings(fm.dependencies).map(normalizeId).sort(),
    body: normalizeBody(task.body),
    fields,
  };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

export function viewHash(view: TaskView): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(view)))
    .digest("hex")
    .slice(0, 16);
}

function changedFields(a: TaskView, b: TaskView): string[] {
  return (Object.keys(a) as (keyof TaskView)[]).filter(
    (k) => JSON.stringify(canonical(a[k])) !== JSON.stringify(canonical(b[k])),
  );
}

export type SyncAction =
  | { kind: "export-new"; adaptrace: string; id: string; backlogPath: string }
  | {
      kind: "export";
      adaptrace: string;
      id: string;
      backlogPath: string;
      fields: string[];
    }
  | { kind: "import-new"; adaptrace: string; id: string; backlogPath: string }
  | {
      kind: "import";
      adaptrace: string;
      id: string;
      backlogPath: string;
      fields: string[];
    }
  | { kind: "link"; adaptrace: string; id: string; backlogPath: string }
  | {
      kind: "conflict";
      adaptrace: string;
      id: string;
      backlogPath: string;
      fields: string[];
    }
  | { kind: "missing"; adaptrace: string; id: string }
  | {
      kind: "archived";
      adaptrace: string;
      id: string;
      backlogPath: string;
      // The Adaptrace side changed since the last sync: never exported.
      changed: boolean;
    }
  | { kind: "duplicate-link"; adaptrace: string; id: string; others: string[] }
  | {
      kind: "pending";
      adaptrace: string;
      id: string;
      backlogPath: string;
      side: "adaptrace" | "backlog";
      fields: string[];
    }
  | { kind: "unmapped-state"; adaptrace: string; state: string };

export interface SyncPlan {
  actions: SyncAction[];
  inSync: number;
  errors: { path: string; message: string }[];
  // Internal: what to write for each action, filled by planSync.
  writes: Write[];
}

export type Direction = "both" | "import" | "export";

interface Write {
  // Relative to the bundle root ("adaptrace") or the Backlog.md root.
  side: "adaptrace" | "backlog";
  path: string;
  frontmatter: Frontmatter;
  body: string;
}

function statusFor(state: string | null, config: BacklogConfig): string | null {
  if (state === null) return config.defaultStatus;
  return config.statuses.find((s) => slug(s) === state) ?? null;
}

function titleForFilename(title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|#%]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
  return cleaned === "" ? "untitled" : cleaned.slice(0, 80);
}

function nextIds(backlog: Backlog): () => string {
  const prefix = backlog.config.prefix;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}-(\\d+)$`, "i");
  let max = 0;
  const taken = [
    ...[...backlog.tasks.values()].map((t) => t.id),
    ...backlog.reservedIds,
  ];
  for (const id of taken) {
    const n = pattern.exec(id)?.[1];
    if (n !== undefined) max = Math.max(max, Number(n));
  }
  return () => `${prefix.toUpperCase()}-${++max}`;
}

export function nowIso(now: Date): string {
  return `${now.toISOString().slice(0, 19)}Z`;
}

function backlogFrontmatter(
  base: Frontmatter,
  id: string,
  view: TaskView,
  status: string,
  now: Date,
): Frontmatter {
  const fm: Frontmatter = {};
  // Keep the existing key order, then add what is missing.
  for (const key of Object.keys(base)) {
    if (MAPPED_KEYS.has(key) || key in view.fields) fm[key] = base[key];
  }
  Object.assign(fm, view.fields, {
    id,
    title: view.title,
    status,
    labels: view.tags,
    dependencies: view.dependencies,
    updated_date: nowIso(now),
  });
  const ordered: Frontmatter = { id, title: view.title, status };
  for (const [k, v] of Object.entries(fm)) if (!(k in ordered)) ordered[k] = v;
  return ordered;
}

function adaptraceFrontmatter(
  base: Frontmatter,
  conceptPath: string,
  view: TaskView,
  id: string,
  sync: string,
  pathsById: Map<string, string>,
  generatedBy: string,
  now: Date,
  touchContent: boolean,
): Frontmatter {
  const fm: Frontmatter = { ...base, type: "Task", title: view.title };
  if (view.state === null) delete fm.state;
  else fm.state = view.state;
  if (view.tags.length > 0) fm.tags = view.tags;
  else delete fm.tags;
  // depends_on: keep entries that are not linked Backlog.md tasks, then add
  // the Backlog.md dependencies that have an Adaptrace task.
  const linked = new Set(pathsById.values());
  const kept = strings(base.depends_on).filter((t) => {
    const p = resolvePath(t, conceptPath);
    return p === null || !(linked.has(p) || linked.has(`${p}.md`));
  });
  const unmapped: string[] = [];
  const mapped: string[] = [];
  for (const dep of view.dependencies) {
    const path = pathsById.get(dep);
    if (path) mapped.push(`/${path}`);
    else unmapped.push(dep);
  }
  const dependsOn = [...kept, ...mapped];
  if (dependsOn.length > 0) fm.depends_on = dependsOn;
  else delete fm.depends_on;
  const backlog: Record<string, unknown> = { id, sync };
  if (Object.keys(view.fields).length > 0) backlog.fields = view.fields;
  if (unmapped.length > 0) backlog.unmapped_dependencies = unmapped;
  fm.backlog = backlog;
  if (touchContent) {
    fm.generated = { by: generatedBy, at: nowIso(now) };
    delete fm.timestamp;
  }
  return fm;
}

// Decides, per task, which side changed since the last sync (by comparing
// each side's view with the hash recorded in backlog.sync) and what to write.
export function planSync(
  bundle: Bundle,
  backlog: Backlog,
  options: {
    direction?: Direction;
    // Settles conflicts in favor of one side; without it they are reported.
    resolve?: "adaptrace" | "backlog";
    // Per task, by bundle path (tasks/a.md) or Backlog.md id (back-7); it
    // comes before resolve.
    resolveTasks?: Map<string, "adaptrace" | "backlog">;
    now?: Date;
    generatedBy: string;
    tasksDir?: string;
  },
): SyncPlan {
  const direction = options.direction ?? "both";
  // The side a conflict on this task is settled to, if any.
  const byId = new Map(
    [...(options.resolveTasks ?? [])].map(([k, v]) => [normalizeId(k), v]),
  );
  const sideFor = (path: string, id: string) =>
    options.resolveTasks?.get(path) ??
    byId.get(normalizeId(id)) ??
    options.resolve;
  const now = options.now ?? new Date();
  const tasksDir = options.tasksDir ?? "tasks";
  const plan: SyncPlan = {
    actions: [],
    inSync: 0,
    errors: [...backlog.errors],
    writes: [],
  };
  const { ids, duplicates } = linkedIds(bundle);
  for (const [id, paths] of duplicates) {
    for (const path of paths) {
      plan.actions.push({
        kind: "duplicate-link",
        adaptrace: path,
        id,
        others: paths.filter((p) => p !== path),
      });
    }
  }
  const duplicated = new Set([...duplicates.values()].flat());
  const nextId = nextIds(backlog);
  // Backlog.md id -> Adaptrace path, including tasks this run will create.
  const pathsById = new Map<string, string>();
  for (const [path, id] of ids) pathsById.set(id, path);
  const imports: BacklogTask[] = [];
  for (const [key, task] of backlog.tasks) {
    if (pathsById.has(key) || duplicates.has(key)) continue;
    if (direction === "export") continue;
    let path = `${tasksDir}/${task.id.toLowerCase()}.md`;
    for (let n = 2; bundle.concepts.has(path); n++) {
      path = `${tasksDir}/${task.id.toLowerCase()}-${n}.md`;
    }
    pathsById.set(key, path);
    imports.push(task);
  }
  // Ids for Adaptrace tasks that will be exported for the first time.
  const exportIds = new Map<string, string>();
  const prefixOk = SAFE_ID.test(`${backlog.config.prefix}-1`);
  if (!prefixOk) {
    plan.errors.push({
      path: "config.yml",
      message: `task_prefix '${backlog.config.prefix}' must be letters, digits, '.', '_' or '-'; new tasks are not exported`,
    });
  }
  if (direction !== "import" && prefixOk) {
    for (const concept of bundle.concepts.values()) {
      if (!isTask(concept) || linkInfo(concept)) continue;
      // A task whose state has no status is skipped, so it gets no id.
      const state = concept.frontmatter.state;
      if (
        statusFor(typeof state === "string" ? state : null, backlog.config) ===
        null
      ) {
        continue;
      }
      const id = nextId();
      exportIds.set(concept.path, id);
      ids.set(concept.path, normalizeId(id));
      pathsById.set(normalizeId(id), concept.path);
    }
  }

  const exportTo = (
    concept: Concept,
    original: TaskView,
    id: string,
    existing: BacklogTask | null,
    fields: string[],
  ) => {
    const status = statusFor(original.state, backlog.config);
    if (status === null) {
      plan.actions.push({
        kind: "unmapped-state",
        adaptrace: concept.path,
        state: original.state ?? "",
      });
      return;
    }
    // Write both sides from the same view, so the next run sees them in sync:
    // a missing state becomes the default status, and a new task records the
    // created_date that Backlog.md keeps.
    const view: TaskView = {
      ...original,
      state: slug(status),
      fields:
        existing === null && original.fields.created_date === undefined
          ? { ...original.fields, created_date: nowIso(now) }
          : original.fields,
    };
    const backlogPath =
      existing?.path ??
      `tasks/${id.toLowerCase()} - ${titleForFilename(view.title)}.md`;
    plan.actions.push(
      existing
        ? { kind: "export", adaptrace: concept.path, id, backlogPath, fields }
        : { kind: "export-new", adaptrace: concept.path, id, backlogPath },
    );
    plan.writes.push({
      side: "backlog",
      path: backlogPath,
      frontmatter: backlogFrontmatter(
        existing?.frontmatter ?? {},
        id,
        view,
        status,
        now,
      ),
      body: view.body,
    });
    plan.writes.push({
      side: "adaptrace",
      path: concept.path,
      frontmatter: adaptraceFrontmatter(
        concept.frontmatter,
        concept.path,
        view,
        id,
        viewHash(view),
        pathsById,
        options.generatedBy,
        now,
        false,
      ),
      body: concept.body,
    });
  };

  const importFrom = (
    task: BacklogTask,
    view: TaskView,
    path: string,
    base: Frontmatter,
    isNew: boolean,
    fields: string[],
  ) => {
    plan.actions.push(
      isNew
        ? {
            kind: "import-new",
            adaptrace: path,
            id: task.id,
            backlogPath: task.path,
          }
        : {
            kind: "import",
            adaptrace: path,
            id: task.id,
            backlogPath: task.path,
            fields,
          },
    );
    plan.writes.push({
      side: "adaptrace",
      path,
      frontmatter: adaptraceFrontmatter(
        base,
        path,
        view,
        task.id,
        viewHash(view),
        pathsById,
        options.generatedBy,
        now,
        true,
      ),
      body: `\n${view.body}\n`,
    });
  };

  for (const concept of bundle.concepts.values()) {
    if (!isTask(concept)) continue;
    if (duplicated.has(concept.path)) continue;
    const link = linkInfo(concept);
    if (link === null) {
      const id = exportIds.get(concept.path);
      if (id !== undefined) {
        exportTo(concept, adaptraceView(concept, null, ids), id, null, []);
      } else if (direction !== "import" && prefixOk) {
        const state = concept.frontmatter.state;
        plan.actions.push({
          kind: "unmapped-state",
          adaptrace: concept.path,
          state: typeof state === "string" ? state : "",
        });
      }
      continue;
    }
    const task = backlog.tasks.get(normalizeId(link.id));
    // Archived in Backlog.md: reported, but not a problem.
    const archivedPath =
      task === undefined
        ? backlog.archived.get(normalizeId(link.id))
        : undefined;
    if (archivedPath !== undefined) {
      plan.actions.push({
        kind: "archived",
        adaptrace: concept.path,
        id: link.id,
        backlogPath: archivedPath,
        changed: viewHash(adaptraceView(concept, link, ids)) !== link.sync,
      });
      continue;
    }
    if (task === undefined) {
      plan.actions.push({
        kind: "missing",
        adaptrace: concept.path,
        id: link.id,
      });
      continue;
    }
    const mine = adaptraceView(concept, link, ids);
    const theirs = backlogView(task);
    const mineHash = viewHash(mine);
    const theirsHash = viewHash(theirs);
    if (mineHash === theirsHash) {
      if (link.sync === mineHash) {
        plan.inSync++;
      } else {
        // Same content on both sides but no record of it: just record it.
        plan.actions.push({
          kind: "link",
          adaptrace: concept.path,
          id: task.id,
          backlogPath: task.path,
        });
        plan.writes.push({
          side: "adaptrace",
          path: concept.path,
          frontmatter: adaptraceFrontmatter(
            concept.frontmatter,
            concept.path,
            mine,
            task.id,
            mineHash,
            pathsById,
            options.generatedBy,
            now,
            false,
          ),
          body: concept.body,
        });
      }
      continue;
    }
    const fields = changedFields(mine, theirs);
    const mineChanged = link.sync !== mineHash;
    const theirsChanged = link.sync !== theirsHash;
    const canExport = direction !== "import";
    const canImport = direction !== "export";
    const pending = (side: "adaptrace" | "backlog") =>
      plan.actions.push({
        kind: "pending",
        adaptrace: concept.path,
        id: task.id,
        backlogPath: task.path,
        side,
        fields,
      });
    if (mineChanged && !theirsChanged) {
      if (canExport) exportTo(concept, mine, task.id, task, fields);
      else pending("adaptrace");
    } else if (theirsChanged && !mineChanged && !canImport) {
      pending("backlog");
    } else if (theirsChanged && !mineChanged) {
      importFrom(
        task,
        theirs,
        concept.path,
        concept.frontmatter,
        false,
        fields,
      );
    } else if (
      mineChanged &&
      theirsChanged &&
      sideFor(concept.path, task.id) === "adaptrace" &&
      canExport
    ) {
      exportTo(concept, mine, task.id, task, fields);
    } else if (
      mineChanged &&
      theirsChanged &&
      sideFor(concept.path, task.id) === "backlog" &&
      canImport
    ) {
      importFrom(
        task,
        theirs,
        concept.path,
        concept.frontmatter,
        false,
        fields,
      );
    } else if (mineChanged && theirsChanged) {
      plan.actions.push({
        kind: "conflict",
        adaptrace: concept.path,
        id: task.id,
        backlogPath: task.path,
        fields,
      });
    }
  }
  for (const task of imports) {
    const path = pathsById.get(normalizeId(task.id));
    if (path === undefined) continue;
    importFrom(task, backlogView(task), path, {}, true, []);
  }
  return plan;
}

// Strings that YAML 1.1 parsers such as js-yaml (used by Backlog.md) would
// read as something else: dates and timestamps, numbers, booleans, null.
const NEEDS_QUOTES =
  /^(\d{4}-\d\d?-\d\d?([Tt ].*)?|[-+]?(\d[\d_]*(\.\d*)?|\.\d+)([eE][-+]?\d+)?|0x[\da-fA-F]+|0o?[0-7]+|true|false|yes|no|on|off|y|n|null|~|\.inf|\.nan)$/i;

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

// YAML for Backlog.md files: block style, and quotes on every string that a
// YAML 1.1 parser would otherwise turn into a date, number or boolean.
export function backlogYaml(value: unknown, indent = ""): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return " []";
    return value
      .map((v) => `\n${indent}- ${backlogYaml(v, `${indent}  `).trimStart()}`)
      .join("");
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return " {}";
    return entries
      .map(([k, v]) => {
        return `\n${indent}${k}:${backlogYaml(v, `${indent}  `)}`;
      })
      .join("");
  }
  if (typeof value === "string") {
    const plain = Bun.YAML.stringify(value).trim();
    return ` ${NEEDS_QUOTES.test(value) || plain.startsWith("|") ? quote(value) : plain}`;
  }
  return ` ${value === undefined ? "null" : JSON.stringify(value)}`;
}

function serialize(
  frontmatter: Frontmatter,
  body: string,
  side: "adaptrace" | "backlog",
): string {
  if (side === "adaptrace") return serializeDocument(frontmatter, body);
  const yaml = `${backlogYaml(frontmatter).replace(/^\n/, "")}\n`;
  const text = body.startsWith("\n") ? body : `\n${body}`;
  return `---\n${yaml}---\n${text.replace(/\n*$/, "\n")}`;
}

export async function applySync(
  plan: SyncPlan,
  bundleRoot: string,
  backlogRoot: string,
): Promise<void> {
  for (const write of plan.writes) {
    const root = write.side === "adaptrace" ? bundleRoot : backlogRoot;
    await Bun.write(
      posix.join(root, write.path),
      serialize(write.frontmatter, write.body, write.side),
    );
  }
}
