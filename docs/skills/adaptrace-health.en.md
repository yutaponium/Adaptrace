# adaptrace-health (English reference translation)

[Japanese original (the skill that runs)](../../skills/adaptrace-health/SKILL.md)

> This is a reference translation for English readers. Claude Code runs the Japanese SKILL.md; this file is not loaded as a skill. When the two differ, the Japanese version is correct (ADR-003).

## When the skill is used

The skill goes through the results of a health check of an Adaptrace bundle with the user, one item at a time. It covers the dependency suggestions from `adaptrace health` (dependencies on deprecated documents, redundant dependencies, orphans) and the problems from `adaptrace validate` such as deadlocks and cycles. It decides with the user how to handle each one, shows a diff, and fixes it after approval. Use it when the user says "I want to tidy up the bundle", "Check the dependencies", "Run a health check", or "I want to clear the validate warnings". It writes only after the user approves the diff.

## adaptrace-health

Tidy up the dependencies of the bundle (`.adaptrace/` by default) together with the user.
`adaptrace health` and `adaptrace validate` do the detection. This skill decides with the user how to handle each detected item, and writes only the approved fixes.
The exact rules for keys and commands are in Adaptrace's `docs/spec/schema.md`.
They are all in the Adaptrace repository; "Shared conventions" below says where to find them. Read them when you are unsure how to proceed.

## Rules

- **Do not change any file before the user approves.** Before writing, show the diff for each file and get approval (Adaptrace design principle 6).
- If the user leaves the decision to you ("whatever you recommend"), that is not approval to write. Show your recommendation as a diff, and ask again whether you may write it.
- **None of the `health` items is an error.** If there is a reason to keep something, it may stay as it is. Even when you show a recommendation, the user decides.
- When you add a new dependency, show the basis. The basis is the body of both documents, or the user's explanation. Do not add dependencies by guessing.
- Change only the keys of the items whose handling was decided. Do not rewrite the body. Match the way keys are written (a list or a single value, the order of keys) to that document and the existing documents. A list left with one value may stay a list.
- Write a dependency key in the dependent document. For example, for a risk derived from a decision, write `derived_from` in the risk document.
- Do not change `generated` of existing documents. Changing only dependency keys or `status` does not change the meaning of the body. Changing `generated` puts the dependent documents up for review.
- Commit and push only when the user asks.
- Show diffs per document. You may show the diffs of several documents together and get approval once. In that case too, list which documents you will write and confirm the list.
- When you ask the user something, use a tool that asks with choices (AskUserQuestion) if one is available. If not, show numbered choices in text and wait for the answer.

## How to write paths

| Where | How to write | Example |
|---|---|---|
| A document passed to a command | Path inside the bundle. No leading `/` | `adaptrace impact decisions/adr-0002-db.md` |
| The value of a frontmatter key | Path inside the bundle. With a leading `/` | `depends_on: /decisions/adr-0002-db.md` |

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

## 1. Collect the items and decide the scope

1. Run the following three commands, and keep the results in the conversation so you can compare them in step 4.
   - `adaptrace validate --format json`: an array of errors and warnings, with `severity` (`error` or `warning`) and `code`. Judge whether something is an error by `severity`, not by the exit code.
   - `adaptrace health --format json`: an array of suggestions for tidying dependencies. It has no `severity`, and none of the items is an error. The exit code is always 0. `orphan` has no `line`. `deprecated-target` and `redundant-dependency` have the key of the dependency in question (`kind`) and its target (`to`). `deprecated-target` also has `replacedBy`, and `redundant-dependency` has `via`. Paths in the JSON have no leading `/`. When you write them in frontmatter, add a leading `/`.
   - `adaptrace stale --format json`: documents older than their targets. Use this to spot documents that newly appear after tidying.
2. Count the items in each of the following categories and show them as a table.

   | Category | Items (`code`) | Handling |
   |---|---|---|
   | Errors to fix | `error` from `validate` (`dependency-cycle`, `dependency-target` and so on) | `validate` fails until they are fixed |
   | Deadlocks | `dependency-deadlock` (a `validate` warning) | The documents wait for each other, and neither can start. It is a warning, so `validate` does not fail, but work stops |
   | Dependencies on deprecated documents | `deprecated-target` | Re-point, remove, or keep as history |
   | Redundant dependencies | `redundant-dependency` | Remove, or keep to make the direct relationship explicit |
   | Orphans | `orphan` | Add a dependency, deprecate, or leave as it is |
   | Other warnings | `warning` from `validate` other than `dependency-deadlock` | See "Other warnings" below |

3. When `validate` and `health` together have few items (about 10 or fewer as a guide), you may show the recommendations of "2. Decide how to handle each item" for all items at once, and ask about the handling in one go.
4. When there are many items, ask which category to start with, and proceed category by category. The recommended order is the order of the table above. Errors and deadlocks stop work, so deal with them first. You do not have to finish everything in one session.

## 2. Decide how to handle each item

For each item in the category, read the body of the related documents, and ask with a recommended handling and the reason. Even when you ask about several items at once, show a recommendation and the reason for each item. Even after the handling is decided, do not write yet. Show the diffs in step 3.

### Deadlocks (`dependency-deadlock`)

- `message` names the documents waiting for each other and their keys. `blocks` means that the document pointed to cannot start until the document pointing to it is finished.
- When one document points to the same document with both `depends_on` and `blocks`, it is often a mistake. Ask which is the actual order, and suggest removing the other.
- When two or more documents wait for each other, work out from the body and `state` which dependency does not match the actual order of work, and recommend which dependency to remove. If part of the work can start first, also suggest splitting the document.
- Even if one side's `state` is already a "finished" value, so that nothing actually waits, the contradiction in the dependencies remains. Recommend resolving it.

