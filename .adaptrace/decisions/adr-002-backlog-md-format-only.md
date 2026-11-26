---
type: Decision
title: Backlog.mdとは形式だけ合わせる
state: accepted
generated: { by: human:yutaponium, at: 2026-10-29T00:00:00+09:00 }
verified: { by: human:yutaponium, at: 2026-11-26T00:22:00+09:00 }
---

# Backlog.mdとは形式だけ合わせる

> 注：2026-11-23に文言だけを修正した。決定の内容は変えていない。

## 決定

v0.3まではBacklog.mdをフォークも依存もせず、タスクの形式だけを合わせる。必要になったら部分的にコードを取り込む。

## 理由

- 依存したりフォークしたりすると、Backlog.mdの変更の影響を受ける
- 形式が合っていれば、v0.3の相互変換は実装できる

## 結果

コードを取り込むときは、著作権表示とライセンス（MIT）をTHIRD_PARTY_NOTICES.mdに残す。
