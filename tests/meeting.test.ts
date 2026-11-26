import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { loadBundle, withFiles } from "../src/bundle";
import { run } from "../src/cli";
import { buildGraph } from "../src/graph";
import { createServer } from "../src/mcp";
import {
  buildInvitationPrompt,
  customerView,
  meetingDraft,
  meetingPlan,
} from "../src/meeting";

const BUNDLE = "tests/fixtures/conflicts";
const FAKE = `"${process.execPath}" "${join(import.meta.dir, "fake-llm.ts")}"`;
const REQUESTS = [
  "change-requests/cr-sms.md",
  "change-requests/cr-email.md",
  "change-requests/cr-idp.md",
];

// The user's own LLM command must not run in these tests.
const savedLlm = process.env.ADAPTRACE_LLM;
beforeEach(() => {
  delete process.env.ADAPTRACE_LLM;
});
afterEach(() => {
  mock.restore();
  if (savedLlm === undefined) delete process.env.ADAPTRACE_LLM;
  else process.env.ADAPTRACE_LLM = savedLlm;
});

async function plan(audience: "internal" | "customer", extra = false) {
  const base = await loadBundle(BUNDLE);
  // A cost baseline below the IdP decision.
  const bundle = extra
    ? withFiles(base, [
        {
          path: "cost/baseline.md",
          text: "---\ntype: Cost Baseline\ntitle: Cost baseline\nowner: suzuki\ndepends_on: /decisions/auth.md\n---\n",
        },
      ])
    : base;
  return {
    bundle,
    plan: meetingPlan(bundle, buildGraph(bundle), REQUESTS, audience),
  };
}

test("participants: owners of what is reached, and requesters by their side", async () => {
  const internal = (await plan("internal")).plan;
  // Internal only by a Stakeholder document with side: internal.
  expect(internal.participants.map((p) => [p.name, p.side, p.roles])).toEqual([
    [
      "業務部門",
      "internal",
      ["利用部門の窓口", "requested change-requests/cr-sms.md"],
    ],
  ]);
  // Owners given by bare names are to check before inviting.
  expect(internal.unconfirmed.map((p) => [p.name, p.roles])).toEqual([
    ["sato", ["owner of decisions/auth.md"]],
    ["tanaka", ["owner of risks/lockin.md"]],
  ]);
  // The customer's contact joins the meeting with the customer only.
  const customer = (await plan("customer")).plan;
  expect(customer.participants.map((p) => [p.name, p.side])).toContainEqual([
    "顧客A社 情報システム部",
    "customer",
  ]);
  expect(internal.requests[1]?.requestedBy[0]).toMatchObject({
    name: "顧客A社 情報システム部",
    side: "customer",
    stakeholder: "stakeholders/a-corp.md",
  });
  expect(internal.pairs).toHaveLength(3);
});

test("baselines reached are on the agenda", async () => {
  const { plan: p } = await plan("internal", true);
  expect(p.baselines).toEqual(["cost/baseline.md"]);
  expect(p.unconfirmed.map((x) => x.name)).toContain("suzuki");
});

test("the Meeting draft points at the requests and keeps internal analysis internal", async () => {
  const { plan: internal } = await plan("internal");
  const draft = meetingDraft(internal, {
    today: "2026-11-25",
    by: "human:sato",
    now: "2026-11-25T10:00:00+09:00",
    decide: ["SMSを認めるか"],
  });
  expect(draft.path).toBe("meetings/2026-11-25-cr-sms-internal.md");
  expect(draft.text).toContain(
    "status: draft\ndepends_on:\n  - /change-requests/cr-sms.md\n  - /change-requests/cr-email.md\n  - /change-requests/cr-idp.md\ngenerated: { by: human:sato, at: 2026-11-25T10:00:00+09:00 }\n",
  );
  expect(draft.text).toContain("both change `requirements/mfa.md`");
  expect(draft.text).toContain("- To decide: SMSを認めるか");
  const { plan: customer } = await plan("customer");
  const forCustomer = meetingDraft(customer, {
    today: "2026-11-25",
    by: "human:sato",
    now: "2026-11-25T10:00:00+09:00",
  });
  expect(forCustomer.text).not.toContain("both reach");
});

