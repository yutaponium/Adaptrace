# adaptrace-change-decision (English reference translation)

[Japanese original (the skill that runs)](../../skills/adaptrace-change-decision/SKILL.md)

> This is a reference translation for English readers. Claude Code runs the Japanese SKILL.md; this file is not loaded as a skill. When the two differ, the Japanese version is correct (ADR-003).

## When the skill is used

The skill records the decision to approve, reject or defer change requests in an Adaptrace bundle. It sets the change request's `state` to a value for the decision, and writes in the body the date of the decision, who decided and the reason. Before recording, it checks the undecided change requests whose impact ranges overlap, and reports them with the steps that follow the record. Use it when the user says "We approved CR-002", "Record the decision on the change request", or "Record the results of the change control meeting". People make the decision; this skill records it. It writes only after the user approves the diff.

## adaptrace-change-decision

Record the decision on change requests (approve, reject, defer) in the change request documents of the bundle (`.adaptrace/` by default).
You can record the decisions on several change requests in one session.
This skill does not review an approved change request (from adding `derived_from` to the starting documents to marking it implemented). Do that with the skill `adaptrace-review`.
The steps fall between "3. Take in a change request" and "4. Once approved, update from upstream" in the Adaptrace guide [Updating PMBOK documents for a change request](../guide/pmbok.en.md) (`docs/guide/pmbok.md`).
The exact rules for keys and commands are in Adaptrace's `docs/spec/schema.md`.
They are all in the Adaptrace repository; "Shared conventions" below says where to find them. Read them when you are unsure how to proceed.

## Rules

- **Do not change any file before the user approves.** Before writing, show the diff and get approval (Adaptrace design principle 6).
- Show diffs per document. You may show the diffs of several documents together and get approval once. In that case too, list which documents you will write and confirm the list.
- If the user leaves the decision to you ("whatever you recommend"), that is not approval to write. Show your recommendation as a diff, and ask again whether you may write it. Do not put choices in the diff; write only what is decided.
- **Do not approve, reject or defer a change request yourself.** Record only the decisions the user tells you. Do not change a change request whose decision you have not been told.
- **Do not write the reason, the date or who decided by guessing.** If you do not know, ask. If the user answers that they do not know, leave that item out and tell them to write it later. Do not write negatives (such as "there are no conditions"). Do not write items the user answered "none" to in your confirming questions either.
- In a change request document, change only `state`, `generated`, and the "判断" (decision) heading you add at the end of the body. Do not change `received_at`, `changes`, `requested_by`, or the body as received.
- Do not change other documents (requirements, decisions, tasks, other change requests, `index.md` and so on). Do not create new documents either. The skill `adaptrace-review` adds `derived_from` to the starting documents. If you think a change is needed, write it in the report (for example, when `index.md` lists the states of the change requests).
- People contact the requester. If the user wants, show a draft message in the conversation. Do not write the draft in the bundle.
- Commit and push only when the user asks.
- When you ask the user something, use a tool that asks with choices (AskUserQuestion) if one is available. If not, show numbered choices in text and wait for the answer.

## How to write paths

| Where | How to write | Example |
|---|---|---|
| A document passed to a command | Path inside the bundle. No leading `/` | `adaptrace progress change-requests/cr-011-csv-export.md` |
| A link in the body | Relative path from that document | `[Change control meeting on November 26](../meetings/2026-11-26.md)` |

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
3. Check the current state
   - `adaptrace validate`: note the errors and warnings that exist before recording the decisions
   - `adaptrace list --format json --columns type,state`: the list of documents. Check here the type names for change requests and minutes (`Change Request`, `Meeting` and so on). `list` leaves out documents with `status: deprecated`
   - `adaptrace list --type "<change request type>" --format json --columns state,requested_by,received_at,changes`: the list of change requests
4. Get the current date and time with the time zone, once (for example, with GNU date, `date --iso-8601=seconds`). Use this value for `generated.at` of every document you update this time

## 1. Confirm the decisions

