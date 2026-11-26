---
type: Decision
title: Backlog.mdとは内容のハッシュで変化を見分けて双方向に変換する
state: accepted
generated: { by: human:yutaponium, at: 2026-10-29T00:00:00+09:00 }
depends_on:
  - /decisions/adr-002-backlog-md-format-only.md
verified: { by: human:yutaponium, at: 2026-11-26T00:22:00+09:00 }
---

# Backlog.mdとは内容のハッシュで変化を見分けて双方向に変換する

> 注：2026-11-23に文言だけを修正した。決定の内容は変えていない。

## 決定

- `accordant sync` で、Accordantの `Task` とBacklog.mdのタスクを双方向に変換する。Backlog.mdはファイルとして読み書きするだけで、Backlog.mdのコードには依存しない（ADR-002）
- 既定では計画を表示するだけで、`--write` を付けたときだけ書き込む。設計原則「ユーザーの文書を勝手に書き換えない」に従う
- 前回同期したときの共通の内容のハッシュを、Accordant側の `backlog.sync` に記録する。両側の現在の内容をそれと比較し、片方だけが変わっていればもう片方へ反映する。両方が変わっていれば上書きせず、衝突として通知する。衝突は `--resolve accordant|backlog` で、人がどちらかにそろえる
- カンバンは `accordant board` で、Accordant自身が `state` ごとに表示する。Backlog.mdがなくても使える

## 理由

- Backlog.mdの `updated_date` は、ファイルを手で編集すると更新されない。日時では変化を見落とすので、内容で比較する
- 衝突を新しい方で上書きすると、古い側の編集が警告なしに失われる
- Backlog.mdの `status` と `type` はOKFの `status`・`type` と意味が違うので、そのままではOKFの概念にならない。変換して、Backlog.mdだけの項目は `backlog.fields` に入れて往復させる

## 検討した他の案

- 新しい方で上書きする：古い側の編集が失われる
- 片方向だけにする：Backlog.mdの画面で進み具合を変更しても、Accordantに反映されない
- Backlog.mdの画面にカンバンを任せる：Backlog.mdをインストールしていないと見られない
