---
type: Decision
title: Backlog.mdとの同期は、skillが `sync` の計画を項目ごとに示し、衝突や問題の扱いを利用者と決めてから書き込む
state: accepted
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-26T22:13:05+09:00 }
depends_on:
  - /decisions/adr-011-backlog-sync.md
  - /decisions/adr-026-adopt-skill.md
---

# Backlog.mdとの同期は、skillが `sync` の計画を項目ごとに示し、衝突や問題の扱いを利用者と決めてから書き込む

## 決定

- Backlog.mdとの同期を支援するClaude Codeのskill `adaptrace-sync` を、`skills/` に置く
- 計画は、`--write` を付けない `adaptrace sync --format json` で取得する。変換と変化の判定は、既存の `sync` で行う（ADR-011、ADR-026）
- 計画を、変更（書き出し、取り込み、対応づけの記録）と、問題（衝突、見つからないタスク、対応しない `state`、重複した `backlog.id`、読めないファイル）に分けて示す
- 問題ごとの扱いは、次から利用者と決める
  - 衝突：今の両側の内容を、違う項目（`fields`）ごとに並べて示す。どちらの側にそろえるかを、タスクごとに決める。決まった側は、`sync --resolve <タスク>=<側>` で渡す。選ばなかった側の変更を残したいときは、Adaptraceの文書にその変更を書いてから、Adaptraceの側にそろえる。決まらない衝突は、そのまま残す
  - 対応しない `state`：Backlog.mdのステータスに対応する値に、Adaptraceの `state` を変える。またはBacklog.mdにステータスを追加するよう案内する
  - 重複した `backlog.id`：利用者が写しだと決めた文書から、`backlog` を削除する。次の `sync` で、新しいタスクとして書き出される
  - 見つからないタスク：Backlog.mdの側で戻すか、Adaptraceの文書を残すか（`sync` は知らせ続ける）を、利用者と決める。Adaptraceの文書を削除するのは、利用者が明示したときだけにする
- skillが書き換えるのは、次だけにする
  - `sync --write` が書く、AdaptraceのTaskの文書と、Backlog.mdのタスクのファイル
  - 上の扱いで決めた、AdaptraceのTaskの文書のキーと本文
  - `log.md`（行の追加だけ）
- Backlog.mdのファイル（`config.yml` を含む）は、`sync --write` のほかでは書き換えない
- `sync --write` は、実行する内容（`--resolve` の指定を含む）と、`--write` を付けない計画を示し、承認を得てから実行する
- 取り込みで `generated` が更新されたタスクに依存する文書は、`stale` に出る。skillは報告に書き、見直しは skill `adaptrace-review` を案内する

## 理由

- `sync` は、衝突を上書きせずに知らせるが、どちらにそろえるかは人が決める必要がある。タスクごとに決めた結果を渡すために、`--resolve <タスク>=<側>` をCLIに追加した（PR #15）
- Backlog.mdの側は開発者が使う。skillが `sync` のほかの方法で書き換えると、`backlog.sync` のハッシュと食い違い、次の `sync` で衝突になる
- 計算は既存の `sync` で行い、skillには手順と判断の基準だけを書く（ADR-026）

## 検討した他の案

- 全体の `--resolve adaptrace|backlog` だけで作る：タスクごとにそろえる側が違うと、どちらかの変更を手で戻すことになる
- 見つからないタスクを、skillが `status: deprecated` にする：`sync` は、`deprecated` のタスクも見つからないと知らせ続ける。廃止するかどうかは、同期とは別の判断である
