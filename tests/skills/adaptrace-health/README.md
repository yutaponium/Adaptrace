# `adaptrace-health` の試験

Claude Codeのskill `adaptrace-health`（`skills/adaptrace-health/`）を、模擬のリポジトリで実行して確認する手順。
skillを修正したら、この試験を実行する。試験の考え方と共通の仕組みは、[`adaptrace-adopt` の試験](../adaptrace-adopt/README.md) と同じ。

## ファイル

| ファイル | 内容 |
|---|---|
| `repo/` | 模擬のリポジトリ。`validate` の警告が1件、`health` の項目が7件ある |
| `setup.sh` | `repo/` から試験用のgitリポジトリを作り、skillをコピーする |
| `prompts/runner.md` | 実行役への依頼 |
| `check.ts` | skillを実行した後のリポジトリと、対話の記録を確認する。`must` が1つでも失敗すると、終了コード1 |
| `expected/`、`expected.dialog.md` | 期待する結果と、期待する報告の抜粋 |
| `failing/`、`failing.dialog.md` | 失敗する例。残すと決めた依存を外し、文書の本文を書き換えている |

## 項目と、期待する扱い

| 文書 | 項目 | 期待する扱い |
|---|---|---|
| `tasks/data-migration.md` | `dependency-deadlock` | `blocks` を外す |
| `tasks/login-form.md` | `deprecated-target`（ADR-0001） | ADR-0002に付け替える |
| `tasks/session-api.md` | `redundant-dependency`（ADR-0002） | 外す |
| `tasks/login-ui.md` | `redundant-dependency`（2回書いた依存） | 重複した記述を外す |
| `tasks/audit-report.md` | `redundant-dependency`（ADR-0002） | 残す |
| `risks/db-load.md` | `orphan` | ADR-0002への依存関係を張る |
| `decisions/adr-0003-coding.md` | `orphan` | そのままにする |
| `tasks/redis-poc.md` | `orphan` | 廃止する |

## 手順

1. skillを実行して、確認する

   ```bash
   bun tests/skills/run.ts adaptrace-health /tmp/health-test 3 --issues
   ```

2. `check.ts` の失敗と、記録のSkill issuesをもとに、skillを修正する
3. PRの本文の「レビュー」に、合格した回数と、Skill issuesへの採用・不採用を書く
4. 確認項目を変えたら、`expected/` と `failing/` も合わせて修正し、`bun test` が通ることを確認する

## 依頼

```text
Adaptraceのバンドルの依存関係を点検して、整理したいです。
```

## 利用者が知っていること

利用者役のエージェントに渡す事実。skillが何をすべきかのヒントは書かない。

- 自分はこのプロジェクトの技術リーダーの佐藤
- 見つかったものは、全部この場で片付けたい
- セッションの保存先は、ADR-0001（メモリ）からADR-0002（データベース）に変えた。ログインフォームは、ADR-0002の方式で作り直した
- セッションのAPIは、セッションのテーブルを使って作る。ADR-0002との関係は、テーブルを通じて分かれば十分
- ログイン画面の仕上げの依存先に、セッションのAPIを誤って2回書いた
- ログインの監査レポートは、ADR-0002で決めたセッションの保存期間に合わせて集計する。そのことが分かるよう、ADR-0002への依存は残したい
- データベースの負荷のリスクは、セッションをデータベースに保存すると決めた（ADR-0002）ことから出てきた
- コーディング規約（ADR-0003）は、すべてに共通する方針で、特定の文書には関係しない。今のままでよい
- RedisのPoCは、セッションをデータベースに保存すると決めたので、もう要らない。中止をどう記録するかの決まりはない
- 既存のセッションの移行は、セッションのテーブルができてから行う。移行のタスクがテーブルの作成を止めることはない。`blocks` は誤りだった
- 差分は、内容が上の事実と合っていれば承認する
- `log.md` には、整理したことを記録してよい
- コミットは、自分で確認してから行うので、しないでほしい

## 確認項目（`check.ts`）

- `must`
  - `validate` のエラーとデッドロックの警告が0件
  - `tasks/login-form.md` が、ADR-0001ではなくADR-0002に依存している
  - `tasks/session-api.md` が、ADR-0002に直接依存せず、セッションのテーブルに依存している
  - `tasks/login-ui.md` が、セッションのAPIを1回だけ指している
  - `tasks/audit-report.md` が、ADR-0002に直接依存したままである
  - `risks/db-load.md` が、見直しの連鎖のキーでADR-0002を指している
  - `tasks/redis-poc.md` が中止されている。`status: deprecated` か、中止を表す `state`（`cancelled`、`abandoned` など）
  - 上の表で変更を期待する文書は、扱いに必要なキーだけを変えている。本文は変えていない。それ以外の文書（ADR-0003を含む）は変更していない。`index.md` と `log.md` は追加だけ
- `should`
  - 変更した文書の `generated.at` が変わっていない
  - 報告で、そのままにした項目（ADR-0003、監査レポート）に触れている
