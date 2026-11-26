# Adaptrace schema (v1.0)

[日本語](schema.md) | English

> The Japanese version is the original. This translation follows it (ADR-003).

An Adaptrace bundle is a directory of Markdown that conforms to [OKF 0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md).
This document defines the rules that Adaptrace adds on top of OKF. The reasons for these choices are in [ADR-008](../../.adaptrace/decisions/adr-008-okf-alignment.md).

## Bundle

- The default location is `.adaptrace/` at the root of the repository
- `index.md` and `log.md` are OKF reserved files. They are not concept documents
- The root `index.md` may have `okf_version: "0.2"` in its frontmatter. Other `index.md` files have no frontmatter
- `log.md` has one heading per date (`## YYYY-MM-DD`), newest first
- Every other `.md` file is a concept document. It needs YAML frontmatter and a non-empty `type`

## Frontmatter

| Key | Required | Content | Origin |
| --- | --- | --- | --- |
| `type` | Required | The document type (table below) | OKF |
| `title` | | Display name | OKF |
| `description` | | One-sentence summary | OKF |
| `tags` | | List of tags | OKF |
| `status` | | `draft` / `stable` / `deprecated`. Defaults to `stable` | OKF |
| `generated` | | `{ by: <actor>, at: <datetime> }`. `at` is the last update | OKF |
| `verified` | | `{ by, at }` or a list of them. A record of a review that needed no change | OKF |
| `stale_after` | | The document is treated as old after this datetime | OKF |
| `resource` | | What the document represents (a URI or a path). If it is a local file, `stale` reports changes to it | OKF |
| `resource_sha256` | | The SHA-256 of the file that `resource` points to, at the time of the review | Adaptrace |
| `sources` | | List of source materials. If an item's `resource` is a local file, `stale` reports changes to it. Each item's `sha256` records the SHA-256 at the time of the review | OKF (`sha256` is Adaptrace) |
| `state` | | Progress (`proposed`, `in_progress`, `done`, `accepted`, and so on). Each project decides the values per type | Adaptrace |
| `received_at` | | The datetime a change request was received. It is the baseline datetime for `progress` | Adaptrace |
| `requested_by` | | The person or organization that made the change request. A name, or the path of a stakeholder document (starting with `/`). Not a dependency | Adaptrace |
| `side` | | In a stakeholder document: internal (`internal`) or customer (`customer`). Used by `meeting` | Adaptrace |
| `role` | | In a stakeholder document: the role of the person or organization | Adaptrace |
| Dependency keys | | Table below | Adaptrace |

- Write datetimes in ISO 8601 with a UTC offset (for example, `2026-10-29T10:00:00+09:00`)
- Actors follow the OKF rules. A person is `human:<id>`, an agent or tool is `<producer>/<version>`, and an automated process is `process:<id>`
- You may add other keys freely, such as `owner` or `due`. Adaptrace does not delete keys it does not know
- The OKF 0.1 `timestamp` is readable, but a warning recommends moving to `generated.at`

## Types

| `type` | Content |
| --- | --- |
| `Requirement` | Requirement or customer request |
| `Acceptance` | Acceptance criteria or definition of done |
| `Decision` | Decision record (equivalent to an ADR) |
| `Task` | Work item |
| `Risk` | Risk and its response |
| `Milestone` | Milestone |
| `Change Request` | Change request |
| `Meeting` | Minutes |

Each project can add types. A type not in the table is not an error.
If a type in the table is written in lowercase or with hyphens (`task`, `change-request`), a warning suggests fixing the spelling.

## Dependency keys

The value is one path or a list of paths. Every key points from "the document that has the key" to "the document in the value".

