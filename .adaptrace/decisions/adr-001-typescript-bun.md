---
type: Decision
title: 実装言語にTypeScript、ランタイムにBunを使う
state: accepted
generated: { by: human:yutaponium, at: 2026-10-29T00:00:00+09:00 }
verified: { by: human:yutaponium, at: 2026-11-26T00:22:00+09:00 }
---

# 実装言語にTypeScript、ランタイムにBunを使う

> 注：2026-11-23に文言だけを修正した。決定の内容は変えていない。

## 決定

実装言語はTypeScript、ランタイム・パッケージ管理・テストはBun、lintとフォーマットはBiomeを使う。

## 理由

- 形式を合わせるBacklog.mdがTypeScript（Bun）で実装されており、将来コードを取り込む場合にも移植しやすい
- MCPのTypeScript SDKが充実している
- Bunはテストランナーを備え、TypeScriptを直接実行できるので、必要なツールが少なくて済む

## 検討した他の案

Python、Go。
