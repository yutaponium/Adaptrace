# `adaptrace-sync` の試験

Claude Codeのskill `adaptrace-sync`（`skills/adaptrace-sync/`）を、模擬のリポジトリで実行して確認する手順。
skillを修正したら、試験の必要度を判断する（ADR-042）。試験の考え方と共通の仕組みは、[`adaptrace-adopt` の試験](../adaptrace-adopt/README.md) と同じ。

## ファイル

| ファイル | 内容 |
|---|---|
| `repo/` | 模擬のリポジトリ。バンドル（`.adaptrace/`）とBacklog.md（`backlog/`）を一度同期した後に、両側でタスクを変えてある |
| `setup.sh` | `repo/` から試験用のgitリポジトリを作り、skillをコピーする。`sync` の結果は今日の日付によらないので、日付は変えない |
| `prompts/runner.md` | 実行役への依頼 |
| `check.ts` | skillを実行した後のリポジトリと、対話の記録を確認する。実行する前の状態として、`repo/` と比べる。`must` が1つでも失敗すると、終了コード1 |
| `expected/`、`expected.dialog.md` | 期待する結果と、期待する報告の抜粋 |
| `failing/`、`failing.dialog.md` | 失敗する例。衝突をすべてAdaptraceの側にそろえ、対応しない `state` を残し、アーカイブされたタスクの文書を削除している |

`repo/` を作り直すときは、`src/backlog.ts` の `planSync` に過去の日時（`now`）を渡して同期してから、両側を変える。`created_date` が、作り直した日時にならないようにするため。

## 同期の前の状態と、期待する扱い

| タスク | `sync` の計画 | 期待する扱い |
|---|---|---|
| `tasks/login-mfa.md`（BACK-3） | 取り込む。開発者が `Done` にした | そのまま取り込む |
| `tasks/sms-send.md`（BACK-5） | 書き出す。PMが題を変えた | そのまま書き出す |
| `tasks/manual.md`（BACK-4） | 衝突。PMが題を変え、開発者が `In Progress` にして担当を付けた | Backlog.mdの側にそろえる（`--resolve tasks/manual.md=backlog` か `back-4=backlog`）。PMの題の変更は失われる |
| `tasks/audit-log.md`（BACK-1） | 衝突。PMが本文に保存期間を書き、開発者が `In Progress` にした | 両方の変更を残す。Adaptraceの `state` を `in_progress` にしてから、Adaptraceの側にそろえる |
| `tasks/session-timeout.md` | 対応しない `state`（`waiting`） | `state` を `to_do` にして、新しいタスクとして書き出す |
| `tasks/legacy-import.md`（BACK-2） | 見つからない。開発者がアーカイブした | Adaptraceの文書を残す。`sync` は次も知らせる |
| BACK-6 | 取り込む。開発者が追加した | `tasks/back-6.md` として取り込む |

## 手順

1. skillを実行して、確認する

   ```bash
   bun tests/skills/run.ts adaptrace-sync /tmp/sync-test 3 --issues
   ```

2. `check.ts` の失敗と、記録のSkill issuesをもとに、skillを修正する
3. PRの本文の「レビュー」に、合格した回数と、Skill issuesへの採用・不採用を書く
4. 確認項目を変えたら、`expected/` と `failing/` も合わせて修正し、`bun test` が通ることを確認する

## 依頼

```text
Backlog.mdと同期したいです。開発者がBacklog.mdでタスクを動かしているので、変更を取り込んで、こちらの変更も書き出してください。
```

## 利用者が知っていること

利用者役のエージェントに渡す事実。skillが何をすべきかのヒントは書かない。

- 自分はこのプロジェクトのPMの林。開発者の田中が、Backlog.mdでタスクを動かしている
- 操作マニュアルのタスクは、田中が着手した状況（`In Progress`、担当が田中）が正しい。自分が変えた題（「会員向けの操作マニュアルを書く」）は、元に戻ってよい
- 監査ログのタスクは、自分が本文に書いた保存期間を残したい。田中が `In Progress` にしたのも正しいので、両方を残したい
- セッションの有効期限のタスクは、顧客の回答を待っているので `waiting` にしていた。Backlog.mdにステータスは追加しない。`to_do` にしてよい
- 旧会員データの移行は、計画から外れたので、田中がBacklog.mdでアーカイブした。Adaptraceの文書は、経緯として残したい。`sync` が毎回知らせるのは構わない
- ほかの取り込みと書き出しは、そのままでよい
- 片方向だけにはしない
- 計画や差分は、内容が上の事実と合っていれば承認する
- `log.md` には、同期したことを記録してよい
- コミットは、自分で確認してから行うので、しないでほしい

## 確認項目（`check.ts`）

- `must`
  - `validate` のエラーが0件
  - `sync` の計画に残るのは、アーカイブされたタスク（`missing`）だけ
  - ログイン画面のタスクが `done` で取り込まれ、SMSのタスクの新しい題がBacklog.mdに書き出されている
  - 操作マニュアルのタスク：両側とも、`In Progress`、担当が田中、元の題
  - 監査ログのタスク：両側とも、`In Progress` で、本文に保存期間がある
  - セッションの有効期限のタスク：`state` が `to_do` で、BACK-2ではない新しいIDで書き出されている
  - BACK-6が、1件だけ取り込まれている
  - アーカイブされたタスクの文書が、変わらずに残っている
  - ほかのファイルは変更していない。削除したファイルがない。Backlog.mdの `config.yml` とアーカイブも変えていない。新しいファイルは、取り込んだタスクと書き出したタスクだけ。`log.md` と `tasks/index.md` は追加だけ
  - タスクのタグと依存関係が残っている。本文は、操作マニュアルと監査ログのほかは変わっていない
- `should`
  - `state` だけを変えたタスク（監査ログ、セッションの有効期限）の `generated` が変わっていない
  - `log.md` に行が追加されている
  - 対話で、操作マニュアルで失われる題の変更に触れている
  - 報告で、`sync` が次も知らせるアーカイブされたタスクに触れている
