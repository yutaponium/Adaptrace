# adaptrace-review (English reference translation)

[Japanese original (the skill that runs)](../../skills/adaptrace-review/SKILL.md)

> This is a reference translation for English readers. Claude Code runs the Japanese SKILL.md; this file is not loaded as a skill. When the two differ, the Japanese version is correct (ADR-003).

## When the skill is used

In an Adaptrace bundle, the skill reviews, from upstream down, the documents affected by an approved change request or by a document whose content was changed. For documents that need a change, it shows the diff of a draft update. For documents that do not, it leaves a review record (`verified`). Use it when the user says "I want to move the review of this change request forward", "I changed a requirement, so I want to review the related documents" or "I want all of progress to be reviewed". It writes only after the user approves the diff.

## Overview

Starting from an approved change request, or from a document whose content was changed, review the affected documents from upstream down.
Follow "4. Once approved, update from upstream" in the Adaptrace guide [Updating PMBOK documents for a change request](../guide/pmbok.en.md) (`docs/guide/pmbok.md`).
The exact rules for keys and commands are in Adaptrace's `docs/spec/schema.md`.
They are all in the Adaptrace repository; "Shared conventions" below says where to find them. Read them when you are unsure how to proceed.

## Rules

- **Do not change any file before the user approves.** Before writing, show the diff for each file and get approval (Adaptrace design principle 6)
- If the user leaves a decision to you ("whatever you recommend"), that is not approval to write. Show the recommendation as a diff and ask again whether you may write it
- **The user makes the review decisions.** For each document, this skill shows the material for deciding "whether a change is needed" and a draft update. The user decides whether to change the document, or to leave it unchanged and record only the review
- Do not add to a document's body, by guessing, facts that are not in the request or the documents. If you lack information needed for the update (a new due date, figures and so on), ask
- Do not change documents outside the affected documents. If you think one needs a change, put it in the report
- Commit and push only when the user asks
- When you ask the user something, use a tool that asks with choices (AskUserQuestion) if one is available. Otherwise, show numbered choices in text and wait for the answer

## What to record when the content changed, and when it did not

| Review result | Frontmatter | Effect on downstream documents |
|---|---|---|
| The content changed | Set `generated` to the current date and time (also update `by`) | Downstream documents become review targets |
| The content did not change | Do not change `generated`. Add `verified: { by, at }` with the current date and time | Downstream documents do not become review targets |

- A document with neither `generated` nor `timestamp` has no known last update, so `progress` and `impact` cannot compare it (ADR-029). During the review, suggest writing `generated` in that document. If the content changed, use the time of writing. If it did not, use the last update time of the content as known to the user. If that is unknown, use the time of writing, and review the downstream documents too
- For a single `verified` entry, write it on one line as `verified: { by: human:sato, at: <date and time> }`, on the line after `generated`. If `verified` already exists, keep the earlier records, turn it into a block-style list, and add the new entry at the end
- `by` is the person who made the review decision. Write the ID asked for in step 0 in the form `human:<id>`. Even if the document's owner (`owner`) is someone else, write the person who decided, because the agent did not make the decision on their behalf
- Write dates and times with a time zone (on GNU date, for example, `date --iso-8601=seconds`). In the diff, leave a placeholder `<time of writing>`. Get the time once just before writing, and use the same value for every document written at that time

## How to write paths

| Where | How to write | Example |
|---|---|---|
| A document passed to a command | Path inside the bundle, without a leading `/` | `adaptrace progress change-requests/cr-011-csv-export.md` |
| The value of a frontmatter key | Path inside the bundle, with a leading `/` | `derived_from: /change-requests/cr-011-csv-export.md` |

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
3. Run `adaptrace validate` and `adaptrace stale`, and note the errors and the documents reported as older that exist before the review
4. Ask for the ID of the person who makes the review decisions (example: `sato`). Use it for `by` in `generated` and `verified`
5. Confirm what triggered the review
   - **Change request**: the document of an approved change request. Check that its `state` is a value meaning approved (such as `approved`, or the value existing change requests use). If unsure, ask the user whether it was approved. If it was not approved, do not start the review.
   - **Document whose content was changed**: a document changed without a change request (such as rewording a requirement). Check that the change to its content has already been written. Also check that the document's `generated` is the time of the change. If it is still old, downstream documents are not judged as older, so show a diff that updates `generated`. If there is no `generated`, suggest writing it with the time of the change.
6. For a change request, run `adaptrace progress <change request>` and check whether this resumes an earlier review. If every starting document in the change request's `changes` points to the change request with `derived_from`, and `progress` shows them as `reviewed` ("starts the change"), this continues the previous review. In that case, skip "1. Show the affected documents" and "2. Update the starting documents", and continue "3. Review step by step" from the first step that is not `reviewed`. This is because refreshing the `generated` of the starting documents would make already reviewed downstream documents review targets again. If only some starting documents are not shown that way, do "2. Update the starting documents" only for those

## 1. Show the affected documents

The starting documents are the documents where the review begins. For a change request, they are the documents in the change request's `changes`. If there are none, ask the user which documents to change. For a document whose content was changed, it is that document.

