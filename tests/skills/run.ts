// Runs a skill with two Claude Code agents (claude -p) on fresh test
// repositories, and checks each result with the skill's check.ts.
// - The runner runs the skill. It sees only the user's request
//   (<skill>/prompts/runner.md).
// - The user answers the runner's questions from the facts in
//   <skill>/README.md (「利用者が知っていること」) only.
// Each skill's directory has setup.sh <dir>, check.ts <repo> <dialog>,
// prompts/runner.md and README.md. The prompts shared by every skill are in
// prompts/.
// Usage: bun run.ts <skill> <work dir> [runs, default 3]
//          [--jobs <n>, default: all runs at once] [--issues]
// --issues also asks the runner, after each run, what in SKILL.md was
// unclear (run-<n>.issues.md): use it after changing the skill.
// It costs Claude Code usage and takes several minutes per run.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const SKILLS = import.meta.dir;
const ROOT = resolve(SKILLS, "../..");
const DONE = "SKILL-WORK-DONE";
const MAX_TURNS = 25;
// One claude call: a stalled call fails the run instead of hanging.
const CALL_TIMEOUT_MS = 15 * 60 * 1000;

// Done only when the runner ends its reply with the line, as it is told.
function done(reply: string): boolean {
  return reply.trimEnd().split("\n").at(-1)?.trim() === DONE;
}

function usage(message: string): never {
  console.error(message);
  console.error(
    "usage: bun run.ts <skill> <work dir> [runs] [--jobs <n>] [--issues]",
  );
  process.exit(2);
}

const { values, positionals } = (() => {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        jobs: { type: "string" },
        issues: { type: "boolean", default: false },
      },
    });
  } catch (e) {
    return usage((e as Error).message);
  }
})();
const [skill, workArg, runsArg] = positionals;
if (skill === undefined || workArg === undefined) usage("missing arguments");
const HERE = join(SKILLS, skill);
for (const file of ["check.ts", "setup.sh", "README.md", "prompts/runner.md"]) {
  if (!existsSync(join(HERE, file))) usage(`no ${file} in ${HERE}`);
}
const work = resolve(workArg);
const runs = Number(runsArg ?? 3);
if (!Number.isInteger(runs) || runs < 1) {
  usage("runs must be a positive integer");
}
const jobs = Number(values.jobs ?? runs);
if (!Number.isInteger(jobs) || jobs < 1) {
  usage("--jobs must be a positive integer");
}
// Outside this repository: CLAUDE.md and AGENTS.md here would be loaded.
if (`${work}/`.startsWith(`${ROOT}/`)) {
  usage(`the work dir must be outside ${ROOT}`);
}
if (existsSync(work)) usage(`${work} already exists`);

// A prompt file without its leading HTML comment, with values filled in:
// the skill's own file, or else the shared one.
function prompt(name: string, fill: Record<string, string>): string {
  const own = join(HERE, "prompts", name);
  const path = existsSync(own) ? own : join(SKILLS, "prompts", name);
  let text = readFileSync(path, "utf8")
    .replace(/^<!--[\s\S]*?-->\n/, "")
    .trim();
  for (const [key, value] of Object.entries(fill)) {
    // A function, so "$&" or "$$" in the value are copied as they are.
    text = text.replaceAll(`{{${key}}}`, () => value);
  }
  return text;
}

