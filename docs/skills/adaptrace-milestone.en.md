# adaptrace-milestone (English reference translation)

[Japanese original (the skill that runs)](../../skills/adaptrace-milestone/SKILL.md)

> This is a reference translation for English readers. Claude Code runs the Japanese SKILL.md; this file is not loaded as a skill. When the two differ, the Japanese version is correct (ADR-003).

## When the skill is used

Before a milestone in an Adaptrace bundle, the skill gathers the material for judging whether it can be met, and decides with the user how to handle the work and requirements left. It shows how the requirements in the scope are covered, the work not done, work that will miss the due date, open change requests that touch the scope, and out-of-date documents. For each item, it decides with the user how to handle it, such as moving work to the next milestone or changing a due date. Use it when the user says "I want to judge the release", "Check whether we make the milestone", or "Sort out the remaining work". People make the judgment. It writes only after the user approves the diff.

## adaptrace-milestone

Before a milestone, gather from the bundle (`.adaptrace/` by default) the material for judging whether it can be met.
For each item left, decide with the user how to handle it, and update the milestone's plan (its scope and due date).
People judge whether the milestone can be met. This skill shows the material and the choices.
The exact rules for keys and commands are in Adaptrace's `docs/spec/schema.md`. The rules of `coverage` are there too.
They are all in the Adaptrace repository; "Shared conventions" below says where to find them. Read them when you are unsure how to proceed.

## Rules

- **Do not change any file before the user approves.** Before writing, show the diff and get approval (Adaptrace design principle 6).
- Show diffs per document. You may show the diffs of several documents together and get approval once. In that case too, list which documents you will write and confirm the list.
- If the user leaves the decision to you ("whatever you recommend"), that is not approval to write. Show your recommendation as a diff, and ask again whether you may write it.
- **Do not judge yourself whether the milestone can be met.** Show the material and the choices for each item. The user makes the judgment.
- Change only these keys and `log.md`. Do not change other documents or keys. Do not create new documents either.
  - In the milestone documents: `due`, `depends_on`, `blocks`, `state`
  - In work (Task) documents: `due`, `blocks`
  - `log.md`: only add lines
- Do not change requirement, decision or change request documents. If a requirement's content or scope needs to change, guide the user to take it in as a change request (skill `adaptrace-change-request`).
- Do not create tasks for a requirement that lacks work. Report that work is missing; the user decides whether to create tasks.
- When you change only dependency keys, `due` or `state`, do not change `generated`.
- Commit and push only when the user asks.
- When you ask the user something, use a tool that asks with choices (AskUserQuestion) if one is available. If not, show numbered choices in text and wait for the answer.

## How to write paths

| Where | How to write | Example |
|---|---|---|
| A document passed to a command | Path inside the bundle. No leading `/` | `adaptrace coverage --milestone milestones/release-1.md` |
| The value of a frontmatter key | Path inside the bundle. With a leading `/` | `depends_on: /tasks/login-mfa.md` |

## Shared conventions

Rules shared by the Adaptrace skills.

- **How to write commands**: in this skill, `adaptrace` stands for the way to run Adaptrace decided in step 0. When you run it, replace `adaptrace` with that command and write it out in full every time (example: `bun ~/tools/adaptrace/src/cli.ts validate`). Run one command at a time. Do not use shell variables, aliases, loops, chaining with `&&` or `;`, or `$?`: some environments reject them or ask for approval. When a command fails, the tool result shows the exit code. Read files with a file-reading tool (such as Read), not the shell. Run commands at the root of the repository you are working in, because the default bundle location and the paths you pass are relative to the root
- **Where the Adaptrace specification and guides are**: they are in the Adaptrace repository, not in the repository you are working in. Look in this order
  1. If Adaptrace runs as `bun <path>/src/cli.ts`, the specification is `<path>/docs/spec/schema.md` and the guides are in `<path>/docs/guide/`
  2. If the `adaptrace` command was installed with `bun add -g`, they are in `~/.bun/install/global/node_modules/adaptrace/docs/` by Bun's default
  3. If you installed this skill as a Claude Code plugin, they are in `${CLAUDE_PLUGIN_ROOT}/docs/` (the specification is `spec/schema.md`, the guides are in `guide/`)
  4. If none of these exists or you cannot read them, check the version with `adaptrace --version` and read `https://github.com/yutaponium/Adaptrace/tree/v<version>/docs`. If you cannot read that either, ask the user instead of guessing
  - When you are unsure about the rules for types, keys or `state` values, read the specification before writing a document
