# `adaptrace-review` の試験

Claude Codeのskill `adaptrace-review`（`skills/adaptrace-review/`）を、模擬のリポジトリで実行して確認する手順。
skillを修正したら、この試験を実行する。試験の考え方と共通の仕組みは、[`adaptrace-adopt` の試験](../adaptrace-adopt/README.md) と同じ。

## ファイル

| ファイル | 内容 |
|---|---|
| `repo/` | 模擬のリポジトリ。場面は、変更要求を受け付ける試験の後。顧客A社の変更要求 `cr-002`（SMSでもコードを受け取りたい）が承認され、社内の `cr-001` は却下された。起点の要件には、まだ `derived_from` がない |
| `setup.sh` | `repo/` から試験用のgitリポジトリを作り、skillをコピーする。コミットの日付は2026-11-24に固定し、`test-base` のタグを付ける |
| `prompts/runner.md` | 実行役への依頼 |
| `check.ts` | skillを実行した後のリポジトリと、対話の記録を確認する。`must` が1つでも失敗すると、終了コード1 |
| `expected/`、`expected.dialog.md` | 期待する結果と、期待する報告の抜粋 |
| `failing/`、`failing.dialog.md` | 失敗する例。変更の要らない判断を書き換えている、年内リリースを見直していない、変更要求の `generated` を新しくしたので起点が古くなっている |

## 手順

1. skillを実行して、確認する

   ```bash
   bun tests/skills/run.ts adaptrace-review /tmp/review-test 3 --issues
   ```

2. `check.ts` の失敗と、記録のSkill issuesをもとに、skillを修正する
3. PRの本文の「レビュー」に、合格した回数と、Skill issuesへの採用・不採用を書く
4. 確認項目を変えたら、`expected/` と `failing/` も合わせて修正し、`bun test` が通ることを確認する

## 依頼

```text
変更要求 `cr-002` が承認されたので、影響を受ける文書の見直しを進めてください。
```

## 利用者が知っていること

利用者役のエージェントに渡す事実。skillが何をすべきかのヒントは書かない。

- 自分はこのプロジェクトのPMの佐藤（ID `sato`）。見直しの判断は自分がする
- `cr-002` は、2026年11月24日の変更管理の会議で承認した。`cr-001` は却下した
- 要件（REQ-1）は、コードをメールに加えてSMSでも送るように変える
- 認証基盤の判断（ADR-0001）は変えない。IdP-XはSMSでもコードを送れる
- ログイン画面のタスクは、SMSで届いたコードも入力できるように変える。担当（田中）と期日（12月15日）は変えない
- IdP-Xのリスクは、今回の変更では変わらない
- 年内リリースの期日は変えない
- 見直しが終わったら、変更要求は反映済みにしたい。反映済みの値は `implemented`
- 今回で最後まで進めたい
- 差分は、上の事実と合っていれば承認する
- `log.md` には、見直しを終えたことを記録してよい
- コミットは、自分で確認してから行うので、しないでほしい

## 確認項目（`check.ts`）

- `must`
  - `validate` のエラーが0件
  - `progress change-requests/cr-002-sms.md` の終了コードが0（すべて見直し済み）
  - 起点の要件：`derived_from` に `cr-002` があり、本文にSMSがあり、`generated.at` が承認の後
  - 認証基盤の判断、年内リリース：`generated` が元のままで、`verified` がある
  - IdP-Xのリスク：`generated` が元のまま。依存先の認証基盤の判断が内容を変えないので、見直しの対象にならない（ADR-020）。`verified` はあってもなくてもよい
  - ログイン画面のタスク：本文にSMSがあり、`generated.at` が承認の後
  - `cr-002` の `state` が `implemented`
  - `stale` が、古い文書を示さない。変更要求の `generated` を最後に更新すると、起点の要件が古くなる
  - 影響範囲の外の文書（セッションの要件、`cr-001`、ステークホルダー）を変更していない
- `should`
  - `verified` と、更新した文書の `generated` の `by` が `human:sato`
  - `log.md` に、見直しの記録が追加されている
  - 実行役が、ステップごとに進めている
