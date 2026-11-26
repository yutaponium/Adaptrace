# Bringing Adaptrace into an existing repository

[日本語](adoption.md) | English

> The Japanese version is the original. This translation follows it (ADR-003).

This guide explains how to start using Adaptrace in a repository where development is already under way.
It assumes that documents such as requirements, design decisions and tasks are scattered across a wiki, a `docs/` folder, Excel files, issues and so on.

The key is not to move everything at once. Start small, with the documents where you struggle to follow the impact of changes.

- This guide covers Adaptrace v1.0.0. The exact rules for keys and commands are in [the schema specification](../spec/schema.en.md)
- In this guide, `adaptrace` is the command installed with `bun add -g` in step 1. If you use a clone instead, read it as `bun src/cli.ts` run in your clone of the Adaptrace repository
- The "target repository" is the repository of the project that starts using Adaptrace. This guide calls it `my-project`

## Overview

1. Get Adaptrace ready to use
2. Choose the first documents to manage
3. Create a bundle in the target repository
4. Bring in existing documents
5. Add dependencies and validate
6. Open a PR and review it as a team
7. Add Adaptrace to CI and AI agents
8. Start using it day to day

## 1. Get Adaptrace ready to use

Adaptrace runs on [Bun](https://bun.sh/). Install Bun, then install Adaptrace in one of these two ways. Without Bun, download an executable instead.
If you use the tag of a released version, everyone on the team gets the same behavior.

**Install directly from GitHub** (the simplest)

```bash
bun add -g github:yutaponium/Adaptrace#v1.0.0
adaptrace --version
```

This gives you the `adaptrace` command. Adaptrace is not published on npm, so it is installed from the GitHub repository.

**Download an executable** (no Bun needed)

From [Releases](https://github.com/yutaponium/Adaptrace/releases), download the file for your platform (`adaptrace-<version>-<platform>.tar.gz`, or `.zip` for Windows). Extract it and put `adaptrace` in a folder on your PATH. The platforms are `linux-x64`, `linux-arm64`, `darwin-arm64` (Apple silicon), `darwin-x64` (Intel Mac) and `windows-x64`. You can check the file with `SHA256SUMS` on the same page. The executables are not signed. If macOS will not open it, run `xattr -d com.apple.quarantine adaptrace`. If Windows shows a warning, choose "More info" and run it.

```bash
tar -xzf adaptrace-v1.0.0-linux-x64.tar.gz
sudo mv adaptrace /usr/local/bin/
adaptrace --version
```

**Clone the repository**

Clone the repository if you want to copy the skill folders, or read the specification and the guides locally.

```bash
git clone https://github.com/yutaponium/Adaptrace.git ~/tools/adaptrace
cd ~/tools/adaptrace
git checkout v1.0.0
bun install
```

If you cloned it, typing `bun ~/tools/adaptrace/src/cli.ts` every time is long, so an alias is handy.

```bash
alias adaptrace='bun ~/tools/adaptrace/src/cli.ts'
```

Run the commands at the root of the target repository. By default, the bundle is `.adaptrace/` in the current folder.

## 2. Choose the first documents to manage

You do not need to move every document into Adaptrace from the start. Starting with documents like these shows the benefit quickly.

- Documents that change often, where related documents are often left un-updated after each change. For example, requirements, and the design decisions and tasks based on them
- Documents in areas that often receive change requests from customers or other departments
- Documents where one decision is the premise for many tasks or risks

At first, narrow the scope to one feature or one area. For example, "the requirements, decisions, tasks and risks around login", about 10 to 20 documents.
Widen the scope once you are used to it.

On the other hand, you do not have to move the following.

- Detailed day-to-day task management. Keep using your current tools, such as issues or Backlog.md. For working with Backlog.md, see [Using Adaptrace with Backlog.md](backlog-md.en.md)
- Records that do not change, such as past meeting minutes or the materials of finished projects

## 3. Create a bundle

In the target repository, create a working branch, then create the bundle.
A bundle is the folder that holds Adaptrace's documents.

```bash
cd my-project
git switch -c chore/adopt-adaptrace
adaptrace init --title "Member Site"
```

`init` creates the following files. It does not overwrite files that already exist.

```text
.adaptrace/
├── index.md                # Table of contents for the whole bundle
├── log.md                  # Change log (newest first)
├── requirements/index.md
├── decisions/index.md
├── tasks/index.md
├── risks/index.md
└── meetings/index.md
```

If your project manages documents according to PMBOK, you can copy [the PMBOK document templates](../../examples/pmbok/README.md) instead of running `init`.
How to use the templates, and how PMBOK documents are divided, are in [Updating PMBOK documents for a change request](pmbok.en.md).

## 4. Bring in existing documents

There are two ways to bring in existing documents.

| Method | Suited to | The original is |
|---|---|---|
| Move the document into the bundle | Documents written in Markdown that you will keep updating | The document in the bundle |
| Place a stand-in document that points to the original file | Documents you cannot move, such as Excel, MS Project, wiki pages, or files read by other tools | The original file |

### Move the document into the bundle

Move Markdown documents into the bundle and add frontmatter at the top.
Frontmatter is the part at the top enclosed by `---`. It holds fields such as the document's type and dependencies.

```markdown
---
type: Requirement
title: Add multi-factor authentication (MFA) to login
owner: sato
generated: { by: human:sato, at: 2026-11-10T10:00:00+09:00 }
---

(The body of the original document)
```

- If one file contains several requirements, split them into one file each. Dependencies are added per document, so splitting lets you follow the impact in finer detail
- `type` is required. Write `Requirement`, `Decision`, `Task`, `Risk` and so on
- In `generated`, write who wrote the content and the date and time of its last update. For a document you only moved without changing its content, use the author and date of the last commit that changed the original file (`git log -1 --format='%an %aI' -- <original path>`). If you use the date you brought it in, you can no longer tell which documents are newer
- Add a time zone to dates and times, such as `+09:00`
- Leave one line at the original location that points to the new location. Then people following links from other documents will not get lost

If you have existing ADRs, move them to `decisions/` and set `type: Decision`.
If an ADR was replaced, list the old one under `supersedes` in the newer document.

### Place a stand-in document that points to the original file

For a document you cannot move, place a "stand-in document" in the bundle to represent it.
Use `resource` to point from the stand-in document to the original file. The path is relative to the stand-in document and starts with `./` or `../`.

```markdown
---
type: Requirement
title: Member site requirements specification
owner: sato
resource: ../../docs/requirements.md
generated: { by: human:sato, at: 2026-11-25T10:00:00+09:00 }
---

The body of the requirements is in `docs/requirements.md`.
```

When you run `adaptrace stale`, it shows the SHA-256 of the original file. SHA-256 is a value calculated from the file's content.

```text
requirements/mfa.md  updated 2026-11-25T10:00:00+09:00 (generated.at)
  no sha256 recorded for its file ../../docs/requirements.md (now 3b1c255900b1c48d2e427656275ce6a5a8c501ac04745204efdba589c11f9d16)
```

Write the 64-character value it shows in `resource_sha256` to complete the record. `adaptrace stale --format json` also gives the same value as `current`.
After that, if the original file changes, `stale` tells you.

```yaml
resource: ../../docs/requirements.md
resource_sha256: 3b1c255900b1c48d2e427656275ce6a5a8c501ac04745204efdba589c11f9d16
```

How to handle a WBS in Excel or a schedule in MS Project is explained in detail in [Put a stand-in document for Excel and MS Project files](pmbok.en.md#put-a-stand-in-document-for-excel-and-ms-project-files) in the PMBOK guide.

### Create drafts from meeting minutes

If decisions are recorded only in meeting minutes, `extract` can create drafts.
An LLM (an AI that generates text) creates drafts of `Decision`, `Task`, `Risk` and other documents from the minutes.

```bash
adaptrace extract meetings/2026-11-20-review.md --llm "claude -p"
```

By default, it only shows the drafts. Check the content, then add `--write` to create them as new files.
Place the minutes themselves in `meetings/` as a document with `type: Meeting`.

### Have Claude Code help you bring in files

You can also work through step 4 and the next step, step 5, in a conversation using the Claude Code skill `adaptrace-adopt`.
A skill is a file that teaches Claude Code the steps of a task. The skills are written in Japanese.

1. Install the skill. You can install it as a Claude Code plugin, or copy its folder
   - **Plugin (recommended)**: run these two commands in Claude Code. All seven Adaptrace skills are installed together. Their names get the prefix `adaptrace:` (for example `/adaptrace:adaptrace-adopt`)

     ```text
     /plugin marketplace add yutaponium/Adaptrace
     /plugin install adaptrace@adaptrace
     ```

     To move to a newer version, run `claude plugin marketplace update adaptrace` and `claude plugin update adaptrace@adaptrace` in a terminal
   - **Copy**: copy `skills/adaptrace-adopt/` from the Adaptrace repository to `.claude/skills/` in the target repository. To use it in all your repositories, copy it to `~/.claude/skills/` instead. The skills follow the open "Agent Skills" format, so other agents (such as Codex and Gemini CLI) load them too when you copy them into their skill directories. However, the skills are tested only with Claude Code, and how they work with other agents has not been checked. Where to copy them is in [the README](../../README.en.md#other-coding-agents)

     ```bash
     mkdir -p .claude/skills
     cp -r ~/tools/adaptrace/skills/adaptrace-adopt .claude/skills/
     ```

   Either way, install the CLI as in step 1. The skills call the CLI to do their work

2. In Claude Code, name the files you want to manage and ask

   ```text
   I want to manage docs/requirements.md and docs/adr/ with Adaptrace. Add the dependencies too.
   ```

Claude works in this order.

- For each file, it asks whether to move it into the bundle or to place a stand-in document
- It suggests the type and the frontmatter content. For fields it does not know, such as the owner, it asks instead of guessing
- It shows candidate dependencies, with the reasons and how likely each one is. You choose which ones to adopt
- Before writing, it shows the diff for each file. It writes only what you approve
- Finally, it checks with `validate`, `stale` and `impact`

## 5. Add dependencies and validate

Once the documents are in place, write the dependencies between them in the frontmatter.
With dependencies, when a document changes, `impact` can list the documents to review.

```yaml
---
type: Task
title: Add MFA to the login screen
state: to_do
owner: tanaka
generated: { by: human:tanaka, at: 2026-11-25T10:00:00+09:00 }
satisfies: /requirements/mfa.md
depends_on: /decisions/auth-provider.md
---
```

- Write dependencies from the downstream document to the upstream document. Write "which documents, when changed, mean this document must be reviewed"
- Write paths inside the bundle, starting with `/`
- A dependency can point only to documents inside the bundle. For a file outside the bundle, place a stand-in document as described above and point to it
- Do not link everything. With too many links, a single change makes almost every document a review target

How to think about adding dependencies is explained in [How to set dependencies](project-management.en.md#how-to-set-dependencies) in the project management guide.

After writing them, validate.

```bash
adaptrace validate
adaptrace graph --format mermaid
```

- `validate` reports errors such as frontmatter mistakes, targets that do not exist, and cycles
- Paste the output of `graph` into Markdown on GitHub or into a Mermaid editor to see the dependencies as a diagram

As a test, pick one upstream document, run `impact`, and check that the documents you expect are listed.

```bash
adaptrace impact requirements/mfa.md --order review
```

## 6. Open a PR and review it as a team

A bundle is just Markdown. Keep it in the same repository as the code and review it in PRs.

- In the first PR, review as a team which documents were brought in and how the dependencies were added. Pasting the `graph` diagram into the PR description makes it easier to explain
- The merge of that PR is the starting point of the adoption. If `adaptrace stale` shows nothing at that point, later changes are easier to follow

## 7. Add Adaptrace to CI and AI agents

### Validate in CI

Running `adaptrace validate` in CI stops PRs with broken dependencies before they are merged.
CI is a system that runs checks automatically on every change.
`validate` exits with code 1 if there are errors, and with 0 if there are only warnings.

Here is an example for GitHub Actions.

```yaml
name: adaptrace
on: [pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/checkout@v5
        with:
          repository: yutaponium/Adaptrace
          ref: v1.0.0
          path: .tools/adaptrace
          token: ${{ secrets.ADAPTRACE_TOKEN }}
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
        working-directory: .tools/adaptrace
      - run: bun .tools/adaptrace/src/cli.ts validate .adaptrace
```

- The Adaptrace repository is private for now. So you need to register a token with read access as a repository secret (`ADAPTRACE_TOKEN`)
- In `ref`, write the tag of the version you use

If you do not want PRs merged until the review for a change request is finished, you can also run `adaptrace progress <change request>` in CI. It exits with code 1 until every document has been reviewed.

### Use it from AI agents

You can register Adaptrace as an MCP server with AI agents such as Claude Code.
MCP is a protocol that lets AI agents use external tools.

```bash
claude mcp add adaptrace -- adaptrace mcp .adaptrace
```

If you use a clone, replace `adaptrace` with `bun ~/tools/adaptrace/src/cli.ts`.

The MCP server does not write files. The agent only creates draft updates. A person decides whether to apply them.

If the target repository has a `CLAUDE.md` or `AGENTS.md`, adding instructions for the agent there helps it remember to use Adaptrace.

```markdown
## Requirement and decision documents

- Requirements, design decisions, tasks and risks are in `.adaptrace/` (an Adaptrace bundle)
- When you change a requirement or decision, check the affected documents with `impact` and show draft updates
- When you change a document, update `generated`. When you review it and no change is needed, update `verified`
```

Examples of how to ask an agent are in [Delegating to AI agents](project-management.en.md#delegating-to-ai-agents) in the project management guide.

## 8. Start using it day to day

After adoption, use Adaptrace in these situations.

| Situation | Commands | Details |
|---|---|---|
| When you change a document | `impact`, `assess` | [When a change request arrives](project-management.en.md#when-a-change-request-arrives) in the project management guide |
| When you receive a change request | `estimate`, `conflicts`, `meeting` | [3. Take in a change request](pmbok.en.md#3-take-in-a-change-request) in the PMBOK guide |
| When you check how far the review for a change request has gone | `progress` | [5. Check that nothing is missed](pmbok.en.md#5-check-that-nothing-is-missed) in the PMBOK guide |
| Before a regular meeting | `stale`, `board`, `list` | [Regular status checks](project-management.en.md#regular-status-checks) in the project management guide |

When you update a document, update its frontmatter too.

- If you changed the content, set `generated` to the current date and time. Documents that depend on it become review targets
- If you reviewed it and no change was needed, leave `generated` as it is and set `verified: { by, at }` to the current date and time. Documents that depend on it do not become review targets

## Common pitfalls

- **Every `.md` file in the bundle needs frontmatter.** Except for `index.md` and `log.md`, a Markdown file without `type` is a `validate` error. Keep notes and explanatory `README.md` files outside the bundle
- **Write a time zone in dates and times.** `2026-11-25` and `2026-11-25 10:00` are treated as "no date and time" and cannot be compared. Write them like `2026-11-25T10:00:00+09:00`
- **Do not write progress in `status`.** `status` is used only for the lifecycle (`draft`, `stable`, `deprecated`). Write progress in `state`
- **Check your formatter settings.** If the repository uses a Markdown formatter or linter, check whether it rewrites frontmatter. If it does, exclude `.adaptrace/` from it
- **Write `generated` in every document.** Since v0.9.0, the last update is decided only by `generated.at`, and git commit dates are not used. Documents without `generated` cannot be compared, so `adaptrace validate` warns about them. A bundle that relied on git dates can be migrated once with `adaptrace migrate-dates --write`
