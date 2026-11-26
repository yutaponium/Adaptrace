import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { loadBundle, withFiles } from "../src/bundle";
import { run } from "../src/cli";
import { buildGraph } from "../src/graph";
import { lastUpdated } from "../src/history";
import { formatProgress } from "../src/output";
import { progress } from "../src/progress";

const BUNDLE = "tests/fixtures/progress";

afterEach(() => {
  mock.restore();
});

// cr-sms.md was received on 11-01 (received_at), and updated on 11-20 when
// its state became implemented.
const SMS_RECEIVED = "2026-11-01T10:00:00+09:00";
const SMS =
  "---\ntype: Change Request\nstate: implemented\ngenerated: { by: human:tanaka, at: 2026-11-20T10:00:00+09:00 }\n---\n";

async function report(
  request: string,
  files: { path: string; text: string }[] = [],
) {
  const base = await loadBundle(BUNDLE);
  const bundle = files.length > 0 ? withFiles(base, files) : base;
  // No git dates, so the results do not depend on the repository's history.
  return progress(bundle, buildGraph(bundle), lastUpdated(bundle), request);
}

const rows = (r: Awaited<ReturnType<typeof report>>) =>
  r.items.map((i) => [i.step, i.status, i.path]);

test("judges each document upstream first, against what it depends on in the range", async () => {
  const r = await report("change-requests/cr-sms.md");
  expect(rows(r)).toEqual([
    [1, "reviewed", "requirements/mfa.md"],
    // No update date: it cannot be cleared.
    [2, "to-review", "risks/sim-swap.md"],
    [2, "reviewed", "scope/scope.md"],
    // Newer than vendor.md is not needed: that is outside the change.
    [3, "reviewed", "cost/cost.md"],
    // Through the deprecated old.md, it is compared with mfa.md.
    [3, "to-review", "plans/comms.md"],
    [3, "to-review", "wbs/wbs.md"],
    // Newer than wbs.md, but wbs.md still has to be reviewed first.
    [4, "waiting", "schedule/schedule.md"],
  ]);
  const mfa = r.items[0];
  expect(mfa?.origin).toBe(true);
  expect(r.items.find((i) => i.path === "wbs/wbs.md")?.newer).toEqual([
    "scope/scope.md",
  ]);
  expect(r.items.find((i) => i.path === "plans/comms.md")?.newer).toEqual([
    "requirements/mfa.md",
  ]);
  expect(
    r.items.find((i) => i.path === "schedule/schedule.md")?.waitingFor,
  ).toEqual(["wbs/wbs.md"]);
  expect(r.counts).toEqual({ reviewed: 3, "to-review": 3, waiting: 1 });
  expect(r.done).toBe(false);
});

test("updating the change request itself afterwards does not undo the reviews", async () => {
  // cr-sms.md was updated on 11-20, after every document; mfa.md (11-02) is
  // newer than when the request was received, so it is still reviewed.
  const r = await report("change-requests/cr-sms.md");
  expect(r.baseline).toEqual({
    at: new Date(SMS_RECEIVED),
    raw: SMS_RECEIVED,
    source: "received_at",
  });
  expect(r.items[0]?.status).toBe("reviewed");
  // Without received_at, the request's last update is all there is.
  const without = await report("change-requests/cr-sms.md", [
    { path: "change-requests/cr-sms.md", text: SMS },
  ]);
  expect(without.baseline?.source).toBe("generated.at");
  expect(without.items[0]?.status).toBe("to-review");
  // A received_at that cannot be read is passed over, with a warning.
  const bad = await report("change-requests/cr-sms.md", [
    {
      path: "change-requests/cr-sms.md",
      text: SMS.replace("state:", "received_at: 2026-11-01\nstate:"),
    },
  ]);
  expect(bad.baseline?.source).toBe("generated.at");
  expect(bad.badReceivedAt).toBe("2026-11-01");
  expect(bad.items[0]?.status).toBe("to-review");
  expect(formatProgress(bad, false)).toContain(
    "Warning: received_at 2026-11-01 is not a datetime with a UTC offset",
  );
});

