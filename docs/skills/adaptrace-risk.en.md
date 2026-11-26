# adaptrace-risk (English reference translation)

[Japanese original (the skill that runs)](../../skills/adaptrace-risk/SKILL.md)

> This is a reference translation for English readers. Claude Code runs the Japanese SKILL.md; this file is not loaded as a skill. When the two differ, the Japanese version is correct (ADR-003).

## When the skill is used

The skill reviews, one at a time with the user, the risks in an Adaptrace bundle that are past their review date or whose dependencies were updated. It decides with the user whether to update the assessment (probability, impact and so on), create a mitigation task, close the risk, and when to review it next, and writes the review record (verified, stale_after). Use it when the user says "I want to review the risks", "Sort out the risks past their review date", or "Update the risk register". People make the judgment. It writes only after the user approves the diff.

## adaptrace-risk

Review the risks in the bundle (`.adaptrace/` by default) one at a time with the user, and record the result.
The targets are risks past their review date (`stale_after`), and risks whose dependencies (decisions and the like) were updated after them.
People decide the assessment and handling. This skill shows the material and the choices, and records what was decided.
The exact rules for keys and commands are in Adaptrace's `docs/spec/schema.md`.
They are all in the Adaptrace repository; "Shared conventions" below says where to find them. Read them when you are unsure how to proceed.

## Rules

- **Do not change any file before the user approves.** Before writing, show the diff and get approval (Adaptrace design principle 6).
- Show diffs per document. You may show the diffs of several documents together and get approval once. In that case too, list which documents you will write and confirm the list.
- If the user leaves the decision to you ("whatever you recommend"), that is not approval to write. Show your recommendation as a diff, and ask again whether you may write it.
- **Do not decide a risk's assessment, handling or next review date yourself.** Show the material and the choices; the user decides. Do not write an assessment by guessing.
- Follow the assessment keys (probability, impact and so on) and the `state` values used by the bundle's existing risks. Add a new key only when the user decides to.
- Change only the following. Do not change other documents.
  - The risk documents being reviewed
  - A new Task document created as a mitigation, and one added line in that type's `index.md`
  - `log.md`: only add lines
- Create a mitigation task only when the user decides its title, owner and due date. Do not fill them in by guessing.
- Commit and push only when the user asks.
- When you ask the user something, use a tool that asks with choices (AskUserQuestion) if one is available. If not, show numbered choices in text and wait for the answer.

## How to write paths

| Where | How to write | Example |
|---|---|---|
| A document passed to a command | Path inside the bundle. No leading `/` | `adaptrace impact risks/idp-lock-in.md` |
| The value of a frontmatter key | Path inside the bundle. With a leading `/` | `derived_from: /risks/idp-lock-in.md` |

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
3. Run `adaptrace validate` and note the errors and warnings that exist before the review
4. Get the current date and time with the time zone, once (for example, with GNU date, `date --iso-8601=seconds`). Use it for `verified.at` and `generated.at`
5. Ask for the ID of the person who judges the review (example: `sato`). Use it for `by` of `verified` and `generated` of the reviewed risks (`human:<ID>`). A risk's assessment is a person's judgment, so `by` is the person who judged, even when the agent writes the body. Follow how existing documents write `by`. For `generated.by` of a new task, follow "Shared conventions" and use the agent that did the work

## 1. Decide the risks to review

1. `adaptrace list --format json --columns type,state`: check the type names and the `state` values. Note the risk type (`Risk` and so on) and the `state` values risks use (`open`, `closed` and so on). A document whose `state` is an empty string (`""`) has no `state`
2. `adaptrace stale --format json`: take the documents of the risk type from `stale`. Risks whose `state` is a closed value are not reviewed. If closed risks appear in `stale`, write them in the report. The `kind` in `reasons` is the reason
   - `expired`: past the review date (`staleAfter`)
   - `older-than-dependency`: a dependency (`dependency`) was updated after the risk
   - Show other reasons (such as a changed file) as they are
3. If the user named risks, include them. If you cannot find one, ask instead of guessing
4. Show the risks to review in a table. Decide the order with the user. If there is no preference, list the risks past their review date, oldest first, then the risks whose dependencies were updated, by the oldest update of the dependency

| Risk | State (`state`) | Reason | Review date, or the updated dependency |
|---|---|---|---|
| `risks/idp-lock-in.md` | `open` | Past its review date | 2026-11-24 |

## 2. Review one at a time

For each risk, do the following.

