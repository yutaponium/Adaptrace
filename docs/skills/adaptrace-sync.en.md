# adaptrace-sync (English reference translation)

[Japanese original (the skill that runs)](../../skills/adaptrace-sync/SKILL.md)

> This is a reference translation for English readers. Claude Code runs the Japanese SKILL.md; this file is not loaded as a skill. When the two differ, the Japanese version is correct (ADR-003).

## When the skill is used

The skill syncs the tasks in an Adaptrace bundle with the tasks in Backlog.md using adaptrace sync. Before writing, it shows the changes and the problems (conflicts changed on both sides, tasks not found in Backlog.md, states with no Backlog.md status, duplicated backlog.id) item by item, and decides with the user how to handle them, such as which side to keep. Use it when the user says "I want to sync with Backlog.md", "Bring in the changes from Backlog.md", or "sync reported a conflict". People make the judgment. It writes only after the user approves.

## adaptrace-sync

It syncs the Tasks in the bundle (by default `.adaptrace/`) with the tasks in Backlog.md (by default `backlog/`) using `adaptrace sync`.
`sync` copies content from the side that changed to the side that did not, and reports a task changed on both sides as a conflict.
This skill shows the `sync` plan item by item, and decides with the user how to handle conflicts and other problems before writing.
The exact rules for keys and commands are in "Converting to and from Backlog.md" in Adaptrace's `docs/spec/schema.md`. How to use it is in `docs/guide/backlog-md.md`.
All of these are in the Adaptrace repository; how to find them is in "Shared conventions" below. Read them when unsure about a step.

## Rules

- **Do not change files before the user approves.** `sync` writes only with `--write`. Before running it with `--write`, show the command and the plan without `--write`, and get approval. When editing a document, show the diff and get approval (Adaptrace design principle 6)
- If the user leaves a decision to you ("go with your recommendation"), that is not approval to write. Show what you recommend and ask again whether to write it
- **Do not decide yourself which side a conflict keeps.** Show both sides; the user decides. Tell the user that the changes on the side not chosen are lost
- Change only the following. Do not change other documents
  - The Adaptrace Task documents and the Backlog.md task files that `sync --write` writes
  - The keys and body of Adaptrace Task documents decided with the user in step 2
  - `log.md`: only add lines
- **Do not change Backlog.md files (including `config.yml`) except through `sync --write`.** A manual change disagrees with the hash in `backlog.sync` and becomes a conflict on the next `sync`. Tell the user what to change on the Backlog.md side
- Do not edit `backlog.sync` or `backlog.fields` by hand
- Do not delete documents. Only when the user says so explicitly, show the diff and delete
- Commit and push only when the user asks
- When asking the user, use a tool that asks with choices (AskUserQuestion) if there is one. If not, show numbered choices in text and wait for the answer

## How to write paths

| Where | How | Example |
|---|---|---|
| A document passed to a command | The path inside the bundle, without a leading `/` | `adaptrace sync --resolve tasks/manual.md=backlog` |
| The value of a frontmatter key | The path inside the bundle, with a leading `/` | `depends_on: /tasks/login-mfa.md` |
| A Backlog.md task | The path inside the `--backlog` directory | `tasks/back-3 - 操作マニュアルを書く.md` |

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

1. Check how to run Adaptrace. If `adaptrace --version` does not work, ask the user (for example `bun ~/tools/adaptrace/src/cli.ts`). From here on, the command decided here is written `adaptrace` ("Shared conventions")
2. Check where the bundle is. By default it is `.adaptrace/` at the repository root. If it is not there, ask the user. If it is elsewhere, add `--bundle <directory>` to every later command
3. Check the Backlog.md directory. By default it is `backlog/` at the repository root, with `config.yml` in it. If it is not there, ask the user. If it is elsewhere, add `--backlog <directory>` to every later `sync`
4. Read `backlog/config.yml` and note the list of statuses (`statuses`). An Adaptrace `state` matches the status lowercased, with spaces and the like turned into `_` (for example `In Progress` and `in_progress`)
5. Run `adaptrace validate` and note the errors and warnings that exist before the sync
6. When the user wants one direction only, add `--direction import` (import only) or `--direction export` (export only) to every later `sync`. Changes on the excluded side are shown as `pending` and not written

## 1. Show the plan

