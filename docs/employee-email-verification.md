# Employee email verification

Employees can save/correct their address and request a six-digit code from their portal. The code is valid for 10 minutes with five incorrect attempts. Requests have a 60-second cooldown, a six-per-hour employee limit and a 100-per-hour company limit. Changing addresses does not reset those limits. Verification is optional and does not block the published schedule or attendance. With Resend unconfigured, saving an address still works; sending a code gives a clear unavailable message.

Use the existing `RESEND_API_KEY` and `RESEND_FROM` configuration. The verification message does not require APP_URL and includes no password. Provider acceptance is not proof of delivery. If a valid code arrives after an ambiguous provider failure it can still be used. A resend replaces the previous challenge; the UI asks for the latest code and supports iOS one-time-code autofill. UI countdowns make no network requests.

Challenges and send quotas are scoped by company and token employee identity in system_data. Codes are random and stored only as an HMAC bound to company, employee, address and challenge nonce. Sending happens outside row locks. Confirmation locks company data, consumes the challenge, records emailVerifiedAt/emailVerifiedAddress and audits the event atomically. Used challenge hashes are removed. No raw code or mail payload is persisted in the challenge or audit log. The next request replaces expired challenge state; there is no cleanup cron or periodic write.

Verification fields are server-owned: main-data saves cannot forge them, and email changes via either the employee editor or administrator revoke the proof. Cosmetic address casing preserves it. Confirmation changes the main-data revision to reject stale administrator saves. The employee directory and unified profile show verified/unverified status.

Tests use an explicit Node preload to mock Resend in a separate PostgreSQL integration process. The production server never imports the mock and has no test-only bypass. Real email delivery/domain configuration and visual iPhone/PWA verification still need checking on the deployed environment.
