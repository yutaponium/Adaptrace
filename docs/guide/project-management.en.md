# Using Adaptrace for project management

[日本語](project-management.md) | English

> The Japanese version is the original. This translation follows it (ADR-003).

This guide collects useful ways to use Adaptrace in project management work.
It follows one project as an example and goes through these situations in order: estimating the impact of a change request, regular status checks, replacing decisions, asking AI agents for help and more.

- It covers the development version after v0.7. It uses `progress` and review records with `verified`, which v0.7 does not have. The exact rules for keys and commands are in [the schema specification](../spec/schema.en.md)
- The package is not published yet. Where this document says `adaptrace`, read it as `bun src/cli.ts` in the cloned repository
- A bundle (`.adaptrace/`) is the folder that holds Adaptrace's documents. You can create one with `adaptrace init`. It does not overwrite existing files

## The example project

The project adds multi-factor authentication (MFA) to a membership site's login by the end of the year.

```text
.adaptrace/
├── index.md
├── log.md
├── meetings/2026-10-01-kickoff.md     # Meeting: kickoff
├── requirements/mfa.md                # Requirement: add MFA to login
├── acceptance/mfa.md                  # Acceptance: acceptance criteria
├── decisions/auth-provider.md         # Decision: use IdP-X as the authentication provider
├── tasks/mfa-login.md                 # Task: add MFA to the login screen
├── tasks/mfa-e2e.md                   # Task: write E2E tests for MFA
├── risks/idp-lockin.md                # Risk: lock-in to IdP-X
└── milestones/release.md              # Milestone: release by year end
```

A document looks like this, for example.
The part enclosed in `---` at the top is called the frontmatter. It holds fields such as the document's type and its dependencies.

```markdown
---
type: Task
title: Add MFA to the login screen
state: in_progress
owner: tanaka
due: 2026-12-15
generated: { by: human:tanaka, at: 2026-10-10T10:00:00+09:00 }
satisfies: /requirements/mfa.md
depends_on: /decisions/auth-provider.md
blocks: /milestones/release.md
---

# Add MFA to the login screen
```

`owner` and `due` are not keys defined by Adaptrace. A project can add such keys freely, and Adaptrace never removes them.

## How to set dependencies

Dependency keys are easier to choose if you think of them in two groups.

- **Review chain** (`depends_on`, `derived_from`, `satisfies`): when the target changes, review this document. `impact` and `stale` follow these keys
- **Waiting** (`blocks`, `depends_on`): this document cannot proceed until the target is done. `board` and deadlock detection use these keys

`depends_on` has both meanings. `blocks` means waiting only, and `impact` and `stale` do not follow it.

Here is a guide to which keys to use between types.

| Document | Key | Target | Meaning |
| --- | --- | --- | --- |
| Requirement | `derived_from` | Meeting, Change Request | Which agreement the requirement came from |
| Acceptance | `derived_from` | Requirement | Acceptance criteria derived from the requirement |
| Decision | `depends_on` | Requirement | A decision based on the requirement |
| Task | `satisfies` | Requirement | The requirement this task satisfies |
| Task | `depends_on` | Decision, Acceptance, Task | The decision, criteria or earlier task this task builds on |
| Task | `blocks` | Milestone, Task | What cannot proceed until this task is done |
| Risk | `depends_on` | Decision | A risk that arises from the decision |
| Decision | `supersedes` | Decision | Replaces an old decision |

**We recommend linking to a Milestone with `blocks`.**
If a Milestone has `depends_on` pointing to tasks, `stale` shows the Milestone as "old" every time a task is updated. This gets in the way of status checks.
Instead, write `blocks: /milestones/release.md` in the task. This expresses the waiting relationship, and it stays out of the review chain.

Markdown links in the body (`[ADR](../decisions/auth-provider.md)`) are references and do not count as dependencies.
Link in the body to documents you only want people to read as related material. Put in the frontmatter only the documents that should trigger a review when they change.

