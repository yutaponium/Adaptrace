---
type: Decision
title: セッションをRedisに保存する
satisfies: /requirements/req-2-session-timeout.md
generated: { by: claude-code, at: 2026-11-25T19:46:34+09:00 }
---

# ADR-0002 セッションをRedisに保存する

REQ-2のセッションの有効期限を管理するため、セッションはRedisに保存する。
有効期限はRedisのTTLで実現する。
