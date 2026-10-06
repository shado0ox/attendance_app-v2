# Google Play release — WAFR Dawam

Developer label supplied by owner: xshadox. Support: shady.nasif@gmail.com. Public origin: https://attendance.xshadox.com/. Production package: com.xshadox.wafrdawam, versionName 1.0.0, versionCode 1, min API 23 and target API 36. Confirm this permanent package has not already been used in the publisher's Play Console before first upload.

The release workflow generates an unsigned AAB and isolated Android source archive. Sign with a private upload key outside CI. Keep upload keys/passwords out of git, public archives and Actions artifacts; keep the owner's private signing backup separate from the publisher handoff. Register Play App Signing with a Google-generated app-signing key. Future AAB uploads use the same upload key and a higher versionCode. The preview certificate/package do not replace these production identifiers.

After first upload, obtain the SHA-256 App signing certificate from Play Console. Add a production assetlinks entry using the production package and that certificate, preserving the preview entry. Do not substitute the upload certificate for the Play certificate. Fullscreen domain verification requires deploying that updated association file.

Readiness gaps before submitting for public review:
- Complete PRIVACY_CONTROLLER_NAME, PRIVACY_CONTACT_EMAIL and PRIVACY_RETENTION_NOTICE with verified operator/retention information. Developer label is not a legal-company-name verification.
- Deploy account-deletion.html and settings links; support must actually process account/data deletion and document any justified retained records and retention durations. The request page opens the mail app; it is not an automatic database erasure implementation.
- Supply dedicated review employee/admin accounts with fictitious data and access from any location without weakening production location restrictions. This change does not create real accounts or bypass authentication.
- Capture real employee-feature screenshots on a tested Android device; public login screenshots alone do not demonstrate the authenticated functions.
- Review Data Safety against actual production hosting/email providers, all SDKs and browser behavior. Web data collection is still app data collection.
- Test TWA location, WebAuthn, photo selection, PDFs, notifications, back navigation and updates on Android. No background-location feature is added.
- Validate account-specific testing/billing requirements in Play Console. This bundle alone does not guarantee review acceptance.

No database identifiers, data, Docker names or company permissions change.
