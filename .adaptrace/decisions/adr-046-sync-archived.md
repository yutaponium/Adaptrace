---
type: Decision
title: Backlog.mdでアーカイブされたタスクは、`sync` が `archived` として知らせ、問題として扱わない
state: accepted
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-26T22:32:48+09:00 }
depends_on:
  - /decisions/adr-011-backlog-sync.md
  - /decisions/adr-045-sync-skill.md
---

# Backlog.mdでアーカイブされたタスクは、`sync` が `archived` として知らせ、問題として扱わない

## 決定

- `backlog.id` のタスクが、Backlog.mdの `archive/tasks/` か `archive/drafts/` にあるときは、`sync` は `missing` ではなく `archived` として知らせる。計画には、アーカイブされたファイルのパス（`backlogPath`）を含める
- `archived` は問題として扱わない。`archived` だけなら、終了コードは0にする
- どちらの側にも書き込まない。Adaptraceの文書の `state` や `status` も変えない
- 前回の同期の後にAdaptraceの文書が変わっていれば、`archived` に `changed: true` を付ける。その変更は書き出されないことを知らせるためである。問題としては扱わない。アーカイブの後に、PMが `state` を終わった値にするのは、ふつうの使い方だからである
- 同じIDのタスクが `drafts/` にもあれば、アーカイブの写しが残っていても `missing` にする。アーカイブされたファイルが複数あれば、ディレクトリとファイル名の順で最初のものを示す
- `--resolve` でアーカイブされたタスクを指定すると、アーカイブされていて、そろえるものがないことを示して、使い方の誤り（終了コード2）にする
- `drafts/` に戻されたタスクと、ファイルが削除されたタスクは、これまでどおり `missing` にする
- テキストの出力では、`ARCHIVED in Backlog.md` と表示し、最後の行に `N archived` を加える（1件以上のときだけ）

## 理由

- 開発者が、終わったタスクや計画から外れたタスクをBacklog.mdでアーカイブするのは、ふつうの使い方である。これまでは、Adaptraceの文書を経緯として残すと、`sync` が毎回 `missing` と知らせ、終了コードが1になった。`status: deprecated` にしても同じだった
- アーカイブされた理由（完了、中止など）は、ファイルからは分からない。Adaptraceの文書を書き換えると、推測で `state` を決めることになる（設計原則6）。どう残すかは、利用者が決める

## 検討した他の案

- Adaptraceの側でも、タスクを終わったことにする：アーカイブの理由が分からないので、`state` を推測で書くことになる
- アーカイブされたタスクの内容を、最後に一度取り込む：アーカイブの後の変更を取り込む利点が小さく、変換の対象を広げると、下書きとの扱いの違いが分かりにくくなる
