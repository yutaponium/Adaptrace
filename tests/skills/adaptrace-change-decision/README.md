# `adaptrace-change-decision` の試験

Claude Codeのskill `adaptrace-change-decision`（`skills/adaptrace-change-decision/`）を、模擬のリポジトリで実行して確認する手順。
skillを修正したら、この試験を実行する。試験の考え方と共通の仕組みは、[`adaptrace-adopt` の試験](../adaptrace-adopt/README.md) と同じ。

## ファイル

| ファイル | 内容 |
|---|---|
| `repo/` | 模擬のリポジトリ。判断を記録する変更要求 `cr-002`、`cr-003`、`cr-004` と、却下済みの `cr-001`、未決のまま残る `cr-005` がある |
| `setup.sh` | `repo/` から試験用のgitリポジトリを作り、skillをコピーする |
| `prompts/runner.md` | 実行役への依頼 |
| `check.ts` | skillを実行した後のリポジトリと、対話の記録を確認する。`must` が1つでも失敗すると、終了コード1 |
| `expected/`、`expected.dialog.md` | 期待する結果と、期待する報告の抜粋 |
| `failing/`、`failing.dialog.md` | 失敗する例。却下に、バンドルで使っていない値（`rejected`）を使い、要件に `derived_from` を追加している |

## 変更要求と、期待する扱い

| 変更要求 | 起点 | 期待する扱い |
|---|---|---|
| `cr-001-app-only.md` | REQ-1 | 変更しない。却下済み（`state: declined`）で、バンドルの値の手本になる |
| `cr-002-sms.md` | REQ-1 | `state` を承認の値にし、「判断」の見出しを追加する。見直しは `adaptrace-review` で進めると報告する |
| `cr-003-push.md` | REQ-1 | `state` を保留の値にし、「判断」の見出しに再検討の条件を書く |
| `cr-004-timeout.md` | REQ-2 | `state` を `declined` にし、「判断」の見出しを追加する |
| `cr-005-voice.md` | REQ-1 | 変更しない。承認した `cr-002` と重なっていたので、見積もりのやり直しが要ると報告する |

要件（REQ-1、REQ-2）など、変更要求のほかの文書は変更しない。起点への `derived_from` の追加は、`adaptrace-review` が行う。

## 手順

1. skillを実行して、確認する

   ```bash
   bun tests/skills/run.ts adaptrace-change-decision /tmp/change-decision-test 3 --issues
   ```

2. `check.ts` の失敗と、記録のSkill issuesをもとに、skillを修正する
3. PRの本文の「レビュー」に、合格した回数と、Skill issuesへの採用・不採用を書く
4. 確認項目を変えたら、`expected/` と `failing/` も合わせて修正し、`bun test` が通ることを確認する

## 依頼

```text
11月26日の変更管理委員会で、CR-002を承認、CR-003を保留、CR-004を却下しました。記録してください。
```

## 利用者が知っていること

利用者役のエージェントに渡す事実。skillが何をすべきかのヒントは書かない。

- 自分はこのプロジェクトのPMの林で、変更管理委員会の議長
- 判断したのは、2026年11月26日の変更管理委員会。議事録はバンドルにない
- CR-002（SMS）を承認した理由：メールが届かないという問い合わせが多い。IdP-XはSMSを送れるので、追加の費用が小さい
- CR-003（プッシュ通知）を保留にした理由：IdP-Xがプッシュ通知に対応するのは、2027年4月の予定。対応版が出た時点で再検討する
- CR-004（セッションの有効期限）を却下した理由：セキュリティ部門の基準で、有効期限は30分を超えられない
- CR-005（音声通話）は、まだ委員会で扱っていない
- 承認や保留を表す `state` の値に、決まりはない。既存の変更要求に合わせてほしい
- 依頼者への連絡は、自分でする
- 差分は、内容が上の事実と合っていれば承認する
- `log.md` には、判断を記録してよい
- 見直しは、来週から始める。今回は判断の記録だけでよい
- コミットは、自分で確認してから行うので、しないでほしい

## 確認項目（`check.ts`）

- `must`
  - `validate` のエラーが0件
  - `cr-002` の `state` が承認の値（`approved` か `accepted`）
  - `cr-003` の `state` が保留の値（`deferred`、`on_hold`、`postponed`）
  - `cr-004` の `state` が、バンドルで却下に使っている `declined`
  - 判断した3件の本文に「判断」の見出しがあり、受け付けたときの本文が残っている
  - 判断した3件で変わったのは、`state`、`generated`、本文の末尾だけ。`received_at`、`changes`、`requested_by` は変わっていない
  - ほかの文書（要件、`cr-001`、`cr-005` など）は変更していない。`index.md` と `log.md` は追加だけ
- `should`
  - 「判断」の見出しに、判断した日と理由が書いてある（`cr-002` は問い合わせ、`cr-003` は2027年4月、`cr-004` はセキュリティ部門の基準）
  - 判断した3件の `generated.at` が新しくなっている
  - 報告で、`cr-002` の見直しを `adaptrace-review` で進められることに触れている
  - 報告で、`cr-002` と重なっていた未決の `cr-005` に触れている
