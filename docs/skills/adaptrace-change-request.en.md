# adaptrace-change-request (English reference translation)

[Japanese original (the skill that runs)](../../skills/adaptrace-change-request/SKILL.md)

> This is a reference translation for English readers. Claude Code runs the Japanese SKILL.md; this file is not loaded as a skill. When the two differ, the Japanese version is correct (ADR-003).

## When the skill is used

The skill takes a request received by email or chat as an Adaptrace change request document, and shows the affected documents and any overlapping open change requests. Use it when the user says "Make this request a change request", "I want to take in a change request" or "Look at the impact of this request", or when the user hands over the text of a request or an email file. It writes only after the user approves the diff. It does not decide whether to approve or reject.

## Overview

Create a change request document in an Adaptrace bundle (`.adaptrace/` by default) from the text of a request.
Then show an estimate of the impact and any overlapping open change requests, so that the material for a decision is ready.
Follow "3. Take in a change request" in the Adaptrace guide [Updating PMBOK documents for a change request](../guide/pmbok.en.md) (`docs/guide/pmbok.md`).
The exact rules for keys and commands are in Adaptrace's `docs/spec/schema.md`.
They are all in the Adaptrace repository; "Shared conventions" below says where to find them. Read them when you are unsure how to proceed.

## Rules

