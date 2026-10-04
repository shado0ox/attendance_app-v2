# Attendance exceptions

`/admin/exceptions` is a read-only review queue with date, historical department, employee and exception type filters. It covers absence, missing/invalid punches or shift definitions, late arrival after grace, early departure, punches on rest/approved leave days or without a schedule, split-shift review, multiple rows for one employee-day and potential overtime. A day with several reasons occupies one row. Priority comes before newest date; all-original rows for the day stay together through paging and export.

Attendance uses published assignments/shift definitions and recorded lifecycle dates. Approved leave and inactive scheduled days do not create absences. Absence starts after the shift end, including overnight shifts. A missing final checkout is suppressed while a valid shift is ongoing; actual late arrival can be shown before checkout. Double-shift hours still need period review, and potential overtime is never approval for payment.

The authenticated administrator-only API `/api/attendance-exceptions` allows periods up to 31 days, pages of at most 100 days and a complete CSV export with the same filters. Summary reason counts apply before the reason filter; they overlap and do not sum to the unique employee-day count. Pending attendance correction requests are attached without changing their status. Raw GPS coordinates and unrelated employee metadata are excluded.

Filtering requires an explicit search; pagination and export are explicit requests. There is no polling, periodic write, automated deduction, record deletion, review-state mutation or change to approved monthly snapshots. The detail dialog shows original periods, schedule/notes, first/last locations and pending correction requests, with shortcuts to the existing attendance day and request screens.

Current report role/company authorization applies. Department-manager server permission enforcement remains a separate roadmap phase. Mobile layout uses wrapped controls, horizontal table scrolling, a scrollable details dialog, Escape and focus containment; actual iPhone/PWA visual verification remains required.