1. Run `adaptrace sync --format json`, without `--write`. Even with exit code 1, the plan is printed. The `kind` in `actions` is the plan for each task
2. Show the plan in a table, split into changes and problems. `inSync` is the number of tasks already in sync

| `kind` | Meaning | Class |
|---|---|---|
| `export-new` | Creates the Adaptrace task in Backlog.md. An id is assigned | Change |
| `export` | Writes what changed in Adaptrace to Backlog.md | Change |
| `import-new` | Creates the Backlog.md task in Adaptrace (`tasks/<id>.md`) | Change |
| `import` | Brings what changed in Backlog.md into Adaptrace | Change |
| `link` | Both sides have the same content; only the link record is written | Change |
| `conflict` | Both sides changed since the last sync | Problem |
| `unmapped-state` | Backlog.md has no status for the `state`, so it cannot be exported | Problem |
| `missing` | The task with the `backlog.id` is not in Backlog.md. It was deleted or moved to the archive | Problem |
| `duplicate-link` | Two or more Tasks have the same `backlog.id`. This often happens when a document is copied | Problem |
| `pending` | A change on the side excluded by `--direction` | On hold |

   - The table columns are the task (`adaptrace`), the id (`id`), the Backlog.md file (`backlogPath`) and the fields that changed (`fields`). Leave a cell empty when the `kind` has no such value
   - The field names are `title`, `state`, `tags`, `dependencies` (the `depends_on` to tasks), `body` and `fields`. `body` is the body, including the heading line at the top (`# <title>`). If the title changed and the heading too, `body` shows as changed as well. `fields` are keys with no Adaptrace counterpart, such as `assignee` and `priority`. The plan does not say which key differs, so compare the keys in the Backlog.md file with `backlog.fields` in the Adaptrace document and show them
   - For `import` and `export`, read the Adaptrace document and the Backlog.md file, and show the values before and after for the fields that changed. For `import-new` and `export-new`, show the title, status, assignee (`assignee`) and labels
   - If there are `errors`, show the file and the message. They are unreadable Backlog.md files or a wrong `task_prefix`. Tell the user to fix them on the Backlog.md side
3. If there are no problems, go to step 3

## 2. Decide how to handle the problems

For each problem, show the material and ask how to handle it. You may add a recommendation and the reason. Decide all the problems before going to step 3.

### Conflicts (`conflict`)

1. Read the Adaptrace document and the Backlog.md file (`backlogPath`)
2. For each field that differs (`fields`), show the current values on both sides side by side. When the bodies differ, show the lines that differ. Backlog.md's `status` corresponds to Adaptrace's `state`; `labels` to `tags`; `dependencies` to `depends_on`
3. If there is git history, you may check with `git log -p -- <file>` what changed on each side. If you cannot, show only the current values and do not claim which side is newer
4. Ask how to handle it

| Handling | Change |
|---|---|
| Keep the Backlog.md side | Add `--resolve <task>=backlog`. The changes on the Adaptrace side are lost |
| Keep the Adaptrace side | Add `--resolve <task>=adaptrace`. The changes on the Backlog.md side are lost |
| Keep the changes of both | Write the Backlog.md changes to keep into the Adaptrace document, then add `--resolve <task>=adaptrace`. Decide what to write with the user, field by field. Only `title`, `state`, `tags`, `depends_on` and the body can be kept. Items in `fields` (`assignee` and so on) are in `backlog.fields`, which is not edited by hand, so this handling cannot keep them. To keep a change in `fields`, keep the Backlog.md side, or tell the user to set it again on the Backlog.md side after the sync |
| Do not settle it now | Add no `--resolve`. It stays a conflict and the next `sync` reports it again |

- Write `<task>` as the path inside the bundle (`tasks/manual.md`) or the Backlog.md id (`back-3`). The id is not case-sensitive. Add one `--resolve` per task
- Use the global `--resolve adaptrace` or `--resolve backlog` only when the user decides to settle every conflict to the same side

### State with no status (`unmapped-state`)

Show the `state` value (`state`) and the list of Backlog.md statuses (step 0.4), and ask how to handle it.
Read the document and show whether it has the `backlog` key. Without `backlog`, the task is not in Backlog.md yet. Changing `state` makes it `export-new`, and a task with a new id is created in Backlog.md. Say so when asking how to handle it.

