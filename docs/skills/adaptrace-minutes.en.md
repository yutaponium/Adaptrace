# adaptrace-minutes (English reference translation)

[Japanese original (the skill that runs)](../../skills/adaptrace-minutes/SKILL.md)

> This is a reference translation for English readers. Claude Code runs the Japanese SKILL.md; this file is not loaded as a skill. When the two differ, the Japanese version is correct (ADR-003).

## When the skill is used

The skill reads meeting minutes and turns what was decided, the work that was assigned, and the risks that were found into documents in an Adaptrace bundle. Besides creating new documents, it also updates existing ones, such as the `state` of a finished task or a decision that was replaced. Use it when the user says "Take in these minutes", "Record what we decided in the regular meeting", or "Create tasks from these minutes", or when the user hands over a minutes file or text. It writes only after the user approves the diff.

## adaptrace-minutes

Create documents in the Adaptrace bundle (`.adaptrace/` by default) from minutes, and update existing documents.
First put the minutes in the bundle as a `type: Meeting` document. The documents you create point to it with `derived_from`.
The exact rules for keys and commands are in Adaptrace's `docs/spec/schema.md`.
The specification of the CLI's `adaptrace extract` (the section "Extracting from minutes" in the same file) is also a useful reference for how to create documents.
They are all in the Adaptrace repository; "Shared conventions" below says where to find them. Read them when you are unsure how to proceed.

## Rules

- **Do not change any file before the user approves.** Before writing, show the diff for each file and get approval (Adaptrace design principle 6).
- If the user leaves the decision to you ("whatever you recommend"), that is not approval to write. Show your recommendation as a diff, and ask again whether you may write it.
- **Do not fill in anything the minutes do not say by guessing.** For the person in charge, due date and `state`, use only what is written in the minutes. If you do not know, ask, or leave it empty.
  - Write the person in charge in the same `owner` format that existing documents use (for example, "Ito" in the minutes becomes `ito`). If you do not know the mapping, ask.
  - For a due date without a year ("June 2"), use the nearest such date on or after the meeting date ("January 15" in a December meeting is in the next year). Note in the confirmation table of step 2 that you filled in the year.
- "We discussed" or "an opinion was raised" in the minutes is not a decision. Separate what was decided from what was not.
- **Do not write contact details in the bundle.** Do not write e-mail addresses, phone numbers or signatures in the minutes document or in any other document.
- For a request that changes requirements or scope, do not rewrite requirements in this skill. Guide the user to accept it as a change request (skill `adaptrace-change-request`).
- For `generated.at` of a new document, use the date and time you got in step 0.
- Update `generated` of an existing document only when you change the meaning of its body. When you change only `state`, `owner`, `due` or `status`, do not change `generated`. `generated.at` is the last update of the content. Making it newer puts the dependent documents up for review.
- Commit and push only when the user asks.
- When you ask the user something, use a tool that asks with choices (AskUserQuestion) if one is available. If not, show numbered choices in text and wait for the answer.

## How to write paths

| Where | How to write | Example |
|---|---|---|
| A document passed to a command | Path inside the bundle. No leading `/` | `adaptrace impact decisions/adr-0004-stock.md` |
| The value of a frontmatter key | Path inside the bundle. With a leading `/` | `derived_from: /meetings/2026-05-12-stock.md` |
| A link in the body (reference) | Relative path from that document | `[Stock allocation](../tasks/stock-allocate.md)` |

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
2. Check where the bundle is. The default is `.adaptrace/` at the root of the repository. If it is somewhere else, add `--bundle <directory>` to every command from here on. If there is no bundle, tell the user that the existing documents need to be brought in first (skill `adaptrace-adopt`).
3. Check the current state.
   - `adaptrace validate`: note the errors and warnings that exist before taking in the minutes.
   - `adaptrace list --format json --columns type,status,state,owner,due`: the existing documents. Use this to check for duplicates and to find the documents to update. `list` excludes documents with `status: deprecated`, so run it again with `--status deprecated` and check replaced decisions and similar documents too.
   - `adaptrace board --format json`: the values used for the `state` of tasks (the column names). `board` makes columns only for values in use. If there is no value meaning "not started", use `to_do`. If there is no value meaning "finished", use `done`. Both are the default values of `board`.