test("a customer invitation is not given internal analysis", async () => {
  const { plan: internal } = await plan("internal");
  const { plan: customer } = await plan("customer");
  const texts = { "change-requests/cr-sms.md": "SMS" };
  expect(buildInvitationPrompt(internal, texts, [])).toContain(
    "Where the requests overlap",
  );
  // The customer's view, and no points from internal judging: the LLM
  // lists them from the requests alone.
  const prompt = buildInvitationPrompt(customerView(customer), texts, [
    "SMSを認めるか",
  ]);
  expect(prompt).not.toContain("Where the requests overlap");
  expect(prompt).not.toContain("decisions/auth.md");
  expect(prompt).not.toContain("SMSを認めるか");
  expect(prompt).toContain("Do not mention the team's internal analysis");
  expect(prompt).toContain("Only the titles of the requests are given");
  expect(prompt).not.toContain("change-requests/");
});

test("the CLI: text, --llm, --write, and the customer's view", async () => {
  const dir = await mkdtemp(join(tmpdir(), "adaptrace-meeting-"));
  try {
    await cp(BUNDLE, dir, { recursive: true });
    const log = spyOn(console, "log").mockImplementation(() => {});
    const args = ["meeting", ...REQUESTS, "--bundle", dir];
    expect(
      await run([...args, "--llm", `${FAKE} pair`, "--jobs", "1", "--write"]),
    ).toBe(0);
    const text = String(log.mock.calls[0]?.[0]);
    expect(text).toContain("LLM: conflict:");
    expect(text).toContain("To decide: SMSを認めるか");
    expect(text).toContain("Subject: 変更要求の協議");
    expect(text).toContain("(written)");
    const path = text.match(/(meetings\/\S+-internal\.md) \(written\)/)?.[1];
    expect(path).toBeDefined();
    const written = await readFile(join(dir, path ?? ""), "utf8");
    expect(written).toContain("type: Meeting");
    // A second run does not overwrite: -2.
    expect(await run([...args, "--write", "--format", "json"])).toBe(0);
    const json = JSON.parse(String(log.mock.calls[1]?.[0]));
    expect(json.draft.path).toMatch(/-internal-2\.md$/);
    expect(json.draft.written).toBe(true);
    // The customer's view leaves out the documents each request changes.
    expect(await run([...args, "--audience", "customer"])).toBe(0);
    const customer = String(log.mock.calls[2]?.[0]);
    expect(customer).not.toContain("changes requirements/mfa.md");
    expect(customer).toContain("Internal analysis is left out");
    const error = spyOn(console, "error").mockImplementation(() => {});
    expect(await run(["meeting", "--bundle", dir])).toBe(2);
    expect(await run([...args, "--audience", "board"])).toBe(2);
    expect(error.mock.calls[0]?.[0]).toContain(
      "meeting needs the change requests",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("MCP meeting_context: the customer's view leaves out what is reached", async () => {
  const client = new Client({ name: "test", version: "0" });
  try {
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createServer({ bundle: BUNDLE, backlog: "no/such/backlog" }).connect(
      a,
    );
    await client.connect(b);
    const call = async (audience: string) => {
      const result = await client.callTool({
        name: "meeting_context",
        arguments: { requests: REQUESTS, audience },
      });
      const [first] = result.content as { text: string }[];
      return JSON.parse(first?.text ?? "{}");
    };
    const internal = await call("internal");
    expect(internal.pairs).toHaveLength(3);
    expect(internal.instructions).toContain("propose_document");
    const customer = await call("customer");
    expect(customer.pairs).toEqual([]);
    expect(customer.requests[0].reach).toEqual([]);
  } finally {
    await client.close();
  }
});

test("the customer's view: owners' roles without documents, nothing reached", async () => {
  const { plan: full } = await plan("customer");
  const view = customerView(full);
  const roles = view.participants.flatMap((p) => p.roles).join(" ");
  expect(roles).not.toContain("decisions/auth.md");
  expect(roles).toContain("owner of a document they reach");
  expect(view.pairs).toEqual([]);
  expect(view.requests[0]?.targets).toEqual([]);
  // The internal plan is untouched.
  expect(customerView((await plan("internal")).plan).pairs).toHaveLength(3);
});

test("a requester by name who also owns a document stays unknown; drafts escape words", async () => {
  const base = await loadBundle(BUNDLE);
  const bundle = withFiles(base, [
    {
      path: "change-requests/cr-sms.md",
      text: '---\ntype: Change Request\ntitle: "SMS *now* <b>"\nstate: submitted\nrequested_by: sato\nchanges: /requirements/mfa.md\n---\n',
    },
  ]);
  const p = meetingPlan(bundle, buildGraph(bundle), REQUESTS, "internal");
  expect(p.unconfirmed.find((x) => x.name === "sato")?.roles).toEqual([
    "requested change-requests/cr-sms.md",
    "owner of decisions/auth.md",
  ]);
  const draft = meetingDraft(p, {
    today: "2026-11-25",
    by: "human:sato",
    now: "2026-11-25T10:00:00+09:00",
    decide: ["A or B?\n## Decisions\n- chose A", "see https://x.example/y"],
  });
  expect(draft.text).toContain("- SMS \\*now\\* \\<b\\>");
  expect(draft.text).toContain("- To decide: A or B? ## Decisions - chose A");
  expect(draft.text).toContain("- To decide: see `https://x.example/y`");
  // Only the one real Decisions heading.
  expect(draft.text.match(/^## Decisions$/gm)).toHaveLength(1);
});

test("the same request in two spellings is one; customer json hides the analysis", async () => {
  const log = spyOn(console, "log").mockImplementation(() => {});
  const args = [
    "meeting",
    "change-requests/cr-sms.md",
    "/change-requests/cr-sms.md",
    "change-requests/cr-email.md",
    "--bundle",
    BUNDLE,
    "--format",
    "json",
  ];
  expect(await run(args)).toBe(0);
  const internal = JSON.parse(String(log.mock.calls[0]?.[0]));
  expect(internal.plan.requests).toHaveLength(2);
  expect(internal.plan.pairs).toHaveLength(1);
  expect(
    await run([...args, "--audience", "customer", "--llm", `${FAKE} fail`]),
  ).toBe(1);
  const customer = JSON.parse(String(log.mock.calls[1]?.[0]));
  expect(customer.plan.pairs).toEqual([]);
  // No pair judging for the customer; the invitation failed (exit 1).
  expect(customer.judged).toBeNull();
  expect(customer.decide).toEqual([]);
  expect(customer.invitation.invitation).toBeNull();
  expect(JSON.stringify(customer)).not.toContain("decisions/auth.md");
});

test("only a Stakeholder document with side: internal makes a person internal", async () => {
  const base = await loadBundle(BUNDLE);
  const bundle = withFiles(base, [
    {
      path: "stakeholders/acme.md",
      text: "---\ntype: Stakeholder\ntitle: ACME\nside: external\n---\n",
    },
    {
      path: "stakeholders/team.md",
      text: "---\ntype: Stakeholder\nside: Internal\n---\n",
    },
    {
      path: "stakeholders/old.md",
      text: "---\ntype: Stakeholder\ntitle: 業務部門\nside: customer\nstatus: deprecated\n---\n",
    },
    {
      path: "decisions/auth.md",
      text: "---\ntype: Decision\ntitle: Auth\nowner:\n  - /stakeholders/acme.md\n  - /stakeholders/nowhere.md\n  - ../stakeholders/a-corp.md\n  - /stakeholders/team.md\ndepends_on: /requirements/mfa.md\n---\n",
    },
    {
      path: "change-requests/cr-idp.md",
      text: "---\ntype: Change Request\ntitle: IdP\nstate: rejected\nrequested_by:\n  - 顧客B社\n  - 業務部門\nchanges: /decisions/auth.md\n---\n",
    },
  ]);
  const p = meetingPlan(bundle, buildGraph(bundle), REQUESTS, "internal");
  // 業務部門 by name is the one live Stakeholder of that title.
  // team.md has no title but side: Internal (any case).
  expect(p.participants.map((x) => x.name)).toEqual([
    "stakeholders/team.md",
    "業務部門",
  ]);
  expect(p.unconfirmed.map((x) => x.name)).toEqual([
    "../stakeholders/a-corp.md",
    "/stakeholders/nowhere.md",
    "ACME",
    "tanaka",
    "顧客B社",
  ]);
  expect(p.unresolved).toEqual([
    "../stakeholders/a-corp.md",
    "/stakeholders/nowhere.md",
  ]);
  const { formatMeeting } = await import("../src/output");
  const text = formatMeeting(
    bundle,
    {
      plan: p,
      judged: null,
      decide: [],
      invitation: null,
      draft: null,
      writeError: null,
    },
    false,
  );
  expect(text).toContain("Check before inviting");
  expect(text).toContain("(state rejected)");
  // The customer's view shows no paths as names.
  const customer = customerView(
    meetingPlan(bundle, buildGraph(bundle), REQUESTS, "customer"),
  );
  const json = JSON.stringify(customer);
  expect(json).not.toContain("nowhere");
  expect(json).not.toContain("a-corp.md");
  expect(json).not.toContain("stakeholders/team.md");
  expect(customer.unresolved).toEqual([]);
});

test("a request's line shows the side of the merged person", async () => {
  const base = await loadBundle(BUNDLE);
  const bundle = withFiles(base, [
    {
      path: "change-requests/cr-sms.md",
      text: "---\ntype: Change Request\ntitle: SMS\nrequested_by: sato\nchanges: /requirements/mfa.md\n---\n",
    },
  ]);
  const p = meetingPlan(bundle, buildGraph(bundle), REQUESTS, "internal");
  expect(p.requests[0]?.requestedBy[0]?.roles).toEqual([
    "requested change-requests/cr-sms.md",
    "owner of decisions/auth.md",
  ]);
});

test("--audience is only for meeting", async () => {
  const error = spyOn(console, "error").mockImplementation(() => {});
  expect(await run(["conflicts", BUNDLE, "--audience", "customer"])).toBe(2);
  expect(error.mock.calls[0]?.[0]).toContain("--audience is only for meeting");
});

test("round 6: requesters' roles for the customer, namesakes without side, other requests", async () => {
  const base = await loadBundle(BUNDLE);
  const bundle = withFiles(base, [
    {
      path: "requirements/mfa.md",
      text: "---\ntype: Requirement\ntitle: MFA\nowner: /stakeholders/business.md\n---\n",
    },
    {
      path: "stakeholders/tanaka-us.md",
      text: "---\ntype: Stakeholder\ntitle: tanaka\nside: internal\n---\n",
    },
    {
      path: "stakeholders/tanaka-a.md",
      text: "---\ntype: Stakeholder\ntitle: tanaka\n---\n",
    },
    {
      path: "stakeholders/gone.md",
      text: "---\ntype: Stakeholder\ntitle: Gone\nside: internal\nstatus: deprecated\n---\n",
    },
    {
      path: "change-requests/cr-x.md",
      text: "---\ntype: Change Request\ntitle: X\nowner: /stakeholders/gone.md\nchanges: /requirements/other.md\ndepends_on: /requirements/mfa.md\n---\n",
    },
  ]);
  const p = meetingPlan(bundle, buildGraph(bundle), REQUESTS, "internal");
  // Two Stakeholders titled tanaka: unknown, though only one has side.
  expect(p.participants.map((x) => x.name)).not.toContain("tanaka");
  expect(p.unconfirmed.map((x) => x.name)).toContain("tanaka");
  // cr-x is another change request: its owner is not invited.
  expect(JSON.stringify(p)).not.toContain("Gone");
  expect(JSON.stringify(p.pairs)).not.toContain("cr-x");
  // The draft keeps who to check.
  const draft = meetingDraft(p, {
    today: "2026-11-25",
    by: "human:sato",
    now: "2026-11-25T10:00:00+09:00",
  });
  expect(draft.text).toContain("- Check before inviting: tanaka (unknown)");
  // For the customer, requesters' roles name no documents either.
  const customer = customerView(
    meetingPlan(bundle, buildGraph(bundle), REQUESTS, "customer"),
  );
  expect(JSON.stringify(customer)).not.toContain("requirements/mfa.md");
});

test("a name with a slash is a name; a deprecated Stakeholder by path is unknown", async () => {
  const base = await loadBundle(BUNDLE);
  const bundle = withFiles(base, [
    {
      path: "stakeholders/gone.md",
      text: "---\ntype: Stakeholder\ntitle: Gone\nside: internal\nstatus: deprecated\n---\n",
    },
    {
      path: "change-requests/cr-sms.md",
      text: "---\ntype: Change Request\ntitle: SMS\nrequested_by:\n  - 営業部/東京支店\n  - /stakeholders/gone.md\nchanges: /requirements/mfa.md\n---\n",
    },
  ]);
  const p = meetingPlan(bundle, buildGraph(bundle), REQUESTS, "internal");
  expect(p.unresolved).toEqual([]);
  expect(p.unconfirmed.map((x) => x.name)).toContain("営業部/東京支店");
  expect(p.unconfirmed.map((x) => x.name)).toContain("Gone");
});

test("a path to a document that is not a Stakeholder is not a person", async () => {
  const base = await loadBundle(BUNDLE);
  const bundle = withFiles(base, [
    {
      path: "change-requests/cr-sms.md",
      text: "---\ntype: Change Request\ntitle: SMS\nrequested_by: /requirements/mfa.md\nchanges: /requirements/mfa.md\n---\n",
    },
  ]);
  const p = meetingPlan(bundle, buildGraph(bundle), REQUESTS, "internal");
  expect(p.unresolved).toEqual(["/requirements/mfa.md"]);
  const customer = customerView(
    meetingPlan(bundle, buildGraph(bundle), REQUESTS, "customer"),
  );
  const json = JSON.stringify(customer);
  expect(json).not.toContain("MFA");
  expect(json).not.toContain("requirements/mfa.md");
});

test("the customer's invitation gets titles only, without paths or bodies", async () => {
  const dir = await mkdtemp(join(tmpdir(), "adaptrace-meeting-"));
  try {
    await cp(BUNDLE, dir, { recursive: true });
    const file = join(dir, "change-requests/cr-sms.md");
    const raw = await readFile(file, "utf8");
    await Bun.write(
      file,
      `${raw}\n影響: \`/requirements/mfa.md\`、「/要件/認証.md」を変更\n`,
    );
    const capture = join(dir, "prompt.txt");
    const llm = `sh -c 'cat > "${capture}"; echo "{\\"subject\\":\\"s\\",\\"body\\":\\"b\\"}"'`;
    const log = spyOn(console, "log").mockImplementation(() => {});
    const args = [
      "meeting",
      ...REQUESTS,
      "--bundle",
      dir,
      "--audience",
      "customer",
    ];
    expect(await run([...args, "--llm", llm])).toBe(0);
    const prompt = await readFile(capture, "utf8");
    expect(prompt).toContain("- Add SMS codes");
    expect(prompt).not.toContain("影響");
    expect(prompt).not.toContain(".md");
    // No links into the repository in the customer's Markdown.
    expect(
      await run([
        ...args,
        "--format",
        "markdown",
        "--link-base",
        "https://git.example/r/",
      ]),
    ).toBe(0);
    expect(String(log.mock.calls[1]?.[0])).not.toContain("git.example");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a requester given twice is shown once", async () => {
  const base = await loadBundle(BUNDLE);
  const bundle = withFiles(base, [
    {
      path: "change-requests/cr-sms.md",
      text: "---\ntype: Change Request\ntitle: SMS\nrequested_by:\n  - /stakeholders/business.md\n  - 業務部門\nchanges: /requirements/mfa.md\n---\n",
    },
  ]);
  const p = meetingPlan(bundle, buildGraph(bundle), REQUESTS, "internal");
  expect(p.requests[0]?.requestedBy).toHaveLength(1);
});
