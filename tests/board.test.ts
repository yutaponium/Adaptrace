import { expect, test } from "bun:test";
import { board } from "../src/board";
import { loadBundle, withFiles } from "../src/bundle";
import { buildGraph } from "../src/graph";

const task = (fields: string) => `---\ntype: Task\n${fields}---\n`;

test("a stopped task (deprecated) is not waited for", async () => {
  const base = await loadBundle("tests/fixtures/valid");
  const bundle = withFiles(base, [
    // Waits for an open task, a stopped one and a finished one; another is
    // blocked by a stopped one. Only the open task is waited for.
    {
      path: "tasks/w.md",
      text: task(
        "state: to_do\ndepends_on:\n  - /tasks/open.md\n  - /tasks/stopped.md\n  - /tasks/finished.md\n",
      ),
    },
    { path: "tasks/open.md", text: task("state: in_progress\n") },
    { path: "tasks/finished.md", text: task("state: done\n") },
    {
      path: "tasks/stopped.md",
      text: task("state: in_progress\nstatus: deprecated\n"),
    },
    {
      path: "tasks/blocker.md",
      text: task(
        "state: in_progress\nstatus: deprecated\nblocks: /tasks/b.md\n",
      ),
    },
    { path: "tasks/b.md", text: task("state: to_do\n") },
  ]);
  const tasks = board(bundle, buildGraph(bundle)).flatMap((c) => c.tasks);
  const waiting = (path: string) =>
    tasks.find((t) => t.path === path)?.waitingFor;
  expect(waiting("tasks/w.md")).toEqual(["tasks/open.md"]);
  expect(waiting("tasks/b.md")).toEqual([]);
  // Deprecated tasks are not shown at all.
  expect(tasks.some((t) => t.path === "tasks/stopped.md")).toBe(false);
});
