# `adaptrace-supersede` の試験

Claude Codeのskill `adaptrace-supersede`（`skills/adaptrace-supersede/`）を、模擬のリポジトリで実行して確認する手順。
skillを修正したら、この試験を実行する。試験の考え方と共通の仕組みは、[`adaptrace-adopt` の試験](../adaptrace-adopt/README.md) と同じ。

## ファイル

| ファイル | 内容 |
|---|---|
| `repo/` | 模擬のリポジトリ。置き換える判断 `decisions/adr-0003-batch.md` と、それに依存する文書がある |
| `setup.sh` | `repo/` から試験用のgitリポジトリを作り、skillをコピーする |
| `prompts/runner.md` | 実行役への依頼 |
| `check.ts` | skillを実行した後のリポジトリと、対話の記録を確認する。`must` が1つでも失敗すると、終了コード1 |
| `expected/`、`expected.dialog.md` | 期待する結果と、期待する報告の抜粋 |
| `failing/`、`failing.dialog.md` | 失敗する例。古い判断の本文を書き換えている |

## 古い判断に依存している文書と、期待する扱い

| 文書 | 古い判断との関係 | 期待する扱い |
|---|---|---|
| `tasks/sync-monitor.md` | `depends_on`（直接） | 新しい判断に付け替える |
| `tasks/csv-batch.md` | `depends_on`（直接） | 中止する |
| `risks/csv-format.md` | `derived_from`（直接） | 廃止するか、古い判断から外す |
| `tasks/payroll-test.md` | `csv-batch` を通じて（間接） | 見直しの対象として報告する。変えてよいのは、中止したタスクへの `depends_on` だけ |
| `change-requests/cr-004-batch-time.md` | `changes` | 変更しない。起点が廃止されたことを報告する |

## 手順

1. skillを実行して、確認する

   ```bash
   bun tests/skills/run.ts adaptrace-supersede /tmp/supersede-test 3 --issues
   ```

2. `check.ts` の失敗と、記録のSkill issuesをもとに、skillを修正する
3. PRの本文の「レビュー」に、合格した回数と、Skill issuesへの採用・不採用を書く
4. 確認項目を変えたら、`expected/` と `failing/` も合わせて修正し、`bun test` が通ることを確認する

## 依頼

```text
給与システムへの連携を、夜間のCSVバッチから、給与システムのAPIを呼ぶ方式に変えることにしました。ADR-0003を置き換えてください。
```

## 利用者が知っていること

利用者役のエージェントに渡す事実。skillが何をすべきかのヒントは書かない。

- 自分はこのプロジェクトのPMの林
- 2026年11月24日の定例で決めた。議事録はバンドルにない
- 理由：給与システムがAPIを提供した。夜間のバッチでは、当日の修正が翌日まで給与システムに届かない
- 検討した他の案：バッチの回数を増やす。給与システムの負荷が大きくなるので採らなかった
- 新しい方式でも、勤怠データを給与システムに渡すという要件は同じ。データの保存先も変わらない
- CSVバッチの実装は、もう要らないので中止する。中止をどう記録するかの決まりはない
- 連携の監視は、APIの連携でも必要なので続ける
- CSVの形式が変わるリスクは、APIにするのでなくなった
- 結合テストは続ける。何に依存させるかは、APIの連携のタスクを作ってから決める
- CR-004（バッチの実行時刻）は、依頼者と相談してから扱いを決めるので、今は変えないでほしい
- 差分は、内容が上の事実と合っていれば承認する
- `log.md` には、置き換えたことを記録してよい
- コミットは、自分で確認してから行うので、しないでほしい

## 確認項目（`check.ts`）

- `must`
  - `validate` のエラーが0件
  - 新しい判断が1件だけあり、`supersedes` でADR-0003を指す。本文にAPIのことが書いてある
  - ADR-0003が `status: deprecated` で、本文が残っている
  - `tasks/sync-monitor.md` が、ADR-0003ではなく新しい判断に依存している
  - `tasks/csv-batch.md` が中止されている。`status: deprecated` か、中止を表す `state`（`cancelled`、`abandoned` など）
  - 廃止していない文書で、見直しの連鎖のキーでADR-0003を指すものがない。変更要求、中止したタスク、リスクは除く
  - 上の表で変更を期待する文書は、扱いに必要なキーだけを変えている。それ以外の文書（CR-004を含む）は変更していない。`index.md` と `log.md` は追加だけ
- `should`
  - 新しい判断が、`satisfies` でREQ-1を指す
  - ADR-0003と `tasks/sync-monitor.md` の `generated.at` が変わっていない
  - `risks/csv-format.md` が廃止されたか、ADR-0003から外れている
  - 報告で、CR-004と、間接的に影響を受ける結合テストに触れている