// The facts the user knows: one section of README.md.
const readme = readFileSync(join(HERE, "README.md"), "utf8");
const facts =
  readme.match(/## 利用者が知っていること\n([\s\S]*?)\n## /)?.[1]?.trim() ?? "";
if (facts === "") usage("README.md has no 利用者が知っていること");
// Only after every check, so a failed start leaves no work dir behind.
mkdirSync(work, { recursive: true });

// Where the time goes in one run: each claude call, setup.sh and
// check.ts. For a claude call, apiMs is the time waiting for the model;
// the rest of ms is mostly the tools the agent ran (the CLI, git).
interface Timing {
  step: string;
  ms: number;
  apiMs?: number;
  agentTurns?: number;
  costUsd?: number;
}
// A resumed session reports its model time and cost as totals so far: the
// totals seen last, by session, give each call's own share.
const sessionTotals = new Map<string, { apiMs: number; costUsd: number }>();

// A command, run without blocking the other runs.
async function exec(
  cmd: string[],
  options: { cwd?: string; input?: string; timeoutMs?: number } = {},
): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}> {
  const proc = Bun.spawn(cmd, {
    cwd: options.cwd,
    stdin: options.input === undefined ? "ignore" : "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  if (options.input !== undefined && proc.stdin) {
    // A process that exits before reading its input must not end run.ts.
    try {
      proc.stdin.write(options.input);
      Promise.resolve(proc.stdin.end()).catch(() => {});
    } catch {}
  }
  let timedOut = false;
  const timer = options.timeoutMs
    ? setTimeout(() => {
        timedOut = true;
        proc.kill();
        // Then for good, if it does not stop.
        setTimeout(() => proc.kill("SIGKILL"), 10_000).unref();
      }, options.timeoutMs)
    : undefined;
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (timer) clearTimeout(timer);
  return { exitCode, stdout, stderr, timedOut };
}

async function timed<T>(
  timings: Timing[],
  step: string,
  f: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  try {
    return await f();
  } finally {
    timings.push({ step, ms: Math.round(performance.now() - start) });
  }
}

// The prompt goes on stdin: options such as --allowedTools take any number
// of values and would swallow a prompt given after them.
async function claude(
  timings: Timing[],
  step: string,
  args: string[],
  input: string,
  cwd: string,
): Promise<string> {
  // Only the test repository's settings and skills: not the maintainer's
  // ~/.claude, where an older copy of the skill may be installed.
  const start = performance.now();
  const run = await exec(
    [
      "claude",
      "-p",
      "--setting-sources",
      "project,local",
      // Every event, so the text written before a tool call is kept too:
      // the result holds only the text after the last one.
      "--output-format",
      "stream-json",
      "--verbose",
      ...args,
    ],
    { cwd, input, timeoutMs: CALL_TIMEOUT_MS },
  );
  const ms = Math.round(performance.now() - start);
  const fail = (message: string): never => {
    timings.push({ step, ms });
    throw new Error(message);
  };
  if (run.timedOut)
    fail(`claude timed out after ${CALL_TIMEOUT_MS / 60000} min`);
  let out: {
    result?: string;
    is_error?: boolean;
    subtype?: string;
    session_id?: string;
    duration_api_ms?: number;
    num_turns?: number;
    total_cost_usd?: number;
  } = {};
  const texts: string[] = [];
  for (const line of run.stdout.split("\n")) {
    if (line.trim() === "") continue;
    let event: {
      type?: string;
      parent_tool_use_id?: string | null;
      message?: { content?: { type?: string; text?: string }[] };
    };
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    // The agent's own text: not a subagent's, which has a parent tool use.
    if (event.type === "assistant" && !event.parent_tool_use_id) {
      for (const c of event.message?.content ?? []) {
        if (c.type === "text" && c.text?.trim()) texts.push(c.text.trim());
      }
    } else if (event.type === "result") {
      out = event as typeof out;
    }
  }
  // A failed call: the cause is in the result event (an API error such as
  // a usage limit), else in stderr.
  if (run.exitCode !== 0 || out.is_error) {
    const r = out as { api_error?: unknown; api_error_status?: number };
    fail(
      `${run.exitCode === 0 ? "claude returned an error" : `claude exited with ${run.exitCode}`}: ${[
        out.subtype,
        r.api_error_status,
        r.api_error == null
          ? undefined
          : typeof r.api_error === "string"
            ? r.api_error
            : JSON.stringify(r.api_error),
        out.result,
        run.stderr.trim(),
        run.stdout.slice(-300),
      ]
        .filter((x) => x !== undefined && x !== "")
        .join(" / ")}`,
    );
  }
  if (out.subtype === undefined && out.result === undefined) {
    fail(`claude printed no result: ${run.stdout.slice(0, 200)}`);
  }
  // An error result can come with exit code 0, and without a result.
  if (typeof out.result !== "string") {
    fail(`claude returned an error: ${out.subtype ?? "no result"}`);
  }
  const apiMs = out.duration_api_ms ?? 0;
  const costUsd = out.total_cost_usd ?? 0;
  const before = (out.session_id && sessionTotals.get(out.session_id)) || {
    apiMs: 0,
    costUsd: 0,
  };
  if (out.session_id) sessionTotals.set(out.session_id, { apiMs, costUsd });
  // Totals that went down were not carried over: the value is this call's.
  const share = (now: number, last: number) => (now >= last ? now - last : now);
  timings.push({
    step,
    ms,
    apiMs: share(apiMs, before.apiMs),
    agentTurns: out.num_turns,
    costUsd: share(costUsd, before.costUsd),
  });
  // All the text the agent wrote in this call, in order.
  return texts.length > 0 ? texts.join("\n\n") : (out.result ?? "").trim();
}

// The totals by kind of step: runner, user, issues, setup, check.
function summary(list: Timing[]): string {
  const kinds = new Map<string, Timing[]>();
  for (const t of list) {
    const kind = t.step.replace(/ \d+$/, "");
    kinds.set(kind, [...(kinds.get(kind) ?? []), t]);
  }
  const s = (ms: number) => `${(ms / 1000).toFixed(0)}s`;
  const sum = (ts: Timing[], f: (t: Timing) => number | undefined) =>
    ts.reduce((n, t) => n + (f(t) ?? 0), 0);
  const parts = [...kinds].map(([kind, ts]) => {
    const ms = sum(ts, (t) => t.ms);
    const api = sum(ts, (t) => t.apiMs);
    return api > 0
      ? `${kind} ${s(ms)} (${ts.length} calls, model ${s(api)}, other ${s(ms - api)}, ${sum(ts, (t) => t.agentTurns)} agent turns)`
      : `${kind} ${s(ms)}`;
  });
  const total = sum(list, (t) => t.ms);
  const cost = sum(list, (t) => t.costUsd);
  return `  time ${s(total)}, $${cost.toFixed(2)}: ${parts.join("; ")}`;
}

const RUNNER_TOOLS = [
  "--permission-mode",
  "acceptEdits",
  "--disallowedTools",
  "AskUserQuestion",
  "--allowedTools",
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "Skill",
  "Bash(bun:*)",
  "Bash(git:*)",
  "Bash(date:*)",
  "Bash(grep:*)",
  "Bash(ls:*)",
  "Bash(mkdir:*)",
  "Bash(find:*)",
];

// One run: its result lines are printed together when it ends, so the
// output of parallel runs does not interleave.
async function runOnce(i: number): Promise<boolean> {
  const repo = join(work, `run-${i}`);
  const timings: Timing[] = [];
  const out: string[] = [];
  const setup = await timed(timings, "setup", () =>
    exec(["sh", join(HERE, "setup.sh"), repo]),
  );
  if (setup.exitCode !== 0) {
    console.log(`run ${i}: FAIL, setup.sh: ${setup.stderr.trim()}`);
    return false;
  }
  const session = crypto.randomUUID();
  const system = prompt("runner-system.md", {});
  const dialog: string[] = [`# Run ${i}`, ""];
  let uncovered = 0;
  let finished = false;
  let issuesFailed = false;
  try {
    let reply = await claude(
      timings,
      "runner 1",
      [
        "--session-id",
        session,
        "--append-system-prompt",
        system,
        ...RUNNER_TOOLS,
      ],
      prompt("runner.md", { ADAPTRACE: `bun ${ROOT}/src/cli.ts` }),
      repo,
    );
    for (let turn = 1; turn <= MAX_TURNS; turn++) {
      dialog.push(`## Runner ${turn}`, "", reply, "");
      if (done(reply)) {
        finished = true;
        break;
      }
      const answer = await claude(
        timings,
        `user ${turn}`,
        ["--tools", "", "--no-session-persistence"],
        prompt("user.md", { FACTS: facts, MESSAGE: reply }),
        work,
      );
      // The first line is the mark, when the user gave one.
      const lines = answer.split("\n");
      // The mark may come in backticks or bold, as user.md shows it.
      const mark = lines[0]?.replace(/[`*]/g, "").trim() ?? "";
      const marked = mark === "COVERED" || mark === "UNCOVERED";
      const body = (marked ? lines.slice(1) : lines).join("\n").trim();
      if (mark === "UNCOVERED") uncovered++;
      dialog.push(
        `## User ${turn} (${marked ? mark : "no mark"})`,
        "",
        body,
        "",
      );
      reply = await claude(
        timings,
        `runner ${turn + 1}`,
        [
          "--resume",
          session,
          "--append-system-prompt",
          system,
          ...RUNNER_TOOLS,
        ],
        // Never the bare mark: the runner would read it as the answer.
        body || "（返事なし）",
        repo,
      );
    }
    if (!finished && done(reply)) {
      dialog.push(`## Runner ${MAX_TURNS + 1}`, "", reply, "");
      finished = true;
    } else if (!finished) {
      dialog.push(`## Runner ${MAX_TURNS + 1}`, "", reply, "");
      dialog.push(`## Stopped`, "", `${MAX_TURNS} turns without ${DONE}`, "");
    }
  } catch (e) {
    dialog.push(`## Error`, "", String(e), "");
  }
  // After the work: the runner, as a tester, lists what was unclear. Its
  // failure is reported apart from the check.
  if (values.issues) {
    try {
      const issues = await claude(
        timings,
        "issues",
        ["--resume", session, "--tools", ""],
        `The work is over. You were testing the ${skill} skill. List concretely, in Japanese, where SKILL.md was unclear, missing a step, contradicted the CLI's behavior, or made you guess. Be critical. Reply with the list only.`,
        repo,
      );
      writeFileSync(join(work, `run-${i}.issues.md`), `${issues}\n`);
    } catch (e) {
      issuesFailed = true;
      writeFileSync(
        join(work, `run-${i}.issues.md`),
        `(failed) ${String(e)}\n`,
      );
    }
  }
  const dialogPath = join(work, `run-${i}.dialog.md`);
  writeFileSync(dialogPath, dialog.join("\n"));
  const check = await timed(timings, "check", () =>
    exec([process.execPath, join(HERE, "check.ts"), repo, dialogPath]),
  );
  const result = check.stdout + check.stderr;
  writeFileSync(join(work, `run-${i}.check.txt`), result);
  const ok = check.exitCode === 0;
  out.push(
    `run ${i}: ${ok ? "PASS" : "FAIL"}, ${uncovered} questions not covered by the facts${finished ? "" : ", stopped before the end"}${issuesFailed ? ", issues step failed" : ""}`,
  );
  for (const line of result.split("\n")) {
    if (/^(FAIL|warn)/.test(line)) out.push(`  ${line}`);
  }
  writeFileSync(
    join(work, `run-${i}.timing.json`),
    `${JSON.stringify(timings, null, 2)}\n`,
  );
  out.push(summary(timings));
  console.log(out.join("\n"));
  return ok;
}

// Up to `jobs` runs at once: each run's repository, session and files are
// its own.
const started = performance.now();
const results: boolean[] = [];
let next = 1;
await Promise.all(
  Array.from({ length: Math.min(jobs, runs) }, async () => {
    while (next <= runs) {
      const i = next++;
      // One run's failure is that run's FAIL, not the end of the others.
      results[i] = await runOnce(i).catch((e) => {
        console.log(`run ${i}: FAIL, ${String(e)}`);
        return false;
      });
    }
  }),
);
const passed = results.filter(Boolean).length;
const wall = ((performance.now() - started) / 1000).toFixed(0);
console.log(
  `${passed} of ${runs} runs passed in ${wall}s (${Math.min(jobs, runs)} at once). Logs: ${work}/run-*`,
);
process.exit(passed === runs ? 0 : 1);