## When a change request arrives

Suppose a customer says, "We want to receive codes by SMS as well." This is where Adaptrace helps most.

### 1. Register the change request

Create a new file `change-requests/cr-001-sms.md` in the bundle and write the following.

```markdown
---
type: Change Request
title: Allow receiving codes by SMS as well
state: proposed
requested_by: Customer A Inc.
received_at: 2026-10-28T10:00:00+09:00
generated: { by: human:sato, at: 2026-10-28T10:00:00+09:00 }
---
```

`received_at` is the date and time the change request was received. Do not change this value, even if you change `state` later. It is used when you check review progress with `progress`.

### 2. Before accepting, check how far the change reaches

`impact` lists every document that depends on the changing document, regardless of dates.
If you run it before rewriting the requirement, you see what you will have to review if the requirement changes.

```bash
adaptrace impact requirements/mfa.md
```

```text
Direct (3)
  acceptance/mfa.md  derived_from  ...
  decisions/auth-provider.md  depends_on  ...
  tasks/mfa-login.md  satisfies  ...

Indirect (2)
  tasks/mfa-e2e.md  depends_on -> acceptance/mfa.md  ...
  risks/idp-lockin.md  depends_on -> decisions/auth-provider.md  ...
```

The change reaches five documents: the acceptance criteria, the authentication provider decision, the implementation and test tasks, and the risk.
Under an outcome-based contract, this is the basis for a decision: accept the change, accept it for an extra fee, or decline it.
You can also see that even the authentication provider decision needs review. That suggests a plan, such as first checking whether IdP-X supports SMS.

With `--format json`, the output comes in a form you can pass to a spreadsheet or an estimating tool.

With `estimate`, you can put the material for the decision on one page.

```bash
adaptrace estimate requirements/mfa.md --request change-requests/cr-001-sms.md --format markdown
```

- It lists the documents the change reaches. It also shows the number of Tasks for each `state`, finished Tasks that must be redone, the people involved (`owner`) and Milestones whose due dates are at risk
- With `--llm "claude -p"`, each document gets a rough size (`small` / `medium` / `large`) and effort in person-hours, plus a total. The figures come from an LLM (an AI that generates text), so use them as a draft estimate. Check the numbers with the people in charge
- The `--format markdown` output can be pasted as is into the change request document or an Issue

### 3. After accepting, update the requirement

Set the change request to `state: accepted`.
Then add the change request to the requirement's `derived_from`, and set `generated.at` to the current date and time.

```yaml
generated: { by: human:sato, at: 2026-10-29T10:00:00+09:00 }
derived_from:
  - /meetings/2026-10-01-kickoff.md
  - /change-requests/cr-001-sms.md
```

Later, this lets you trace "why did this requirement change?" back to the change request.
With `adaptrace impact change-requests/cr-001-sms.md`, you can also check everything one change request reaches at once.
You can check how far the review has gone with `adaptrace progress change-requests/cr-001-sms.md`. For details, see [Updating PMBOK documents for a change request](pmbok.en.md).

### 4. Check the documents to review, one by one

Documents older than the requirement are marked `needs review`.

```text
Direct (3)
  acceptance/mfa.md  derived_from  updated 2026-10-03T10:00:00+09:00 (generated.at)  needs review
  ...
5 documents to review
```

Open each one. If it needs a change, change it and update `generated.at`.
**If the review finds that no change is needed, leave `generated` as it is and set `verified: { by, at }` to the current date and time.**
Without this record, the document stays `needs review` forever.
When you record the review with `verified`, the documents that depend on it are not marked for review, because its content has not changed.

### 5. Let an LLM make a first judgment

When there are many documents to review, `assess` speeds things up by letting an LLM make a first judgment.
Pass `--llm` a command that reads a prompt from standard input and writes the answer to standard output.

```bash
adaptrace assess requirements/mfa.md --llm "claude -p"
```

