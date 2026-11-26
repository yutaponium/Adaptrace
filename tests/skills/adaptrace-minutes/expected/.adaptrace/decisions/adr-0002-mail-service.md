---
type: Decision
title: ADR-0002 メールは外部のメール配信サービスで送る
status: draft
satisfies: /requirements/req-1-form.md
supersedes: /decisions/adr-0001-mail.md
derived_from: /meetings/2026-11-20-weekly.md
generated: { by: claude-code/opus-5.5, at: 2026-11-26T11:00:00+09:00 }
---

# ADR-0002 メールは外部のメール配信サービスで送る

自前のSMTPサーバーは運用の負担が大きいため、外部のメール配信サービスを使う。