test("linking to the request without updating the document is not a review", async () => {
  const r = await report("change-requests/cr-sms.md", [
    {
      path: "requirements/mfa.md",
      text: "---\ntype: Requirement\ngenerated: { by: human:tanaka, at: 2026-10-01T10:00:00+09:00 }\nderived_from: /change-requests/cr-sms.md\n---\n",
    },
  ]);
  expect(r.items[0]).toMatchObject({
    path: "requirements/mfa.md",
    status: "to-review",
    newer: ["change-requests/cr-sms.md"],
  });
  // Nothing below it is reviewed before it is.
  expect(r.counts.reviewed).toBe(0);
});

test("reviewing upstream turns the waiting document into one to review", async () => {
  const r = await report("change-requests/cr-sms.md", [
    {
      path: "wbs/wbs.md",
      text: "---\ntype: WBS\ngenerated: { by: human:tanaka, at: 2026-11-06T10:00:00+09:00 }\ndepends_on: /scope/scope.md\n---\n",
    },
  ]);
  const schedule = r.items.find((i) => i.path === "schedule/schedule.md");
  expect(schedule?.status).toBe("to-review");
  expect(schedule?.newer).toEqual(["wbs/wbs.md"]);
});

test("done when every document is reviewed, and when nothing is linked yet", async () => {
  expect((await report("change-requests/cr-done.md")).done).toBe(true);
  const empty = await report("change-requests/cr-new.md");
  expect(empty.items).toEqual([]);
  expect(empty.done).toBe(true);
});

test("text and markdown output", async () => {
  const text = formatProgress(await report("change-requests/cr-sms.md"), false);
  expect(text).toContain(
    "  4  waiting    schedule/schedule.md  after wbs/wbs.md",
  );
  expect(text).toContain(
    "3 of 7 documents reviewed: 3 to review now, 1 waiting for documents upstream.",
  );
  const md = formatProgress(
    await report("change-requests/cr-done.md"),
    true,
    "https://example.com/b",
  );
  expect(md).toContain("| Step | Status | Document | Detail |");
  expect(md).toContain(
    "| 1 | reviewed | [Login page](https://example.com/b/requirements/login.md) | starts the change |",
  );
  expect(
    formatProgress(await report("change-requests/cr-new.md"), false),
  ).toContain("No documents depend on it yet.");
});

test("the CLI exits 1 until every document is reviewed", async () => {
  const log = spyOn(console, "log").mockImplementation(() => {});
  const args = ["progress", "--bundle", BUNDLE];
  expect(await run([...args, "change-requests/cr-done.md"])).toBe(0);
  expect(log.mock.calls[0]?.[0]).toContain(
    "not older than 2026-11-10T10:00:00+09:00 (generated.at)",
  );
  expect(
    await run([...args, "change-requests/cr-sms.md", "--format", "json"]),
  ).toBe(1);
  const json = JSON.parse(log.mock.calls[1]?.[0]);
  expect(json.baseline).toEqual({
    at: SMS_RECEIVED,
    utc: "2026-11-01T01:00:00.000Z",
    source: "received_at",
  });
  expect(json.items[0]).toMatchObject({
    path: "requirements/mfa.md",
    status: "reviewed",
    updated: { at: "2026-11-02T10:00:00+09:00", source: "generated.at" },
  });
  const error = spyOn(console, "error").mockImplementation(() => {});
  expect(await run(["progress", "--bundle", BUNDLE])).toBe(2);
  expect(await run([...args, "no/such.md"])).toBe(2);
  expect(error.mock.calls[0]?.[0]).toContain(
    "progress needs the change request",
  );
});

const doc = (at: string | null, deps: string[], extra = "") =>
  `---\ntype: Plan\n${at ? `generated: { by: human:tanaka, at: ${at} }\n` : ""}${extra}depends_on:\n${deps.map((d) => `  - ${d}\n`).join("")}---\n`;

