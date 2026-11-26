# `adaptrace-minutes` の試験

Claude Codeのskill `adaptrace-minutes`（`skills/adaptrace-minutes/`）を、模擬のリポジトリで実行して確認する手順。
skillを修正したら、この試験を実行する。試験の考え方と共通の仕組みは、[`adaptrace-adopt` の試験](../adaptrace-adopt/README.md) と同じ。

## ファイル

| ファイル | 内容 |
|---|---|
| `repo/` | 模擬のリポジトリ。バンドルの外の `notes/minutes-1120.md` に議事録がある |
| `setup.sh` | `repo/` から試験用のgitリポジトリを作り、skillをコピーする |
| `prompts/runner.md` | 実行役への依頼 |
| `check.ts` | skillを実行した後のリポジトリと、対話の記録を確認する。`must` が1つでも失敗すると、終了コード1 |
| `expected/`、`expected.dialog.md` | 期待する結果と、期待する報告の抜粋 |
| `failing/`、`failing.dialog.md` | 失敗する例。議事録を連絡先ごと写し、判断の本文を書き換え、要望を要件に追記している |

## 議事録の内容と、期待する扱い

| 議事録の内容 | 期待する扱い |
|---|---|
| 記録者の連絡先 | バンドルに書かない |
| フォームの画面が完成した | `tasks/form-ui.md` の `state` を `done` にする |
| 外部のメール配信サービスを使うと決めた | 新しい判断が `supersedes` で `decisions/adr-0001-mail.md` を置き換え、ADR-0001を `status: deprecated` にする。ADR-0001の本文は変えない |
| SMTPサーバーの構築を中止する | `tasks/smtp-setup.md` を、中止したと分かる状態にする |
| 山田がメール配信サービスの選定を進める。期日は12月4日 | 新しいタスク。`owner` は `yamada`、`due` は `2026-12-04` |
| 迷惑メールとして扱われるおそれ | 新しいリスク |
| 顧客から添付ファイルの要望 | 要件は変えない。変更要求として受け付けるよう案内する |

## 手順

1. skillを実行して、確認する

   ```bash
   bun tests/skills/run.ts adaptrace-minutes /tmp/minutes-test 3 --issues
   ```

2. `check.ts` の失敗と、記録のSkill issuesをもとに、skillを修正する
3. PRの本文の「レビュー」に、合格した回数と、Skill issuesへの採用・不採用を書く
4. 確認項目を変えたら、`expected/` と `failing/` も合わせて修正し、`bun test` が通ることを確認する

## 依頼

```text
先週の定例の議事録を `notes/minutes-1120.md` に置きました。決まったことを、Adaptraceの文書に反映してください。
```

## 利用者が知っていること

利用者役のエージェントに渡す事実。skillが何をすべきかのヒントは書かない。

- 自分はこのプロジェクトのPMの佐藤で、この議事録を書いた
- 議事録の内容は、出席者全員で確認済み。会議は2026年11月20日
- 議事録から作った文書を、案（下書き）として扱うかの決まりはない
- 担当者の `owner` の値は、名字のローマ字（山田は `yamada`、加藤は `kato`）
- 中止したタスクを、どう記録するかの決まりはない。中止したと分かればよい
- 添付ファイルの要望は、まだ正式に受け付けていない。依頼者や詳しい内容は、顧客に確認中
- 差分は、内容が議事録と合っていれば承認する
- `log.md` には、取り込んだことを記録してよい
- コミットは、自分で確認してから行うので、しないでほしい

## 確認項目（`check.ts`）

- `must`
  - `validate` のエラーが0件
  - 議事録が `meetings/` の下に `type: Meeting` の文書としてある
  - バンドルのどこにも、メールアドレスと電話番号がない
  - `tasks/form-ui.md` の `state` が `done`
  - 新しい判断が1件、`supersedes` でADR-0001を指し、ADR-0001が `status: deprecated`。ADR-0001の本文が残っている
  - `due` が `2026-12-04` で、担当が `yamada` の新しいタスクがある
  - 新しいリスクがある
  - 要件を追加も変更もしていない
  - 議事録が触れていない既存の文書を変更していない
- `should`
  - `tasks/smtp-setup.md` が作業中のままでない
  - `state` だけを変えた `tasks/form-ui.md` の `generated.at` が変わっていない
  - 議事録の文書が、依存関係のキーを持たない
  - 新しい文書が、`derived_from` で議事録の文書を指す
  - 報告で、添付ファイルの要望を変更要求として受け付けるよう案内している
