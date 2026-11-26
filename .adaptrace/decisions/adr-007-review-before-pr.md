---
type: Decision
title: PRの前のレビューは当面/code-reviewのみ
state: accepted
status: deprecated
generated: { by: human:yutaponium, at: 2026-10-29T00:00:00+09:00 }
verified: { by: human:yutaponium, at: 2026-11-26T00:22:00+09:00 }
---

# PRの前のレビューは当面/code-reviewのみ

> 注：2026-11-23に文言だけを修正した。決定の内容は変えていない。

## 決定

PRの前のレビューは、当面Claude Codeの/code-reviewだけにする。別のエージェント（Geminiなど）によるレビューは、コードが増えてから追加する。

## 理由

- 今はコードが少なく、二重のレビューの手間に見合わない
- メンテナーの別のプロジェクトではGeminiのレビューも使っており、必要になれば同じ形で追加できる
