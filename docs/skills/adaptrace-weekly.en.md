# adaptrace-weekly (English reference translation)

[Japanese original (the skill that runs)](../../skills/adaptrace-weekly/SKILL.md)

> This is a reference translation for English readers. Claude Code runs the Japanese SKILL.md; this file is not loaded as a skill. When the two differ, the Japanese version is correct (ADR-003).

## When the skill is used

Before a regular meeting, the skill sums up from an Adaptrace bundle the tasks with near due dates, waiting tasks, documents that need review, risks past their review date, and the status of change requests, and shows a draft agenda. Use it when the user says "I want to prepare for the regular meeting", "Sum up this week's status" or "Make the agenda for the regular meeting". It does not change documents. It creates a minutes draft only after the user approves.

## Overview

Before a regular meeting, sum up the status of the bundle (`.adaptrace/` by default) and show a draft agenda.
Follow "Regular status checks" in the Adaptrace guide [Using Adaptrace for project management](../guide/project-management.en.md) (`docs/guide/project-management.md`).
The exact rules for keys and commands are in Adaptrace's `docs/spec/schema.md`.
They are all in the Adaptrace repository; "Shared conventions" below says where to find them. Read them when you are unsure how to proceed.

## Rules

- **Do not change documents.** Show the problems you find as agenda items, and point to how to fix them (the skill or command to use next). The user does the fixing separately
- Write only the minutes draft (a `type: Meeting` document), and the `index.md` and `log.md` that point to it. For each, show the diff and get approval before writing
- If the user leaves a decision to you ("whatever you recommend"), that is not approval to write. Show the recommendation as a diff and ask again whether you may write it
- Do not guess why a task is late or what is happening with the owner. Show only what the documents say
- Commit and push only when the user asks
- When you ask the user something, use a tool that asks with choices (AskUserQuestion) if one is available. Otherwise, show numbered choices in text and wait for the answer

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
2. Check where the bundle is. The default is `.adaptrace/` at the root of the repository. If it is somewhere else, add `--bundle <directory>` to every command from here on
3. Get today's date. Use the same time zone as the dates in the bundle (for example, if the dates use `+09:00`, use `date --date='TZ="Asia/Tokyo" now' +%F` on GNU date). If the time zone differs, due-date judgments shift by one day
4. Ask for the date of the next regular meeting, and wait for the answer before going to step 1. If the user says they do not know, use the date 7 days from today. The period up to this date is called "until the next regular meeting"

## 1. Collect the status

Run the following commands. None of them write.

| What to check | Command |
|---|---|
| Broken targets, cycles, deadlocks, date warnings | `adaptrace validate --format json` |
| Documents older than their targets, documents past their review date (`stale_after`) | `adaptrace stale --format json` |
| Tasks by `state`, and waiting tasks | `adaptrace board --format json` |
| Due dates of tasks and milestones | `adaptrace list --type Task --columns state,owner,due --format json`, `adaptrace list --type Milestone --columns state,due --format json` |
| Status of change requests | `adaptrace list --type "Change Request" --columns state,received_at --format json` |
| Progress of change requests under review | `adaptrace progress <change request>` for each change request that is approved but not yet implemented |
| Overlapping open change requests | `adaptrace conflicts --format json` |

- Use the type names the bundle uses. If there are no `Milestone` or `Change Request` documents, skip that row
- Leave finished tasks out of the due-date judgments. Decide which `state` means finished from the column names of `board` (`done`, `closed`, `completed` and so on). If unsure, ask the user. Treat a milestone without `state` as not finished
- Decide the `state` of change requests from the values used in existing change requests. As a guide: approved is `approved` and `accepted`; implemented is `implemented`, `closed` and `done`; open is anything else (such as `submitted`); settled with no review needed is `rejected` and `deferred`
- Sort the reasons from `stale --format json` (`reasons[].kind`) into these categories. `older-than-dependency`, `resource-changed`, `resource-unrecorded` and `resource-missing` go to "documents that need review". `expired` goes to "documents past their review date". `unknown` documents (last update not known) go to "bundle problems"
- From `conflicts --format json`, put only `pairs` (overlapping pairs) on the agenda. `unlinked` (change requests without starting documents) goes to "bundle problems"
- `progress` returns exit code 1 until the review is finished. An exit code of 1 midway is normal

## 2. Put together the draft agenda

Put the collected results in a table with the following categories. For any category with no entries, write "None".

| Category | What to show | Next action |
|---|---|---|
| Overdue | Tasks and milestones whose due date is before today and that are not finished | Ask the owner about the status |
| Due before the next regular meeting | Tasks and milestones due between today and the next regular meeting | Ask the owner about the outlook |
| Waiting tasks | Tasks with `waitingFor` in `board`, and what they wait for | Move what they wait for forward first |
| Documents that need review | Older documents from `stale` (older than their target, the file changed) | The skill `adaptrace-review`, or `adaptrace impact <target> --order review` |
| Documents past their review date | Documents from `stale` past `stale_after` (risks and so on) | Review the content. If it changed, update `generated`; if not, update `verified`. Also move `stale_after` to the next review date. Otherwise it is shown as expired again at the next regular meeting |
| Change requests under review | Change requests that are approved but not yet implemented, and the number reviewed in `progress` | Continue with the skill `adaptrace-review` |
| Open change requests | Change requests that were received but not settled, and the date received | Decide where the decision is made. If there are overlaps, `adaptrace meeting` |
| Overlapping change requests | Pairs from `conflicts` | Prepare a discussion meeting (`adaptrace meeting`) |
| Bundle problems | Errors and warnings from `validate` (`missing-generated`, `stale-generated` and so on) | Fix them as the warnings say |

- In each row, write the document's path and display name, and the owner (`owner`) if there is one
- For due dates, also write how many days from today (or how many days overdue)
- Use the order of the table above. Show overdue items first

## 3. Report

1. Show the draft agenda in the conversation. Start with one line that sums up the count per category
2. Ask whether to create a minutes draft

If you create a minutes draft:

- The path is `meetings/<date of the next regular meeting>-weekly.md`. If the same path exists, add `-2`, `-3` and so on
- Frontmatter

```yaml
---
type: Meeting
title: Regular meeting 2026-12-03
status: draft
generated: { by: <agent>/<model ID>, at: <time of writing> }
---
```

- The body is the draft agenda table and empty headings "決まったこと" (decisions) and "宿題" (action items). The skill writes these Japanese headings as they are. Write links to documents as relative paths such as `../tasks/login-mfa.md`. Do not add dependency keys, because the minutes need no review when the documents on the agenda change
- Add a one-line link of the form `* [display name](file name)` to `meetings/index.md`. If there is no `meetings/`, create `meetings/index.md` and add a link to it in the root `index.md` too
- Ask whether to record it in `log.md`. If you add it, write it under a heading for today's date (`## YYYY-MM-DD`) in the form `* **Creation**: <description>`, newest first
- Show the diff, and write only after approval. After writing, run `adaptrace validate`