- **`generated.by`**: if the skill's steps have a rule for `by`, follow it (for example, a review record names the person who made the call). Otherwise, a document written by an agent uses `<agent>/<model ID>` (example: `claude-code/claude-opus-5-5`). The model ID is the identifier used in the API, not the display name. If you do not know it, use only `<agent>` (example: `claude-code`). If the user wants their own name, use `human:<ID>`
- **Dates and times**: write dates and times such as `generated.at` in ISO 8601 with a time zone (example: `2026-11-26T10:00:00+09:00`). With GNU date, `date --iso-8601=seconds` gives one
- **Where a new key goes and how to write it**: if the skill's steps have a rule for a key's position or form (one value or a list), follow it. Otherwise, do as follows. The order of frontmatter keys has no meaning. Follow the order in existing documents. If there is no example, follow the order in this skill's examples. Put a key not in the examples just before `generated`. If existing documents write a key as a list, use a list even for one value
- **`log.md`**: date headings (`## YYYY-MM-DD`) go newest first. If there is no heading for today, add it above the existing date headings, but not above the file title (`# ...`). Write each line as `* **<label>**: <description>`. Keep the label (`Creation`, `Update` and so on) in English, and write the description in the language of the bundle's document bodies. That is fine even if an existing line written by `init` is in English. Write one line per piece of work: `Creation` if you created a document, `Update` if you updated one. Within a heading, put new lines on top

## 0. Preparation

1. Check how to run Adaptrace. If `adaptrace --version` does not work, ask the user (example: `bun ~/tools/adaptrace/src/cli.ts`). From here on, `adaptrace` means the command decided here ("Shared conventions")
2. Check where the bundle is. The default is `.adaptrace/` at the root of the repository. If it is not there, ask the user. If it is somewhere else, add `--bundle <directory>` to every command from here on
3. Run `adaptrace validate` and note the errors and warnings that exist before the judgment
4. Get the current date with the time zone, once (for example, with GNU date, `date --iso-8601=seconds`). Use it to tell whether due dates have passed, and for the heading in `log.md`

## 1. Confirm the milestone

1. `adaptrace list --type Milestone --format json --columns state,due`: the list of milestones
2. Find in the list the milestone the user named. If you cannot find it, ask instead of guessing
3. Read the milestone's body. Check its due date (`due`) and `state`. Without `state`, it is not done yet
4. `adaptrace list --type Task --format json --columns state`: check the `state` values that mean a Task or a Milestone is done. The default of `coverage` is `done`, and its JSON shows the list in `done`. If a value other than `done` (such as `completed`) means done, add `--done <value,...>` to `coverage` from here on. If you are unsure, ask
5. `adaptrace list --type "Change Request" --format json --columns state`: check the `state` values of the change requests, for step 2.2. Use the type name the bundle uses

## 2. Gather the material

1. `adaptrace coverage --milestone <milestone> --format json`
   - `requirements`: the requirements in the scope and their status (`uncovered`, `open`, `covered`). They are the requirements the milestone waits for directly, and those the work in the scope satisfies with `satisfies`. A satisfier with `counted: false` is another release's work and is not counted. A document that is not work, such as a Decision, has `done: null` and counts as satisfying the requirement if it exists
   - `scope`: the documents in the scope. Tasks and Milestones with `done: false` are the work left. Documents with `done: null` (requirements, decisions) are not work and do not go in the list of work. Work with `late: true` is not done and is due after the milestone
2. `adaptrace conflicts --format json`: take the open change requests from `requests`. A change request whose `reach` (impact range) shares even one document with the `scope` or the `requirements` of `coverage`, or includes the milestone itself, touches this milestone. Change requests without `changes` (`unlinked`) cannot be judged, so write them in the report. This skill does not use `pairs` (overlaps between change requests)
   - If the values checked in step 1.5 include a settled value that is not among the defaults of `conflicts` (such as `declined`), add `--settled`. The defaults are `approved`, `accepted`, `rejected`, `deferred`, `implemented`, `closed` and `done`. `--settled` replaces the defaults, so list every value you use
3. `adaptrace stale --format json`: the documents in `stale` that are in the `scope` or the `requirements`. Report also the documents in `unknown` (no known date) that are in the scope
4. Note the work in the `scope` that is not done and whose due date is before the date from step 0, as work past its due date. Compare the date of `due` with the date part of the date and time from step 0