For each direct dependent, it shows whether a review is needed (`none` / `minor` / `major`), the reason, and a diff with the draft update.

```text
acceptance/mfa.md  derived_from  updated 2026-10-03T10:00:00+09:00 (generated.at)  minor
  The existing acceptance criterion (log in with a code from a TOTP app) is still correct. However, there is no criterion that checks receiving a one-time code by SMS, which was added to the requirement, so add one line.
  Proposal:
    ...
    -generated: { by: human:sato, at: 2026-10-03T10:00:00+09:00 }
    +generated: { by: adaptrace/0.5.0, at: 2026-10-29T03:00:00Z }
    ...
     - Can log in with a code issued by a TOTP app
    +- Can log in with a one-time code received by SMS

decisions/auth-provider.md  depends_on  updated 2026-10-05T10:00:00+09:00 (generated.at)  none
  The premises and conclusion of the decision to use IdP-X as the authentication provider do not change. However, this diff does not show whether IdP-X supports delivering one-time codes by SMS.
  Proposal: record the review in verified
```

- The LLM reads two things. One is a diff of what changed in the requirement since the document was last committed. The other is the full text of the document. Without `--llm`, only the diff is shown. The diff is also useful material when a person does the review
- **It writes no files.** Read the judgment, and apply the draft if it makes sense. The `proposal.diff` in `--format json` can be applied with `patch -p1 -d .adaptrace`
- A `none` draft only updates `verified` to record that the document was reviewed. It does not change `generated`. The reason may mention points to check. In the example above, it is whether IdP-X supports SMS. Read the reason before you apply the draft
- Only direct dependents are covered. After you update the acceptance criteria, run `adaptrace assess acceptance/mfa.md` next to check the E2E test task
- The draft's `generated.by` (`verified.by` in a `none` draft) is `adaptrace/<version>` by default. If you name the tool that made the judgment, as in `--by claude-code/1.0`, you can tell them apart

How to update PMBOK documents such as the scope statement, the WBS and the baselines for a change request without missing anything is explained in [Updating PMBOK documents for a change request](pmbok.en.md).

## Regular status checks

Before a weekly regular meeting, run these three commands to get an overview of the situation.

```bash
adaptrace validate   # broken targets, cycles, deadlocks
adaptrace stale      # documents older than their targets, documents past their review date
adaptrace board      # tasks by state, and tasks that are waiting
```

`board` marks a task with `waiting for` when it waits for an unfinished task.

```text
to_do (1)
  - Write E2E tests for MFA  tasks/mfa-e2e.md  waiting for tasks/mfa-login.md

in_progress (1)
  - Add MFA to the login screen  tasks/mfa-login.md
```

With `--format markdown`, the output can be pasted into minutes or an Issue.
If you pass the URL of the bundle in the repository to `--link-base`, task names become links to their documents.

```bash
adaptrace board --format markdown --link-base https://github.com/<owner>/<repo>/blob/main/.adaptrace/
```