4. Get the current date and time with the time zone, once (for example, with GNU date, `date --iso-8601=seconds`).

## 1. Put the minutes in the bundle

You receive the minutes as a `type: Meeting` document in the bundle, as a file outside the bundle, or as text pasted into the conversation.

- **If the minutes are in the bundle**: use that document.
- **If there is a draft for the same meeting**: even if the minutes are outside the bundle, first check whether `meetings/` has a `Meeting` document for the same meeting. The skill `adaptrace-weekly` creates a draft with `status: draft` at `meetings/<meeting date>-weekly.md`. If one exists, do not create a new document. Instead, show a diff that adds the content of the minutes under the draft's "決まったこと" (decisions) and "宿題" (action items) headings. If the minutes are final, also ask whether to remove `status: draft`.
- **Otherwise**: show a diff that creates a new minutes document.
  - The path is `meetings/<meeting date>-<meeting name>.md`. Write `<meeting name>` briefly in lowercase letters, digits and `-` (`weekly` for a regular meeting, `kickoff` for a kickoff). If the same path exists, add `-2`, `-3`.
  - The frontmatter is `type: Meeting`, `title` (the meeting name and date) and `generated`. Do not add dependency keys.
  - Copy the content of the minutes into the body as it is, but leave out contact details and signatures. Tell the user that you left them out.
  - If the minutes do not show the meeting date, ask. Do not use today's date.
  - Add a one-line link of the form `* [display name](file name)` to `meetings/index.md`. If `meetings/` does not exist, create `meetings/index.md` and also add a link to it in the root `index.md`.

```yaml
---
type: Meeting
title: Inventory management regular meeting (2026-05-12)
generated: { by: <agent>/<model ID>, at: <date and time from step 0> }
---
```

Write the minutes document first, after approval, because the documents created in later steps point to it with `derived_from`.

## 2. Read the minutes and sort them into items

Sort the content of the minutes into one of the following. One remark can produce several items.

| Category | Examples | Step |
|---|---|---|
| New document | What was decided (`Decision`), work that was assigned (`Task`), a risk raised as a concern (`Risk`), a milestone with a fixed date (`Milestone`), an agreed requirement (`Requirement`), acceptance criteria (`Acceptance`) | Step 3 |
| Update to an existing document | A task was finished, the person in charge or due date changed, a decision was replaced, a risk went away | Step 4 |
| Becomes a change request | A request from a customer or user that changes requirements or scope | Guided in step 5 |
| Not made into a document | A report with nothing decided, something still under discussion, small talk | Mentioned in the report only |

- For each candidate new document, check whether an existing document already covers the same thing. If so, do not create a new one. Treat it as an update to the existing document.
- A risk may become a document even without a decision. Treat concerns such as "there is a chance that ..." or "... will probably be needed" as candidate risks.
- Treat action items such as "check ..." or "look into ..." as candidate tasks even when no one is in charge. Leave `owner` empty and ask who is in charge.
- Show the result as a table and confirm it with the user. In the table, write the relevant sentence of the minutes (the basis), the document type, and whether to create or update. Also write the values you filled in (the year, the `owner` format). The user decides which items to adopt (ask with multiple choice).
- In the same confirmation, also ask whether to add `status: draft` to the new documents (step 3).
- Create a new `Requirement` only when the meeting agreed on it as a requirement. If a request was only raised, treat it as something that becomes a change request.

## 3. Create new documents

For each adopted item, show the diff of the document, and write it after approval.

