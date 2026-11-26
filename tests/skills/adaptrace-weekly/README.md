# `adaptrace-weekly` の試験

Claude Codeのskill `adaptrace-weekly`（`skills/adaptrace-weekly/`）を、模擬のリポジトリで実行して確認する手順。
skillを修正したら、この試験を実行する。試験の考え方と共通の仕組みは、[`adaptrace-adopt` の試験](../adaptrace-adopt/README.md) と同じ。

## ファイル

| ファイル | 内容 |
|---|---|
| `repo/` | 模擬のリポジトリ。日付は `{{D+4}}`（今日から4日後）、`{{T-2}}`（2日前の10時）のように書き、`setup.sh` が実行した日を基準に置き換える。期限を過ぎたか、次の定例までかは、今日によって決まるため |
| `../render-dates.ts` | 日付の置き換え。基準の日を指定できる。`adaptrace-milestone` の試験と共通。`setup.sh` は、環境変数 `ADAPTRACE_TEST_DAY`（`YYYY-MM-DD`）を基準の日として渡す |
| `setup.sh` | `repo/` から試験用のgitリポジトリを作り、日付を置き換え、skillをコピーする |
| `prompts/runner.md` | 実行役への依頼 |
| `check.ts` | skillを実行した後のリポジトリと、対話の記録を確認する。`must` が1つでも失敗すると、終了コード1 |
| `expected/`、`expected.dialog.md` | 期待する結果と、期待する報告の抜粋。日付は2026-11-26を基準に置き換えたもの |
| `failing/`、`failing.dialog.md` | 失敗する例。期限を過ぎたタスクと見直し時期を過ぎたリスクを報告していない |

## 模擬のリポジトリの状況

| 文書 | 状況 | 報告すべき区分 |
|---|---|---|
| `tasks/login-mfa.md` | 期日が3日前で、作業中 | 期限を過ぎたもの |
| `tasks/sms-send.md` | 期日が4日後で、`login-mfa` を待っている | 次の定例までに期限が来るもの、待っているタスク |
| `tasks/e2e-email.md` | 期日が10日前だが、終わっている | 報告しない |
| `tasks/manual.md` | 期日が20日後 | 報告しない |
| `decisions/adr-0001-idp.md` | 依存先の要件より古い | 見直しが必要な文書 |
| `risks/idp-lock-in.md` | `stale_after` が2日前 | 見直し時期を過ぎた文書 |
| `change-requests/cr-002-sms.md` | 承認済みで、見直しの途中 | 見直し中の変更要求 |
| `change-requests/cr-003-push.md` | 受け付けたが未決 | 未決の変更要求 |

## 手順

1. skillを実行して、確認する

   ```bash
   bun tests/skills/run.ts adaptrace-weekly /tmp/weekly-test 3 --issues
   ```

2. `check.ts` の失敗と、記録のSkill issuesをもとに、skillを修正する
3. PRの本文の「レビュー」に、合格した回数と、Skill issuesへの採用・不採用を書く
4. 確認項目を変えたら、`expected/` と `failing/` も合わせて修正し、`bun test` が通ることを確認する

## 依頼

```text
来週の定例の準備をしたいので、今の状況をまとめてください。
```

## 利用者が知っていること

利用者役のエージェントに渡す事実。skillが何をすべきかのヒントは書かない。

- 自分はこのプロジェクトのPMの佐藤
- 定例は毎週同じ曜日で、次の定例は今日から7日後
- 議事録の下書きは、`.adaptrace/` に作っておきたい
- 差分は、内容が状況と合っていれば承認する
- `log.md` には、下書きを作ったことを記録してよい
- コミットは、自分で確認してから行うので、しないでほしい

## 確認項目（`check.ts`）

- `must`
  - `validate` のエラーが0件
  - 既存の文書を変更していない。変えてよいのは、`meetings/` の下と、`index.md` と `log.md` への追加だけ
  - 報告で、`login-mfa` を期限を過ぎたものとして示し、期限が近く待っている `sms-send`、古い `adr-0001-idp`、見直し時期を過ぎた `idp-lock-in`、見直し中の `cr-002`、未決の `cr-003` に触れている
- `should`
  - 議事録の下書き（`type: Meeting`）が `meetings/` にあり、依存関係のキーを持たない
  - 終わった `e2e-email` を、期限を過ぎたものとして報告していない
