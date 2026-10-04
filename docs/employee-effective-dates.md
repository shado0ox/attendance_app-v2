# Employee effective dates

Department transfers (single edit or bulk transfer) and status actions ask for a Riyadh business date, up to today. The change takes effect immediately for login and current operations; future scheduling of employment changes is deliberately rejected. Backdating cannot precede the last recorded transition of the same field. Multiple changes on one date use the final state for that whole business day.

The server constructs independent department/status histories from the stored value, ignoring incoming history. Changes and audit records commit together under the existing optimistic concurrency guard. `_employmentEffectiveDate` is transient; `employmentEffectiveDate` records the last saved change date for auditing. No polling, cron, or recurring database writes are introduced.

Attendance analysis resolves synthesized missing days against historical department/status. Captured punches keep their original department. Coverage alerts and department schedule export resolve each date independently; the schedule grid includes employees who belonged to the department during the selected month. Frozen monthly reports are not rewritten.

Legacy employees have no historical timeline. Their current department/status becomes the baseline before their first recorded transition; unknown earlier changes cannot be reconstructed. This feature records day-level transitions, not intraday changes. Existing unpublished shift assignments are not moved or deleted when an employee transfers.