1. Identify the change requests whose decisions you record. If the user named them by number or title, find their paths in the list from step 0. If you cannot find one, ask instead of guessing
2. Read the body of each change request
3. For each change request, confirm the following. If the user's request already says it, use it without asking. Ask about the missing items together. If you do not know the `state` values of step 2 or the ID for `generated.by` of step 4, you may put them in the same question
   - The result: approve, reject or defer. For an approval with conditions, the conditions
   - The date of the decision. If the year is left out, fill in the year of today's date. If the filled-in date is later than today, use the previous year. Tell the user you filled it in and get confirmation
   - The name of the meeting that decided, or who decided. You may write the people the user names (such as the chair). Write a person with the name the user used. Follow the existing "判断" headings for how the meeting is called
   - The reason
   - For a deferral, when or on what condition it is reconsidered
4. Check whether the minutes of the meeting are in the bundle. Look for a document of the minutes type (`Meeting` and so on) in the list from step 0, and match it by date and title. If there is no minutes type or no matching document, do not write a link to the minutes. This skill does not create minutes
5. If a change request's `state` already has a value for a settled decision (approved, rejected and so on), confirm that the decision changes. Even then, do not remove the earlier "判断" heading. Add a new "判断" heading below it

## 2. Decide the `state` values

Each project decides the list of `state` values. There is no configuration file that sets them. This skill does not fix the values either.

1. In the list from step 0, check the `state` values used by the existing change requests. Sort each value into settled (approved, rejected, deferred, implemented and so on) or undecided (submitted, under review and so on). Ask the user about values whose names do not tell
2. Decide the value for each decision
   - If the existing values include one for approval, rejection or deferral, use it (example: if `declined` is used for rejection, do not use `rejected`)
   - If there is no such value, recommend `approved` (approval), `rejected` (rejection) and `deferred` (deferral), and get the user's confirmation. They are the default values that `conflicts` treats as settled. Even when the user asked you to follow the existing values and there is no such value, recommend these three and get confirmation. The existing values and the recommended values may be mixed
3. Once the values are decided, decide the list of settled values to pass to `conflicts`. The defaults of `conflicts` are `approved`, `accepted`, `rejected`, `deferred`, `implemented`, `closed` and `done`. The list is the defaults, minus the values you sorted as undecided in step 2.1, plus the existing settled values and the values decided this time. If the list differs from the defaults, add `--settled <value,...>` to `conflicts` in step 3. `--settled` replaces the defaults, so list every value in the list

## 3. Before writing, check overlaps and the review status

Run the following **before writing any document**. A change request whose decision is recorded gets a settled value and drops out of `conflicts`.

1. `adaptrace conflicts --format json` (with the `--settled` decided in step 2.3): from `pairs`, take the pairs that include a change request you decide this time. Each pair has `a`, `b`, `sharedTargets` (the starting documents both point to with `changes`) and `overlap` (the documents in both impact ranges). If the other request is not one you decide this time, it stays undecided after the decision. Note the pair, `sharedTargets` and `overlap`
   - When you re-decide change requests that already have settled values, run `conflicts` again with a `--settled` that leaves out the current values of all the requests you re-decide. With a settled value, a request is not a subject of `conflicts`. From that result, take the pairs that include a request you re-decide. If the other side is not decided this time and its `state` is in the list of step 2.3, it is already settled, so do not use that pair
2. In `backlinks` of `adaptrace graph --format json`, look at the key of each change request's path. If there is an item whose `kind` is a review-chain key (`derived_from`, `depends_on`, `satisfies`), from any document, it counts. If there are any, the review has already started. Do not change the body or `generated` of that change request in step 4. If you re-decide that change request as rejected or deferred, note the documents that point to it with `derived_from`, and report them in step 6
3. For each change request you approve, check that it has `changes`. Without `changes` there is no starting document, and the review cannot start with `adaptrace-review`; write that in the report. If `changes` points to a document that does not exist, `validate` in step 0 already shows it as an error. The values of `changes` start with `/`. Remove the leading `/` when you pass them to a command

## 4. Update the change request documents

For each change request, show the diff and get approval before writing. The diff shows the lines you change (`state`, `generated`) and the "判断" heading you add. You may leave out the body that does not change.