test("the documents of a cycle are not compared with each other", async () => {
  // a <-> b, both on mfa.md (reviewed, 11-02). Whichever is newer, both are
  // reviewed: updating one does not send the other back.
  for (const [a, b] of [
    ["2026-11-22T00:00:00Z", "2026-11-23T00:00:00Z"],
    ["2026-11-24T00:00:00Z", "2026-11-23T00:00:00Z"],
  ]) {
    const r = await report("change-requests/cr-sms.md", [
      {
        path: "cyc/a.md",
        text: doc(a ?? null, ["/requirements/mfa.md", "/cyc/b.md"]),
      },
      {
        path: "cyc/b.md",
        text: doc(b ?? null, ["/requirements/mfa.md", "/cyc/a.md"]),
      },
    ]);
    const status = (p: string) => r.items.find((i) => i.path === p)?.status;
    expect([status("cyc/a.md"), status("cyc/b.md")]).toEqual([
      "reviewed",
      "reviewed",
    ]);
  }
});

test("a cycle waits as a whole while one of its documents waits", async () => {
  // b also depends on wbs.md, which is not reviewed; a is in the cycle with b.
  const r = await report("change-requests/cr-sms.md", [
    {
      path: "cyc/a.md",
      text: doc("2026-11-22T00:00:00Z", ["/requirements/mfa.md", "/cyc/b.md"]),
    },
    {
      path: "cyc/b.md",
      text: doc("2026-11-23T00:00:00Z", ["/wbs/wbs.md", "/cyc/a.md"]),
    },
  ]);
  const a = r.items.find((i) => i.path === "cyc/a.md");
  expect(a?.status).toBe("waiting");
  // The cycle shares b's dependency outside it.
  expect(a?.waitingFor).toEqual(["wbs/wbs.md"]);
  expect(r.items.find((i) => i.path === "cyc/b.md")?.waitingFor).toEqual([
    "wbs/wbs.md",
  ]);
});

test("says so when everything it reaches is deprecated", async () => {
  const r = await report("change-requests/cr-new.md", [
    {
      path: "plans/gone.md",
      text: doc(
        "2026-11-16T00:00:00Z",
        ["/change-requests/cr-new.md"],
        "status: deprecated\n",
      ),
    },
  ]);
  expect(r.items).toEqual([]);
  expect(formatProgress(r, false)).toContain(
    "Every document it reaches is deprecated: plans/gone.md.",
  );
});

test("a cycle shares the baseline of the document in it that starts the change", async () => {
  // a starts the change and is new; b is in a cycle with a but was never
  // updated, and depends on nothing else.
  const r = await report("change-requests/cr-new.md", [
    {
      path: "cyc/a.md",
      text: doc("2026-11-22T00:00:00Z", [
        "/change-requests/cr-new.md",
        "/cyc/b.md",
      ]),
    },
    { path: "cyc/b.md", text: doc("2020-01-01T00:00:00Z", ["/cyc/a.md"]) },
  ]);
  expect(rows(r)).toEqual([
    [1, "waiting", "cyc/a.md"],
    [1, "to-review", "cyc/b.md"],
  ]);
  expect(r.items[1]?.newer).toEqual(["change-requests/cr-new.md"]);
  expect(r.done).toBe(false);
});

test("a document below a cycle that waits also waits", async () => {
  const r = await report("change-requests/cr-sms.md", [
    {
      path: "cyc/a.md",
      text: doc("2026-11-22T00:00:00Z", ["/requirements/mfa.md", "/cyc/b.md"]),
    },
    {
      path: "cyc/b.md",
      text: doc("2026-11-23T00:00:00Z", ["/wbs/wbs.md", "/cyc/a.md"]),
    },
    { path: "cyc/c.md", text: doc("2026-11-24T00:00:00Z", ["/cyc/a.md"]) },
  ]);
  const c = r.items.find((i) => i.path === "cyc/c.md");
  expect(c?.status).toBe("waiting");
  expect(c?.waitingFor).toEqual(["cyc/a.md"]);
});
