---
type: Decision
title: ADR-0001 認証基盤にIdP-Xを使う
satisfies: /requirements/req-1-mfa.md
generated: { by: human:sato, at: 2026-11-01T10:00:00+09:00 }
verified: { by: human:sato, at: 2026-11-25T10:00:00+09:00 }
---

# ADR-0001 認証基盤にIdP-Xを使う

IdP-Xを使う。MFAのワンタイムコードの送信もIdP-Xに任せる。IdP-Xは、メールとSMSでコードを送れる。