- Set `state` to the value decided in step 2
- Add a "判断" (decision) heading at the end of the body. Write the heading in the language of the body (`Decision` for an English body). Write only what you confirmed in step 1. Leave out items you do not know
  - In the first sentence, write when, who and what was decided
  - Write the reason. For an approval with conditions, write the conditions. For a deferral, write when or on what condition it is reconsidered
  - If the minutes of the meeting are a document, link to it from the body with a relative path. Do not make it a dependency such as `derived_from`
- Set `generated` to the date and time from step 0. Set `by` to the user who asked you to record the decision with this skill (`human:<ID>`). Do so even if someone else, such as the chair, made the decision, because the record writes down the decision the user told you. Follow the existing documents for how the ID is written. If you do not know it, ask. You may overwrite `by` from when the request was taken in; the time it was taken in stays in `received_at`
- For a change request that already had documents pointing to it with a review-chain key in step 3.2, change only `state`. Do not change the body or `generated`. If the change request's `generated` gets newer, the reviewed starting documents show as out of date. Write the decision in `log.md` in step 5
- Do not change `received_at`, `changes`, `requested_by`, other keys, or the body as received

```markdown
---
type: Change Request
title: 検索結果をCSVで出力できるようにする
state: approved
requested_by: /stakeholders/sales.md
received_at: 2026-11-10T09:30:00+09:00
changes: /requirements/req-7-report.md
generated: { by: human:sato, at: <date and time from step 0> }   # the user who asked for the record
---

# 検索結果をCSVで出力できるようにする

(The body as received. Do not change it.)

## 判断

2026-11-26の変更管理の会議（議長：田中）で、承認した。営業部門からの要望が多く、出力の機能は既存の帳票の仕組みで作れるため。
```

## 5. Record

1. Ask whether to record this in `log.md`. You may ask together with the diffs of step 4. If you did not change the body of a change request in step 4, always record its decision in `log.md`, because `log.md` is the only record of that decision. In that case too, show the diff and get approval
2. If you record it, write one line `* **Update**: <description>` under the date heading of today (the day of the work) (`## YYYY-MM-DD`). In the description, write the meeting, its date and the decision on each change request. Follow the existing lines, not the example below, for how numbers are written (such as spaces around them) (example: "Recorded the decisions of the change control meeting on November 26: approved cr-011, rejected cr-012"). For a change request whose body you did not change in step 4, write the reason here too
3. Run `adaptrace validate`. If there are more errors than at step 0, explain the cause and show a diff that fixes them. Do not undo what you wrote while you wait for approval of the fix. `validate` does not check the `state` values or the content of the "判断" heading; those are as confirmed in the diffs of step 4

## 6. Report

Report the following together. Report in the conversation, not in a file.

- The decision on each change request and the `state` value written
- Approved change requests
  - The review can proceed with the skill `adaptrace-review`. It starts by adding `derived_from` to the starting documents (the documents `changes` points to)
  - As a guide to the review order, you may show the order list of `adaptrace impact <starting document> --order review` for each starting document. The list does not include the starting document itself; it starts from the document to review after it. At this point, its last line usually says "0 documents to review". That is because the starting documents are not updated yet; it does not mean no review is needed. If it is 0, do not show that line. If it is not 0, some documents are already older than the starting document; show the count and the documents
  - A change request without `changes` needs its starting documents decided before the review starts
- The change requests noted in step 3.1 that stay undecided after the decision. If one overlapped several change requests decided this time, report on each of them
  - If one overlapped an approved change request: the approval changes the overlapping documents, so that change request needs its estimate and judgment redone
  - If one overlapped a rejected change request: that overlap no longer needs attention
  - If one overlapped a deferred change request: it drops out of the overlap check for now, but when the deferred change request is reconsidered, check the overlap again
- Pairs of change requests decided this time
  - Two approved change requests: both change the same documents. The review needs to apply both changes together
  - An approved and a deferred change request: when the deferred change request is reconsidered, the documents that overlapped (the starting documents for `sharedTargets`, or the documents in the impact range if only `overlap`) will already have been changed by the approval
  - A pair with a rejected change request: need not be reported
- When you re-decided a change request whose review had started as rejected or deferred: the documents noted in step 3.2 that point to it with `derived_from`. People decide whether to undo the changes applied
- People contact the requesters (`requested_by`) of the rejected or deferred change requests. If the user wants, show a draft message in the conversation
- Errors and warnings from `validate` that increased since step 0