- The path is `<type directory>/<id>.md` (`requirements`, `acceptance`, `decisions`, `tasks`, `risks`, `milestones`). Follow the naming of the existing documents (if they go up to `adr-0003`, the next is `adr-0004`).
- Use the type names that the bundle uses.
- Frontmatter
  - `derived_from: /meetings/<minutes>.md`
  - `status: draft`. The document is a draft written from the minutes, and it is removed after a person checks the content. This is the same as `adaptrace extract`. If the user answers that it is not needed because the meeting settled it, do not add it. If the user leaves the decision to you, recommend adding it.
  - For the `state` of a task, use the value the bundle uses for "not started" (choose from the column names of `board`). Write `owner` and `due` only when the minutes state them.
  - Suggest dependencies on existing documents (`depends_on`, `satisfies` and so on) as candidates only when they can be read from the minutes or the body of the existing documents. Show the basis too.
  - Write the `state` of a risk, its probability and its impact only when the minutes state them.
- The body is a summary of the relevant part of the minutes. You may link to the minutes with a relative path.

```yaml
---
type: Task
title: Implement stock allocation per warehouse
status: draft
state: to_do
owner: ito
due: 2026-05-26
derived_from: /meetings/2026-05-12-stock.md
depends_on: /decisions/adr-0004-stock.md
generated: { by: <agent>/<model ID>, at: <date and time from step 0> }
---
```

- Add a one-line link to each new document in the `index.md` of its directory. If you create a new directory, create its `index.md` and also add a link to it in the root `index.md`.

## 4. Update existing documents

For each adopted item, show the diff of the existing document, and write it after approval. Change only what was decided in the minutes.

When you replace a decision, run `adaptrace impact <old decision>` **before writing any document**. `impact` does not list documents with `status: deprecated`. If you first write, for example, a task stopped in the same intake, it will no longer appear as a document that depended on the old decision. For each document shown (tasks and so on), show together with the diff whether it needs review to match the new decision. Rewrite a target only when the user approves.

| Content of the minutes | Update |
|---|---|
| A task was finished, or the person in charge or due date changed | `state`, `owner` and `due` of that task |
| Work was stopped | Ask how to record the stop (see the notes below) |
| A decision was replaced | Create a new decision document that points to the old decision with `supersedes`. Set the old decision to `status: deprecated`. Do not rewrite the body of the old decision. In the diff, confirm whether to carry over the old decision's `satisfies` and `depends_on` to the new decision |
| A risk went away, or a countermeasure was decided | The `state` or body of that risk. If the countermeasure becomes a new task, create it in step 3 |

- Do not change anything other than the keys you change. Update `generated` only when you change the meaning of the body (see "Rules").
- There are two ways to record that work was stopped. If the bundle has a `state` value meaning "stopped", use it. If not, explain the difference and ask.
  - `status: deprecated`: the document no longer appears in the columns of `board`, in `list` or in `impact`. This suits a closed matter that you want off the lists. Dependent tasks are no longer shown as waiting in `board` either.
  - A new `state` value (such as `cancelled`): the document stays in the lists. `board` waits for any target whose `state` is not a value meaning "finished" (such as `done`), so dependent tasks keep being shown as "waiting".
  - With either method, if other tasks depend on the stopped task, ask whether to remove or re-point their `depends_on`. If the stopped task itself points to other tasks with `blocks`, also ask whether to remove that `blocks`, because with `status: deprecated` it no longer shows up in `board` or `health`.
- Do not rewrite a requirement here for a decision that changes its content. In step 5, guide the user to make it a change request.

## 5. Record and report

1. Ask whether to record this in `log.md`. If you add a record, write it under today's date heading (`## YYYY-MM-DD`) in the form `* **Creation**: <description>` or `* **Update**: <description>`, newest first.
2. Run `adaptrace validate`. If there are more errors than at step 0, explain the cause and show a diff that fixes them.
3. Report the following together. Report in the conversation, not in a file.
   - The minutes document, and the documents created and updated.
   - The items not adopted, and the items not made into documents.
   - What becomes a change request. Confirm the requester and the date and time of acceptance, and guide the user to accept it with the skill `adaptrace-change-request`. If the request has not been formally accepted yet, tell the user to use the skill when accepting it.
   - The impact of a replaced decision (the result of the `impact` run at the start of step 4), and the documents that need review. Review can be done with the skill `adaptrace-review`, or separately by the user.
   - For documents created with `status: draft`, check the content and then remove `status: draft`.
