---
type: Decision
title: 要件の充足は、CLIの coverage で依存関係から計算し、マイルストーンの範囲は待っている文書をたどって決める
state: accepted
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-26T17:28:09+09:00 }
depends_on:
  - /decisions/adr-026-adopt-skill.md
  - /decisions/adr-033-health.md
---

# 要件の充足は、CLIの coverage で依存関係から計算し、マイルストーンの範囲は待っている文書をたどって決める

## 決定

- 要件ごとに、満たす文書（`satisfies`）と、その進み具合を示す `adaptrace coverage [bundle]` と、MCPのツール `coverage` を追加する。名前は、メンテナーの確認を得て決めた（2026-11-26）
- 要件の状況は3つにする
  - `uncovered`：`status: deprecated` でない文書のうち、要件を `satisfies` で指すものがない
  - `open`：要件を満たすTaskのうち、終わっていないものがある
  - `covered`：それ以外
- 進み具合を持つのはTaskだけとする。Task以外（Decisionなど）の満たす文書は、存在すれば満たしているとみなす
- Taskが終わったかは、`state` の値で決める。既定は `done` で、`--done` で変えられる。大文字と小文字は区別しない。`state` の値の一覧が未確定のため、`conflicts` の `--settled` と同じ形にする
- 要件の型は、既定で `Requirement` とし、`--type` で変えられる
- `--milestone <文書>` を付けると、マイルストーンの範囲だけを示す。範囲は、マイルストーンが待っている文書（`depends_on` と `blocks`。`board` と同じ向き）を連鎖でたどった文書と、それらが `satisfies` で満たす要件にする。`status: deprecated` の文書は、範囲に含めず、その先もたどらない。メンテナーの確認を得て決めた（2026-11-26）
- `--milestone` のときは、範囲の作業（Task）を、担当者、期日、終わったか、マイルストーンより後の期日か（`late`）とともに示す
- 何も書き込まない。終了コードは0
- `--format` は `text`、`markdown`、`json`。`markdown` は `--link-base` に対応する

## 理由

- マイルストーンの判定（skillの候補）には、要件ごとの充足の計算が要る。ADR-026に従い、計算はCLIに作る
- 要求事項トレーサビリティ・マトリックスを、別の表として管理しない方針（`docs/guide/pmbok.md`）と合う。表は依存関係から毎回計算する
- マイルストーンを指定しない形でも使えるので、バンドル全体のトレーサビリティの確認にも使える
- 範囲を依存関係でたどれば、今のバンドルの書き方（マイルストーンがタスクに依存する）のまま使える。要件を直接 `depends_on` で指したマイルストーンでも、その要件が範囲に入る

## 検討した他の案

- マイルストーンの判定に必要な情報（未決の変更要求を含む）を1つにまとめる `adaptrace milestone <文書>`：用途が限られる。未決の変更要求は `conflicts` の `requests[].reach` と範囲を照らせば分かる
- マイルストーンの範囲を、マイルストーンが直接 `depends_on` で指す要件だけにする：既存のバンドルに書き足す必要がある
- Task以外も `state` で進み具合を判定する：型ごとに `state` の意味が違い（Decisionの `accepted` など）、値の一覧も未確定である
