---
type: Risk
title: SMSの送信費用が予算を超える
state: open
owner: hayashi
probability: 高
impact: 中
stale_after: 2026-12-10T10:00:00+09:00
depends_on: /decisions/adr-0002-sms.md
generated: { by: human:hayashi, at: 2026-11-26T11:00:00+09:00 }
---

# SMSの送信費用が予算を超える

会員の多くがSMSを選ぶと、送信費用が予算を超える。

対応方針：送信件数を毎月確認する。送信件数に上限を設ける。

2026-11-26の見直しで、SMSの単価の改定（ADR-0002）を受けて、発生の可能性を「高」に上げた。