## 3. Show the material

Show it in this table. Do not write a recommended judgment. For a category with no items, write "none".

| Category | Item | Content |
|---|---|---|
| Requirements lacking work (`uncovered`) | Requirement | No work satisfies it |
| Requirements not done (`open`) | The requirement and the work not done | Owner and due date of the work |
| Work that misses the due date (`late`, past due) | Work | Due date and owner |
| Open change requests that touch the scope | Change request | Overlapping documents |
| Out-of-date documents | Document | What it is older than |

When one piece of work falls in several categories, show it in each. Show the counts per category. The number of days until the milestone's due date is its due date minus today's date.

After that, ask whether to decide how to handle each item. If the user wants only the judgment, skip steps 4 and 5 and report in step 6. In that case, say that no document was changed.

## 4. Decide how to handle each item

For each item, show these choices and ask. You may read the body and add a recommendation with a reason. You may ask about similar items together.

| Handling | When it fits | Change |
|---|---|---|
| Keep as is | It is expected to finish by the due date. Accept it as a risk. For a requirement lacking work, the user plans to create tasks | No change |
| Move the work to another milestone | It will not finish in this release | Remove the work from this milestone's `depends_on`. If the work's `blocks` points to this milestone, remove that too. Add the work to the target milestone's `depends_on` |
| Change a due date | The due date of the work or the milestone can move | Change `due` of the work or the milestone |
| Take a requirement out of the scope | It was decided not to satisfy it in this release | If the milestone points to the requirement directly with `depends_on`, remove it. If the requirement was agreed with the customer, guide the user to take it in as a change request first (skill `adaptrace-change-request`) |
| Decide the change request first | An open change request touches the scope | No change. Guide the user to the skill `adaptrace-change-decision` |

- Have the user pick the target milestone from the list in step 1. If there is none, do not create one; write that in the report. Compare the target's `due` with the work's `due`, and if the work still misses the target's due date, say so
- Move only work that the milestone waits for directly with `depends_on`, or whose `blocks` points to the milestone. This skill does not move work waited for through other work. Show through which work it is waited for, using `edges` of `adaptrace graph --format json`, and leave it to the user
- **Confirm with the user before moving work that satisfies a requirement (`satisfies`).** The moved work no longer counts toward this milestone's requirement. When the rest of the work is done, the requirement shows as `covered`, but part of it is not satisfied in this release. If the requirement's scope has to be agreed again with the customer, guide the user to take it in as a change request (skill `adaptrace-change-request`). If the milestone waits for the requirement directly, the moved work still counts, so the requirement stays `open`
- Do not create tasks for a requirement lacking work (`uncovered`). Write in the report that work is missing
- This skill does not decide change requests or change requirements

## 5. Write

1. Show the changes decided in step 4 as a diff per document, and write them after approval
   - Change only the keys decided. Do not change `generated`
   - Even if `depends_on` ends up with one value, follow the existing form (a list). If it becomes empty, remove the key. Put an added value at the end of the list
2. When every item is settled and the user judges that the work in the scope is done, ask whether to set the milestone's `state` to a done value. Use the value checked in step 1.4
3. Ask whether to record this in `log.md`. You may ask together with the diff in item 1 of this step. If so, write one line `* **Update**: <description>` for the whole session under today's date heading (`## YYYY-MM-DD`). In the description, write the milestone and the handling that changed something
4. Run `adaptrace validate`. If there are more errors than at step 0, explain the cause and show a diff that fixes them
5. Run `adaptrace coverage --milestone <milestone> --format json` again, and check the state after the changes. Run it for the milestone the work moved to as well, and check that the moved work is in its scope

## 6. Report

Report the following together. Report in the conversation, not in a file.

- The milestone and its due date. The counts per requirement status after the changes
- The handling decided for each item, and the documents changed
- The risks left: work kept as is, requirements lacking work, work that misses the due date, requirements whose satisfying work was partly moved
- What people do: decide the open change requests (skill `adaptrace-change-decision`), change requirements (skill `adaptrace-change-request`), create tasks for the missing work
- If it applies, tell the user that a requirement the milestone itself satisfies (`satisfies`) shows as `open` until the milestone's `state` is set to a done value
- Errors and warnings from `validate` that increased since step 0