1. Read the risk's body and frontmatter. Check the assessment keys (`probability`, `impact` and so on; the names depend on the bundle) and the owner (`owner`)
2. For a risk whose dependency was updated, read that dependency and summarize what changed. If there is git history, you may check the changes after the risk's last update with `git log -p -- <the dependency's file>`
3. In `backlinks` of `adaptrace graph --format json`, check the documents that point to the risk (mitigation tasks and the like). Show how far the mitigations have gone as material too
4. Show the material and ask how to handle it. You may add a recommendation with a reason

| Handling | When it fits | Change |
|---|---|---|
| Continue unchanged | The assessment and the body are fine as they are | Add a review record to `verified`. Set `stale_after` to the next review date. Do not change `generated` or the body. A risk whose dependency was updated also leaves `stale`, because the time of `verified` is now later than the dependency's update |
| Update the assessment or body | Probability, impact, the response and so on changed | Change the keys decided and the body. Set `generated` to now. Set `stale_after` to the next review date |
| Create a mitigation task | A new response is needed | Create a new Task document. Combine with one of the two above |
| Close | The cause is gone, the period has passed and so on; it is no longer a risk | Set `state` to the closed value. Remove `stale_after`. Set `generated` to now, and write why it was closed in the body. Keep dependencies such as `depends_on` as history. If a dependency is updated later, the risk appears in `stale`, but closed risks are not reviewed (step 1.2) |
| It happened | The risk occurred | Set `state` to the value for occurred. Set `generated` to now, and write what happened in the body. Ask whether `stale_after` becomes a date to review until the response is done, or is removed. Guide the user to handle the response as a change request (skill `adaptrace-change-request`) or an issue |

5. Ask for the next review date. You may suggest one from the interval between the `stale_after` and the last update of existing risks. The user decides. Count expressions such as "in two weeks" from today. Write `stale_after` in the existing form (a date, or a date and time). If it is a date and time, follow the existing values for the time and time zone too
6. Use the `state` values noted in step 1.1. If there is no value for closed or occurred, show candidates (`closed`, `occurred` and so on) and ask the user. Use the values existing risks use for the assessment keys too (such as 高, 中, 低)

### How to write the records

- Write one `verified` as `verified: { by: human:<ID>, at: <date and time> }` on one line, on the line after `generated`. If it already exists, keep the earlier records, make it a block list and add the new one at the end
- Write `verified` only when continuing unchanged. When the assessment or body is updated, or the risk is closed, setting `generated` to now is the review record. Do not remove existing `verified`
- When you change an assessment key, change only its value. Do not move the key
- When you add to the body, write the review date and the reason for the change. Write only what you heard from the user

### Mitigation tasks

- Ask the user for the title, owner (`owner`) and due date (`due`). Leave out items not decided. If the title is not decided, do not create the task; write it in the report
- Follow existing tasks for the path and name
- Point to the risk with `derived_from`. Set `state` to the value existing tasks use for not started. If existing tasks have no value for not started, show candidates (`to_do` and so on) and ask the user
- Set `generated` to the date and time from step 0 and the agent that did the work ("Shared conventions")
- If the type has an `index.md`, add one line in the form `* [display name](file name)`

```yaml
---
type: Task
title: SMSの送信件数に上限を設ける
owner: suzuki
state: to_do
due: 2026-12-10
derived_from: /risks/sms-cost.md
generated: { by: <agent>/<model ID>, at: <date and time from step 0> }
---
```

## 3. Write

1. After deciding the handling of all the risks, show the changes decided in step 2 as a diff per document, get approval for them together, and write them. If the user wants to write risk by risk, do so
2. Ask whether to record this in `log.md` once, at the end. You may ask together with the diff in item 1 of this step. If so, write one line `* **Update**: <description>` for the whole session under today's date heading (`## YYYY-MM-DD`). If you created tasks, write a `* **Creation**: <description>` line too
3. Run `adaptrace validate`. If there are more errors than at step 0, explain the cause and show a diff that fixes them
4. Run `adaptrace stale --format json` again, and check that the reviewed risks no longer appear. If a risk still appears, report why

## 4. Report

Report the following together. Report in the conversation, not in a file.

- The handling of each risk, and its next review date
- The tasks created, with their owners and due dates
- The risks closed, and those that happened. For the ones that happened, what people need to do
- The risks not reviewed (put off by the user), and the risks that still appear in `stale`
- Errors and warnings from `validate` that increased since step 0