### Cycles (`dependency-cycle`)

- Documents point to each other with the review chain keys (`depends_on`, `derived_from`, `satisfies`) or with `supersedes`.
- Removing any one dependency resolves it. Suggest which one to remove based on the upstream and downstream relationship (from requirements to decisions, from decisions to tasks).

### Dependencies on deprecated documents (`deprecated-target`)

| Handling | When it fits | Change |
|---|---|---|
| Re-point | The dependency is still needed under the replacing document (`replacedBy`) | Change the key's value to the path of the `replacedBy` document. If the same key already has that document, only remove the entry for the deprecated document |
| Remove | It has nothing to do with the replacing document | Delete it from the key. If the key becomes empty, delete the whole key |
| Keep as history | You want to keep pointing to the deprecated document | No change |

- When `message` contains a sentence starting with "This document replaces it", this document itself replaces the deprecated document. There is nothing to re-point to, so ask only whether to remove it or keep it as history.
- If `replacedBy` has several entries, ask which one to re-point to. If it is empty, ask the user where to re-point.
- A re-pointed document needs review to match its new target. If the new target's `generated.at` is newer, `adaptrace stale` shows the document. In the report, show it as needing review. This skill does not do the review or record it (`verified`). The same applies when the user says the document already matches the new target.

### Redundant dependencies (`redundant-dependency`)

- If `via` is empty, the same document is written twice under the same key. Remove the duplicate entry.
- If `via` has entries, the target can also be reached through a longer path with the same key. Removing the dependency does not change which documents `impact` reaches when the target changes. However, `stale` compares only with direct targets. After removing it, when the target changes, `stale` first shows the document in the middle of the path as old, and shows this document only after that one is reviewed. Explain this difference to the user.
- If the body refers directly to the content of that target, suggest keeping the dependency to make the direct relationship explicit. If not, suggest removing it.

### Orphans (`orphan`)

| Handling | When it fits | Change |
|---|---|---|
| Add a dependency | The body or the user's explanation shows a related document | Point to the related document with a suitable key |
| Deprecate | It is no longer needed | Add `status: deprecated`. Do not change `state`. If `state` is an "in progress" value, confirm that the work may stop |
| Leave as it is | An independent document that depends on no other document (such as a project-wide policy) | No change |

- If existing documents use a `state` value meaning "stopped" (such as `cancelled`), ask whether to use that value instead of `status: deprecated`. You can see the values in use in the `state` of `nodes` in `adaptrace graph --format json`. Do not use `list` here, because by default it does not show `deprecated` documents. Tasks with `status: deprecated` are not shown in `board`.
- Find candidate dependencies by reading the bodies of documents that seem related. When there are many documents, narrow them down by the types and display names in `nodes` of `adaptrace graph --format json`. Show the basis with each candidate.
- Write the key in the dependent document. If the orphan is downstream (a task, a risk and so on), write it in the orphan. If it is upstream (a requirement, a decision, minutes and so on), write it in the downstream document that depends on it.
- Choosing the key: use `derived_from` if the document was derived from a decision, risk or similar document; `satisfies` if it satisfies a requirement; `depends_on` if it assumes another document's completion or content.

### Other warnings

- `missing-generated`: there is no last update. Do not write a date and time by guessing. To migrate from the git history, point the user to `adaptrace migrate-dates`.
- `stale-generated`: the body was changed, but neither `generated` nor `verified` was changed. If the meaning of the body was changed, update `generated`. If only the wording was changed, update `verified`. Ask the user which.
- For warnings not listed above, show `message` and suggest a fix as a diff.

## 3. Fix

1. Show the diffs of the items whose handling was decided, per document, and write them after approval. Even if the handling was decided in "2. Decide how to handle each item", get approval for the diff separately. Do not add keys that are not in the approved diff.
2. Change only the decided keys. Do not change `generated` (except for `stale-generated` in "Other warnings").
3. Do not change `index.md` when tidying dependencies. Even if you deprecate a document, keep its link. In `log.md`, only add lines. Do not change existing lines.

## 4. Record and report

1. Run `adaptrace validate`, `adaptrace health` and `adaptrace stale`. Compare with the results you kept in step 1. If there are items that were not there in step 1, explain the cause and show a diff that fixes them. Documents that newly appear in `stale` are re-pointed documents and the like, and they need review.
2. Ask whether to record this in `log.md`, showing the diff of the line to add. Write it under today's date heading (`## YYYY-MM-DD`) in the form `* **Update**: <description>`. Headings are in newest-first order, so if there is no heading for today, create it above the existing date headings (`## YYYY-MM-DD`). Do not put it above the file's title (`# ...`). If the heading already exists, add the line at the top of it. After writing, run `adaptrace validate`.
3. After the user answers, report the following together. Report in the conversation, not in a file. Make this report your last reply of the task.
   - For each category, the items fixed and the items left as they are.
   - That the items left as they are will be shown again the next time `health` runs.
   - The documents that need review: documents whose target was re-pointed, and documents that got a new dependency. Both appear in `stale` only when the new target is newer. Even if they do not appear in `stale`, check that their content matches the target. Review can be done with the skill `adaptrace-review`.
   - Documents whose redundant dependency was removed: when the target changes, `stale` first shows the document in the middle of the path.
   - The categories not yet handled, and the number of items in each.