| Key | Meaning | When the target changes |
| --- | --- | --- |
| `depends_on` | This document depends on the target | Review this document |
| `derived_from` | This document was derived from the target | Review this document |
| `satisfies` | This document satisfies the target (a requirement, for example) | Review this document |
| `blocks` | The target cannot proceed until this document is done | (If this document is late, the target is affected) |
| `supersedes` | This document replaces the target | (The target becomes invalid) |
| `changes` | This change request changes the target (the target is a starting document). [ADR-023](../../.adaptrace/decisions/adr-023-changes-key.md) | (Not propagated. On approval, add the change request to the target's `derived_from`) |

- Write paths as bundle-absolute paths that start with `/` (`/requirements/security-mfa.md`). Paths relative to the file (`../requirements/security-mfa.md`) and concept IDs without `.md` are also readable
- Markdown links in the body are references. They are handled separately from dependencies

## Validation (`adaptrace validate`)

The exit code is 0 when there are no problems or only warnings, 1 when there are errors, and 2 for a wrong command or argument.

Body links are checked in `index.md` and `log.md` as well as in concept documents.
It reads links of the form `[text](target)` and reference-style links (`[text][1]`, `[text][]`, `[text]`). For a reference-style link, the target of its definition (`[1]: target`) is checked on the line where the link is used. A target that contains spaces is enclosed in `<...>` (`[text](<my file.md>)`). A target may contain one level of balanced parentheses (`[text](guide_(v2).md)`). Footnotes (`[^1]`) and task list checkboxes (`- [x]`) are not treated as links. Definitions inside list items, indented code blocks, and HTML comments that span several lines are not yet distinguished.

| Severity | Code | Content |
| --- | --- | --- |
| error | `frontmatter` | The frontmatter is missing, not closed, or not readable as YAML |
| error | `missing-type` | `type` is missing or empty |
| error | `index-frontmatter` | `index.md` has frontmatter that is not allowed |
| error | `log-date` | A date heading in `log.md` is not `YYYY-MM-DD` |
| error | `invalid-dependency` | The value of a dependency key is neither a path nor a list of paths |
| error | `dependency-target` | The target does not exist, is not a concept document, or is outside the bundle |
| error | `dependency-cycle` | The review chain (`depends_on`, `derived_from`, `satisfies`) or `supersedes` forms a cycle |
| warning | `okf-version` | `okf_version` is not 0.2 |
| warning | `type-spelling` | A type in the table is written in lowercase or with hyphens |
| warning | `invalid-status` | `status` is not an OKF lifecycle value |
| warning | `legacy-timestamp` | `timestamp` is used |
| warning | `invalid-generated` / `invalid-verified` / `invalid-datetime` | The form of `generated`, `verified`, `stale_after` or `received_at` is wrong |
| warning | `dependency-deadlock` | Documents wait for each other ("Deadlocks" below) |
| warning | `broken-link` | A body link target does not exist. OKF allows broken links, so this is a warning |
| warning | `missing-resource` | The local file that `resource` or `sources[].resource` points to does not exist or is not a regular file ("Non-Markdown files" below) |
| warning | `invalid-sha256` | `resource_sha256` or `sources[].sha256` is not a string of 64 hex digits |
| warning | `unlinked-sha256` | A SHA-256 is recorded, but the value it belongs to cannot be read as a local file (for example, it was written as `/pm/...`). It is not tracked |
| warning | `missing-generated` | Neither `generated.at` nor `timestamp` exists. The last update of the content is unknown ("Last update" below). This includes documents with only `verified`, and documents whose `generated` has no `at`. A document with a wrongly formatted `at` is reported by `invalid-datetime`. Only `validate` in the CLI and MCP checks this |
| warning | `stale-generated` | The body changed, but neither `generated` nor `verified` changed ("Detecting missed updates" below). Only `validate` in the CLI and MCP checks this, in a git repository |
| warning | `stale-generated-skipped` | `stale-generated` was not checked because the clone is shallow. Or git could not compare some documents |

### Deadlocks

`blocks` and `depends_on` both express a "waits for" relation.

- `A blocks B`: B waits for A
- `A depends_on B`: A waits for B

If these "waits for" relations form a cycle that contains at least one `blocks`, no document can proceed. This is a deadlock.
For example, if `A depends_on B` and `A blocks B` both exist, A and B wait for each other.

A deadlock is a warning, not an error ([ADR-009](../../.adaptrace/decisions/adr-009-deadlock-warning.md)). It can occur temporarily while planning.
The warning shows who waits for whom. It then suggests removing one dependency, or splitting a document so that part of the work can start.

A cycle of `depends_on` alone is an error, as a cycle in the review chain (`dependency-cycle`).

Deadlock detection also counts documents with `status: deprecated`. `board` does not treat a cancelled Task as something to wait for, so a deadlock that includes a cancelled Task does not appear in `board`. Removing the dependencies of the cancelled Task clears the warning.

## Graph (`adaptrace graph`)

- `--format mermaid` (default): a Mermaid `graph LR`. Dependencies are solid lines. With `--references`, body links are added as dotted lines
- `--format json`: `nodes` (path, ID, type, display name, `status`, `state`), `edges` (`from`, `to`, `kind`), `backlinks` (incoming edges per document)

## Last update

Impact analysis and staleness detection compare the "last update" of documents ([ADR-010](../../.adaptrace/decisions/adr-010-last-updated.md), [ADR-029](../../.adaptrace/decisions/adr-029-no-git-dates.md)).

1. `generated.at`
2. If missing, the old `timestamp`
3. If both are missing, "unknown". It is not compared

Git commit dates are not used. They are not fixed until a commit is made, and they change with the clone depth. The result is the same wherever it runs.
`validate` warns about a document with neither `generated` nor `timestamp` with `missing-generated`. A bundle that filled in the last update from git dates is migrated once with `adaptrace migrate-dates` ("Migrating dates" below).

Only ISO 8601 datetimes with a UTC offset are read.
Values such as `2026-10-29` or `2026-10-29 10:00` would give different results depending on the time zone of the environment. They are therefore treated as "no datetime" (validate also warns).

If a review finds that no change is needed, leave `generated` as it is and set `verified: { by, at }` to the current datetime ([ADR-020](../../.adaptrace/decisions/adr-020-verified-review.md), [ADR-021](../../.adaptrace/decisions/adr-021-verified-review-followup.md)).

- A document's "reviewed datetime" is the newer of the content's last update and `verified.at`. When `verified` is a list, the newest `at` is used
- Whether a document is old is decided by comparing its own reviewed datetime with the content's last update of its targets. This is the same in `impact`, `stale` and `progress`
- So a review alone does not make the documents that depend on it old. When the content changes, `generated` is updated, so the documents that depend on it become review candidates
- For a document with no content datetime and only `verified`, the oldest `verified.at` is used as the content's last update. This keeps the content datetime from moving forward with each review
- When adding `verified`, keep the earlier records and append to the end of the list
- `assess` and the MCP draft updates change only the `verified` lines. For a one-line `verified: { ... }` and a block-style list, other lines and comments are kept. For any other form, the `verified` part is rewritten. If a record cannot be added without losing earlier records (a quoted key, for example), no draft is made and an error is returned
- The output shows the reviewed datetime as "reviewed" (`reviewed` in JSON)

### Detecting missed updates

`validate` warns with `stale-generated` about a document whose body changed while neither `generated` nor `verified` changed ([ADR-029](../../.adaptrace/decisions/adr-029-no-git-dates.md)).

- It reads the versions before and after each change and compares the body (the part after the frontmatter). It does not depend on git diff settings
- It goes back from uncommitted changes through the commits that changed the document, newest first. It stops at a change that set any of `generated.at`, `timestamp` or the latest `verified.at` to a newer datetime. A change to `by` alone or to formatting does not count as a record. If a change before that point changed the body without changing the record, it warns. It goes back at most 50 commits
- A frontmatter-only change (adding a dependency, for example) does not count as a body change. A merge commit is compared with its first parent
- Updating `generated` if the meaning of the content changed, or `verified` if only the wording was fixed, clears the warning
- It is not checked outside a git repository. In a shallow clone (`git clone --depth 1`), the version before the commit that last changed the document may be missing. So it is not checked, and one `stale-generated-skipped` is shown. In CI, set `fetch-depth: 0` on `actions/checkout`
- This check and `missing-generated` are added by `validate` in the CLI and MCP. They are not part of the check on MCP draft updates

### Migrating dates (`adaptrace migrate-dates [bundle]`)

Migrates, once, a bundle that filled in the last update from git dates.

- For each `missing-generated` document, it writes `generated: { by: process:git, at }` with the author date of the commit that last changed the document
- By default it only shows the diff. With `--write` it writes
- Documents not yet committed, and documents changed after their last commit, have no datetime to take. They are shown separately. Commit and run again, or write `generated` by hand
- For a document whose `generated` has `by` but no `at`, it keeps `by` and writes the datetime. A document whose `generated` datetime cannot be read (a wrong `at` format, for example) is not rewritten and is shown separately. Fix it by hand
- A document with only `verified` also gets the datetime of its last commit. Only a document with no commit gets the oldest `verified.at`. Both are the datetimes used as the last update until now
- Other fields of `generated` are kept
- It does not run outside a git repository or in a shallow clone. In a shallow clone, every file would get the same commit datetime
- The exit code is 1 when it refuses to run or fails to write a document, and 0 otherwise
- `--format` is `text` (default) or `json`

## Impact analysis (`adaptrace impact <document>`)

Lists the review candidates when a document changes.

- It follows `depends_on`, `derived_from` and `satisfies` in reverse. It does not follow `blocks` or `supersedes`
- The first level is "Direct" and later levels are "Indirect", nearest first
- Documents older than the changed document, and documents whose last update is unknown, are marked `needs review`. If the last update of the changed document is unknown, nothing can be compared, so all are marked
- Documents with `status: deprecated` are not listed, but the traversal continues past them. Documents that depend on a deprecated document are listed
- A document can be given as any of: a path from the bundle, a path starting with `/`, a concept ID (without `.md`), a path from the current directory, or an absolute path
- The bundle is given with `--bundle`. `validate`, `graph` and `stale` also accept `--bundle` (it cannot be combined with `[bundle]`)

### Review order (`--order review`)

With `--order review`, documents are ordered upstream first. Each document comes after all of its targets within the reached documents have been reviewed. Reviewing in this order means no document is reviewed twice.

- The default is `--order depth`. This is the "Direct" / "Indirect" order above
- The order is shown as "steps". A step is the number of levels on the longest path from the starting documents. Documents with `status: deprecated` are not listed, so steps are renumbered from 1 using only the listed documents
- Documents in the same step do not depend on each other, except in a cycle. They can be reviewed in any order. Within a step, documents are sorted by path
- Where a document is reached from (the path in `impact`, "Via" in `estimate`) shows the shortest path regardless of `--order`. It is not necessarily the target that decided the step
- Each document in JSON includes `step` regardless of `--order`. With `--order review`, the JSON order also follows the steps
- The order is printed even if the reached documents contain a cycle. Documents in a cycle share the same step. They depend on each other, so review them together. Documents that depend on the cycle come in later steps. A cycle is a `validate` error

## Staleness detection (`adaptrace stale [bundle]`)

Lists documents that match any of the following. The exit code is 0 even if old documents are found.

- The last update is older than a direct target of `depends_on`, `derived_from` or `satisfies` (check indirect effects with `impact`)
- The local file that `resource` or `sources[].resource` points to differs from the recorded SHA-256, or nothing is recorded ("Non-Markdown files" below)
- `stale_after` has passed

Documents with `status: deprecated` are excluded, both as old documents and as newer targets.
If the same target is pointed to by several keys, the reasons are merged into one.
Documents whose last update is unknown cannot be compared, so only their names are shown.

### Non-Markdown files

An Excel WBS or an MS Project schedule cannot be a dependency target. Put a "proxy document" that represents it in the bundle, and point to the file with OKF keys ([ADR-022](../../.adaptrace/decisions/adr-022-resource-freshness.md)).
When you review the proxy document, compute the SHA-256 from the file content and record it in the proxy document.

```yaml
type: Schedule Baseline
resource: ../../pm/schedule.mpp      # the file this document represents
resource_sha256: 3f2a…c91e           # SHA-256 of that file at review time
sources:
  - resource: ../../pm/wbs.xlsx      # a file this document is based on
    sha256: 9b0d…41aa
```

- `stale` compares the file's current SHA-256 with the record. If they differ, it lists `resource-changed`. If nothing is recorded, it lists `resource-unrecorded`. Both show the current SHA-256. If the file is missing, is not a regular file (a directory, for example), or cannot be read, it lists `resource-missing`. No datetimes and no git are used, so clones and CI give the same result
- Write the record as 64 lowercase hex digits. Uppercase is also read, and the comparison ignores case. Record the value that `stale` shows. For text files it may differ from the value of `sha256sum` or PowerShell `Get-FileHash`
- For text files, CRLF line endings are computed as LF. A file is text if its first 8000 bytes contain no NUL. Files that git treats as text with `core.autocrlf` are normally text under this rule too. The value stays the same even if `core.autocrlf` changes the line endings. So it may differ from a value computed with `sha256sum` and similar tools. Record the value that `stale` shows
- After reviewing the document against the file, record the shown value in `resource_sha256` or `sha256`. Also update `generated` if you changed the content, or `verified` if you did not. `review: true` in the MCP `propose_update` also drafts this record
- **Write a local file as a path relative to the document, starting with `./` or `../`.** An absolute URI starting with `file:///` also works (`file://host/...` with a host name is not supported). `\` is read as `/`. Files outside the bundle can also be pointed to
- Any other value is not treated as a file. This includes values starting with `/`, values like `pm/schedule.mpp`, URLs, resource names (`projects/...`, `/subscriptions/...`) and descriptive text. OKF `resource` and `sources` may hold such values
- When `review: true` or `resources: true` in `propose_update` records a SHA-256, the `sources` part is rewritten. Comments in that part are not kept
- Paths are taken as written. URL encoding such as `%20` is not decoded (except in `file:///` URIs)
- A `resource` that points to the document itself is excluded. Each record would change the document
- If an MCP draft update would make the frontmatter unreadable as YAML (for example, a column-0 comment in the middle of the `sources` list), no draft is made and an error is returned. Fix the document by hand
- The result may be wrong in these cases
  - `text` in `.gitattributes` forces line-ending conversion on a file that contains NUL
  - The document points to itself through a symbolic link or a name with different case (not detected as itself)
  - The same file is pointed to several times with conflicting records (compared with the first record)
  - The record is not a string (`stale` shows "not recorded", and `validate` warns with `invalid-sha256`)
- If the same file is pointed to several times, it is treated as one
- Documents with `status: deprecated` are not checked
- `impact` and `progress` do not look at files. When the proxy document is updated, the change propagates downstream through the dependencies
- In JSON, the reason is one of `{ "kind": "resource-changed", "resource": "<written value>", "recorded": "<record>", "current": "<current value>" }`, `resource-unrecorded` without `recorded`, or `resource-missing` with only `resource`
- Files are compared even for documents whose last update is unknown. "Update date unknown, not compared with dependencies" lists the documents that could not be compared with their targets

## Health check (`adaptrace health [bundle]`)

Shows suggestions for tidying the dependencies ([ADR-033](../../.adaptrace/decisions/adr-033-health.md)). None of them is an error. People decide whether to tidy. Nothing is written. The exit code is 0.

| Code | Content |
| --- | --- |
| `deprecated-target` | A document without `status: deprecated` points with a key to a `deprecated` document. `supersedes` and `changes` are excluded |
| `redundant-dependency` | A `depends_on`, `derived_from` or `satisfies` dependency A→C is also reached through two or more dependencies of the same key |
| `orphan` | A document that is not `deprecated` and has no dependency with any other non-`deprecated` document |

- `deprecated-target` shows the key and the document that points. Among the documents that replaced the `deprecated` document with `supersedes`, those that are not `deprecated` are shown in `replacedBy`. If a replacing document is also `deprecated`, the documents that replaced it are followed in turn. If the pointing document is itself a replacing document, it is not included in `replacedBy`, and the suggestion is to remove the dependency. Other replacing documents, if any, are also shown
- `changes` is a record of what a change request was about, so it is not checked
- `redundant-dependency` shows the shortest path to the same document in `via`
  - The path follows only the same key as the direct dependency. Paths with different keys do not count. For example, a task that points to a requirement with `satisfies` and also `depends_on` a decision derived from that requirement is not redundant
  - Every document on the path must be non-`deprecated`. Otherwise, removing the direct dependency would leave only a dependency through a deprecated document
  - It is not shown when the dependent or the target is in a cycle of the same key. `validate` reports cycles. Outside cycles, removing all the shown dependencies does not change which documents are reached
  - It is also shown when the same document is written twice or more under the same key. The line is that of the second or later entry. `via` is empty
  - You may keep the dependency to make the direct relation explicit
- For `orphan`, body links (references) do not count as dependencies. Dependencies with `deprecated` documents do not count either. However, these documents are not `orphan`
  - A document that replaced a `deprecated` document with `supersedes`, and a change request that points with `changes`
  - A stakeholder document pointed to by `owner` or `requested_by` of a non-`deprecated` document. As in `meeting`, it is pointed to by a path starting with `/`, or by a name that matches the display name of exactly one document
- Deadlocks and cycles are reported by `validate`. `health` does not report them
- `--format` is `text` (default) or `json`. `json` is an array of `code`, `file`, `line` (the line of the key; absent for `orphan`) and `message`. `deprecated-target` and `redundant-dependency` add `kind` and `to`. `deprecated-target` adds `replacedBy`. `redundant-dependency` adds `via` (an array of `from`, `to`, `kind`)

## Conversion with Backlog.md (`adaptrace sync [bundle]`)

Converts both ways between `type: Task` documents and Backlog.md tasks (`backlog/tasks/` and `backlog/completed/`) ([ADR-011](../../.adaptrace/decisions/adr-011-backlog-sync.md)).

- By default it only shows the plan. It writes only with `--write`
- The Backlog.md directory is given with `--backlog` (default `backlog`). It reads `statuses`, `default_status` and `task_prefix` from `config.yml`
- `--direction import|export` limits it to one direction. Changes on the excluded side are shown as "pending" and not written. `--resolve` also does not write to the excluded side

### Field mapping

| Adaptrace | Backlog.md | Notes |
| --- | --- | --- |
| `title` | `title` | |
| `state` | `status` | Matched by lowercasing and turning spaces and the like into `_`, as in `In Progress` ⇔ `in_progress`. A `state` not in Backlog.md `statuses` is not exported and is reported. Without `state`, `default_status` |
| `tags` | `labels` | |
| `depends_on` entries that point to a task with a Backlog.md counterpart | `dependencies` | Other `depends_on` entries (to requirements or decisions) stay on the Adaptrace side only |
| Body | Body | As is |
| `backlog.id` | `id` | Pairing |
| `backlog.fields` | All other keys (`assignee`, `priority`, `milestone`, `created_date`, and so on) | Round-tripped as is |
| `backlog.sync` | | Hash of the shared content at the last sync |
| `backlog.unmapped_dependencies` | `dependencies` entries with no matching Adaptrace document | |

- Imported tasks are created at `tasks/<id>.md` (for example, `tasks/back-7.md`). `generated` is set to `adaptrace/<version>` and the sync datetime
- A new exported task gets a Backlog.md ID (`task_prefix` and the next number) and is created at `backlog/tasks/<id> - <title>.md`
- `updated_date` is written only on the Backlog.md side and is not part of the compared content
- In Backlog.md files, strings that look like dates, numbers or booleans (`'2026-10-29T00:00:00Z'`, for example) are quoted. This keeps the Backlog.md YAML parser from reading them as dates
- A new ID does not collide with the IDs of tasks in `drafts/` and `archive/`
- A Backlog.md `id` may contain only letters, digits, `.`, `_` and `-`, because it becomes a file name. A file with any other `id` is reported as a read error. If `task_prefix` does not meet the same condition, no new task is exported

### Detecting changes

The current content on each side (the fields in the table above) is hashed and compared with `backlog.sync`.

| Adaptrace | Backlog.md | Result |
| --- | --- | --- |
| Unchanged | Unchanged | In sync |
| Changed | Unchanged | Export to Backlog.md |
| Unchanged | Changed | Import to Adaptrace |
| Changed | Changed | Conflict. Reported without overwriting. Resolve to one side with `--resolve adaptrace` or `--resolve backlog` |

If both sides have the same content and only `backlog.sync` is missing, only the record is written.
If the task of a `backlog.id` is not in Backlog.md, it is reported. It is neither recreated nor deleted.
If two or more Tasks have the same `backlog.id`, none of them is synced and it is reported. This tends to happen when a document is copied.

The exit code is 1 if there is a conflict, a missing task, an unmapped `state`, a duplicate `backlog.id`, or an unreadable Backlog.md file. If there is only pending, it is 0.

## Kanban board (`adaptrace board [bundle]`)

Arranges `type: Task` documents in columns by `state`. `--format` is `text` (default), `markdown` or `json`.

- The column order is as follows. If a Backlog.md `config.yml` exists, it is the order of `statuses`. Otherwise it is `to_do`, `in_progress`, `done`, other `state` values (by name), then no `state`
- A Task that waits with `depends_on` for an unfinished Task, or is blocked by an unfinished Task with `blocks`, is shown as "waiting for". "Finished" is the last value of `statuses` (`done` if there is none)
- Tasks with `status: deprecated` are not shown. They are treated as cancelled Tasks and are not something to wait for. A Task that depends on a cancelled Task is not shown as waiting. A dependency (`depends_on` and so on) from a non-deprecated document to a cancelled Task is reported by `health` as `deprecated-target`. A `blocks` written in the cancelled Task itself is reported by no command
- With `--format markdown`, paths are shown as code (`` `tasks/a.md` ``). Links relative to the bundle break when pasted into an Issue or similar. With `--link-base <URL>`, the display name becomes a link to `<URL>` joined with the path (for example, `--link-base https://github.com/<owner>/<repo>/blob/main/.adaptrace/`)

## Impact judgment (`adaptrace assess <document>`)

For each direct dependent (`depends_on`, `derived_from`, `satisfies`) of the changed document, shows the material for judging whether a review is needed. If an LLM is available, it also gives a judgment and a draft update ([ADR-013](../../.adaptrace/decisions/adr-013-llm-assess.md)). It does not write files.

- The targets of this command are the direct dependents that `impact` marks `needs review`. With `--all`, unmarked ones are included too
- Indirect dependents are not covered. Update the direct dependents first, then run `assess` on those documents
- For each dependent, it shows the diff of the target. It compares the target at the git commit that last changed the dependent with the target in the current working tree. If the dependent has no commit, or the target does not exist in that commit, the previous version is "unknown"

### Judgment by an LLM

The LLM judges only when a command is given with `--llm <command>` or the environment variable `ADAPTRACE_LLM`.

- The command runs in a shell. The prompt is passed on standard input, and one JSON object is read from standard output. Text and code fences around it are skipped
- Any command that reads a prompt from standard input and writes the answer to standard output works, such as `claude -p`, `ollama run <model>` or `llm`
- The command is taken only from arguments or environment variables. It is not read from bundle or repository settings
- It is called once per dependent. Up to `--jobs <n>` (default 4) calls run at once. `--jobs 1` runs them one at a time. A call is stopped after `--timeout <seconds>` (default 300). Stopping Adaptrace with Ctrl-C also stops running commands
- If the target has not changed since the previous version, the LLM is not called and the verdict is `none`

Answer format:

```json
{ "verdict": "none" | "minor" | "major", "reason": "reason", "body": "new body" | null }
```

| `verdict` | Meaning | Draft update |
| --- | --- | --- |
| `none` | Correct as is | A draft that adds `verified` (a review record). `generated` is not changed |
| `minor` | Fixes to wording or details | If `body` is given, a draft that replaces the body and updates `generated` |
| `major` | The content no longer holds | Same as above |

Draft updates have the same form as the MCP proposal tools (full text, diff, added and removed issues).
`generated.by` (`verified.by` for `none`) is `--by` (default `adaptrace/<version>`), and `at` is the current datetime.
The diff can be applied with `patch -p1 -d <bundle>`.

Dependents with an unreadable answer, a failed command or a timeout are shown as errors. In that case the exit code is 1. Otherwise it is 0. `--format json` is supported.

## Creating a bundle (`adaptrace init [bundle]`)

Creates a new bundle ([ADR-014](../../.adaptrace/decisions/adr-014-init.md)). The default location is `.adaptrace`.

- It creates these files
  - The root `index.md` (`okf_version: "0.2"` and a table of contents for each directory)
  - `log.md` (a heading with today's date)
  - `index.md` in each of the `requirements`, `decisions`, `tasks`, `risks` and `meetings` directories
- Existing files are not overwritten and are shown as `exists`. Only missing files are created, so it is safe to run any number of times
- `--title` sets the title of `index.md`. The default is the name of the current directory
- The date is today in the time zone of the environment

## Extracting from minutes (`adaptrace extract <minutes>`)

Turns decisions, assigned work, requirements and risks from minutes into drafts of new documents ([ADR-015](../../.adaptrace/decisions/adr-015-extract.md)).

- The LLM command is given with `--llm` or `ADAPTRACE_LLM`, as in `assess`. Without it, it is a usage error (exit code 2)
- The LLM receives the full minutes and the list of documents in the bundle (path, type, title, `state`). Instead of creating a duplicate of an existing document, it links to it
- The draft types are `Requirement`, `Acceptance`, `Decision`, `Task`, `Risk` and `Milestone`. Other types are shown as "Skipped"
- Every draft has `status: draft` and `derived_from: /<minutes>`, and `generated` is `{ by: value of --by, at: now }`. `state`, `owner`, `due`, `tags`, `depends_on`, `satisfies` and `blocks` are taken from the LLM's answer
- The path is `<type directory>/<id>.md` (`requirements`, `acceptance`, `decisions`, `tasks`, `risks`, `milestones`). `id` is the lowercase alphanumerics and hyphens returned by the LLM. If it is not usable, `<minutes file name>-<number>` is used. If the same path exists, `-2`, `-3` and so on are appended
- If `id` is `index` or `log` (the names of OKF reserved files), another name is used too. Whether the same path exists is checked without regard to case
- Links between drafts are written as `#<id>` in the LLM's answer, and Adaptrace converts them to paths. If no draft has that `id`, the link is removed and shown in "Links removed from drafts". The same happens if that draft was Skipped. If several drafts have the same `id`, the first one is used
- An item that does not fit the answer format is Skipped on its own
- The drafts are validated together, and problems such as missing targets are shown. Problems that appear in existing documents (cycles, for example) are shown in "New issues in existing documents"
- By default it only displays. With `--write`, it creates the draft files. Existing files are not changed. If any draft file has appeared just before writing, no draft is created and they are shown in "Not written". This keeps links between drafts from pointing to someone else's files. `--format json` is supported

LLM answer format:

```json
{ "documents": [ { "type": "Task", "id": "build-login", "title": "…", "body": "…", "state": "to_do", "owner": "tanaka", "due": "2026-12-15", "depends_on": ["/decisions/auth.md", "#auth-provider"] } ] }
```

The exit code is 1 in any of these cases: the LLM failed or its answer could not be read, the drafts add `validate` errors, links between drafts were removed, or a file could not be written.

## Estimating a change (`adaptrace estimate <document>...`)

Given the starting documents of a change (the requirements to change, for example), it summarizes the documents the change reaches and clues for the work ([ADR-016](../../.adaptrace/decisions/adr-016-estimate.md)). Nothing is written.

- Reached documents are followed in the same direction as `impact` (`depends_on`, `derived_from`, `satisfies` in reverse). Starting documents are at depth 0. A document reached from several starting documents gets the nearer depth. Documents with `status: deprecated` are not included, even if passed as starting documents. They are shown in "Left out as deprecated" (`ignored` in JSON)
- `--request <change request>` attaches a change request document. It is used as material for the LLM and in the output heading
- If only `--request` is given with no starting documents, the change request's `changes` are the starting documents. `deprecated` documents are shown in "Left out as deprecated", as with other starting documents
- What it shows
  - Per document: type, `state`, `owner`, `due`, and where it is reached from
  - Counts per type, and counts of Tasks per `state`
  - Tasks to redo: those whose `state` is a "finished" value (the last of Backlog.md `statuses`, or `done` if there is none)
  - People involved: the list of `owner` values (`owner` may be a list)
  - Milestones whose due date is affected: Milestones that a reached Task `blocks`, or that `depends_on` a reached Task, with their `due`. Milestones whose `state` is a "finished" value are excluded
- The "finished" value comes from the Backlog.md `config.yml` in `--backlog` (default `backlog`)
- `--format` is `text` (default), `markdown` or `json`. In `markdown`, documents are shown as in `board`, and `--link-base` makes them links
- `--order review` orders them for update and review. The idea is the same as in `impact`. Starting documents are included in the steps. A starting document reached from another starting document comes after it. `text` and `markdown` show the steps

### Estimates by an LLM

With `--llm <command>` or `ADAPTRACE_LLM`, the LLM estimates each reached document (including the starting documents).

```json
{ "size": "none" | "small" | "medium" | "large", "hours": 6 | null, "work": "work to do", "reason": "reason" }
```

- The LLM receives the change request, the full text of the starting documents, the full text of the document, and the path from the starting documents. The path includes whether a Task must be redone
- `hours` is the person-hours for the work on that document alone. For a Task, it is the implementation work. The prompt tells the LLM not to double-count the work of targets
- The LLM is called in parallel up to `--jobs` (default 4)
- It shows counts per size and the total effort (to two decimal places). Documents without `hours` (except `none`) and documents with no answer are counted as "no estimate"
- These are LLM rough figures, not a quotation. The output says so too

The exit code is 1 if any document got no answer.

## Review progress (`adaptrace progress <change request>`)

For one change request, shows how far the documents it reaches have been reviewed ([ADR-018](../../.adaptrace/decisions/adr-018-progress.md)). Nothing is written.

- The documents reached are the same as `impact <change request>`. It follows `depends_on`, `derived_from` and `satisfies` in reverse from the change request
- Documents that point directly to the change request are the "starting documents". A starting document counts as updated if it is not older than the datetime the change request was received (the baseline datetime)
- The baseline datetime is the change request's `received_at`. Write it when you create the change request. Without `received_at`, the change request's last update is used. In that case, updating the change request's `state` and changing `generated.at` puts the starting documents back to `to review`
- If `received_at` has a wrong format, `validate` warns. `progress` prints a warning and uses the change request's last update as the baseline datetime. If the baseline datetime is unknown, it says so and does not compare the starting documents with it
- The baseline datetime is shown at the top of the output. In JSON it is `baseline`, and `source` is one of `received_at`, `generated.at`, `timestamp` or `verified.at`
- Every document is compared with its direct targets within the reached documents. Starting documents are also compared with the baseline datetime. Staleness caused by targets outside the reached documents is checked with `stale`
- Documents with `status: deprecated` are not listed. A dependency through a `deprecated` document is compared with the targets beyond it. If all reached documents are `deprecated`, it says so
- If there is a cycle, the cycle is judged as one unit. Documents in the cycle share a step and are not compared with each other. Each is compared with the targets outside the cycle that all members of the cycle have. If a starting document is in the cycle, all members are also compared with the baseline datetime. While any document in the cycle is not `reviewed`, the others are `waiting`. A cycle is a `validate` error
- A document that needed no change after review becomes `reviewed` when `verified` is updated. `generated` is not changed, so downstream documents do not become old ([ADR-020](../../.adaptrace/decisions/adr-020-verified-review.md))
- The exit code is 0 if all are `reviewed`, and 1 otherwise. It is also 0 when no documents are reached
- The type of the change request is not checked. Any document can be given
- `--format` is `text` (default), `markdown` or `json`. In `markdown`, documents are shown as in `board`, and `--link-base` makes them links

## List (`adaptrace list [bundle]`)

Makes a table of documents, one per row ([ADR-019](../../.adaptrace/decisions/adr-019-list.md)). It is for pasting a change log or a risk register into regular meeting materials. Nothing is written.

- Filters are `--type`, `--state` and `--status`. Each is an exact match with the written value. This is the same as the MCP `list_documents`. Only string values match. A value written as a number, such as `state: 2`, does not match `--state 2`. Quote it as `state: "2"`. `--status` is one of `draft`, `stable` or `deprecated`
- The list options (`--type`, `--state`, `--status`, `--columns`, `--sort`) cannot be used with other commands
- Documents with `status: deprecated` are excluded by default. With `--status`, only documents with that value are shown
- The first column is the document (path and display name)
- The default columns are `type`, `state`, `owner`, `due` and `updated`. When filtering with `--type` without `--columns`, the `type` column is omitted
- `--columns` takes a comma-separated list of keys to show as columns. Example: `--columns state,probability,impact,owner`
  - Separating with `.`, as in `generated.by`, reads a nested key. Only keys written in the document are read
  - `updated` is not a frontmatter key. It is the last update ([Last update](#last-update))
  - List values are joined with ", ". Other objects are shown as JSON. A missing value is empty
  - Values are shown as read from YAML. Numbers are normalized (`1.10` becomes `1.1`, `007` becomes `7`). Quote a value to show it as written
  - Giving the same column twice, or giving `path` or `title`, is an error
- The default order is by path. `--sort <column>` orders by that column's values. Values are grouped as numbers, datetimes, other strings, then empty values, and compared within each group. Datetimes are datetimes with a UTC offset and date-only values (`2026-12-15`). They are compared by instant regardless of offset, and a date-only value is compared as 00:00 UTC on that day. A date that does not exist, such as `2026-02-30`, is treated as a string. Strings and paths are compared by code point, regardless of the locale of the environment. Equal values are ordered by path. `--sort path` and `--sort title` order by the displayed path and display name. Sorting by a key that no document has prints a warning to standard error
- `--format` is `text` (default), `markdown`, `csv` or `json`
  - `text` is a table with aligned columns. Full-width characters and characters shown as emoji count as two columns wide. Newlines, tabs and control characters become spaces. When no document matches, it shows `No documents.` (the same for `markdown`)
  - In `markdown`, documents are shown as in `board`, and `--link-base` makes them links
  - `csv` follows RFC 4180. The first row is `path,title,` followed by the column names. Rows end with CRLF. A BOM is added at the start so that the Japanese edition of Excel does not garble the text. A value starting with `=`, `+`, `-` or `@` gets a leading `'`, so that spreadsheet software does not run it as a formula. Values readable as numbers (`-3`, for example) do not get it
  - `json` is `{ "columns": [...], "documents": [{ "path", "title", "values": { column: value } }] }`

## Overlapping change requests (`adaptrace conflicts [bundle]`)

Shows pairs of open change requests whose reached documents overlap ([ADR-023](../../.adaptrace/decisions/adr-023-changes-key.md)). Overlapping change requests may contradict each other. Discuss them together before deciding either one. Nothing is written. The exit code is 0.

- The documents a change request changes (the starting documents) are pointed to with `changes`. On approval, add the change request to the starting documents' `derived_from`, as before
- An open change request is a document that has `changes`, is not `status: deprecated`, and whose `state` is not a settled value. The type is not checked
- The settled values by default are `approved`, `accepted`, `rejected`, `deferred`, `implemented`, `closed` and `done`. Case is ignored. `--settled <value,...>` changes them
- The reached documents are the starting documents plus the documents reached from them in the same direction as `impact`. Documents with `status: deprecated` are not included
- For each pair, it shows the documents both change (`sharedTargets`), the documents both reach (`overlap`), and their counts per type (`byType`). Pairs with shared starting documents come first, and within them, pairs with larger overlap come first
- Open change requests with no `changes`, or whose `changes` documents are all `deprecated`, are shown as change requests that could not be compared (`unlinked` in JSON)
- `--format` is `text` (default), `markdown` or `json`. In `markdown`, documents are shown as in `board`, and `--link-base` makes them links

### Judgment by an LLM

With `--llm <command>` or `ADAPTRACE_LLM`, the LLM judges for each overlapping pair whether the two change requests are compatible ([ADR-024](../../.adaptrace/decisions/adr-024-conflicts-llm.md)).

```json
{ "verdict": "conflict" | "duplicate" | "compatible" | "unclear", "reason": "reason", "decide": ["points to decide in the discussion"] }
```

- `conflict` means they cannot both hold, `duplicate` means they ask for the same thing, `compatible` means they can both hold, and `unclear` means the documents alone are not enough to judge
- The LLM receives the full text of both change requests and the full text of the documents both change. For a pair with no document that both change, it receives the full text of the documents each one changes. Other documents each one changes, and other documents both reach, are given by path and display name only
- For each pair, it shows the verdict, the reason and the points to decide, and at the end the counts per verdict. In `markdown`, the LLM's answer is escaped and URLs are shown as code. In JSON, each pair has `judgment` (`null` and `error` on failure)
- The exit code is 1 if the LLM failed or its answer could not be read for any pair
- `--jobs` and `--timeout` are the same as in `assess`
- The LLM's judgment is material for discussion. It is not a decision. Nothing is written

## Preparing a discussion meeting (`adaptrace meeting <change request>...`)

For change requests to discuss together, shows material for preparing the meeting ([ADR-025](../../.adaptrace/decisions/adr-025-meeting.md)). It does not schedule or send invitations. It does not handle contact details. It shows only names and roles.

- `--audience internal` (default) is an internal meeting, and `--audience customer` is a meeting with the customer. The intended flow has two stages: first decide the direction internally, then consult the customer
- Internal or customer is decided only by the stakeholder document's `side` (`internal` or `customer`). Write the path of that document, starting with `/`, in `owner` and `requested_by` (`/stakeholders/a-corp.md`, for example)
  - A name-only value is treated as a stakeholder document if exactly one stakeholder document without `status: deprecated` has the same display name. Stakeholder documents without `side` are counted too
  - If a stakeholder document pointed to by path has `status: deprecated`, its `side` is not used. If the document pointed to by path is not a stakeholder document (its type is not `Stakeholder` and it has no `side`), it is treated like a path that was not found
  - Everything else is `unknown`. This covers name-only values, paths whose document is not found, paths not starting with `/`, documents without `side`, and documents whose `side` is neither `internal` nor `customer`. `side` is case-insensitive
  - The rules are strict so that a typo or a different person with the same name does not bring a customer into an internal meeting
- Candidate participants are the `owner` of the documents the change requests reach and the `requested_by` of the change requests. Each person's role is shown (which documents they own, which request they made, and the `role` in the stakeholder document). In an internal meeting, only `internal` people are candidates, and `unknown` people are shown separately as "needs checking before inviting". Values that look like paths but whose document is not found are also shown. Values starting with `/`, `./` or `../`, and values ending in `.md`, are treated as paths. The `Meeting` draft also lists the people who need checking
- Other change requests (documents with `changes`, and documents of type `Change Request`) are not counted as reached documents. Their `owner` is not a candidate participant
- In an internal meeting, the agenda is the overlap of each pair of change requests and the baselines reached (documents whose type name contains `Baseline`). In a meeting with the customer, details of the internal discussion are not shown. What is not shown: reached documents, overlaps, baselines, documents the change requests change, names of documents that owners own, the reasons of the LLM's judgments, and paths of documents not found. The same applies to the JSON output, the `Meeting` draft, and the material passed to the LLM for the invitation text. For the customer invitation text, the LLM receives only the display names of the change requests. Bodies and paths are not passed. Bodies can refer to internal documents in many ways, and not all of them can be removed mechanically. The MCP `meeting_context` also tells the agent, for the customer, to write the text using only the returned material
- With `--llm`, the LLM writes the invitation text (subject and body). The text is in the same language as the documents, and the date, time and place are left blank
  - In an internal meeting, the verdict for each pair (the same as `conflicts --llm`) and the points to decide in the discussion are added to the agenda
  - In a meeting with the customer, pairs are not judged, because the judgment material includes internal discussion. The LLM lists the points for the customer to decide in the text, based only on the bodies of the change requests
- Change requests with a settled `state` or with `status: deprecated` can also be given. In that case, this is noted
- It shows a `Meeting` draft. It points to the change requests with `depends_on` and has `status: draft`. The path is `meetings/<date>-<first change request>-<audience>.md`. If the same path exists, `-2`, `-3` and so on are appended. It is created as a new file only with `--write`
- The exit code is 1 when the LLM failed or the draft could not be written. Otherwise it is 0
- The same change request given in different forms is treated as one. Draft path collisions are checked without regard to case
- `--format` is `text` (default), `markdown` or `json`. In `markdown`, document and LLM text is escaped, and the invitation text is shown in a code block
- After the meeting, pass the minutes to `extract` to draft a `Decision` for the direction, and update each change request's `state`

## MCP server (`adaptrace mcp [bundle]`)

Starts as a stdio MCP server ([ADR-012](../../.adaptrace/decisions/adr-012-mcp-server.md)).
No tool writes to files. Each call reads the bundle from disk again.

| Tool | Content |
| --- | --- |
| `validate` | The same list of problems as `adaptrace validate` |
| `list_documents` | List of documents (path, type, display name, `status`, `state`, last update, reviewed datetime (`reviewed`)). Can be filtered by `type`, `state` and `status` |
| `read_document` | The full text of one document, its frontmatter, outgoing dependencies (`outgoing`) and incoming dependencies (`incoming`) |
| `graph` | Same as `adaptrace graph --format json` |
| `impact` | Same as `adaptrace impact --format json` |
| `stale` | Same as `adaptrace stale --format json` |
| `health` | Same as `adaptrace health --format json` |
| `progress` | Same as `adaptrace progress --format json`. Takes `request` (the change request) |
| `conflicts` | Same as `adaptrace conflicts --format json`. Takes `settled` (the settled `state` values) |
| `meeting_context` | The `meeting` material (participants, change requests, overlaps, baselines), and the steps (`instructions`) for writing the agenda, the invitation text and the `Meeting` draft. Takes `requests` and `audience`. For the customer, details of the internal discussion are not returned |
| `conflicts_context` | The content of `conflicts`, plus the paths of the documents to read for each pair (`materials`), the full text per path (`texts`, once each) and the judgment steps (`instructions`). The agent makes the judgment |
| `estimate_context` | The content of `estimate --format json`, plus the full text of the change request (`requestContent`), the full text of the reached documents (`contents`) and the estimating steps. Takes `documents` (the starting documents) and `request` |
| `extract_context` | The full minutes, the list of existing documents and the drafting steps (`instructions`). The agent creates the drafts with `propose_document` |
| `assess_context` | The material of `adaptrace assess --format json`, plus the full text of the targets and dependents and the judgment steps (`instructions`). The agent makes the judgment and creates draft updates with `propose_update` |
| `board` | Same as `adaptrace board --format json` |
| `sync_plan` | The plan of `adaptrace sync --format json`. Does not write |
| `propose_document` | A draft of a new document. Takes `path`, `type`, `title`, other keys (`frontmatter`), the body, and `by` (the actor for `generated.by`) |
| `propose_update` | A draft change to an existing document. Takes `set` (set keys), `unset` (delete keys), `body` (replace the body) and `by`. Rewrites only the lines of the given keys. With only `review: true`, it drafts a record of a review that needed no change, setting `verified` to the current datetime. It also sets the SHA-256 of the `resource` and `sources` files to their current values. For a draft that changes content, `resources: true` does the same |

The proposal tools return the following.

- `content`: the full text after the change
- `diff`: a unified diff (can be applied as is with `patch`)
- `issues`: problems found in the changed document
- `newIssues` / `resolvedIssues`: problems that the change adds to or removes from the whole bundle. This includes cycles reported on other documents
- `written: false`

A proposal sets `generated` to `{ by, at: now }` and deletes the old `timestamp`. With `review: true`, it leaves `generated` as it is and sets `verified` to `{ by, at: now }`.
`type` cannot be deleted, and only a non-empty string is accepted.
In `propose_document`, `frontmatter` cannot override `type` or `title`.
Reserved files (`index.md`, `log.md`) and paths outside the bundle are not accepted.
Paths are used as is. `#` and `%` are treated as characters.

`propose_update` rewrites only the lines of the given keys. Indented lines and list lines under a key are also part of the rewrite.
A one-line mapping (`generated: { by, at }`) is rewritten as one line.
Comments, blank lines, line endings (CRLF) and the BOM are kept as they are.
The diff also shows whether there is a trailing newline (`\ No newline at end of file`).