- **Do not change any file before the user approves.** Before writing, show the diff for each file and get approval (Adaptrace design principle 6)
- If the user leaves a decision to you ("whatever you recommend"), that is not approval to write. Show the recommendation as a diff and ask again whether you may write it
- **Do not approve or reject change requests.** Set `state` to the value for "received". People make the decision. The estimates and judgments this skill shows are material for that decision
- Do not guess facts that are not in the request (the requester's organization, the time it was received, the starting documents and so on). If you do not know, ask
- **Do not write contact details in the bundle.** Do not write email addresses, phone numbers or signatures in the change request document or in stakeholder documents
- The impact estimate and the judgments against other change requests are internal analysis. Do not write them in the change request document. Put them in the report to the user. The change request document is a record of the request as received
- Do not change existing documents (other change requests, requirements, decisions and so on). If you think a change is needed, put it in the report
- Commit and push only when the user asks
- When you ask the user something, use a tool that asks with choices (AskUserQuestion) if one is available. Otherwise, show numbered choices in text and wait for the answer

## How to write paths

| Where | How to write | Example |
|---|---|---|
| A document passed to a command | Path inside the bundle, without a leading `/` | `adaptrace estimate --request change-requests/cr-011-csv-export.md` |
| The value of a frontmatter key | Path inside the bundle, with a leading `/` | `changes: /requirements/req-7-report.md` |

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
2. Check where the bundle is. The default is `.adaptrace/` at the root of the repository. If it is somewhere else, add `--bundle <directory>` to every command from here on. If there is no bundle, tell the user that existing documents must be brought in first (the skill `adaptrace-adopt`, or the guide "Bringing Adaptrace into an existing repository")
3. Check the current state
   - `adaptrace validate`: note the errors that exist before taking in the request
   - `adaptrace list --type "Change Request" --format json --columns state,requested_by,received_at,changes`: the existing change requests. Use the type name the bundle uses
   - Check the values used for `state` in existing change requests. If the values that mean "settled" (approved, rejected and so on) differ from the defaults of `conflicts` (`approved`, `accepted`, `rejected`, `deferred`, `implemented`, `closed`, `done`), confirm with the user and add `--settled <value,...>` to `conflicts` in step 6
   - `adaptrace list --format json --columns type,side,role`: stakeholder documents (documents whose `type` is `Stakeholder` or that have `side`) and documents that are candidates for starting documents
4. Get the current date and time with a time zone, only once (on GNU date, for example, `date --iso-8601=seconds`). Use this value for `generated.at` of every document created this time

## 1. Read the request

You receive the request as text pasted into the conversation or as a file (such as a saved email).

Read the following, put it in a table, and confirm it with the user.

| Item | Where to read it | If unknown |
|---|---|---|
| What is requested | The body | Ask the user |
| Requester | The sender, the signature, the body | Ask the user |
| Time received | The email's `Date:`, the time of the chat post | Ask the user. Do not use the current time |
| One request or several | The body | If several things are requested, suggest one file each |

- Write the time received in the form `2026-03-04T09:30:00+09:00`. Use the time zone of the email's `Date:` as is
- Check whether an existing change request already asks for the same thing. If one does, ask whether to create a new one or to treat this as a record for the existing change request

## 2. Decide the starting documents

The starting documents are the documents this change request changes directly. Write them in `changes`.

- Read the request and the bodies of the bundle's documents, and list candidates. For each candidate, show the grounds (the sentence in the request and the matching part of the document)
- Include only the documents changed directly. Documents reachable from the starting documents through dependencies (decisions, tasks, risks and so on) are found by `estimate`, so do not include them
- The user decides which starting documents to adopt. Ask with choices (multiple selection)
- If no document in the bundle matches (such as a new requirement), say so. You may take in the change request without `changes`. In that case, `conflicts` reports that it cannot compare this change request

## 3. Identify the requester

Identify the requester with a stakeholder document. In `requested_by`, write the path of that document starting with `/`.
`meeting` uses the `side` of this document to separate the people invited to internal meetings from those invited to meetings with the customer.

- Look for the requester among the existing stakeholder documents. Match by display name (`title`) and organization or department. If you find one, confirm that it is the right document
- If you find none, suggest creating a stakeholder document
  - The path is `stakeholders/<id>.md`. Write `<id>` with lowercase Latin letters, digits and `-`
  - Frontmatter: `type: Stakeholder`, `title` (organization or department, and a name if needed), `side` (`internal` or `customer`), `role` (the role)
  - Always ask the user for `side` and `role`. Do not guess them from the email domain or similar
  - Do not write contact details. Write only the name and role

```yaml
---
type: Stakeholder
title: Customer B Corp., Accounting Department
side: customer
role: Ordering contact
generated: { by: <agent>/<model ID>, at: <date and time obtained in step 0> }
---
```

## 4. Create the change request document

From what has been decided so far, show the diff of the change request document and write it only after approval.

- The path is `change-requests/<number>-<summary>.md`. Number it in line with the existing change requests (if they go up to `cr-010`, the next is `cr-011`). Write `<summary>` briefly with lowercase Latin letters, digits and `-`
- Use the same `type` name as the existing change requests (`Change Request` by default)
- Set `state` to the value that means "received". Use the value the existing change requests use. If there is none, recommend `submitted`

```yaml
---
type: Change Request
title: Also allow the monthly report to be exported as CSV
state: submitted
requested_by: /stakeholders/b-corp.md
received_at: 2026-03-04T09:30:00+09:00
changes: /requirements/req-7-report.md
generated: { by: <agent>/<model ID>, at: <date and time obtained in step 0> }
---

# Also allow the monthly report to be exported as CSV

## The request

(The key points of the request. Keep the requester's words as much as possible)

## Receipt record

- Received via: email (subject "…")
```

- In the body, write the key points of the request. You may quote the text of the request, but remove contact details and the signature
- Do not write the impact estimate or the judgments against other change requests in the body
- Use a scalar for `changes` with one entry and a block-style list for two or more
- For each new document, add a one-line link of the form `* [display name](file name)` to the `index.md` of its directory. If you create a new directory (such as `stakeholders/`), create its `index.md` and add a link to it in the root `index.md` too
- Ask whether to add one line to `log.md` about taking in the request. If you add it, write it under a heading for today's date (`## YYYY-MM-DD`) in the form `* **Creation**: <description>`, newest first. Write the description in the same language as the bundle's documents

After writing, run `adaptrace validate`. If there are more errors than in step 0, explain the cause and show a diff that fixes them.

## 5. Estimate the impact

Do not run `estimate` for a change request without starting documents (`changes`). `estimate` fails. In that case, report that the affected documents cannot be shown because there are no starting documents, and go to step 6.

1. Run `adaptrace estimate --request <change request>`. Starting from the documents in `changes`, it shows the documents reached, the count per type, the people involved, the milestones whose due dates are affected, and the finished tasks that would need rework
2. Read the bodies of the starting documents and the documents reached, and decide the following for each document
   - Whether a review is needed (needed, probably needed, probably not needed), and why
   - If needed, the size (small, medium, large) and a rough effort (person-hours)
3. Before making the table, confirm the assumptions of the estimate with the user
   - Assumptions are things that affect the estimate but are not written as decided in either the request or the documents. For example, which system or vendor to use, or how much is in scope this time
   - What the documents show to be possible ("the service we use also has that feature" and so on) is not "what has been decided". Show it as an assumption and get confirmation
   - For each assumption, show what you guessed and the grounds, and ask "May I estimate on this assumption?" If the user has not decided, write in the estimate where the effort changes if the assumption changes
4. Put the result in a table. Also write the total effort, the assumptions confirmed, and the assumptions not yet decided

| Document | Review | Size | Rough effort | Reason |
|---|---|---|---|---|
| `requirements/req-7-report.md` | Needed | Small | 1 person-hour | Add CSV to the output formats |

- The estimate is this agent's judgment. In the report, say that it is material for a decision, not a final estimate
- Do not use `--llm`. This agent makes the needed judgments itself

## 6. Check for overlapping change requests

1. Run `adaptrace conflicts --format json` and take the pairs that include this change request. Change requests whose `state` is a settled value (`approved`, `rejected` and so on) are not included
2. For each pair, read the bodies of the two change requests and of the documents both change, and judge the pair as one of these four
   - `conflict`: they cannot both be done
   - `duplicate`: they ask for the same thing (even in different words or from different people)
   - `compatible`: they can both be done
   - `unclear`: the documents alone are not enough to judge
3. For each pair, write the reason and the points to decide in discussion
4. Put the result in a table. Make one row per pair, and write exactly one of the four values in the judgment column

| Pair | Judgment | Reason | Points to decide in discussion |
|---|---|---|---|
| `cr-009` and `cr-011` | conflict | `cr-009` makes the report PDF only; `cr-011` adds CSV | Which one takes priority |

- If there are no overlapping pairs, say so
- A change request without starting documents cannot be checked for overlaps. Report that. `conflicts` shows only documents whose type is `Change Request` as change requests it cannot compare (`unlinked` in the JSON). If the type name differs, they do not appear in `unlinked` either, so do not wrongly report "no overlaps"
- The judgment is material for discussion, not a decision

## 7. Report

Report the following together. Report in the conversation; do not write it to a file.

- The documents created (change request, stakeholder) and the result of `validate`
- The starting documents and the impact estimate (the table and total from step 5)
- Overlapping change requests, their judgments, and the points to decide in discussion (step 6)
- What the user decides later (whether to approve, whom to discuss with and so on)

If there are overlapping pairs, ask whether to prepare a discussion meeting. If so:

1. Start with an internal meeting: `adaptrace meeting <this change request> <overlapping change request>... --audience internal`
2. Show the user the candidate participants, the agenda and the `Meeting` draft. If anyone is marked as needing confirmation before being invited, tell the user
3. Ask whether to save the draft as a file, and after approval run the command with `--write`. Treat it as approval only when the user clearly answers "save it as a file". If the user answers "whatever you recommend" or "up to you", show the recommendation and the reason, and ask again
4. `--write` creates only the `Meeting` draft file. Next, show the following as a diff and write it after approval
   - Add a link to the draft to the `index.md` of the directory where the draft was placed (`meetings/` by default). If the directory is new, create its `index.md` and add a link to it in the root `index.md` too
   - Ask whether to record in `log.md` that the meeting draft was created
   - After adding, run `adaptrace validate`
5. Do not schedule the meeting or send invitations. People do that