- Change the Adaptrace `state` to a value that matches a status: the user decides the value. Change only the document's `state`
- Add a status to Backlog.md: tell the user to add it on the Backlog.md side. This skill does not change `config.yml`. After it is added, start again from step 1
- Do not export it now: leave it. The next `sync` reports it again

### Task not found (`missing`)

Check whether a task with the same id is in Backlog.md's `backlog/archive/tasks/` or `backlog/drafts/`, and show it. `sync` does not convert archived or draft tasks. Tasks in `backlog/completed/` are converted, so they do not become `missing`. Ask how to handle it.

- Restore it on the Backlog.md side: tell the user to restore it on the Backlog.md side. After that, start again from step 1
- Keep the Adaptrace document: change nothing. `sync` reports this task every time, with exit code 1. Setting the lifecycle key `status` to `deprecated` still keeps it reported
- Delete the Adaptrace document: only when the user says so explicitly. Before deleting, check with `backlinks` from `adaptrace graph --format json` which documents point to it, and show them. If any do, deleting it causes `validate` errors
- Delete `backlog` and export it as a new task: the next `sync` creates a task with a new id in Backlog.md

### Duplicated `backlog.id` (`duplicate-link`)

Read the documents with the same id (`adaptrace` and `others`) and show how they differ. Ask the user which one is the original that matches the Backlog.md task. Delete `backlog` from the documents that are not the original. They are exported as new tasks by the next `sync`. For documents not to export, decide with the user whether to delete them.

### Rules for editing documents

- Change only the keys and body decided in the handling. Do not move keys
- When changing only `state`, or only `backlog`, do not change `generated`. When changing the body or other keys, set `generated` to the current time and the agent that did the work ("Shared conventions")
- After you edit a document, `sync` treats the task as changed on the Adaptrace side. A task in conflict stays a conflict unless you add `--resolve <task>=adaptrace`

## 3. Write

1. If step 2 decided edits to documents, show the diff for each document and write after approval. The user choosing a value among choices is not approval. With the diff, show how the `sync` plan will look after the edit (it becomes `export-new`, the conflict is settled to the Adaptrace side, and so on)
2. Run `adaptrace sync --format json` with the decided `--resolve` and without `--write`. Check that the plan matches the decided handling. Check the `kind` and `fields` of the tasks whose handling was decided, and the tasks that get a new id. Check that no problem remains other than those decided in step 2 as "do not settle it now" or "keep"
3. Show the command to run and its plan (what is exported, imported and created) and get approval
4. Run it with `--write`. Use the same `--resolve` as in step 3.2. If problems were left, the exit code is 1 even after writing. Judge whether it wrote by `written` being `true` in the output, and by `errors`
   - `sync` rewrites the frontmatter of the tasks it writes in its own style (a one-line `{ ... }` or `[...]` becomes several lines, and so on). Imported tasks get `generated` with `adaptrace/<version>` and a UTC time. These are how `sync` works; do not change them
   - The Backlog.md file name does not change when the title changes
5. Ask once, at the end, whether to record it in `log.md`. You may ask together with step 3.3. If adding, create a heading with today's date (`## YYYY-MM-DD`) and under it write the whole sync in one line as `* **Update**: <description>`. If you imported new tasks from Backlog.md, also write a `* **Creation**: <description>` line, below the `Update` line. Show the lines before writing them
6. Run `adaptrace sync --format json` again and check that no changes are left and that the only problems are the ones the user decided to leave
7. Run `adaptrace validate`. If there are more errors than at step 0, explain the cause and show a diff to fix them
8. Run `adaptrace stale --format json`. Imported tasks get a newer `generated`, so documents that depend on them show as "older than a dependency". This happens even when only `state` was imported, so it does not always mean the content needs review. Write those documents and the imported fields in the report

## 4. Report

Report the following together. Report in the conversation; do not write it to a file.

- The tasks exported and imported. The tasks newly created and the ids assigned
- For each conflict, the side kept and the changes lost
- The problems left (conflicts not settled, tasks not found and so on), and that `sync` reports them again
- What the user does on the Backlog.md side (adding a status, restoring a task and so on)
- Tasks newly imported from Backlog.md. They have no link to requirements (`satisfies`), so the PM adds it if needed
- Documents that depend on imported tasks and show in `stale`. Whether they need review can be checked with the skill `adaptrace-review`
- `validate` errors and warnings added since step 0
