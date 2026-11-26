# adaptrace-supersede (English reference translation)

[Japanese original (the skill that runs)](../../skills/adaptrace-supersede/SKILL.md)

> This is a reference translation for English readers. Claude Code runs the Japanese SKILL.md; this file is not loaded as a skill. When the two differ, the Japanese version is correct (ADR-003).

## When the skill is used

The skill replaces a decision (Decision) in an Adaptrace bundle with a new decision. It creates the new decision document, points to the old decision with `supersedes`, and sets the old decision to `status: deprecated`. For each document that depended on the old decision, it decides with the user whether to re-point it to the new decision, remove the dependency, stop it, or leave it as it is. Use it when the user says "I want to replace this decision", "Swap out this ADR", or "We changed direction, so deprecate the previous decision". It writes only after the user approves the diff.

## adaptrace-supersede

Replace a decision in the bundle (`.adaptrace/` by default) with a new decision.
Do not rewrite the body of the old decision. Create a new decision document instead, so that the decision before the replacement and its reasons remain as a document.
The exact rules for keys and commands are in Adaptrace's `docs/spec/schema.md`.
They are all in the Adaptrace repository; "Shared conventions" below says where to find them. Read them when you are unsure how to proceed.

## Rules

- **Do not change any file before the user approves.** Before writing, show the diff for each file and get approval (Adaptrace design principle 6).
- If the user leaves the decision to you ("whatever you recommend"), that is not approval to write. Show your recommendation as a diff, and ask again whether you may write it.
- **Do not rewrite the body of the old decision.** In the old decision, change only `status`.
- **Do not write the reasons for the new decision or the other options considered by guessing.** Ask the user. If they do not know, leave that heading empty and tell them to fill it in later.
- Update `generated` of an existing document only when you change the meaning of its body. When you change only `status` or dependency keys, do not change `generated`.
- If the content of a requirement needs to change, do not rewrite the requirement here. Guide the user to accept it as a change request (skill `adaptrace-change-request`).
- Commit and push only when the user asks.
- Show diffs per document. You may show the diffs of several documents together and get approval once. In that case too, list which documents you will write and confirm the list.
- When the user leaves an undecided matter to you ("whatever you recommend"), show your recommendation as a proposal. Do not write it in the body as something decided.
- When you ask the user something, use a tool that asks with choices (AskUserQuestion) if one is available. If not, show numbered choices in text and wait for the answer.

## How to write paths

| Where | How to write | Example |
|---|---|---|
| A document passed to a command | Path inside the bundle. No leading `/` | `adaptrace impact decisions/adr-0012-cache.md` |
| The value of a frontmatter key | Path inside the bundle. With a leading `/` | `supersedes: /decisions/adr-0012-cache.md` |

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
2. Check where the bundle is. The default is `.adaptrace/` at the root of the repository. If it is somewhere else, add `--bundle <directory>` to every command from here on.
3. Run `adaptrace validate` and note the errors and warnings that exist before the replacement.
4. Get the current date and time with the time zone, once (for example, with GNU date, `date --iso-8601=seconds`). Use it for `generated.at` of the new documents.

## 1. Confirm the old decision and the new decision

1. Identify the decision to replace. When the user names it by name or number, search the `nodes` of `adaptrace graph --format json` for a document whose `type` means a decision (`Decision`, `decision`, `ADR` and so on, whatever name the bundle uses), and confirm its path. Do not use `list --type` here, because it matches the type name exactly and also excludes documents with `status: deprecated`.
2. Read the body of the old decision.
3. Check whether the new decision already exists. In the `edges` of `adaptrace graph --format json`, look for a document that points to the old decision with `supersedes`. If there is one, use it as the new decision and skip creating it in step 3.
4. If the new decision does not exist yet, ask the user for its content. If it already exists, skip these questions.
   - What it changes to (the decision)
   - Why it changes (the reason)
   - Other options considered
   - When and where it was decided (the path of the meeting minutes document, if there is one)

## 2. List the documents that depend on the old decision

Run the following two commands **before writing any document**. `impact` does not list documents with `status: deprecated`. If you first stop (set to `deprecated`) a document that depended on the old decision, it disappears from the list.

- `adaptrace impact <old decision> --format json`: the documents that reach the old decision through the review chain (`depends_on`, `derived_from`, `satisfies`). A document with `depth` 1 points to the old decision directly, and `kind` is that key. Documents with `depth` 2 or more are affected indirectly.
- `adaptrace graph --format json`: take all edges in `edges` whose `to` is the old decision. This also shows documents that point to the old decision with keys that `impact` does not follow (`blocks`, `changes`). Exclude the `supersedes` edge (from the new decision to the old decision) from what step 5 handles, because it is the replacement itself.

