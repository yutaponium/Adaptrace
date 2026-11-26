---
type: Decision
title: ADR-0003 給与システムへは夜間のCSVバッチで渡す
state: accepted
status: deprecated
satisfies: /requirements/req-1-payroll.md
depends_on: /decisions/adr-0002-db.md
generated: { by: human:hayashi, at: 2026-10-22T10:00:00+09:00 }
---

# ADR-0003 給与システムへは夜間のCSVバッチで渡す

## 決定

毎晩2時に、前日までの勤怠データをCSVに出力し、給与システムの取り込みフォルダに置く。

## 理由

給与システムには、CSVの取り込みの機能しかない。
