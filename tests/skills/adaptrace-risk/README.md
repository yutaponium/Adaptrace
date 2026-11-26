# `adaptrace-risk` の試験

Claude Codeのskill `adaptrace-risk`（`skills/adaptrace-risk/`）を、模擬のリポジトリで実行して確認する手順。
skillを修正したら、試験の必要度を判断する（ADR-042）。試験の考え方と共通の仕組みは、[`adaptrace-adopt` の試験](../adaptrace-adopt/README.md) と同じ。

## ファイル

| ファイル | 内容 |
|---|---|
| `repo/` | 模擬のリポジトリ。見直しが必要なリスク3件と、見直しの要らないリスク2件がある |
| `setup.sh` | `repo/` から試験用のgitリポジトリを作り、skillをコピーする。日付は、今日からの相対の日付にする（`../render-dates.ts`）。環境変数 `ADAPTRACE_TEST_DAY`（`YYYY-MM-DD`）で、基準の日を指定できる。これは `bun test` で `expected/` と比べるためのもので、`run.ts` で試験するときは指定しない。実行役は、実際の今日の日付で動くため |
| `prompts/runner.md` | 実行役への依頼 |
| `check.ts` | skillを実行した後のリポジトリと、対話の記録を確認する。`must` が1つでも失敗すると、終了コード1 |
| `expected/`、`expected.dialog.md` | 期待する結果と、期待する報告の抜粋。日付は、2026-11-26を基準の日にした値 |
| `failing/`、`failing.dialog.md` | 失敗する例。見直したリスクの `generated` だけを今の日時にし、`stale_after` を進めず、閉じたリスクに `stale_after` を残している |

## リスクと、期待する扱い

| リスク | 見直しの理由 | 期待する扱い |
|---|---|---|
| `risks/idp-lock-in.md` | 見直し時期を過ぎた | 変更なしで続ける。`verified` を記録し、`stale_after` を4週間後にする。`generated` と評価は変えない |
| `risks/sms-cost.md` | 依存先の判断（ADR-0002、SMSの単価の改定）が更新された | 発生の可能性を「高」にし、対応方針を本文に追記する。`generated` を更新し、`stale_after` を2週間後にする。対応策のタスクを作る |
| `risks/legacy-browser.md` | 見直し時期を過ぎた | 閉じる（`state: closed`）。`stale_after` を削除する |
| `risks/vendor-support.md` | なし（見直し時期の前） | 変更しない |
| `risks/test-env.md` | なし（閉じている） | 変更しない。閉じた値（`closed`）の手本 |

## 手順

1. skillを実行して、確認する

   ```bash
   bun tests/skills/run.ts adaptrace-risk /tmp/risk-test 3 --issues
   ```

2. `check.ts` の失敗と、記録のSkill issuesをもとに、skillを修正する
3. PRの本文の「レビュー」に、合格した回数と、Skill issuesへの採用・不採用を書く
4. 確認項目を変えたら、`expected/` と `failing/` も合わせて修正し、`bun test` が通ることを確認する

## 依頼

```text
リスクの見直しをしたいです。見直しが必要なものを整理してください。
```

## 利用者が知っていること

利用者役のエージェントに渡す事実。skillが何をすべきかのヒントは書かない。

- 自分はこのプロジェクトのPMの林。リスクの見直しは自分が判断する。文書の `by` に使う自分のIDは `hayashi`
- IdP-Xの契約のリスクは、状況が変わっていない。評価も本文もそのままでよい。次の見直しは4週間後
- SMSの費用のリスクは、SMSの単価が上がったので、発生の可能性を「高」に上げる。影響は「中」のまま。対応方針に「送信件数に上限を設ける」を加える
- そのための対応策のタスク「SMSの送信件数に上限を設ける」を作る。担当は `suzuki`、期日は2週間後。新しいタスクの `state` は `to_do` にする
- SMSの費用に関するリスクは、次回の見直しを2週間後にする
- 古いブラウザのリスクは、先週の定例で、古いブラウザを対応ブラウザから外すことが決まったので、閉じる。閉じたら、見直しは要らない
- 日本語サポートのリスクは、今回は見ない
- 差分は、内容が上の事実と合っていれば承認する
- `log.md` には、見直したことを記録してよい
- コミットは、自分で確認してから行うので、しないでほしい

## 確認項目（`check.ts`）

- `must`
  - `validate` のエラーが0件
  - `stale` に、閉じていないリスクが1件も出ない
  - IdP-Xの契約のリスク：`verified` が追加され、`generated`、評価（`probability`、`impact`）、本文が変わっていない。`stale_after` が今より後
  - SMSの費用に関するリスク：`probability` が「高」、`impact` が「中」。`generated` が新しい。`stale_after` が元の値と今より後
  - 対応策のタスクが1件あり、`derived_from` でSMSの費用のリスクを指す。担当が `suzuki` で、期日がある
  - 古いブラウザのリスク：`state` が `closed` で、`stale_after` がない
  - ほかの文書は変更していない。リスクの文書で変えたのは、扱いに必要なキーと本文だけ。本文は、対応方針の行のほかは残っている。新しい文書はタスク1件だけ。`tasks/index.md` は1行の追加だけ、`log.md` は追加だけ。ほかの `index.md` は変えていない
- `should`
  - IdP-Xの契約に関するリスクで、`verified.by` が `human:hayashi`
  - SMSの費用に関するリスクで、本文に上限のことが書いてあり、元の対応方針（毎月の確認）が残っている
  - 新しいタスクが `tasks/index.md` に載っている
  - 報告で、作ったタスクに触れている