Show the listed documents to the user as a table.

| Document | Relationship to the old decision | Summary of the body |
|---|---|---|
| `tasks/cache-warmup.md` | `depends_on` (direct) | Work to warm up the cache at startup |
| `tasks/load-test.md` | Through the document above (indirect) | Load test |

## 3. Create the new decision document

Show the diff, and write it after approval.

- Follow the path and naming of the existing decisions (if they go up to `adr-0012`, the next is `adr-0013`).
- Use the same `type` and `state` values that the existing decisions use.
- Point to the old decision with `supersedes`.
- Ask, key by key, whether to carry over the old decision's `satisfies`, `depends_on` and `derived_from`. If the new decision satisfies the same requirement, carry over `satisfies`.
- If the decision was made in a meeting, you may point to its minutes document with `derived_from`.
- Use the headings "Decision", "Reason" and "Other options considered" in the body. Write only what you heard from the user.
- Write when and where the decision was made in the first sentence of "Decision" (for example, "Decided at the design meeting on 2026-04-08."). If there is a minutes document, link to it from the body with a relative path.
- If the user says part of the decision is not settled yet, add an "Open issues" heading and write only the matters the user listed. If the user asks for the heading to be left empty, do so.
- Show the title and file name of the new decision in the diff and get the user's confirmation. The title is the substance of the decision itself, so do not settle it by guessing.

```yaml
---
type: Decision
title: ADR-0013 Store sessions in the database
state: accepted
supersedes: /decisions/adr-0012-cache.md
satisfies: /requirements/req-4-session.md
generated: { by: <agent>/<model ID>, at: <date and time from step 0> }
---
```

- Add a one-line link of the form `* [display name](file name)` to the new document in `decisions/index.md`.

## 4. Deprecate the old decision

Show a diff that adds `status: deprecated` to the frontmatter of the old decision, and write it after approval. Do not change the body or any other key. Do not change `generated` either.

- Do not delete or change the link to the old decision in `decisions/index.md`. In `index.md` and `log.md`, only add lines.

## 5. Decide on each dependent document, one at a time

For each document in the table of step 2 that points to the old decision **directly**, ask which of the following to do. Read the body and add a recommendation and the reason.

| Handling | When it fits | Change |
|---|---|---|
| Re-point | The document is still needed under the new decision | Change the key's value from the old decision to the path of the new decision |
| Remove | It no longer has anything to do with the new decision | Delete the old decision from the key. If the key becomes empty, delete the whole key |
| Stop | Work to carry out the old decision that is no longer needed | Set `state` to a value meaning "stopped", or set `status: deprecated`. If the bundle has no value meaning "stopped", ask which to use |
| Leave as it is | You want to keep pointing to the old decision as history | No change |

- Show one diff per document, and write it after approval. Change only the keys decided. Do not change `generated`.
- Re-pointed documents need review to match the new decision. If the new decision is newer, `adaptrace stale` shows them as needing review. If the new decision already existed and is older than the re-pointed document, it does not appear in `stale`. In both cases, report it as needing review in step 6.
- Do not change an open change request that points to the old decision with `changes`. Write in the report that the starting point of the change request has been deprecated. People decide how to handle the change request.
- Do not change documents affected indirectly (`depth` 2 or more) here. Report them as needing review in step 6.
- If you record a stopped task with a `state` value, tasks that depend on it keep being shown as "waiting" in `board`. With `status: deprecated`, they are not shown that way. If the stopped task itself points to other tasks with `blocks`, also ask whether to remove that `blocks`, because with `status: deprecated` it no longer shows up in `board` or `health`. In either case, if other tasks depend on it, also ask whether to remove or re-point their `depends_on`. You may also ask about documents affected indirectly, but change them only when the user chooses to.

## 6. Record and report

1. Ask whether to record this in `log.md`. If you add a record, write it under today's date heading (`## YYYY-MM-DD`): `* **Creation**: <description>` for creating the new decision, and `* **Update**: <description>` for deprecating the old decision and for how each dependent document was handled.
2. Run `adaptrace validate`. If there are more errors than at step 0, explain the cause and show a diff that fixes them.
3. Run `adaptrace stale`.
4. Report the following together. Report in the conversation, not in a file.
   - The new decision, and the old decision that was deprecated.
   - How each dependent document was handled (re-pointed, removed, stopped, left as it is).
   - The documents that need review: the re-pointed documents and the documents affected indirectly. Review can be done with the skill `adaptrace-review`.
   - Change requests that point to the old decision with `changes`, and anything else that people need to decide.
