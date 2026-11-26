---
type: Decision
title: OKF 0.2に合わせてフロントマターの書き方を決める
state: accepted
generated: { by: human:yutaponium, at: 2026-10-29T00:00:00+09:00 }
verified: { by: human:yutaponium, at: 2026-11-26T00:22:00+09:00 }
---

# OKF 0.2に合わせてフロントマターの書き方を決める

> 注：2026-11-23に文言だけを修正した。決定の内容は変えていない。

## 決定

[OKF 0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)と食い違っていたREADMEの設計案を、次のように改める。

1. **進み具合は `state` で表す。** `status` はOKFのライフサイクル（`draft` / `stable` / `deprecated`）にだけ使う
2. **最終更新は `generated: { by, at }` で記録する。** 古い `timestamp` も読めるようにするが、validateは警告を出す
3. **依存関係のキーのパスは `/` で始めるバンドル絶対パスで書く。** そのファイルからの相対パス（`../` など）も読める
4. **`type` は単語の頭を大文字にする**（`Requirement`、`Change Request`）。小文字の書き方にはvalidateが警告を出す

## 理由

- `status` と `timestamp` はOKF 0.2で意味が決まっており、流用すると他のOKFツールが誤って解釈する
- OKFはパスを「`/` で始まればバンドルのルートから、それ以外はファイルからの相対」と解釈する。READMEの例の `requirements/security-mfa.md` は、OKFの規則ではファイルからの相対パスになってしまう
- `type` の書き方をOKFの例（`Metric`、`BigQuery Table`）とそろえると、他のバンドルと混ぜても見た目が統一される
