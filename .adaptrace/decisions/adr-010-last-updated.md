---
type: Decision
title: 最終更新はgenerated.atを基本にし、なければgitから取る
state: accepted
generated: { by: human:yutaponium, at: 2026-10-29T00:00:00+09:00 }
verified: { by: human:yutaponium, at: 2026-11-26T00:22:00+09:00 }
---

# 最終更新はgenerated.atを基本にし、なければgitから取る

> 注：2026-11-23に文言だけを修正した。決定の内容は変えていない。

## 決定

影響分析（`impact`）と陳腐化の検出（`stale`）で比較する「最終更新」は、次の順に取得する。

1. `generated.at`
2. 古い `timestamp`
3. その文書を最後に変更したgitコミットのauthor date。rebaseやcherry-pickで変わるcommitter dateは使わない
4. どれもなければ「不明」とし、比較しない

`verified` は最終更新に含めない。見直した結果、変更が不要だった場合も、`generated.at` を更新して記録する。

あわせて、次のように決める。

- 影響は `depends_on`・`derived_from`・`satisfies` だけを伝わる。`blocks` と `supersedes` は伝わらない
- `stale` は直接の依存先とだけ比較する。間接の影響は `impact` が示す
- `status: deprecated` の文書は、どちらの判定でも列挙しない。ただし `impact` はその先もたどる
- `stale` は古い文書が見つかっても終了コード0を返し、CIを失敗させない

## 理由

- `generated.at` はOKF 0.2で「内容の最後の意味のある変更」と定義されており、誤字の修正などでは更新されない
- 書き忘れた文書も、gitがあれば判定から漏れない
- `verified` を含めると、何を確認したのかが曖昧なまま「要確認」が消える。判定を単純に保つため、内容の更新だけを見る

## 検討した他の案

- `generated.at` だけを使う：書き忘れた文書が判定から漏れる
- gitだけを使う：誤字の修正でも「更新」とみなされる
- `verified` の日時も含める：上記の理由で採用しない