1. Run `adaptrace impact <starting document> --order review`, and show the affected documents in a table in order from upstream. If there are several starting documents, run it for each
2. At this point the starting documents are not updated yet, so some documents do not have `needs review`. In the table, show all documents as review candidates
3. Even if other change requests that were rejected or deferred point to the same starting documents, do not make them review targets

## 2. Update the starting documents (for a change request)

1. Read the change request and the starting documents, and make a draft update of the starting documents. Apply only what the change request asks for
2. Add the change request to the `derived_from` of the starting document. If it already points to the change request, do not add it. `progress` follows the documents that point to the change request with `derived_from` as the starting documents, so without this you cannot check the review status. If `derived_from` already exists, turn it into a block-style list and add the entry at the end
3. Set the starting document's `generated` to the time of writing. `progress` treats a starting document as updated if it is newer than the change request's `received_at`
4. Show the diff, and write only after approval

Even if the user decides the starting document needs no update, add `derived_from` and record `verified`. If `verified.at` is newer than `received_at`, the starting document counts as reviewed.

After updating the starting documents, run `adaptrace progress <change request>`. From here on, use the step numbers of `progress`. `progress` counts the starting documents as step 1. The `impact` in step 1 does not count the starting documents, so the numbers are off by one.

| Step | Document | Status | Owner |
|---|---|---|---|
| 1 | `requirements/req-7-report.md` | Starting document | sato |
| 2 | `decisions/adr-0012-export.md` | Review | sato |
| 3 | `tasks/report-export.md` | Waiting for the previous step | tanaka |

- Documents in the same step do not depend on each other, so you can review them together
- Documents that `progress` shows as `reviewed` are already reviewed, so skip them. Review `waiting` documents after the upstream steps are done
- If an upstream document did not change its content and only recorded `verified`, the downstream documents that depend only on it become `reviewed` in `progress`. The content has not changed, so they do not need a review. `impact` compares with the time of the starting documents, so it keeps showing `needs review` on these documents too, but follow `reviewed` in `progress`. When there is no change request, decide with `stale`. In the report, list the documents whose review was skipped for this reason
- During the review, the exit code of `progress` is 1. It becomes 0 when everything is reviewed. An exit code of 1 midway is normal
- If there are many documents, ask how far to go this time. Even if you stop midway, next time you can resume where you left off with `progress`

For a document whose content was changed (when there is no change request), skip step 2 and review in the order of `impact --order review` from step 1.

## 3. Review step by step

Repeat the following for each step.

1. Read the bodies of the documents in that step and their targets (upstream documents). Read the upstream documents including what was updated in this session
2. For each document, put the material for the decision in a table

| Document | Suggested decision | Reason |
|---|---|---|
| `decisions/adr-0012-export.md` | Change needed | CSV must be added to the list of output formats |
| `risks/export-delay.md` | No change needed | It does not depend on the output format |

3. For documents marked "change needed", show the diff of a draft update. For documents marked "no change needed", show the diff that adds `verified`
4. Confirm the decision for each document with the user. If the user changes a decision, redo the diff to match
5. Write only the approved diffs. After writing, run `adaptrace validate`
6. Ask whether to go on to the next step or stop here. You may show the suggested decisions and diffs for the next step together and ask "May I go ahead as is?"

- Say that the suggested decision is this agent's judgment and is material for a decision. The user decides
- Put in a draft update only the changes needed to reflect the upstream change. Do not rewrite anything else along the way
- Markdown links in the body are references, not dependencies. Add or remove dependencies (`depends_on` and so on) only when the user asks

## 4. Check that it is finished

1. Run `progress` again (`stale` when there is no change request), and check that every document has been reviewed. For a change request, also check that every starting document in `changes` is shown as "starts the change". For a change request, the exit code becomes 0 and every document, including the starting documents, is shown as `reviewed`. If "No documents depend on it yet" is shown, the starting documents have no `derived_from`. Even if the exit code is 0, the review is not finished
2. If any document is not yet reviewed, explain why (the upstream was changed afterward, and so on)
3. For a change request, if everything is reviewed, suggest setting the change request's `state` to the value meaning implemented
   - Use the value existing change requests use. If there is none, recommend `implemented`
   - Do not change the change request's `generated`. The starting documents depend on the change request through `derived_from`, so refreshing the change request's `generated` makes `stale` report the starting documents as older. Record the time the change was implemented in `log.md`
   - Show the diff, and write only after approval
4. Ask whether to record in `log.md` that the review is finished. If you add it, write it under a heading for today's date (`## YYYY-MM-DD`) in the form `* **Update**: <description>`, newest first. Write the description in the same language as the bundle's documents
5. After writing, run `adaptrace validate` and `adaptrace stale`, and check that the errors and the documents reported as older have not increased. `stale-generated` from `validate` shows documents whose body was changed without updating `generated`

## 5. Report

Report the following together.

- The documents reviewed, and the result for each (content changed, or only a review record left)
- The documents whose review was skipped because the upstream did not change its content
- The documents not yet reviewed, and why
- The results of `validate` and `progress`
- Any documents outside the affected documents that seem to need a change, and why
