# Unified employee profile

Open a staff member by clicking their name or “ملف الموظف” in Employees. The profile contains current contact/account data, the published monthly schedule, analyzed monthly attendance with first/last locations, monthly requests, and the latest 100 employee audit events. Profile viewing is read-only; edit uses the existing employee editor and approvals stay in Requests.

The administrator-only endpoint `/api/employees/:id/profile` checks company authorization and employee membership before each section query. Its data fields are allowlisted: credentials, passwords, raw GPS coordinates and correction baseline blobs are excluded. Requests have stable descending ID ordering and 20-item pages, filtered by target day rather than submission day. Attendance and schedule are bounded to one month. Both use published shifts; department/status are resolved per date through the recorded history. Attendance is a current review calculation, not a frozen approved payroll report.

The dialog is loaded as a separate frontend chunk. Each section loads on demand and is cached only in the open profile. Switching back reuses that section; explicit refresh fetches its latest version. Closing the profile drops its cache. Fetches are aborted on navigation/closing; there is no polling, background database write or new persistent client cache. Opening and viewing this feature never saves main-data.

The dialog has keyboard focus containment, Escape to close, wrapped section buttons, a scrollable content area and horizontal table scrolling. Real iPhone/PWA visual verification is still required. Existing administrator roles and company authorization apply; department-level server permissions are a separate roadmap phase.
