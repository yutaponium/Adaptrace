---
type: Decision
title: ADR-0001 認証基盤にIdP-Xを使う
satisfies: /requirements/req-1-mfa.md
generated: { by: human:test, at: 2026-11-10T10:00:00+09:00 }
---

# ADR-0001 認証基盤にIdP-Xを使う

## 状況

REQ-1（多要素認証）を実装するために、認証基盤を選ぶ必要がある。

## 決定

IdP-Xを使う。MFAのワンタイムコードの送信もIdP-Xに任せる。
