# adaptrace-adopt (English reference translation)

[Japanese original (the skill that runs)](../../skills/adaptrace-adopt/SKILL.md)

> This is a reference translation for English readers. Claude Code runs the Japanese SKILL.md; this file is not loaded as a skill. When the two differ, the Japanese version is correct (ADR-003).

## When the skill is used

The skill brings files of an existing repository into an Adaptrace bundle, selects candidate dependencies, and writes them to the frontmatter in a conversation with the user. Use it when the user says "I want to manage this file with Adaptrace", "I want to add dependencies" or "I want to start using Adaptrace", or when the user names files or directories to manage. It writes only after the user approves the diff.

## Overview

Bring the given files into an Adaptrace bundle (`.adaptrace/` by default) and add dependencies.
Follow steps 4 and 5 of the Adaptrace guide [Bringing Adaptrace into an existing repository](../guide/adoption.en.md) (`docs/guide/adoption.md`).
The exact rules for keys and commands are in Adaptrace's `docs/spec/schema.md`.
They are all in the Adaptrace repository; "Shared conventions" below says where to find them. Read them when you are unsure how to proceed.

## Rules

- **Do not change any file before the user approves.** Before writing, show the diff for each file and get approval. Do not write changes that were not approved (Adaptrace design principle 6)
- Do not guess the owner (`owner`), dates and times, or `state`. If the document does not say, ask the user. If nobody knows, leave the field out
- Change only the given files and the target documents of approved dependencies. If you want to change any other file, ask first
- Do not write contact details (email addresses, phone numbers) or secrets in the frontmatter
- Commit and push only when the user asks
- In steps 1 to 4, only make a plan. Do not change files (except `init` in step 0). Do all writing together in step 5
- When you ask the user something, use a tool that asks with choices (AskUserQuestion) if one is available. Otherwise, show numbered choices in text and wait for the answer
- If the user leaves a decision to you ("whatever you recommend"), show the recommended value and the reason in the diff, and get approval

## How to write paths

| Where | How to write | Example |
|---|---|---|
| A document passed to a command | Path inside the bundle, without a leading `/` | `adaptrace impact requirements/req-1-mfa.md` |
| The value of a dependency key | Path inside the bundle, with a leading `/` | `satisfies: /requirements/req-1-mfa.md` |
| The value of `resource` | Path relative to the stand-in document, starting with `./` or `../` | `resource: ../../pm/schedule.xlsx` |

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
2. Ask whether to create a working branch. If the adoption goes into one PR, the team can review it more easily
3. Check where the bundle is. The default is `.adaptrace/` at the root of the repository. If there is none, ask whether you may create it with `adaptrace init --title "<project name>"`. `init` creates only the skeleton of the bundle, so you may run it without waiting for step 5
4. Check the current state. Both commands fail if there is no bundle, so run them after `init`
   - `adaptrace validate`: note the errors that exist before the adoption, so that you can later tell them apart from new errors
   - `adaptrace list --format json --columns type,state,owner,depends_on,derived_from,satisfies`: the existing documents, types and dependencies. From here on, the documents listed here are called "existing documents". A new bundle has no existing documents
5. Use the type names the bundle already uses. If the bundle was made from the PMBOK templates, use those type names
6. Write the paths of documents passed to commands as paths inside the bundle (`requirements/mfa.md`). Paths outside the bundle are not accepted

## 1. Decide how to bring in each file

Decide how to bring in each given file. If a directory or glob is given, list the target files and confirm them with the user.

| File | How to bring it in |
|---|---|
| Inside the bundle, with frontmatter | Leave as is. Go to step 3 |
| Inside the bundle, without frontmatter | Add frontmatter |
| Markdown outside the bundle | Ask whether to "move it into the bundle" or "place a stand-in document" |
| Non-Markdown outside the bundle (Excel, MS Project, PDF and so on) | Place a stand-in document |

When you ask, include these guidelines.

- Move it into the bundle: for documents that will keep being updated in Markdown. After the move, the document in the bundle is the original
- Place a stand-in document: for documents whose original lives in another tool or a wiki, files read by other systems, and non-Markdown files

If one file contains several requirements or decisions, suggest splitting them into one file each. Dependencies are added per document, so splitting lets you follow the impact in finer detail. The user decides whether to split.

If minutes or notes contain decisions, action items or risks, suggest creating a `Decision`, `Task` or `Risk` document for each.

- The created documents point to the minutes with `derived_from`
- If the minutes give the owner and due date of an action item, write them in `owner` and `due`
- If the user can use an LLM command, you may create drafts with `adaptrace extract <minutes> --llm "<command>"`. `extract` does not write unless `--write` is given. However, `extract` accepts only documents inside the bundle. If the minutes are not in the bundle yet, first write only the adoption of the minutes in step 5, then use `extract`
- Bring in the minutes themselves as a `type: Meeting` document

The created documents are often connected to requirements and decisions. For example, an action item Task points to a requirement with `satisfies`, and a risk points to a decision with `depends_on`. Remember to include them when you select candidate dependencies (step 3).

## 2. Create the frontmatter

Create the following frontmatter for each document.