If you use Claude Code, the skill `adaptrace-weekly` does all these checks together. A skill is a file that teaches Claude Code the steps of a task. The skills are written in Japanese. The skill puts overdue tasks, waiting tasks, documents that need review and the status of change requests into a table for each category, and suggests agenda items and next steps. You get the skill the same way as in [the guide to adopting Adaptrace in an existing repository](adoption.en.md#have-claude-code-help-you-bring-in-files). If you installed the plugin, you already have all the skills. If you copy the folder, replace `adaptrace-adopt` in the command with `adaptrace-weekly`.

### Judging a milestone

Before a milestone, check the requirements in its scope and the work left with `coverage`.

```bash
adaptrace coverage --milestone milestones/release.md
```

A requirement that no work satisfies is shown as `uncovered`, and one whose work is not done as `open`. Then the work the milestone waits for is listed with owners and due dates. Work due after the milestone is marked `(after the milestone)`. `coverage` is available from the release after v1.0.0.

If you use Claude Code, the skill `adaptrace-milestone` gathers the material for the judgment and lets you decide how to handle what is left in a conversation. It also shows open change requests and out-of-date documents that touch the scope, and writes changes such as moving work to the next milestone or changing a due date after you approve them. This skill is also available from the release after v1.0.0. You get the skill the same way as in [the guide to adopting Adaptrace in an existing repository](adoption.en.md#have-claude-code-help-you-bring-in-files). If you installed the plugin, you already have all the skills. If you copy the folder, replace `adaptrace-adopt` in the command with `adaptrace-milestone`.

### Regular risk reviews

For a risk, write the next review date in `stale_after`. After that date, the risk appears in `stale`.

```yaml
type: Risk
title: Lock-in to IdP-X
state: open
stale_after: 2026-10-26T00:00:00+09:00
depends_on: /decisions/auth-provider.md
```

```text
risks/idp-lockin.md  updated 2026-10-05T11:00:00+09:00 (generated.at)
  past stale_after (2026-10-26T00:00:00+09:00)
```

After the review, set `stale_after` to the next review date. If you changed the content, set `generated.at` to the current date and time; if not, record who reviewed it and when in `verified`.

If the risk is linked to a decision with `depends_on`, it also appears in `stale` when the decision changes.

If you use Claude Code, the skill `adaptrace-risk` lets you review the risks past their review date one at a time. It decides with you whether to update the assessment, create a mitigation task or close the risk, and when to review it next, and records them after you approve. For a risk whose content did not change, it records `verified` without changing `generated`. This skill is available from the release after v1.0.0. You get the skill the same way as in [the guide to adopting Adaptrace in an existing repository](adoption.en.md#have-claude-code-help-you-bring-in-files). If you installed the plugin, you already have all the skills. If you copy the folder, replace `adaptrace-adopt` in the command with `adaptrace-risk`.

## Replacing a decision

To overturn a decision, do not rewrite the old Decision. Create a new Decision instead. For example, suppose you switch the authentication provider from IdP-X to IdP-Y.

```yaml
type: Decision
title: Switch the authentication provider to IdP-Y
supersedes: /decisions/auth-provider.md
depends_on: /requirements/mfa.md
```

Mark the old Decision with `status: deprecated`. Its history is kept, and it drops out of the `impact` and `stale` lists.

However, documents that pointed to the old Decision with `depends_on` are not moved to the new Decision automatically.
Before replacing it, run `impact` on the old Decision to find the documents to relink.

```bash
adaptrace impact decisions/auth-provider.md
```

```text
Direct (2)
  risks/idp-lockin.md  depends_on  ...
  tasks/mfa-login.md  depends_on  ...
```

For these two documents, change the target to the new Decision and review their content as well.

If you use Claude Code, the skill `adaptrace-supersede` lets you do this work in a conversation. A skill is a file that teaches Claude Code the steps of a task.

- It creates the new Decision and marks the old Decision with `status: deprecated`. It does not change the body of the old Decision
- For each document that depended on the old Decision, it decides with you whether to relink it to the new Decision, remove the dependency, stop it (for work that is no longer needed), or leave it as it is
- It lists the relinked documents and the documents affected indirectly as documents to review. You can do the review with the skill `adaptrace-review`

You get the skill the same way as in [the guide to adopting Adaptrace in an existing repository](adoption.en.md#have-claude-code-help-you-bring-in-files). If you installed the plugin, you already have all the skills. If you copy the folder, replace `adaptrace-adopt` in the command with `adaptrace-supersede`.

## Waiting and deadlocks

Write the order of tasks with `depends_on` or `blocks`. `depends_on` means this document waits for the target. `blocks` means the target waits for this document.
Either way, the relationship appears as `waiting for` in `board`.

If two documents wait for each other, `validate` gives a warning. This state is called a deadlock.

```text
warning tasks/mfa-e2e.md:12  deadlock: tasks/mfa-login.md waits for tasks/mfa-e2e.md (blocks), tasks/mfa-e2e.md waits for tasks/mfa-login.md (depends_on). Remove one of these dependencies, or split a document so part of the work can start  [dependency-deadlock]
```

This can happen while a plan is still being worked out, so it is a warning, not an error. The reasons are in [ADR-009](../../.adaptrace/decisions/adr-009-deadlock-warning.md).
To resolve it, remove one dependency, or split a task so that part of the work can start first.
For example, if you split it into "prepare E2E tests" and "run E2E tests", the preparation can go on alongside the implementation.

## Tidying dependencies

As documents grow in number, some dependencies need tidying. `health` suggests candidates for tidying. None of them are errors.

```bash
adaptrace health
```

| Candidate | Description | Usual handling |
|---|---|---|
| `deprecated-target` | Points to a deprecated document | Relink to the document that replaced it |
| `redundant-dependency` | A dependency that reaches the same document through another path with the same key, or a dependency written twice | Remove it. Keep it if you want to show the direct relationship explicitly |
| `orphan` | Has no dependency with any document that is not deprecated | Add dependencies, or deprecate it if it is not needed |

Deadlocks and cycles are reported by `validate`.

If you use Claude Code, the skill `adaptrace-health` lets you do this work in a conversation.

- It counts the results of `health` and `validate` by category, and asks where to start tidying
- For each candidate, it reads the related documents and suggests how to handle it, with reasons. You make the decision
- It writes only the diffs you approve. It does not change the body of a document or its last update (`generated`)

You get the skill the same way as in [the guide to adopting Adaptrace in an existing repository](adoption.en.md#have-claude-code-help-you-bring-in-files). If you installed the plugin, you already have all the skills. If you copy the folder, replace `adaptrace-adopt` in the command with `adaptrace-health`.

## Creating requirements and decisions from minutes

First, record what was decided in a meeting as a Meeting document. Then create requirement and decision documents from it.

```yaml
type: Requirement
title: Add multi-factor authentication to login
derived_from: /meetings/2026-10-01-kickoff.md
```

This keeps a record of when, and in which meeting, the agreement was made.
When the minutes are corrected, `impact` shows the requirements and decisions affected.

### Let an LLM write drafts

With `extract`, an LLM writes drafts of Decisions, Tasks, Requirements and Risks from the minutes.

```bash
adaptrace extract meetings/2026-10-01-kickoff.md --llm "claude -p"           # only shows the drafts
adaptrace extract meetings/2026-10-01-kickoff.md --llm "claude -p" --write   # creates new files
```

- Every draft has `status: draft` and points to the minutes with `derived_from`. After checking the content, remove `status` or set it to `stable`
- The list of existing documents is also passed to the LLM. So it does not recreate existing requirements or decisions, and links to them with `depends_on` or `satisfies` instead
- Even with `--write`, it does not change existing files. It only creates new ones
- If the minutes name a person in charge or a due date, they go into `owner` or `due`
- Topics without a conclusion, such as "we will discuss it again next week", do not become drafts

### Let Claude Code help you take in minutes

If you use Claude Code, the skill `adaptrace-minutes` lets you take in minutes in a conversation. A skill is a file that teaches Claude Code the steps of a task.

- If the minutes are outside the bundle, it first turns them into a Meeting document. It does not copy contact details such as e-mail addresses
- Besides creating new documents, it also suggests updates to existing ones. Examples are the `state` of a finished task and a replaced decision. When it replaces a decision, it writes `supersedes` in the new decision and sets the old decision to `status: deprecated`
- Content that changes a requirement, such as a request from a customer, is not written into the requirement. The skill guides you to take it as a change request instead
- No `--llm` command is needed. You look at the diffs and decide which files to write

You get the skill the same way as in [the guide to adopting Adaptrace in an existing repository](adoption.en.md#have-claude-code-help-you-bring-in-files). If you installed the plugin, you already have all the skills. If you copy the folder, replace `adaptrace-adopt` in the command with `adaptrace-minutes`.

## Using it with Backlog.md

You can split the work like this: day-to-day task management happens on the [Backlog.md](https://github.com/MrLesk/Backlog.md) kanban board, and Adaptrace manages the links to requirements and decisions.

```bash
adaptrace sync            # only shows what would change
adaptrace sync --write    # actually writes
```

- It converts `type: Task` documents and Backlog.md tasks both ways. `state` corresponds to Backlog.md's `status`
- `depends_on` entries that point to requirements or decisions stay only on the Adaptrace side. On the Backlog.md side, only dependencies between tasks remain, so the kanban board stays uncluttered
- When the same task has changed on both sides, it does not overwrite either. It reports a conflict. Use `--resolve adaptrace` or `--resolve backlog` to make both sides match one of them

Developers move tasks in Backlog.md. Before the regular meeting, the PM brings them in with `sync` and checks `stale` and `board`.
With this flow, everyone can use the tool they are used to.

[Using Adaptrace with Backlog.md](backlog-md.en.md) explains everything from installation to working with both, with screenshots.

## Delegating to AI agents

If you register `adaptrace mcp` with an AI agent such as Claude Code, the agent can read the bundle and create draft updates.
MCP is a mechanism that lets AI agents use external tools.

```bash
claude mcp add adaptrace -- bun /path/to/Adaptrace/src/cli.ts mcp .adaptrace
```

For example, you can ask:

- "Turn what was decided in these minutes into Decisions, and the action items into Tasks."
- "I added an SMS requirement to requirements/mfa.md. Judge the impact with assess_context and give me a draft update for each document."
- "Review the documents listed by stale, and sort them into those that need changes and those that don't."
- "Look at this week's board and tell me which tasks are stuck waiting."

The agent works in this order.

1. It checks the situation with `impact`, `stale` and `board`
2. With `assess_context`, it gets the diff of the changed document and the full text of each dependent, and makes a judgment
3. It creates draft updates with `propose_document` and `propose_update`

Each draft update comes with the diff and the `validate` problems the change would add or remove.
**The MCP server writes no files.** A person decides whether to apply the changes.
If the agent applies them with its own editing tools, check the diff before applying it.

For documents the agent creates, set `generated.by` to a value such as `claude-code/1.0`. This tells them apart from documents written by people (`human:<id>`).

## Building it into Git and CI

A bundle is just Markdown. So you can keep it in the same repository as the code and review it in PRs.

- If changes to requirements and decisions also go through PRs, the diffs are kept. You can trace who agreed to what, and when, in the git history
- The last update is decided only by `generated.at` in the frontmatter. Git commit dates are not used, so the results do not depend on when you committed or where you run the command
- If CI runs `adaptrace validate`, broken targets and cycles are stopped at the PR stage. CI is a system that runs checks automatically on every change. The exit code is 1 if there are errors, and 0 if there are only warnings
- If you change the body but forget to update `generated`, `validate` gives a warning. This check uses the git history. In CI, configure it to fetch the full history (for GitHub Actions, `fetch-depth: 0` in `actions/checkout`)

## Common pitfalls

- **Write a time zone in dates and times.** `2026-10-29` or `2026-10-29 10:00` are treated as "no date and time" and cannot be compared. Write them like `2026-10-29T10:00:00+09:00`
- **Do not write progress in `status`.** `status` is used only for the OKF lifecycle (`draft`, `stable`, `deprecated`). Write progress in `state`
- **The project decides the values of `state`.** For Tasks converted to and from Backlog.md, use Backlog.md's `statuses` in lowercase (`to_do`, `in_progress`, `done` and so on)
- **Start dependency paths with `/`.** Relative paths can also be read. But bundle-absolute paths starting with `/` are less likely to break when files move
- **Do not link everything with `depends_on`.** The review chain gets too long, and a single change marks every document `needs review`. Decide by asking: if the target changes, do I really need to review this document?
