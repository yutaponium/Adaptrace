---
type: Decision
title: 最終更新にgitの日時を使わず、gitは更新漏れの検出と移行にだけ使う
state: accepted
generated: { by: claude-code/opus-5.5, at: 2026-11-26T01:02:35+09:00 }
depends_on:
  - /decisions/adr-010-last-updated.md
  - /decisions/adr-021-verified-review-followup.md
  - /decisions/adr-028-review-skill.md
---

# 最終更新にgitの日時を使わず、gitは更新漏れの検出と移行にだけ使う

## 決定

- 文書の最終更新は、`generated.at`、なければ古い `timestamp` だけにする。gitのコミットの日時は使わない。ADR-010の「どちらもなければ、最後のgitコミットの日時」を置き換える
- どちらもない文書は、最終更新が「不明」になる。`impact`、`stale`、`progress` では、これまでの「不明」と同じく比べない。`verified` だけがある文書は、これまでどおり最も古い `verified.at` を使う（ADR-021）。ただし、内容の日時がないことに変わりはないので、`missing-generated` で警告し、`migrate-dates` の対象にする
- `validate`（CLIとMCP）は、日時についての警告を加える
  - `missing-generated`：`generated` も `timestamp` もない文書
  - `stale-generated`：本文を変えたのに、`generated` も `verified` も変えていない文書。作業ツリーと、その文書を変えたコミットを新しい順にさかのぼり、記録（`generated`、`verified`、`timestamp`）を変えた変更に行き当たる前に、記録を変えずに本文を変えた変更があれば警告する。さかのぼるのは最大50件。gitのリポジトリでないときは調べない。浅いcloneでは調べず、そのことを警告する。このリポジトリのCIは、履歴をすべて取得する。どちらも警告なので、CIを失敗させない。CIのログで気づけるようにする
- この2つは、文書の構造の検査（`validate` の本体）とは分ける。MCPの更新案の検査には加えない
- 既存のバンドルを移行するために、`accordant migrate-dates` を加える。浅いcloneとgitのリポジトリの外では実行しない。最後のコミットの後に変更した文書と、`generated` の日時が読めない文書は、書き換えずに示す。`generated` も `timestamp` もない文書に、これまで最終更新にしていた日時を `generated.at` として書く。日時は、最後のgitコミットの日時（author date）で、コミットのない文書だけは最も古い `verified.at` にする。`by` は `process:git` にする。`generated` に `by` だけがある文書は、`by` とほかの項目を残して日時を書く。既定では示すだけで、`--write` で書く。一度だけ使う
- gitを読むのは、`stale-generated` の検査、`migrate-dates`、`assess`（依存先の前の版を読む）だけにする
- このリポジトリのADRで、文言を修正したために `stale-generated` が出た25件には、メンテナーの判断で `verified` を記録した。本文は変えていない。ADRのフロントマターに見直しの記録を追加することは、記録の書き換えに当たらないものとする

## 理由

- gitの日時は、コミットするまで決まらない。セッションの中で見直し済みでも、コミットで状態が変わる。skill `accordant-review` のレビューで、この扱いの指摘が繰り返し出た（ADR-028）
- `verified` の効果（下流の文書を古くしない）が、gitの日時の文書では働かなかった。`generated` だけにすれば、どの文書でも同じに働く
- 浅いclone（`--depth 1`）のCIでは、gitの日時が変わる。`generated` だけにすれば、どこで実行しても同じ結果になる
- ADR-010がgitの日時を使った理由は、「書き忘れた文書も判定から漏れない」だった。これは `missing-generated` の警告で、書き忘れを見つけて補う形にする
- ADR-021が、gitの日時を `generated` に書き写さないとした理由は、「後で本文だけを変えたとき、最終更新が進まず、見直しが漏れる」だった。これは `stale-generated` の警告で見つける。そのうえで、移行のときだけ、gitの日時を `generated` に書く
- pre-alphaなので、今のうちに仕様を変えやすい

## 検討した他の案

- 当面はgitの日時も使い、警告で移行を促す：gitの日時の扱いが、しばらくCLIとskillに残る
- 更新漏れを `stale` の理由として示す：CIで見つけるには、`validate` の警告の方が合う
- 「コミットの日時が `generated.at` より新しい」で更新漏れを判定する：`generated` を書いてからコミットするだけで、毎回警告が出る。本文を変えた変更が、`generated` か `verified` も変えているかで判定する
- 移行の手段をskillの手順にする：CLIのコマンドの方が、エージェントを使わない利用者も移行できる