```yaml
type: Requirement                 # Type. Use the names the bundle uses
title: Add MFA to login           # From the heading or content of the body
owner: sato                       # Only when the document says so. Otherwise ask
generated: { by: human:sato, at: 2026-11-10T10:00:00+09:00 }
```

- For `type`, list candidates from the body and let the user choose. The type names used for PMBOK (`Schedule Baseline`, `Cost Baseline`, `WBS` and so on) are in Adaptrace's `examples/pmbok/README.md`
- For `title`, use the heading of the original document as is. If the original document has an ID (REQ-1, ADR-0001 and so on), keep it in `title` too
- Write `state` (progress) only for types that have progress, such as Task and Risk. If the original document does not give it, ask for the value
  - If the bundle already uses values, use the same ones. Otherwise, recommend `to_do`, `in_progress` and `done` for Task, because `adaptrace board` shows these values as columns
  - The values for Risk and other types are up to the project. Show candidates (`open`, `closed` and so on) and ask
- Recommend writing `owner` as an ID in Latin letters. The user decides whether to write it as a name in kanji
- A person named in minutes or notes is not necessarily the owner. It may be the speaker or the person who filed it. Always confirm before making them the `owner`
- If a date has no year or time, show a value filled in from the context of the document (such as the date of the minutes) and get confirmation
- In `generated.at`, write the date and time of the last update of the content, with a time zone
  - Moved documents and split documents: the date of the last commit that changed the original file (`git log -1 --format=%aI -- <original path>`). The content has not changed, so if you use the adoption time, you lose which documents are newer. Use the current time only if the original file already had uncommitted changes before the adoption started
  - Newly created documents (stand-in documents, documents created from minutes): the current time. Get it only once at the start of the adoption, and use the same value for all documents newly created this time. If you get it per document, a target becomes a few seconds newer and `stale` reports the document as older. On GNU date, for example, get it with `date --iso-8601=seconds`. Use the form `2026-11-25T10:00:00+09:00`
- `generated.by` shows the person or system that wrote the content
  - Moved documents and split documents: a person wrote the content, so suggest `human:<id>` from the author of the last commit that changed the original file (`git log -1 --format=%an -- <original path>`), and get confirmation. Use lowercase Latin letters, digits and `-` for `<id>`. If the author name contains spaces or Japanese, or it is a shared account, ask the user
  - Newly created documents: a value that shows an agent created it ("Shared conventions", `generated.by`)
- Write only the lifecycle (`draft`, `stable`, `deprecated`) in `status`. Write progress in `state`

### Location and file names

- Put documents in the directory for their type (`requirements/`, `decisions/`, `tasks/`, `risks/`, `meetings/`). For a type that `init` does not create, create a directory named after the type in lowercase (`schedule-baseline/` for `Schedule Baseline`)
- Write file names with lowercase Latin letters, digits and `-`. If the original document has an ID, put it at the start (`req-1-mfa.md`, `adr-0001-idp.md`). Start minutes with the date (`2026-11-10-weekly.md`)
- For each new document, add a one-line link to the `index.md` of its directory. If you create a new directory, create its `index.md` and add a link to it in the root `index.md` too. Write the link line in the same form as the root `index.md`: `* [display name](file name)`. Use the same heading in the directory's `index.md` as the ones `init` created. Include both in the diff of step 5

### When moving a document into the bundle

- Keep the body of the original document as is. In split documents, make the heading of that entry the top level (`#`). Ask the user whether to remove from the body the information moved to the frontmatter (such as "Owner: Sato")
- When you move one file as a whole, move it with `git mv`. Git treats it as a move, so the history can be followed
- When you split a file or leave a pointer at the original location, Git does not treat it as a move. Tell the user that the history stays at the original path
- If you do not leave a pointer at the original location of a split file, delete the original file with `git rm`. If the same content stays in two places, only one gets updated and they drift apart. Include the deletion in the diff of step 5 and get approval
- Ask whether to leave a file at the original location that points to the new location. If you leave one, make it a single line (example: "This document has moved to [.adaptrace/requirements/](../.adaptrace/requirements/index.md).")
- Search the repository for links to the original file and sentences that contain its path (`grep -rn "<original path>"`), and tell the user as a list. The user decides whether to rewrite them
- If a directory becomes empty after the move, tell the user

### When placing a stand-in document

- Create the stand-in document in the directory for its type. In the body, briefly write where the original file is and what document it is
- Point to the original file with `resource`. **The path is relative to the stand-in document and starts with `./` or `../`**
- Get the SHA-256 to record by running `adaptrace stale --format json` after writing the stand-in document. Among the reasons (`reasons`) for that document, take the `current` value of the one whose `kind` is `resource-unrecorded`, and write it to `resource_sha256`. You may treat this addition as approved together with the diff of the stand-in document. Write "The SHA-256 is recorded after writing" in the diff
- Why use the value from `stale`: for text files, it computes the hash with CRLF line endings treated as LF, so it can differ from the value of `sha256sum`
- If `stale` reports `resource-missing`, the path is wrong or the file cannot be read. Check the path and tell the user

```yaml
type: Requirement
title: Member site requirements specification
resource: ../../docs/requirements.md
resource_sha256: 3b1c2559… (the 64 hex digits that `stale` reported)
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-25T10:00:00+09:00 }
```

## 3. Select candidate dependencies

For each document brought in, select candidate dependencies. Decide by reading the body and the bodies of the candidate targets.

### Choosing the key

Write dependencies from the downstream document to the upstream document. The test is: "If the target changes, should this document be reviewed?"

| Key | Meaning | Example |
|---|---|---|
| `derived_from` | Made from the target's content | Acceptance criteria → requirement, a decision created from minutes → minutes |
| `satisfies` | Exists to satisfy the target (a requirement) | Task → requirement, a design decision to realize a requirement → requirement |
| `depends_on` | Assumes the target | Risk → decision, schedule → task |

The following keys do not propagate reviews. Suggest them only when the body or the user's explanation gives clear grounds.

- `supersedes`: this document replaced the target's decision
- `blocks`: this document is holding up the target's work
- `changes`: a change request changes the target document

### Finding candidates

- Candidate targets are the existing documents in the bundle and the documents brought in this time
- Use clues such as links in the body, document IDs (ADR-012, REQ-3 and so on), shared terms, and phrases like "based on" or "assuming"
- You often cannot read the original file of a stand-in document (Excel and so on). In that case, do not guess candidates. Ask the user: "Which documents, when changed, mean this file should be reviewed?" For a schedule, tasks and the WBS are candidates
- Also look for candidates in the other direction: existing documents (those listed by `list` in step 0) that should depend on the new document. Writing these changes existing documents, so show them separately

### What not to suggest

- Anything that creates a cycle. In the plan that combines this time's candidates with the dependencies that already exist, if this document can be reached from the target, making the target a dependency creates a cycle. `adaptrace impact` works only on documents already in the bundle, so decide for documents not yet brought in based on the plan. `validate` after writing does the final check for cycles
- Anything already covered transitively. If A depends on B and B depends on C, you normally do not add A to C. However, use only existing dependencies and dependencies the user has decided to adopt for this judgment. Do not judge something "already covered" through a candidate that is not decided yet
- Do not connect documents just because they seem related, even across types. For example, suggest that a task assumes a design decision only when the body gives grounds
- Anything that is only "related", where a change to the target would not mean reviewing this document. Too many connections make almost every document a review target after a single change. If you only want to refer to it, use a link in the body

## 4. Decide with the user

For each document, show the candidates in a table.

| Candidate | Key | Grounds | Likelihood |
|---|---|---|---|
| `/decisions/auth-provider.md` | `depends_on` | The body says "assuming we use IdP-X" | High |
| `/requirements/mfa.md` | `satisfies` | The title and acceptance criteria match | Medium |

- In the grounds, write a short quote from the body or the clue
- Order candidates from most likely, up to about five per document
- Ask which to adopt with choices (multiple selection). If there are many choices, split them over several questions. For documents with few candidates, ask about several documents in one question to reduce back-and-forth
- For a candidate where the key is unclear, also ask which key to use
- Also accept dependencies the user names that are not among the candidates. Check that these do not create a cycle either

## 5. Show the diff, then write

Show what was decided as a diff for each file, and write only after approval. After approval, write in this order.

1. Move documents with `git mv`
2. Create new documents, and add frontmatter to moved and split documents
3. Write the dependencies, including those added to existing documents
4. Update `index.md` and `log.md`
5. Record the SHA-256 of stand-in documents with the value from `stale`
6. Ask whether to `git add` the newly created files. Documents moved with `git mv` are staged, but new files are untracked, so making them consistent makes committing easier

Rules for writing:

- Write paths as paths inside the bundle starting with `/`
- Use a scalar for one target and a block-style list for two or more
- Keep the existing frontmatter lines and comments. Only add keys
- If you only add dependencies to an existing document, do not change `generated`, because the content has not changed
- Ask whether to add one line to `log.md` about the adoption. If you add it, write it under a heading for today's date (`## YYYY-MM-DD`), newest first. Use the form `* **Creation**: <description>`. The `**Initialization**` line that `init` writes is in English, but write the description in the same language as the body of the bundle's documents, not in English

After writing, run the following.

1. `adaptrace validate`: if there are more errors than in step 0, explain the cause and show a diff that fixes them. Run it after recording the SHA-256
2. `adaptrace stale`: if documents are reported as older because of the new dependencies, tell the user. This is because the target is newer. If a review finds no change is needed, add `verified: { by, at }`. The user decides whether to add it
3. Pick one upstream document, run `adaptrace impact <document> --order review`, and check with the user that the listed documents are as intended. `needs review` appears only on documents older than that document, so "0 documents to review" is not a problem. What you check is which documents are listed

## 6. Report

Finally, report the following together.

- The documents brought in (moved, given a stand-in document, given frontmatter)
- The dependencies added, and the candidates not adopted
- The results of `validate` and `stale`
- What the user decides later (documents with no owner, links at the original location and so on)

If the user wants to see a diagram of the dependencies, show the output of `adaptrace graph --format mermaid`.
